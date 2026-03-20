"""
Silero TTS FastAPI Server (v5)
Endpoints:
  GET  /health    - Health check
  POST /tts       - Synthesize text to PCM16 audio
  GET  /speakers  - List available voices
"""
import torch
import io
from fastapi import FastAPI, Query
from fastapi.responses import Response

app = FastAPI(title="Silero TTS Server")

# ── Load Models ──────────────────────────────────────────────

models = {}
speakers_map = {
    "ru": ["aidar", "baya", "kseniya", "xenia", "eugene"],
    "en": ["en_0", "en_18", "en_21", "en_45", "en_56", "en_99", "random"],
}

def load_models():
    # V5.2 for Russian (no numpy/scipy deps), V3 for English (latest available)
    for lang, tag in [("ru", "v5_2_ru"), ("en", "v3_en")]:
        try:
            model, _ = torch.hub.load(
                "snakers4/silero-models",
                model="silero_tts",
                language=lang,
                speaker=tag,
                trust_repo=True,
            )
            models[lang] = model
            print(f"✅ Loaded Silero TTS model: {tag} ({lang})")
        except Exception as e:
            print(f"❌ Failed to load {tag}: {e}")

load_models()

# ── Endpoints ────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "languages": list(models.keys()),
        "total_speakers": sum(len(v) for v in speakers_map.values()),
    }


@app.post("/tts")
async def tts(
    text: str = Query(..., description="Text to synthesize"),
    speaker: str = Query("baya", description="Speaker voice ID"),
    language: str = Query("ru", description="Language (ru, en)"),
    sample_rate: int = Query(48000, description="Output sample rate (8000, 24000, 48000)"),
):
    model = models.get(language)
    if not model:
        return Response(
            content=f"Language '{language}' not loaded. Available: {list(models.keys())}",
            status_code=400,
        )

    if speaker not in speakers_map.get(language, []) and speaker != "random":
        return Response(
            content=f"Speaker '{speaker}' not available for '{language}'. Available: {speakers_map.get(language, [])}",
            status_code=400,
        )

    try:
        audio = model.apply_tts(
            text=text,
            speaker=speaker,
            sample_rate=sample_rate,
            put_accent=True,
            put_yo=True,
        )
        # Convert float tensor to PCM16 bytes
        pcm_bytes = (audio * 32767).to(torch.int16).numpy().tobytes()

        return Response(
            content=pcm_bytes,
            media_type="audio/pcm",
            headers={
                "X-Sample-Rate": str(sample_rate),
                "X-Channels": "1",
                "X-Bits-Per-Sample": "16",
                "X-Duration-Seconds": f"{len(audio) / sample_rate:.3f}",
            },
        )
    except Exception as e:
        return Response(content=f"TTS error: {str(e)}", status_code=500)


@app.get("/speakers")
async def speakers(language: str = Query("ru", description="Language")):
    return {
        "language": language,
        "speakers": speakers_map.get(language, []),
    }
