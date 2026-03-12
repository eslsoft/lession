#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "edge-tts>=6.1",
# ]
# ///
"""
Text-to-speech synthesis using Edge TTS.

Reads JSON from stdin: {
  "text": "Text to synthesize",
  "outputPath": "/path/to/output.mp3",
  "voice": "en-US-AndrewMultilingualNeural",
  "speed": 1.0
}

Writes JSON lines to stdout:
  {"type": "progress", "percent": 45}
  {"type": "result", "duration": 12.3, "segments": [{"start": 0.12, "end": 0.28, "text": "The"}, ...]}

Run via: uv run scripts/tts_edge.py
"""
import sys
import json
import asyncio
import re
import struct
import subprocess

import edge_tts


def speed_to_rate(speed: float) -> str:
    """Convert numeric speed (e.g. 1.0, 0.8, 1.2) to edge-tts rate format (e.g. '+0%', '-20%', '+20%')."""
    pct = round((speed - 1.0) * 100)
    if pct >= 0:
        return f"+{pct}%"
    return f"{pct}%"


def split_sentences(text: str) -> list[str]:
    """Split text into sentences for progress tracking."""
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in parts if s.strip()] or [text]


async def synthesize(text: str, output_path: str, voice: str, speed: float):
    rate = speed_to_rate(speed)

    communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")

    # Collect word boundary events and audio data
    total_chars = len(text)
    chars_processed = 0
    last_reported = 0
    word_boundaries: list[dict] = []
    audio_chunks: list[bytes] = []

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            offset_s = chunk["offset"] / 10_000_000  # 100-nanosecond units to seconds
            duration_s = chunk["duration"] / 10_000_000
            word_text = chunk["text"]
            word_boundaries.append({
                "start": round(offset_s, 3),
                "end": round(offset_s + duration_s, 3),
                "text": word_text,
            })
            # Report progress based on character offset in text
            chars_processed += len(word_text) + 1
            percent = min(int((chars_processed / total_chars) * 95), 95)
            if percent >= last_reported + 5:
                print(json.dumps({"type": "progress", "percent": percent}), flush=True)
                last_reported = percent

    # Write combined audio to file
    audio_data = b"".join(audio_chunks)
    with open(output_path, "wb") as f:
        f.write(audio_data)

    # Use last word boundary end time if available, otherwise probe with ffprobe
    if word_boundaries:
        duration = word_boundaries[-1]["end"]
    else:
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", output_path],
                capture_output=True, text=True, timeout=10,
            )
            duration = float(result.stdout.strip())
        except Exception:
            duration = len(audio_data) / 16000  # last resort estimate

    print(json.dumps({"type": "progress", "percent": 100}), flush=True)

    print(json.dumps({
        "type": "result",
        "duration": round(duration, 2),
        "segments": word_boundaries,
    }), flush=True)


def main():
    input_data = json.loads(sys.stdin.read())
    text = input_data["text"]
    output_path = input_data["outputPath"]
    voice = input_data.get("voice", "en-US-AndrewMultilingualNeural")
    speed = input_data.get("speed", 1.0)

    print(json.dumps({"type": "progress", "percent": 0}), flush=True)

    asyncio.run(synthesize(text, output_path, voice, speed))


if __name__ == "__main__":
    main()
