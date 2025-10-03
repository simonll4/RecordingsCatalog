#!/usr/bin/env bash
# Script para configurar UTC y sincronización de tiempo en el host
# Ejecutar UNA SOLA VEZ con: sudo ./scripts/setup-host-timezone.sh

set -e

echo "🕐 Configurando zona horaria UTC en el host..."

# 1) Establecer zona horaria a UTC
sudo timedatectl set-timezone UTC

# 2) Habilitar sincronización automática de tiempo (timesyncd)
sudo timedatectl set-ntp true

# 3) Esperar un momento para que se sincronice
sleep 2

# 4) Verificar configuración
echo ""
echo "✅ Configuración completada. Verificando..."
echo ""
timedatectl

echo ""
echo "📋 Puntos a verificar:"
echo "  - Time zone: UTC (debe aparecer UTC)"
echo "  - System clock synchronized: yes (debe estar en 'yes')"
echo ""
echo "Si 'System clock synchronized' no está en 'yes', puede tardar unos segundos."
echo "Ejecuta 'timedatectl' nuevamente en unos segundos para verificar."
echo ""
echo "⚠️  NOTA: Si tu host tiene mucho jitter (ej: VMs), considera instalar chrony:"
echo "   sudo apt install chrony"
echo "   sudo systemctl disable systemd-timesyncd"
echo "   sudo systemctl enable --now chrony"
