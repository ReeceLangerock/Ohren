"""Phrase in, .wakeword bundle out. Drives upstream openWakeWord's own train.py; adds data download, config and bundling."""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import yaml

from . import __version__
from .bundle import write_bundle
from .env import TrainError, check_environment
from .preflight import check_phrase

UPSTREAM = Path(__file__).resolve().parent.parent / "third_party" / "openWakeWord"
RELEASE = "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/"
FEATURES = "https://huggingface.co/datasets/davidscripka/openwakeword_features/resolve/main/"
FEATURE_FILES = ["openwakeword_features_ACAV100M_2000_hrs_16bit.npy", "validation_set_features.npy"]
PIPER = "https://github.com/rhasspy/piper-sample-generator"
PIPER_TAG = "v3.2.0"  # first release with Apple GPU (MPS) support; the shim below adapts it to upstream's v2 call
PIPER_MODEL = "https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/en_US-libritts_r-medium.pt"
LICENSE = "non-commercial (trained with upstream openWakeWord data, CC BY-NC-SA 4.0)"


def step(name: str) -> None:
    """Stage marker; the UI reads these lines to show progress. Keep names in sync with test-page/train.ts."""
    print(f"##STEP {name}", flush=True)


def slug(phrase: str) -> str:
    return re.sub(r"\s+", "_", phrase.strip().lower())


def make_config(phrase: str, work: Path, base: dict, user_config: Path | None = None) -> dict:
    c = dict(base)
    c.update(model_name=slug(phrase), target_phrase=[" ".join(phrase.lower().split())], output_dir=str(work / "model"))
    c.update(
        piper_sample_generator_path=str(work / "piper-sample-generator"),
        rir_paths=[str(work / "mit_rirs")],
        background_paths=[str(work / "audioset_16k")],
        false_positive_validation_data_path=str(work / FEATURE_FILES[1]),
        feature_data_files={"ACAV100M_sample": str(work / FEATURE_FILES[0])},
    )
    if user_config:
        c.update(yaml.safe_load(user_config.read_text()) or {})
    return c


def download(url: str, dest: Path) -> None:
    if dest.exists():
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    start = time.time()
    last = [-5]

    def hook(blocks, size, total):
        done, pct = blocks * size, blocks * size * 100 // max(total, 1)
        if pct >= last[0] + 5:  # a line per 5%, so it stays readable next to other output
            last[0] = pct
            print(f"[download] {dest.name}: {pct}% ({done / 1e6:,.0f} / {total / 1e6:,.0f} MB, {done / 1e6 / max(time.time() - start, 1):.1f} MB/s)", flush=True)

    try:
        urllib.request.urlretrieve(url, tmp, hook)
    except OSError as e:
        raise TrainError(f"Download failed for {url}: {e}. Check your internet connection and run again; finished files are kept.") from e
    tmp.rename(dest)


def run(*cmd, ok_if_exists: Path | None = None) -> str:
    """Runs a command, echoing its output as it arrives. Returns the last ~50 KB of output."""
    # PYTORCH_JIT=0: Piper's TorchScript "graph fuser" crashes on Apple GPUs after the first few batches.
    env = {**os.environ, "PYTORCH_JIT": "0"}
    proc = subprocess.Popen([str(c) for c in cmd], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    tail = b""
    while chunk := os.read(proc.stdout.fileno(), 4096):  # raw reads: progress bars redraw with \r and have no newlines
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()
        tail = (tail + chunk)[-50_000:]
    if proc.wait() and not (ok_if_exists and ok_if_exists.exists()):
        raise TrainError(f"Step failed: {' '.join(str(c) for c in cmd[:4])} ... (see output above)")
    return tail.decode(errors="replace")


def parse_metrics(text: str) -> dict:
    """Upstream logs 'Final Model Accuracy / Recall / False Positives per Hour' at the end of training."""
    labels = {"accuracy": "Accuracy", "recall": "Recall", "falsePositivesPerHour": "False Positives per Hour"}
    out = {}
    for key, label in labels.items():
        found = re.findall(rf"Final Model {label}: \[?([-+\d.eE]+)", text)
        if found:
            out[key] = float(found[-1])
    return out


def feature_models() -> Path:
    """Upstream's mel/embedding ONNX files live in its package dir but are not shipped with the pip/git source."""
    import openwakeword

    d = Path(openwakeword.__file__).parent / "resources" / "models"
    d.mkdir(parents=True, exist_ok=True)
    for f in ("melspectrogram.onnx", "embedding_model.onnx"):
        download(RELEASE + f, d / f)
    return d


def ensure_data(work: Path) -> None:
    """The speech generator and audio used for augmentation, cached in `work`. Safe to re-run; finished pieces are skipped."""
    print("Preparing datasets...")
    feature_models()
    piper = work / "piper-sample-generator"
    if not piper.exists():
        tmp = work / "piper-sample-generator.partial"  # an interrupted clone must not look finished
        shutil.rmtree(tmp, ignore_errors=True)
        run("git", "clone", "--depth", "1", "--branch", PIPER_TAG, PIPER, tmp)
        tmp.rename(piper)
    shutil.copy(Path(__file__).with_name("piper_shim.py"), piper / "generate_samples.py")
    download(PIPER_MODEL, piper / "models" / "en_US-libritts_r-medium.pt")
    if not all((work / f".done_{d}").exists() for d in ("mit_rirs", "audioset_16k")):
        run(sys.executable, Path(__file__).with_name("fetch_audio.py"), work)


def download_features_in_background(work: Path):
    """The 17 GB feature files are only read when training the classifier, so fetch them while clips generate.
    Returns a function that waits for the download and raises if it failed."""
    errors: list[BaseException] = []

    def go():
        try:
            for f in FEATURE_FILES:
                download(FEATURES + f, work / f)
        except BaseException as e:  # reported by wait() on the main thread
            errors.append(e)

    if not all((work / f).exists() for f in FEATURE_FILES):
        print("Downloading training features in the background (first run only)...", flush=True)
    t = threading.Thread(target=go, daemon=True)
    t.start()

    def wait():
        t.join()
        if errors:
            raise errors[0]

    return wait


def train(phrase: str, out: Path, work: Path, user_config: Path | None = None, threshold: float = 0.5) -> dict:
    step("check")
    for w in check_phrase(phrase):
        print(f"warning ({w.level}): {w.message}")
    if not (UPSTREAM / "openwakeword" / "train.py").exists():
        raise TrainError("Upstream openWakeWord is missing. Run: git submodule update --init")
    work.mkdir(parents=True, exist_ok=True)
    # About 35 GB on a first run; much less once the datasets are cached.
    check_environment(path=work, need_gb=8 if (work / FEATURE_FILES[0]).exists() else 35)
    step("data")
    ensure_data(work)
    features_ready = download_features_in_background(work)
    base = yaml.safe_load((UPSTREAM / "examples" / "custom_model.yml").read_text())
    cfg = make_config(phrase, work, base, user_config)
    cfg_path = work / "config.yaml"
    cfg_path.write_text(yaml.safe_dump(cfg))
    model = Path(cfg["output_dir"]) / f"{cfg['model_name']}.onnx"
    metrics: dict = {}
    for flag, name in (("--generate_clips", "generate"), ("--augment_clips", "augment"), ("--train_model", "train")):
        step(name)
        if flag == "--train_model":
            features_ready()  # needs the big feature files
            model.unlink(missing_ok=True)  # a failed run must not package a model left over from an earlier one
        # Upstream's --convert_to_tflite has `default="False"` (a truthy string), so it always tries TFLite after exporting
        # the ONNX and fails without tensorflow. We only need the ONNX, so a failure with the ONNX present is fine.
        tail = run(
            sys.executable, Path(__file__).with_name("run_upstream.py"), UPSTREAM / "openwakeword" / "train.py",
            "--training_config", cfg_path, flag, ok_if_exists=model if flag == "--train_model" else None,
        )
        if flag == "--train_model":
            metrics = parse_metrics(tail)
    if not model.exists():
        raise TrainError(f"Training finished but {model} was not produced; see output above.")
    step("package")
    import onnxruntime as ort

    window = ort.InferenceSession(str(model)).get_inputs()[0].shape[1]
    res = feature_models()
    manifest = write_bundle(
        out, cfg["model_name"], cfg["target_phrase"][0], res / "melspectrogram.onnx", res / "embedding_model.onnx",
        model, window, license=LICENSE, trained_with=f"wakeword-toolkit {__version__}", threshold=threshold,
    )
    metrics["targetFalsePositivesPerHour"] = cfg["target_false_positives_per_hour"]
    report = {"manifest": manifest, "metrics": metrics, "settings": cfg, "warnings": [w.__dict__ for w in check_phrase(phrase)]}
    Path(out).with_suffix(".report.json").write_text(json.dumps(report, indent=2))
    print(f"##RESULT {json.dumps(metrics)}", flush=True)
    return report
