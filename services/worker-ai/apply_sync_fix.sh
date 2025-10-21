#!/bin/bash
# Script para aplicar el fix de sincronización

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  🔧 Aplicando Fix de Sincronización Video-Anotaciones     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 1. Verificar si el worker está corriendo
echo "1️⃣  Verificando worker..."
if pgrep -f "worker.py" > /dev/null; then
    echo "   ⚠️  Worker está corriendo"
    echo ""
    read -p "   ¿Detener el worker? [S/n]: " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Ss]$ ]] || [[ -z $REPLY ]]; then
        pkill -f worker.py
        sleep 2
        if pgrep -f "worker.py" > /dev/null; then
            echo "   ❌ No se pudo detener el worker"
            echo "   Detenlo manualmente (Ctrl+C en su terminal)"
            exit 1
        fi
        echo "   ✅ Worker detenido"
    else
        echo "   ℹ️  Detenlo manualmente y vuelve a ejecutar este script"
        exit 0
    fi
else
    echo "   ✅ Worker no está corriendo"
fi
echo ""

# 2. Eliminar sesiones antiguas
echo "2️⃣  Eliminando sesiones antiguas..."
TRACKS_DIR="/home/simonll4/Desktop/final-scripting/tpfinal-v3/data/tracks"
SESSION_COUNT=$(find "$TRACKS_DIR" -maxdepth 1 -type d -name "sess_*" 2>/dev/null | wc -l)

if [ $SESSION_COUNT -gt 0 ]; then
    echo "   Sesiones encontradas: $SESSION_COUNT"
    ls -1 "$TRACKS_DIR" | grep "^sess_"
    echo ""
    read -p "   ¿Eliminar estas sesiones? [S/n]: " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Ss]$ ]] || [[ -z $REPLY ]]; then
        rm -rf "$TRACKS_DIR"/sess_*
        echo "   ✅ Sesiones eliminadas"
    else
        echo "   ⚠️  Sesiones NO eliminadas"
        echo "   Las anotaciones de estas sesiones seguirán desfasadas"
    fi
else
    echo "   ℹ️  No hay sesiones antiguas"
fi
echo ""

# 3. Verificar que el código tiene el fix
echo "3️⃣  Verificando código..."
FIX_LINE=$(grep -n "payload.frame_id.*frame real del video" src/pipeline/processor.py 2>/dev/null)
if [ -n "$FIX_LINE" ]; then
    echo "   ✅ Fix aplicado en el código"
else
    echo "   ❌ Fix NO encontrado en el código"
    echo "   Verifica src/pipeline/processor.py línea 106"
    exit 1
fi
echo ""

# 4. Instrucciones finales
echo "4️⃣  Próximos pasos:"
echo ""
echo "   1. Reinicia el worker:"
echo "      cd /home/simonll4/Desktop/final-scripting/tpfinal-v3/services/worker-ai"
echo "      ./run.sh"
echo ""
echo "   2. Genera una nueva sesión con el edge-agent"
echo "      (deja que detecte objetos)"
echo ""
echo "   3. Verifica que el fix funciona:"
echo "      ./verify_fix.sh"
echo ""
echo "   4. Anota el video:"
echo "      python scripts/annotate_from_json.py"
echo ""

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ Listo para reiniciar el worker                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
