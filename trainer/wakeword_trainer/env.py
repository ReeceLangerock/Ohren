import shutil
import sys


class TrainError(Exception):
    """A problem the user can fix; the CLI prints the message without a traceback."""


def gpu_available() -> bool:
    try:
        import torch
    except ImportError:
        raise TrainError("Training requirements are not installed. Run: pip install -r trainer/requirements.txt") from None
    return torch.cuda.is_available() or torch.backends.mps.is_available()


def check_environment(platform: str | None = None, gpu: bool | None = None, free_gb: float | None = None, need_gb: int = 15):
    platform = platform or sys.platform
    if platform.startswith("win"):
        raise TrainError(
            "Training does not run natively on Windows (the speech generator needs Linux or macOS). "
            "Use WSL2 (Ubuntu) with your NVIDIA GPU instead."
        )
    if gpu is None:
        gpu = gpu_available()
    if not gpu:
        raise TrainError(
            "No GPU found (NVIDIA CUDA, or Apple Silicon). Training on a CPU would take days. "
            "Use a machine with a GPU, or a GPU Colab runtime."
        )
    if free_gb is None:
        free_gb = shutil.disk_usage(".").free / 1e9
    if free_gb < need_gb:
        raise TrainError(f"Not enough disk space: {free_gb:.0f} GB free, about {need_gb} GB needed for datasets and clips.")
