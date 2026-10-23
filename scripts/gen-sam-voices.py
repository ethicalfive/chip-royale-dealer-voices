#!/usr/bin/env python3
"""Regenerate the Sam dealer lines on Eleven v4.

Requires ELEVEN_KEY in the environment. The voice id is Sam's clone.
Usage:
  python3 scripts/gen-sam-voices.py            # lines whose tags were wrong, plus the throat
  python3 scripts/gen-sam-voices.py --all      # every dealer line
  python3 scripts/gen-sam-voices.py placebets n16

Square brackets are performance directions, not words. Never put the word
"clear" in a tag: Eleven v4 reads it as a throat clear and bakes one onto
the front of the line. Non-verbal sounds get their own file (see throat).
"""

import json
import math
import os
import re
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request

VOICE_ID = os.environ.get("VOICE_ID", "2XEJ1dB7FoaTdY2mp2Lm")
OUT_DIR = os.environ.get(
    "OUT_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "voices", "sam"),
)
PEAK = 0.30

# Emotion words only. No sound-effect verbs, and no "clear".
LINES = [
    ("welcome", "[warm, welcoming] Welcome to the Gilt Shoe."),
    ("goodluck", "[friendly] Good luck."),
    ("placebets", "Place your bets, please."),
    ("nomorebets", "No more bets."),
    ("insurance", "[curious] Insurance?"),
    ("blackjack", "[pleased] Blackjack."),
    ("twentyone", "[pleased] Twenty-one."),
    ("dealerblackjack", "Dealer has blackjack."),
    ("bust", "[matter of fact] Bust."),
    ("dealerbusts", "Dealer busts."),
    ("youwin", "[pleased] You win."),
    ("housewins", "[cool] House wins."),
    ("push", "[neutral] Push."),
    ("doubledown", "[acknowledging] Double down."),
    ("split", "[acknowledging] Split."),
    ("surrender", "[sympathetic] Surrender."),
    ("evenmoney", "[curious] Even money?"),
    ("insurancepays", "[pleased] Insurance pays."),
    ("insuranceloses", "[apologetic] Insurance loses."),
    ("newshoe", "[bright] New shoe."),
    ("nicehand", "Nice hand."),
    ("soft", "Soft."),
    ("n2", "[steady] Two."),
    ("n3", "[steady] Three."),
    ("n4", "[steady] Four."),
    ("n5", "[steady] Five."),
    ("n6", "[steady] Six."),
    ("n7", "[steady] Seven."),
    ("n8", "[steady] Eight."),
    ("n9", "[steady] Nine."),
    ("n10", "[steady] Ten."),
    ("n11", "[steady] Eleven."),
    ("n12", "[steady] Twelve."),
    ("n13", "[steady] Thirteen."),
    ("n14", "[steady] Fourteen."),
    ("n15", "[steady] Fifteen."),
    ("n16", "Sixteen."),
    ("n17", "Seventeen."),
    ("n18", "[steady] Eighteen."),
    ("n19", "[steady] Nineteen."),
    ("n20", "[steady] Twenty."),
    ("sorry", "[sympathetic] Sorry."),
    ("welldone", "[impressed] Oh, well done."),
    ("beautiful", "[delighted] Beautiful hand."),
    ("thatsaway", "[encouraging] That's the way."),
    ("lovely", "[warm] Lovely."),
    ("congrats", "Congratulations!"),
    ("toobad", "[sympathetic] Ah, too bad."),
    ("unlucky", "[sympathetic] Unlucky."),
    ("notthistime", "[gentle] Not this time."),
    ("shame", "[disappointed] Oh, what a shame."),
    ("housetakes", "[cool] The house takes it."),
    ("bustsoft", "Ah, bust."),
    ("youwinex", "[excited] Yes! You win."),
    ("nicehandex", "Nice hand!"),
    ("blackjackex", "[excited] Blackjack!"),
    ("twentyoneex", "[excited] Twenty-one!"),
    ("dealerbustsex", "Dealer busts!"),
    ("throat", "[clears throat] Hmm."),
]

# The first pass used [clear, inviting] and [clear, steady]. v4 treated
# "clear" as a throat clear and stuck one on the front of each of these.
RETAKE = ["placebets", "throat", *[f"n{n}" for n in range(2, 21)]]


def peak_of(path: str) -> float:
    raw = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "22050", "-f", "s16le", "-"]
    )
    n = len(raw) // 2
    mx = 0
    for i in range(0, n, 4096):
        chunk = raw[i * 2 : (i + 4096) * 2]
        count = len(chunk) // 2
        if count == 0:
            break
        samples = struct.unpack("<" + "h" * count, chunk)
        mx = max(mx, max(abs(s) for s in samples))
    return mx / 32768


def normalize(path: str) -> None:
    pk = peak_of(path)
    if pk <= PEAK + 0.01 or pk <= 0:
        print(f"  level {pk:.2f}")
        return
    db = 20 * math.log10(PEAK / pk)
    tmp = path + ".norm.mp3"
    subprocess.check_call(
        ["ffmpeg", "-v", "error", "-y", "-i", path, "-af", f"volume={db:.2f}dB", "-c:a", "libmp3lame", "-b:a", "128k", tmp]
    )
    os.replace(tmp, path)
    print(f"  level {pk:.2f} -> {peak_of(path):.2f} ({db:.1f} dB)")


def strip_lead(path: str) -> None:
    """Drop a cough glued to the front of a line.

    The cough is a burst in the first half-second, then a short dip, then the words.
    A plain pause inside a sentence is left alone.
    """
    raw = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"]
    )
    n = len(raw) // 2
    if n < 8000:
        return
    samples = struct.unpack("<" + "h" * n, raw)
    win = 320
    frames = []
    for i in range(0, n - win, win):
        chunk = samples[i : i + win]
        frames.append(math.sqrt(sum(s * s for s in chunk) / win) / 32768)
    # Look for the quietest point between 0.28s and 0.55s.
    lo = 14
    hi = min(28, len(frames) - 8)
    if hi <= lo:
        return
    dip = min(range(lo, hi), key=lambda i: frames[i])
    if frames[dip] > 0.008:
        return
    before = max(frames[4:dip] or [0])
    after = max(frames[dip + 1 : dip + 12] or [0])
    if before < 0.05 or after < 0.05:
        return
    start = max(0.0, dip * 0.02 - 0.02)
    tmp = path + ".lead.mp3"
    subprocess.check_call(
        ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-i", path, "-c:a", "libmp3lame", "-b:a", "128k", tmp]
    )
    os.replace(tmp, path)
    print(f"  trimmed lead {start:.2f}s")


def trim_throat(path: str) -> None:
    # A tag on its own is rejected, so the request ends with a carrier word.
    # Keep the throat and drop that word, which sits after a short silence.
    tmp = path + ".trim.mp3"
    subprocess.check_call(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            path,
            "-af",
            "silenceremove=start_periods=0:stop_periods=1:stop_threshold=-32dB:stop_duration=0.2",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            tmp,
        ]
    )
    os.replace(tmp, path)


def generate(key: str, text: str, api_key: str) -> None:
    if os.environ.get("PLAIN"):
        text = re.sub(r"\[[^\]]*\]\s*", "", text).strip()
    body = json.dumps(
        {
            "text": text,
            "model_id": "eleven_v4",
            "voice_settings": {"stability": 0.7, "similarity_boost": 0.95, "use_speaker_boost": True},
        }
    ).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=mp3_44100_128",
        data=body,
        headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    path = os.path.join(OUT_DIR, f"{key}.mp3")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as res:
                data = res.read()
            if not data.startswith(b"ID3") and not data.startswith(b"\xff"):
                raise RuntimeError(data[:120])
            os.makedirs(OUT_DIR, exist_ok=True)
            with open(path, "wb") as handle:
                handle.write(data)
            print(f"wrote {key} {len(data)}")
            normalize(path)
            if key == "throat":
                trim_throat(path)
            return
        except urllib.error.HTTPError as err:
            detail = err.read().decode()[:240]
            print(f"HTTP {key} {err.code} {detail}")
            if err.code not in (429, 500, 502, 503):
                raise
            time.sleep(3 + attempt * 2)
    raise RuntimeError(f"gave up on {key}")


def main() -> None:
    api_key = os.environ.get("ELEVEN_KEY", "")
    if not api_key:
        sys.exit("Set ELEVEN_KEY")
    wanted = sys.argv[1:]
    if not wanted:
        wanted = RETAKE
    elif wanted == ["--all"]:
        wanted = [key for key, _ in LINES]
    by_key = dict(LINES)
    missing = [key for key in wanted if key not in by_key]
    if missing:
        sys.exit(f"unknown keys: {', '.join(missing)}")
    for key in wanted:
        generate(key, by_key[key], api_key)
        time.sleep(0.35)
    print(f"done {len(wanted)}")


if __name__ == "__main__":
    main()
