import pytest

from wakeword_trainer.preflight import check_phrase, syllables


@pytest.mark.parametrize(
    "word,n", [("hey", 1), ("nova", 2), ("jarvis", 2), ("computer", 3), ("alexa", 3), ("make", 1)]
)
def test_syllables(word, n):
    assert syllables(word) == n


def levels(phrase):
    return {w.level for w in check_phrase(phrase)}


def test_one_syllable_is_strong_warning():
    assert "strong" in levels("stop")


def test_single_word_warns():
    ws = check_phrase("nova")
    assert ws and "false" in ws[0].message.lower()


def test_hey_nova_is_fine():
    assert check_phrase("hey nova") == []


def test_common_words_warn():
    assert check_phrase("hello computer")  # common words only, whatever the syllables


@pytest.mark.parametrize("bad", ["", "   ", "hey 123", "hey, nova!"])
def test_bad_characters_rejected(bad):
    with pytest.raises(ValueError, match="phrase"):
        check_phrase(bad)
