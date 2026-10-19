#!/bin/sh
# One-time setup for training on macOS (Apple Silicon) or Linux. Windows: use WSL2 and run this inside it.
set -e
cd "$(dirname "$0")"
if [ "$(uname)" = "Darwin" ]; then brew install uv espeak-ng sox ffmpeg; else sudo apt-get install -y espeak-ng sox ffmpeg; fi
git submodule update --init
uv venv --python 3.11 .venv
uv pip install -p .venv/bin/python -r requirements.txt -e .
echo "Done. Use: .venv/bin/wakeword train \"prometheus\" --out prometheus.wakeword"
