"""Runs a script with multiprocessing's "fork" start method.

Upstream's train.py hands lambdas to DataLoader workers, which only works with fork (Linux default).
macOS defaults to spawn and fails with "Can't pickle <lambda>". Safe here because the classifier trains on CPU.

usage: python run_upstream.py script.py [args...]
"""
import logging
import multiprocessing
import runpy
import sys

multiprocessing.set_start_method("fork", force=True)
logging.basicConfig(level=logging.INFO, format="%(message)s")  # upstream reports final metrics via logging.info
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name="__main__")
