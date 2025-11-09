#!/usr/bin/env python3
"""
Script para verificar que todo está correctamente configurado.
Ejecutar: python scripts/verify_setup.py
"""

import psycopg2
import sys
from pathlib import Path

DB_CONFIG = {
    'host': 'localhost',
    'port': 15432,
    'database': 'session_store',
    'user': 'postgres',
    'password': 'postgres'
}

def check_connection():
    """Verifica la conexión a la base de datos."""
    print("🔌 Verificando conexión a PostgreSQL...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.close()
        print("   ✅ Conexión exitosa")
        return True
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def check_tables(cursor):
    """Verifica que la tabla detections existe."""
    print("\n📊 Verificando tabla 'detections'...")
    try:
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'detections'
            )
        """)
        exists = cursor.fetchone()[0]
        if exists:
            print("   ✅ Tabla 'detections' existe")
            return True
        else:
            print("   ❌ Tabla 'detections' no existe")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def check_columns(cursor):
    """Verifica que las columnas attributes y enriched existen."""
    print("\n🔍 Verificando columnas 'attributes' y 'enriched'...")
    
    columns_ok = True
    
    # Verificar attributes
    try:
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'detections' AND column_name = 'attributes'
            )
        """)
        if cursor.fetchone()[0]:
            print("   ✅ Columna 'attributes' existe")
        else:
            print("   ❌ Columna 'attributes' no existe (ejecutar migración)")
            columns_ok = False
    except Exception as e:
        print(f"   ❌ Error verificando 'attributes': {e}")
        columns_ok = False
    
    # Verificar enriched
    try:
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'detections' AND column_name = 'enriched'
            )
        """)
        if cursor.fetchone()[0]:
            print("   ✅ Columna 'enriched' existe")
        else:
            print("   ❌ Columna 'enriched' no existe (ejecutar migración)")
            columns_ok = False
    except Exception as e:
        print(f"   ❌ Error verificando 'enriched': {e}")
        columns_ok = False
    
    return columns_ok

def check_unenriched_detections(cursor):
    """Verifica si hay detecciones sin enriquecer."""
    print("\n📦 Verificando detecciones sin enriquecer...")
    try:
        cursor.execute("SELECT COUNT(*) FROM detections WHERE enriched = false")
        count = cursor.fetchone()[0]
        if count > 0:
            print(f"   ✅ Hay {count} detección(es) pendiente(s) de enriquecer")
        else:
            print("   ℹ️  No hay detecciones pendientes")
        return True
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def check_frames():
    """Verifica que existen frames de prueba."""
    print("\n🖼️  Verificando frames de prueba...")
    base_path = Path(__file__).parent.parent.parent.parent
    frames_dir = base_path / "data/frames/test_session_001"
    
    if not frames_dir.exists():
        print(f"   ⚠️  Directorio no existe: {frames_dir}")
        print("   💡 Ejecutar: .\\services\\attribute-enricher\\scripts\\setup_test_frames.ps1")
        return False
    
    frames = list(frames_dir.glob("*.jpg"))
    if frames:
        print(f"   ✅ Encontrados {len(frames)} frame(s):")
        for frame in frames:
            print(f"      - {frame.name}")
        return True
    else:
        print("   ⚠️  No se encontraron frames")
        return False

def main():
    print("=" * 60)
    print("🔧 Verificación de setup para Attribute Enricher")
    print("=" * 60)
    
    all_ok = True
    
    # Verificar conexión
    if not check_connection():
        print("\n❌ No se puede conectar a la base de datos")
        print("💡 Asegúrate de que PostgreSQL esté corriendo:")
        print("   docker-compose up -d postgres")
        sys.exit(1)
    
    # Conectar para verificaciones adicionales
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # Verificar tabla
    if not check_tables(cursor):
        all_ok = False
    
    # Verificar columnas
    if not check_columns(cursor):
        all_ok = False
        print("\n💡 Para ejecutar la migración:")
        print("   python services/attribute-enricher/scripts/run_migrations.py")
    
    # Verificar detecciones
    if not check_unenriched_detections(cursor):
        all_ok = False
    
    cursor.close()
    conn.close()
    
    # Verificar frames
    if not check_frames():
        all_ok = False
    
    # Resumen
    print("\n" + "=" * 60)
    if all_ok:
        print("✅ Todo está correctamente configurado!")
        print("\n📋 Puedes iniciar el servicio:")
        print("   docker-compose up -d attribute-enricher")
    else:
        print("⚠️  Algunos componentes necesitan configuración")
        print("\n📋 Pasos recomendados:")
        print("   1. Ejecutar migración: python services/attribute-enricher/scripts/run_migrations.py")
        print("   2. Preparar frames: .\\services\\attribute-enricher\\scripts\\setup_test_frames.ps1")
        print("   3. Verificar nuevamente: python services/attribute-enricher/scripts/verify_setup.py")
    print("=" * 60)

if __name__ == "__main__":
    main()

