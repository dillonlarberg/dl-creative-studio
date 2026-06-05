#!/usr/bin/env python3
"""probe-audio.py — extract catalog metadata from an audio file with librosa.

Prints {"bpm": <float>, "durationSec": <float>} JSON to stdout. Used by
scripts/ingest-music.ts to auto-populate sampleMusic docs so nobody hand-collects
metadata. Same toolchain/contract style as scripts/tempo.py.

Usage: python3 probe-audio.py <audio-path>
"""
import json
import sys


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: probe-audio.py <audio-path>"}), file=sys.stderr)
        sys.exit(2)

    path = sys.argv[1]
    try:
        import librosa
        import numpy as np

        y, sr = librosa.load(path, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))

        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        try:
            from librosa.feature.rhythm import tempo as tempo_fn  # librosa >=0.10
        except Exception:
            from librosa.beat import tempo as tempo_fn  # older librosa
        bpm = float(np.ravel(tempo_fn(onset_envelope=onset_env, sr=sr))[0])

        if not (bpm > 0) or not (duration > 0):
            raise ValueError(f"bad probe: bpm={bpm} duration={duration}")

        print(json.dumps({"bpm": round(bpm, 2), "durationSec": round(duration, 2)}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
