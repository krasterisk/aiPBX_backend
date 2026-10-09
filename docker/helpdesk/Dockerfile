FROM python:3.12.13-slim
WORKDIR /app
RUN pip install --no-cache-dir psycopg[binary]==3.2.13 requests[socks]==2.32.5 PyJWT==2.15.1 paramiko==5.0.0 PyMySQL==1.2.3
COPY bridge.py tests.py network.py routing.py registry.py connectors.py web.py ticketing.py tests_registry.py ./
COPY knowledge ./knowledge
COPY ui ./ui
USER 10001:10001
CMD ["python", "bridge.py"]
