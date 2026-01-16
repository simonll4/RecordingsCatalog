#!/usr/bin/env python3
"""
Script para ejecutar migraciones SQL sin necesidad de psql.
Ejecutar: python scripts/run_migrations.py
"""

import psycopg2
import sys
from pathlib import Path

# Configuración de la base de datos
DB_CONFIG = {
    'host': 'localhost',
    'port': 15432,
    'database': 'session_store',
    'user': 'postgres',
    'password': 'postgres'
}

def execute_sql_file(cursor, filepath):
    """Ejecuta un archivo SQL."""
    print(f"\n📄 Ejecutando: {filepath}")
    with open(filepath, 'r', encoding='utf-8') as f:
        sql = f.read()
    
    try:
        cursor.execute(sql)
        print(f"✅ Completado exitosamente")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    """Función principal."""
    print("=" * 60)
    print("🔧 Ejecutando migraciones para Attribute Enricher")
    print("=" * 60)
    
    # Rutas de los archivos SQL
    base_path = Path(__file__).parent.parent.parent.parent
    migration_file = base_path / "services/session-store/migrations/002_add_attributes_enriched.sql"
    test_data_file = base_path / "services/attribute-enricher/scripts/setup_test_data.sql"
    
    # Conectar a la base de datos
    print(f"\n🔌 Conectando a PostgreSQL en {DB_CONFIG['host']}:{DB_CONFIG['port']}...")
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        cursor = conn.cursor()
        print("✅ Conexión establecida")
    except Exception as e:
        print(f"❌ Error de conexión: {e}")
        print("\n💡 Asegúrate de que:")
        print("   1. PostgreSQL esté corriendo (docker-compose up -d postgres)")
        print("   2. La configuración de conexión sea correcta")
        sys.exit(1)
    
    success = True
    
    # Ejecutar migración
    if migration_file.exists():
        if not execute_sql_file(cursor, migration_file):
            success = False
    else:
        print(f"⚠️  Archivo de migración no encontrado: {migration_file}")
        success = False
    
    # Preguntar si insertar datos de prueba
    print("\n" + "=" * 60)
    response = input("¿Deseas insertar datos de prueba? (s/N): ").strip().lower()
    
    if response in ('s', 'si', 'y', 'yes'):
        if test_data_file.exists():
            if not execute_sql_file(cursor, test_data_file):
                success = False
        else:
            print(f"⚠️  Archivo de datos de prueba no encontrado: {test_data_file}")
    
    # Cerrar conexión
    cursor.close()
    conn.close()
    
    # Resumen
    print("\n" + "=" * 60)
    if success:
        print("✅ Todas las operaciones completadas exitosamente")
        print("\n📋 Próximos pasos:")
        print("   1. Preparar frames: .\\services\\attribute-enricher\\scripts\\setup_test_frames.ps1")
        print("   2. Iniciar servicio: docker-compose up -d attribute-enricher")
        print("   3. Ver logs: docker-compose logs -f attribute-enricher")
    else:
        print("⚠️  Algunas operaciones fallaron. Revisa los mensajes anteriores.")
    print("=" * 60)

if __name__ == "__main__":
    main()

