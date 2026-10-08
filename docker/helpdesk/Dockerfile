FROM python:3.12.13-slim
WORKDIR /app
RUN pip install --no-cache-dir psycopg[binary]==3.2.13 requests[socks]==2.32.5
COPY bridge.py tests.py network.py ./
USER 10001:10001
CMD ["python", "bridge.py"]
