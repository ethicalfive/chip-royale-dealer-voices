#!/usr/bin/env python3
"""Aeon, the Monkey narrator. Raw ElevenLabs mp3s, no trimming of the words.

Game calls stay plain. A few lines are his own, and the cough is a separate file.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

VOICE_ID = os.environ.get("VOICE_ID", "0cHaPqKsmj5pwyeBYIFB")
OUT_DIR = os.environ.get(
    "OUT_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "voices", "aeon"),
)

LINES = [
    ("welcome", "Welcome to the Gilt Shoe."),
    ("goodluck", "Good luck."),
    ("placebets", "Place your bets."),
    ("nomorebets", "No more bets."),
    ("insurance", "Insurance?"),
    ("blackjack", "Blackjack."),
    ("twentyone", "Twenty-one."),
    ("dealerblackjack", "Dealer has blackjack."),
    ("bust", "Bust."),
    ("dealerbusts", "Dealer busts."),
    ("youwin", "You win."),
    ("housewins", "House wins."),
    ("push", "Push."),
    ("doubledown", "Double down."),
    ("split", "Split."),
    ("surrender", "Surrender."),
    ("evenmoney", "Even money?"),
    ("insurancepays", "Insurance pays."),
    ("insuranceloses", "Insurance loses."),
    ("newshoe", "New shoe."),
    ("nicehand", "Nice hand."),
    ("soft", "Soft."),
    ("n2", "Two."),
    ("n3", "Three."),
    ("n4", "Four."),
    ("n5", "Five."),
    ("n6", "Six."),
    ("n7", "Seven."),
    ("n8", "Eight."),
    ("n9", "Nine."),
    ("n10", "Ten."),
    ("n11", "Eleven."),
    ("n12", "Twelve."),
    ("n13", "Thirteen."),
    ("n14", "Fourteen."),
    ("n15", "Fifteen."),
    ("n16", "Sixteen."),
    ("n17", "Seventeen."),
    ("n18", "Eighteen."),
    ("n19", "Nineteen."),
    ("n20", "Twenty."),
    ("sorry", "Sorry."),
    ("welldone", "Oh, well done."),
    ("beautiful", "Beautiful hand."),
    ("thatsaway", "The nature of Monkey was irrepressible!"),
    ("lovely", "With our thoughts, we make the world."),
    ("congrats", "Congratulations!"),
    ("toobad", "Ah, too bad."),
    ("unlucky", "Unlucky."),
    ("notthistime", "And yet again."),
    ("shame", "Primal chaos reigned."),
    ("housetakes", "Heaven sought order."),
    ("bustsoft", "Ah, bust."),
    ("youwinex", "Yes! You win."),
    ("nicehandex", "Nice hand!"),
    ("blackjackex", "Blackjack!"),
    ("twentyoneex", "Twenty-one!"),
    ("dealerbustsex", "Dealer busts!"),
    ("throat", "[clears throat] Hmm."),
]


def generate(key: str, text: str, api_key: str) -> None:
    body = json.dumps(
        {
            "text": text,
            "model_id": "eleven_v4",
            "voice_settings": {"stability": 0.65, "similarity_boost": 0.92, "use_speaker_boost": True},
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
            if len(data) < 800 or (not data.startswith(b"ID3") and not data.startswith(b"\xff")):
                raise RuntimeError(data[:160])
            os.makedirs(OUT_DIR, exist_ok=True)
            with open(path, "wb") as handle:
                handle.write(data)
            print(f"wrote {key} {len(data)}", flush=True)
            return
        except urllib.error.HTTPError as err:
            detail = err.read().decode()[:300]
            print(f"HTTP {key} {err.code} {detail}", flush=True)
            if err.code not in (429, 500, 502, 503):
                raise
            time.sleep(3 + attempt * 2)
    raise RuntimeError(f"gave up on {key}")


def main() -> None:
    api_key = os.environ.get("ELEVEN_KEY", "")
    if not api_key:
        sys.exit("Set ELEVEN_KEY")
    wanted = sys.argv[1:]
    if not wanted or wanted == ["--all"]:
        wanted = [key for key, _ in LINES]
    by_key = dict(LINES)
    missing = [key for key in wanted if key not in by_key]
    if missing:
        sys.exit(f"unknown keys: {', '.join(missing)}")
    for key in wanted:
        generate(key, by_key[key], api_key)
        time.sleep(0.3)
    print(f"done {len(wanted)}", flush=True)


if __name__ == "__main__":
    main()
