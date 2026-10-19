import pytest

from wakeword_trainer.env import TrainError, check_environment


def test_no_gpu_is_readable():
    with pytest.raises(TrainError, match="GPU"):
        check_environment(platform="linux", gpu=False, free_gb=100)


def test_full_disk_is_readable():
    with pytest.raises(TrainError, match="disk space"):
        check_environment(platform="linux", gpu=True, free_gb=3)


def test_windows_points_to_wsl():
    with pytest.raises(TrainError, match="WSL2"):
        check_environment(platform="win32", gpu=True, free_gb=100)


def test_mac_with_gpu_is_ok():
    check_environment(platform="darwin", gpu=True, free_gb=100)


def test_ok():
    check_environment(platform="linux", gpu=True, free_gb=100)
