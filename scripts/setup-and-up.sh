#!/usr/bin/env bash
set -euo pipefail
# -e: aborta ante el primer error
# -u: error si se usa variable no definida
# -o pipefail: si falla un comando en un pipe, falla todo el pipe

# Calcula el directorio raíz del repo: un nivel arriba del directorio del script
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Lista de servicios Node/TS a instalar y compilar (ajustá según tu repo)
SERVICES=(
    "services/session-store"
    "services/edge-agent"
)

# Verifica que un comando exista en PATH; si no, sale con error
ensure_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "[ERROR] Required command '$1' not found" >&2
        exit 1
    fi
}

echo "[setup] Checking required commands"
ensure_command npm     # Necesario para instalar/compilar paquetes Node
ensure_command docker  # Necesario para build/run con Docker
echo "[setup] -> npm and docker found"

echo "[setup] Installing and building services"
for service in "${SERVICES[@]}"; do
    service_path="${ROOT_DIR}/${service}"
    # Si no hay package.json, no es un paquete Node; se salta
    if [[ ! -f "${service_path}/package.json" ]]; then
        echo "[setup] Skipping ${service} (no package.json)"
        continue
    fi
    
    echo "[setup] -> Entering ${service_path}"
    # pushd guarda el dir actual y entra al nuevo; popd vuelve
    pushd "${service_path}" >/dev/null
    
    echo "[setup] --> Running: npm install"
    npm install             # instala dependencias (podrías usar 'npm ci' en CI)
    
    echo "[setup] --> Running: npm run build"
    npm run build           # compila el servicio (requiere script 'build' en package.json)
    
    echo "[setup] <- Leaving ${service_path}"
    popd >/dev/null
done

# Detecta el comando de Compose:
#   1) plugin moderno: 'docker compose'
#   2) binario legacy: 'docker-compose'
COMPOSE_CMD=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
    else
        echo "[ERROR] docker compose not found" >&2
        exit 1
    fi
fi

echo "[setup] Pruning stale docker builder cache"
# Limpia cache vieja del builder (opcional).
# '|| true' evita que un fallo acá aborte el script por 'set -e'.
docker builder prune -f >/dev/null 2>&1 || true

echo "[setup] Building docker images with: ${COMPOSE_CMD[*]} -f ${ROOT_DIR}/docker-compose.yml build"
# Construye imágenes según tu docker-compose.yml
"${COMPOSE_CMD[@]}" -f "${ROOT_DIR}/docker-compose.yml" build

echo "[setup] Starting docker services with: ${COMPOSE_CMD[*]} -f ${ROOT_DIR}/docker-compose.yml up -d"
# Levanta contenedores en segundo plano
"${COMPOSE_CMD[@]}" -f "${ROOT_DIR}/docker-compose.yml" up -d

echo "[setup] Listing running containers:"
# Muestra una tabla con nombre, estado y puertos expuestos
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "[setup] Done ✅"