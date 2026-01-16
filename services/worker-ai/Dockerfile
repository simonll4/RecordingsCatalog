FROM python:3.10-slim

WORKDIR /app

# Dependencias del sistema necesarias para OpenCV y ONNX Runtime
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar environment y preparar micromamba
COPY environment.yml .
RUN curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/latest | tar -xvj bin/micromamba && \
    ./bin/micromamba create -y -f environment.yml -n worker-ai && \
    ./bin/micromamba clean --all --yes

# Copiar código (modular)
COPY ai_pb2.py .
COPY worker.py .
COPY botsort.yaml .
COPY src ./src

# Usar config.docker.toml como config.toml dentro del contenedor
COPY config.docker.toml ./config.toml

# Crear directorios necesarios
RUN mkdir -p /models /data/tracks

# Health check (TCP port check)
HEALTHCHECK --interval=10s --timeout=2s --retries=3 \
    CMD python -c "import socket; s = socket.socket(); s.settimeout(2); s.connect(('127.0.0.1', 7001)); s.close()"

# Usuario no-root
RUN useradd -m -u 1000 worker && \
    chown -R worker:worker /app /data
USER worker

# Ejecutar worker modular
CMD ["./bin/micromamba", "run", "-n", "worker-ai", "python", "-u", "worker.py"]
