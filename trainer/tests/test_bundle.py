import json
import zipfile

from wakeword_trainer.bundle import write_bundle


def test_bundle_has_manifest_and_models(tmp_path):
    for n in ("m", "e", "c"):
        (tmp_path / n).write_bytes(b"x")
    out = tmp_path / "a.wakeword"
    write_bundle(out, "a", "hey a", tmp_path / "m", tmp_path / "e", tmp_path / "c", 16, license="non-commercial", trained_with="t")
    with zipfile.ZipFile(out) as z:
        assert sorted(z.namelist()) == ["classifier.onnx", "embedding.onnx", "manifest.json", "melspec.onnx"]
        m = json.loads(z.read("manifest.json"))
    assert m["formatVersion"] == 1 and m["embeddingWindow"] == 16 and m["license"] == "non-commercial"
    assert m["threshold"] == 0.5


def test_bundle_threshold_override(tmp_path):
    for n in ("m", "e", "c"):
        (tmp_path / n).write_bytes(b"x")
    out = tmp_path / "a.wakeword"
    write_bundle(out, "a", "hey a", tmp_path / "m", tmp_path / "e", tmp_path / "c", 16, license="l", trained_with="t", threshold=0.75)
    with zipfile.ZipFile(out) as z:
        assert json.loads(z.read("manifest.json"))["threshold"] == 0.75
