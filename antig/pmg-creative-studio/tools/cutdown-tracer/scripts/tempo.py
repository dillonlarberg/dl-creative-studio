#!/usr/bin/env python3
"""tempo.py — detect a track's tempo with librosa and print {"bpm": <float>} JSON.

The cutdown-tracer's `TempoDetector` seam (src/librosa.ts) spawns this as a
subprocess, keeping Python/DSP out of the TypeScript codebase. Later it becomes a
Cloud Run microservice behind the same interface — callers never change.

Contract (the only thing src/librosa.ts depends on):
  - on success: prints a single JSON object {"bpm": <positive float>} to stdout, exit 0
  - on failure: prints {"error": "<message>"} to stderr, non-zero exit

Usage: python3 tempo.py <audio-path-or-url>
       (https URLs are downloaded to a temp file first — in v0 these are the
        GCS long-TTL signed URLs the MusicCatalog will hand us in step 5)
"""
import json
import os
import sys
import tempfile
import urllib.request


def _resolve_to_local(src: str):
    """Return (local_path, cleanup_path_or_None). Downloads http(s) sources."""
    if src.startswith("http://") or src.startswith("https://"):
        suffix = os.path.splitext(src.split("?")[0])[1] or ".audio"
        fd, tmp = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        urllib.request.urlretrieve(src, tmp)
        return tmp, tmp
    return src, None


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: tempo.py <audio-path-or-url>"}), file=sys.stderr)
        sys.exit(2)

    src = sys.argv[1]
    cleanup = None
    try:
        path, cleanup = _resolve_to_local(src)

        # Imported lazily so a missing librosa fails with a clear, catchable error
        # rather than blowing up at module load.
        import librosa
        import numpy as np

        y, sr = librosa.load(path, mono=True)
        # Global tempo estimate from the onset envelope. v0 needs the BPM only
        # (it drives a UNIFORM bar-grid; real beat *positions* are v1), and
        # beat_track's tempo can return 0 on sparse/clean signals — the global
        # estimator is the robust choice here.
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        try:
            from librosa.feature.rhythm import tempo as tempo_fn  # librosa >=0.10
        except Exception:
            from librosa.beat import tempo as tempo_fn  # older librosa
        tempo = tempo_fn(onset_envelope=onset_env, sr=sr)
        # librosa returns tempo as an ndarray; normalise to a scalar.
        bpm = float(np.ravel(tempo)[0])
        if not (bpm > 0):
            raise ValueError(f"non-positive bpm: {bpm}")

        print(json.dumps({"bpm": round(bpm, 2)}))
    except Exception as exc:  # noqa: BLE001 — surface any failure as the error contract
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
    finally:
        if cleanup and os.path.exists(cleanup):
            os.remove(cleanup)


if __name__ == "__main__":
    main()
