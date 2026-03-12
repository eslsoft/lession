#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "kokoro-onnx>=0.4",
#     "soundfile>=0.12",
#     "numpy>=1.24",
# ]
# ///
"""
Text-to-speech synthesis using Kokoro-82M (ONNX).

Reads JSON from stdin: {
  "text": "Text to synthesize",
  "outputPath": "/path/to/output.wav",
  "voice": "af_heart",
  "speed": 1.0
}

Writes JSON lines to stdout:
  {"type": "progress", "percent": 45}
  {"type": "result", "duration": 123.45}

Run via: uv run scripts/tts_kokoro.py
"""
import sys
import json
import os
import re
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

MODEL_BASE_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
MODEL_FILENAME = "kokoro-v1.0.onnx"
VOICES_FILENAME = "voices-v1.0.bin"


def get_cache_dir() -> Path:
    """Get or create the cache directory for model files."""
    cache_dir = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "kokoro-onnx"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def download_if_missing(filename: str) -> str:
    """Download a model file from GitHub releases if not already cached."""
    cache_dir = get_cache_dir()
    local_path = cache_dir / filename
    if local_path.exists():
        return str(local_path)

    url = f"{MODEL_BASE_URL}/{filename}"
    print(json.dumps({"type": "status", "message": f"Downloading {filename}..."}), flush=True)
    urllib.request.urlretrieve(url, local_path)
    return str(local_path)


def split_paragraphs(text: str) -> list[str]:
    """Split text into paragraphs. Preserves natural paragraph boundaries."""
    paragraphs = re.split(r'\n\s*\n|\n', text.strip())
    return [p.strip() for p in paragraphs if p.strip()] or [text]


def main():
    input_data = json.loads(sys.stdin.read())
    text = input_data["text"]
    output_path = input_data["outputPath"]
    voice = input_data.get("voice", "af_heart")
    speed = input_data.get("speed", 1.0)

    from kokoro_onnx import Kokoro

    print(json.dumps({"type": "progress", "percent": 0}), flush=True)

    # Download model files if needed (cached after first run)
    model_path = download_if_missing(MODEL_FILENAME)
    voices_path = download_if_missing(VOICES_FILENAME)
    kokoro = Kokoro(model_path, voices_path)

    paragraphs = split_paragraphs(text)
    total = len(paragraphs)
    all_audio = []
    segments = []
    sample_rate = 24000
    cursor = 0.0  # current time position in seconds
    paragraph_pause = 0.8  # silence between paragraphs

    for i, paragraph in enumerate(paragraphs):
        try:
            audio, sr = kokoro.create(paragraph, voice=voice, speed=speed)
            sample_rate = sr
            para_duration = len(audio) / sr
            segments.append({
                "start": round(cursor, 3),
                "end": round(cursor + para_duration, 3),
                "text": paragraph,
            })
            all_audio.append(audio)
            cursor += para_duration
            # Add a pause between paragraphs
            if i < total - 1:
                all_audio.append(np.zeros(int(sr * paragraph_pause), dtype=audio.dtype))
                cursor += paragraph_pause
        except Exception as e:
            print(json.dumps({"type": "warning", "message": f"Skipped paragraph {i+1}: {e}"}), flush=True)

        percent = int(((i + 1) / total) * 100)
        print(json.dumps({"type": "progress", "percent": percent}), flush=True)

    if not all_audio:
        print(json.dumps({"type": "error", "message": "No audio generated"}), flush=True)
        sys.exit(1)

    combined = np.concatenate(all_audio)
    duration = len(combined) / sample_rate

    sf.write(output_path, combined, sample_rate)

    print(json.dumps({
        "type": "result",
        "duration": round(duration, 2),
        "segments": segments,
    }), flush=True)


if __name__ == "__main__":
    main()
