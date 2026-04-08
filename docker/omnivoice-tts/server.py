"""
OmniVoice TTS FastAPI Server
Endpoints:
  GET  /health      - Health check
  POST /tts         - Synthesize text to PCM16 audio
  GET  /voices      - List available voices / info
"""
import asyncio
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

# Concurrency limiter: how many TTS inferences can run in parallel.
# GPU can handle 2-3 concurrent inferences sharing the same model weights.
# Requests beyond this limit will queue (not rejected).
MAX_CONCURRENT = int(__import__('os').environ.get('TTS_MAX_CONCURRENT', '3'))
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)

def load_model():
    global model
    from omnivoice import OmniVoice
    print(f"Loading OmniVoice on {DEVICE}...")
    # device is NOT a from_pretrained() argument — move model to device after loading
    model = OmniVoice.from_pretrained(MODEL_ID)
    model = model.to(DEVICE)
    model.eval()
    # INT8 quantization for lower VRAM (~3.5GB instead of ~6GB)
    if DEVICE == "cuda":
        try:
            model = model.quantize(dtype=torch.int8)
            print("✅ OmniVoice loaded with INT8 quantization on CUDA")
        except Exception as e:
            print(f"⚠️ INT8 quantization failed, using default dtype: {e}")
    else:
        print("✅ OmniVoice loaded on CPU")

load_model()

# ── Request / Response models ────────────────────────────────

class TtsRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize")
    voice: str = Field("default", description="Voice ID or 'default'")
    language: str = Field("ru", description="Language code (e.g. ru, en, de)")
    sample_rate: int = Field(24000, description="Output sample rate (24000 recommended)")

# ── Blocking inference (runs in thread pool) ─────────────────

def _synthesize_sync(text: str, language: str, voice: str, sample_rate: int) -> bytes:
    """Run model inference synchronously. Called via asyncio.to_thread()."""
    with torch.no_grad():
        result = model.synthesize(
            text=text,
            language=language,
            speaker=voice if voice != "default" else None,
            sample_rate=sample_rate,
        )

    # Extract audio tensor
    if isinstance(result, dict):
        audio_tensor = result.get("audio", result.get("waveform"))
    elif isinstance(result, torch.Tensor):
        audio_tensor = result
    else:
        audio_tensor = torch.tensor(result)

    # Normalize and convert to int16
    if audio_tensor.is_floating_point():
        audio_tensor = (audio_tensor.clamp(-1, 1) * 32767).to(torch.int16)

    # Ensure 1D (mono)
    if audio_tensor.dim() > 1:
        audio_tensor = audio_tensor.squeeze()

    return audio_tensor.cpu().numpy().tobytes(), len(audio_tensor)

# ── Endpoints ────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "model": MODEL_ID,
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
        # Semaphore limits concurrent GPU inferences;
        # excess requests queue here without blocking the event loop.
        async with _semaphore:
            pcm_bytes, num_samples = await asyncio.to_thread(
                _synthesize_sync, req.text, req.language, req.voice, req.sample_rate,
            )

        duration = num_samples / req.sample_rate

        return Response(
            content=pcm_bytes,
            media_type="audio/pcm",
            headers={
                "X-Sample-Rate": str(req.sample_rate),
                "X-Channels": "1",
                "X-Bits-Per-Sample": "16",
                "X-Duration-Seconds": f"{duration:.3f}",
            },
        )
    except Exception as e:
        return Response(content=f"TTS error: {str(e)}", status_code=500)


@app.get("/voices")
async def voices():
    return {
        "model": MODEL_ID,
        "note": "OmniVoice supports 600+ languages in zero-shot mode. "
                "Use any voice ID or 'default'. Voice cloning available via reference audio.",
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

