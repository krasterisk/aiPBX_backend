FROM python:3.12.13-slim
WORKDIR /app
RUN pip install --no-cache-dir psycopg[binary]==3.2.13
COPY bridge.py tests.py ./
USER 10001:10001
CMD ["python", "bridge.py"]
