"""Downloads room impulse responses and background audio (ported from upstream's automatic training notebook).
Upstream also uses the FMA music set; it is skipped because its loader executes remote code. AudioSet includes music.

AudioSet is read from one parquet shard (500 clips, ~700 MB) because the notebook's tar URL no longer exists and
`datasets` 3.x cannot parse the dataset's current metadata.

usage: python fetch_audio.py <work_dir>
"""
import io
import itertools
import sys
from pathlib import Path

import datasets
import numpy as np
import scipy.io.wavfile
import scipy.signal
import soundfile
from tqdm import tqdm

work = Path(sys.argv[1])


def save(row, folder, i):
    scipy.io.wavfile.write(folder / f"{i:05d}.wav", 16000, (row["audio"]["array"] * 32767).astype(np.int16))


def stream(repo, n, folder, **kw):
    folder.mkdir(exist_ok=True)
    ds = datasets.load_dataset(repo, split="train", streaming=True, **kw).cast_column("audio", datasets.Audio(sampling_rate=16000))
    for i, row in enumerate(tqdm(itertools.islice(ds, n), total=n, desc=folder.name)):
        save(row, folder, i)
    (work / f".done_{folder.name}").touch()


def audioset(folder):
    import pyarrow.parquet as pq
    from huggingface_hub import hf_hub_download

    folder.mkdir(exist_ok=True)
    shard = hf_hub_download("agkphysics/AudioSet", "data/bal_train/09.parquet", repo_type="dataset", local_dir=work / "hf")
    for i, row in enumerate(tqdm(pq.read_table(shard, columns=["audio"]).to_pylist(), desc=folder.name)):
        x, sr = soundfile.read(io.BytesIO(row["audio"]["bytes"]), dtype="float32", always_2d=True)
        x = scipy.signal.resample_poly(x.mean(axis=1), 16000, sr)
        scipy.io.wavfile.write(folder / f"{i:05d}.wav", 16000, (x * 32767).astype(np.int16))
    (work / f".done_{folder.name}").touch()


# .done_<folder> (outside the folder: upstream loads every file inside as audio) marks a finished folder, so a crashed download is redone instead of silently trained on.
for repo, n, folder, kw in [
    ("davidscripka/MIT_environmental_impulse_responses", 10_000, work / "mit_rirs", {}),
]:
    if not (work / f".done_{folder.name}").exists():
        stream(repo, n, folder, **kw)
if not (work / ".done_audioset_16k").exists():
    audioset(work / "audioset_16k")
