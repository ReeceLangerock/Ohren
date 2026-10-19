"""Cheap checks on a wake phrase before spending GPU time on it."""
import re
from dataclasses import dataclass

# Words so common in everyday speech that a phrase made only of them will misfire constantly.
COMMON = {"hey", "hi", "ok", "okay", "hello", "computer", "assistant", "music", "stop", "go", "yes", "no", "start", "play"}


@dataclass
class Warning:
    level: str  # "strong" | "mild"
    message: str


def syllables(word: str) -> int:
    # ponytail: vowel-group heuristic, off by one on odd words ("area"); swap in `pronouncing` if it matters.
    w = word.lower()
    n = len(re.findall(r"[aeiouy]+", w.lstrip("y") if w.startswith("y") and len(w) > 1 else w))
    if n > 1 and w.endswith("e") and not w.endswith(("le", "ee")):
        n -= 1
    return max(n, 1)


def check_phrase(phrase: str) -> list[Warning]:
    p = " ".join(phrase.lower().split())
    if not p or not re.fullmatch(r"[a-z' ]+", p):
        raise ValueError("phrase must be words made of letters only (e.g. 'hey nova')")
    words = p.split()
    n = sum(syllables(w) for w in words)
    out = []
    if n < 2:
        out.append(Warning("strong", f"'{p}' is a single syllable and will very likely false-trigger. Use 3-4 syllables."))
    elif n < 3:
        out.append(Warning("mild", f"'{p}' is short ({n} syllables) and may false-trigger often. 3-4 syllables work best, e.g. 'hey {p}'."))
    if all(w in COMMON for w in words):
        out.append(Warning("strong", f"'{p}' is made only of very common words and will false-trigger in normal speech."))
    if n > 8:
        out.append(Warning("mild", f"'{p}' is long ({n} syllables); people will find it tiring to say and it is harder to train."))
    return out
