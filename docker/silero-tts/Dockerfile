FROM python:3.11-slim

WORKDIR /app

# Install PyTorch CPU-only (no CUDA needed for TTS)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir fastapi uvicorn omegaconf numpy

# Pre-download Silero TTS models during build (v5 for ru, v3 for en)
RUN python -c "\
import torch; \
torch.hub.load('snakers4/silero-models', model='silero_tts', language='ru', speaker='v5_ru', trust_repo=True); \
torch.hub.load('snakers4/silero-models', model='silero_tts', language='en', speaker='v3_en', trust_repo=True)"

COPY server.py .

EXPOSE 9001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:9001/health')" || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9001", "--workers", "1"]
