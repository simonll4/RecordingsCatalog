FROM python:3.11-slim

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY src/ ./src/

# Copiar configuración
COPY config.yaml .

# Variables de entorno por defecto
ENV PYTHONUNBUFFERED=1
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_NAME=session_store
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres
ENV POLL_INTERVAL_SEC=5
ENV BATCH_SIZE=10
ENV FRAMES_BASE_PATH=/data/frames

# Comando de inicio
CMD ["python", "-m", "src.main"]

