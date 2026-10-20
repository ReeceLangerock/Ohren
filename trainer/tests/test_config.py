from wakeword_trainer.train import make_config


def test_config_overrides_and_user_yaml(tmp_path):
    base = {"model_name": "x", "target_phrase": ["hey jarvis"], "n_samples": 10000, "steps": 50000, "output_dir": "o"}
    user = tmp_path / "config.yaml"
    user.write_text("steps: 1000\n")
    c = make_config("Hey Nova", tmp_path, base, user_config=user)
    assert c["model_name"] == "hey_nova" and c["target_phrase"] == ["hey nova"]
    assert c["steps"] == 1000 and c["n_samples"] == 10000
    assert c["output_dir"] == str(tmp_path / "model")
