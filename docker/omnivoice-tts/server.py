"""
OmniVoice TTS FastAPI Server
Endpoints:
  GET  /health      - Health check
  POST /tts         - Synthesize text to PCM16 audio
  GET  /voices      - List available voices / info
"""
import asyncio
import os
import torch
import numpy as np
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="OmniVoice TTS Server")

# ── Global model instance ────────────────────────────────────

model = None
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_ID = "k2-fsa/OmniVoice"

# OmniVoice uses a DAC audio tokenizer with fixed sample rate.
# The decoder output is 24kHz by default (based on DAC encoder strides: 8*5*4*2*3 = 960,
# with 25 tokens/sec -> 960*25 = 24000 Hz).
OUTPUT_SAMPLE_RATE = 24000

# Concurrency limiter: how many TTS inferences can run in parallel.
MAX_CONCURRENT = int(os.environ.get('TTS_MAX_CONCURRENT', '2'))
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)

# Directory where uploaded voice reference files are stored (shared Docker volume)
VOICES_DIR = os.environ.get('VOICES_DIR', '/app/voices')


def load_model():
    global model
    from omnivoice import OmniVoice
    print(f"Loading OmniVoice on {DEVICE}...")
    model = OmniVoice.from_pretrained(MODEL_ID)
    model = model.to(DEVICE)
    model.eval()
    print(f"✅ OmniVoice loaded on {DEVICE}")


load_model()

# ── Request / Response models ────────────────────────────────

class TtsRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize")
    voice: str = Field("default", description="Voice ID: 'default' or path to reference .wav file")
    language: str = Field("ru", description="Language code (e.g. ru, en, de)")
    sample_rate: int = Field(24000, description="Desired output sample rate (resampled if differs from native 24kHz)")


# ── Blocking inference (runs in thread pool) ─────────────────

def _synthesize_sync(text: str, language: str, voice: str, sample_rate: int) -> bytes:
    """Run model inference synchronously. Called via asyncio.to_thread()."""
    with torch.no_grad():
        # Determine if we should use voice cloning
        ref_audio = None
        if voice and voice != "default":
            # voice can be a full path like /app/voices/uuid.wav
            # or just a filename that we look up in VOICES_DIR
            if os.path.isabs(voice) and os.path.isfile(voice):
                ref_audio = voice
            elif os.path.isfile(os.path.join(VOICES_DIR, voice)):
                ref_audio = os.path.join(VOICES_DIR, voice)
            else:
                print(f"⚠️ Voice file not found: {voice}, using default voice")

        # Call the correct API: model.generate()
        kwargs = {
            "text": text,
            "language": language,
        }
        if ref_audio:
            kwargs["ref_audio"] = ref_audio

        result_tensors = model.generate(**kwargs)

    # result is list[torch.Tensor] — take the first one (single text input -> single output)
    if not result_tensors or len(result_tensors) == 0:
        raise RuntimeError("OmniVoice returned empty result")

    audio_tensor = result_tensors[0]

    # Ensure 1D (mono)
    if audio_tensor.dim() > 1:
        audio_tensor = audio_tensor.squeeze()

    # Move to CPU
    audio_tensor = audio_tensor.cpu()

    # Resample if requested sample rate differs from native
    if sample_rate != OUTPUT_SAMPLE_RATE and sample_rate > 0:
        try:
            import torchaudio
            audio_tensor = audio_tensor.unsqueeze(0)  # add channel dim
            audio_tensor = torchaudio.functional.resample(
                audio_tensor, OUTPUT_SAMPLE_RATE, sample_rate
            )
            audio_tensor = audio_tensor.squeeze(0)
        except ImportError:
            print("⚠️ torchaudio not available, cannot resample. Using native 24kHz.")
            sample_rate = OUTPUT_SAMPLE_RATE

    # Normalize and convert to int16 PCM
    if audio_tensor.is_floating_point():
        audio_tensor = (audio_tensor.clamp(-1, 1) * 32767).to(torch.int16)

    return audio_tensor.numpy().tobytes(), len(audio_tensor), sample_rate


# ── Endpoints ────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "model": MODEL_ID,
        "native_sample_rate": OUTPUT_SAMPLE_RATE,
        "max_concurrent": MAX_CONCURRENT,
        "vram_mb": _get_vram_usage(),
    }


@app.post("/tts")
async def tts(req: TtsRequest):
    if model is None:
        return Response(content="Model not loaded", status_code=503)

    if not req.text or not req.text.strip():
        return Response(content="Empty text", status_code=400)

    try:
        async with _semaphore:
            pcm_bytes, num_samples, actual_sr = await asyncio.to_thread(
                _synthesize_sync, req.text, req.language, req.voice, req.sample_rate,
            )

        duration = num_samples / actual_sr

        return Response(
            content=pcm_bytes,
            media_type="audio/pcm",
            headers={
                "X-Sample-Rate": str(actual_sr),
                "X-Channels": "1",
                "X-Bits-Per-Sample": "16",
                "X-Duration-Seconds": f"{duration:.3f}",
            },
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(content=f"TTS error: {str(e)}", status_code=500)


@app.get("/voices")
async def voices():
    # List uploaded voice files in the shared volume
    available = []
    if os.path.isdir(VOICES_DIR):
        available = [f for f in os.listdir(VOICES_DIR) if f.endswith('.wav')]

    return {
        "model": MODEL_ID,
        "native_sample_rate": OUTPUT_SAMPLE_RATE,
        "available_voices": available,
        "note": "Use 'default' for base voice or provide a .wav filename/path for zero-shot cloning.",
    }


# ── Helpers ──────────────────────────────────────────────────

def _get_vram_usage() -> Optional[int]:
    """Return GPU VRAM usage in MB, or None if not available."""
    try:
        if torch.cuda.is_available():
            return round(torch.cuda.memory_allocated() / 1024 / 1024)
    except Exception:
        pass
    return None
