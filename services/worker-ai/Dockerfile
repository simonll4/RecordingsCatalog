FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema (placeholder para futuras deps)
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código (incluye Protobuf ya generado)
COPY ai_pb2.py .
COPY worker.py .
COPY healthcheck.py .
# Copiar configuración TOML
COPY config.toml .

# Crear directorio para modelos
RUN mkdir -p /models

# Health check
HEALTHCHECK --interval=10s --timeout=2s --retries=3 \
    CMD python3 healthcheck.py

# Usuario no-root
RUN useradd -m -u 1000 worker && chown -R worker:worker /app
USER worker

CMD ["python3", "-u", "worker.py"]
