"""WhisperX transcription predictor for Replicate."""

import gc
import time

import torch
import whisperx
from cog import BaseModel, BasePredictor, Input, Path
from typing import Any

COMPUTE_TYPE = "float16"
DEVICE = "cuda"
WHISPER_MODEL = "medium.en"


class Output(BaseModel):
    segments: Any
    detected_language: str


class Predictor(BasePredictor):
    def setup(self):
        """Pre-download the whisper model at container startup."""
        self.model = whisperx.load_model(
            WHISPER_MODEL,
            DEVICE,
            compute_type=COMPUTE_TYPE,
        )

    def predict(
        self,
        audio: Path = Input(description="Audio file"),
        language: str = Input(
            description="ISO code of the language spoken in the audio, e.g. en, zh",
            default=None,
        ),
        batch_size: int = Input(
            description="Batch size for parallel transcription",
            default=32,
        ),
        align_output: bool = Input(
            description="Align output for word-level timestamps",
            default=True,
        ),
        initial_prompt: str = Input(
            description="Optional text to provide as initial prompt for the first window",
            default=None,
        ),
    ) -> Output:
        with torch.inference_mode():
            start = time.time()
            audio_data = whisperx.load_audio(audio)
            print(f"[load_audio] {time.time() - start:.2f}s")

            # Transcribe
            start = time.time()
            asr_options = {}
            if initial_prompt:
                asr_options["initial_prompt"] = initial_prompt

            if language:
                model = whisperx.load_model(
                    WHISPER_MODEL, DEVICE,
                    compute_type=COMPUTE_TYPE,
                    language=language,
                    asr_options=asr_options if asr_options else None,
                )
            else:
                model = self.model

            result = model.transcribe(audio_data, batch_size=batch_size)
            detected_language = result["language"]
            print(f"[transcribe] {time.time() - start:.2f}s, language={detected_language}")

            if language:
                del model

            gc.collect()
            torch.cuda.empty_cache()

            # Align for word-level timestamps
            if align_output:
                start = time.time()
                model_a, metadata = whisperx.load_align_model(
                    language_code=detected_language, device=DEVICE
                )
                result = whisperx.align(
                    result["segments"],
                    model_a,
                    metadata,
                    audio_data,
                    DEVICE,
                    return_char_alignments=False,
                )
                print(f"[align] {time.time() - start:.2f}s")

                del model_a
                gc.collect()
                torch.cuda.empty_cache()

            return Output(
                segments=result["segments"],
                detected_language=detected_language,
            )
