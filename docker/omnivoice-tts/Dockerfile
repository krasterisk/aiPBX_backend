FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# PyTorch with CUDA support
RUN pip3 install --no-cache-dir \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124

# OmniVoice + FastAPI server deps
RUN pip3 install --no-cache-dir \
    omnivoice \
    fastapi \
    uvicorn \
    numpy

# Set HuggingFace cache dir — will be mounted as a volume for persistence
ENV HF_HOME=/app/hf_cache
ENV TRANSFORMERS_CACHE=/app/hf_cache
# Model will be downloaded on first startup (cached in volume)
# Run: docker volume create omnivoice-cache
# Mount: - omnivoice-cache:/app/hf_cache

COPY server.py .

EXPOSE 9002

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -f http://localhost:9002/health || exit 1

CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9002", "--workers", "1"]
