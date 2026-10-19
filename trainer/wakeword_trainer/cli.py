import argparse
import sys
from pathlib import Path

from .env import TrainError
from .preflight import check_phrase


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="wakeword", description="Train a custom wake word and write a .wakeword bundle.")
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train", help='wakeword train "hey nova" --out hey_nova.wakeword')
    t.add_argument("phrase")
    t.add_argument("--out", type=Path, required=True)
    t.add_argument("--config", type=Path, help="optional config.yaml overriding training settings")
    t.add_argument("--threshold", type=float, default=0.5, help="detection threshold written to the bundle (tune with the test page)")
    t.add_argument("--work-dir", type=Path, default=Path.home() / ".cache" / "wakeword-toolkit")
    c = sub.add_parser("preflight", help="check a phrase without training")
    c.add_argument("phrase")
    a = p.parse_args(argv)
    try:
        if a.cmd == "preflight":
            ws = check_phrase(a.phrase)
            for w in ws:
                print(f"warning ({w.level}): {w.message}")
            if not ws:
                print("looks fine")
            return 0
        from .train import train

        r = train(a.phrase, a.out, a.work_dir, a.config, a.threshold)
        print(f"Wrote {a.out} (threshold {r['manifest']['threshold']}). Report: {a.out.with_suffix('.report.json')}")
        return 0
    except (TrainError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
