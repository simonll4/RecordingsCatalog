#!/usr/bin/env python3
"""Inspecciona el modelo ONNX para ver sus metadatos y clases"""

import sys
from pathlib import Path
import onnxruntime as ort

def inspect_model(model_path):
    """Inspecciona metadatos del modelo"""
    
    print("="*60)
    print("🔍 INSPECCIÓN DE MODELO ONNX")
    print("="*60)
    print(f"\n📁 Modelo: {model_path}")
    
    if not Path(model_path).exists():
        print(f"❌ Archivo no encontrado: {model_path}")
        return False
    
    size_mb = Path(model_path).stat().st_size / (1024*1024)
    print(f"📏 Tamaño: {size_mb:.2f} MB")
    
    try:
        # Cargar sesión
        session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
        
        print("\n" + "="*60)
        print("📥 INPUTS")
        print("="*60)
        for inp in session.get_inputs():
            print(f"\nNombre: {inp.name}")
            print(f"Shape:  {inp.shape}")
            print(f"Type:   {inp.type}")
        
        print("\n" + "="*60)
        print("📤 OUTPUTS")
        print("="*60)
        for out in session.get_outputs():
            print(f"\nNombre: {out.name}")
            print(f"Shape:  {out.shape}")
            print(f"Type:   {out.type}")
        
        print("\n" + "="*60)
        print("🏷️  METADATA")
        print("="*60)
        
        metadata = session.get_modelmeta()
        
        if metadata.custom_metadata_map:
            print("\nMetadata personalizado:")
            for key, value in metadata.custom_metadata_map.items():
                print(f"  {key}: {value}")
                
                # Buscar información de clases
                if 'names' in key.lower() or 'class' in key.lower():
                    print(f"\n⭐ CLASES ENCONTRADAS en '{key}':")
                    print(f"  {value}")
        else:
            print("\n⚠️  Sin metadata personalizado")
        
        # Inferir número de clases del shape de salida
        output_shape = session.get_outputs()[0].shape
        print(f"\n📊 Shape de salida: {output_shape}")
        
        # YOLO típicamente tiene shape [1, C, N] donde C = 4 + num_classes
        # o [1, N, C] dependiendo del formato
        if len(output_shape) >= 2:
            for dim in output_shape:
                if isinstance(dim, int):
                    if 80 <= dim <= 90:
                        print(f"\n💡 Posible num_classes = {dim - 4} (si formato es 4 + classes)")
                    elif 4 <= dim <= 10:
                        print(f"\n💡 Posible bbox info (4 coords) + {dim - 4} classes")
        
        print("\n" + "="*60)
        print("🎯 ANÁLISIS")
        print("="*60)
        
        # Analizar shape para inferir estructura
        output_shape = session.get_outputs()[0].shape
        if output_shape == [1, 6, 8400] or output_shape == ['batch', 6, 8400]:
            print("\n✅ Formato detectado: YOLO con 2 clases")
            print("   Shape: [batch, 6, predictions]")
            print("   6 = 4 (bbox) + 2 (classes)")
            print("\n⚠️  PROBLEMA: No sabemos qué representan clase 0 y clase 1")
            print("\nPosibilidades:")
            print("  - Modelo custom entrenado con 2 clases específicas")
            print("  - Necesitas consultar cómo fue entrenado")
            print("\n📝 SOLUCIÓN:")
            print("  1. Usa classes = [] en config (sin filtro)")
            print("  2. Observa qué detecta en la ventana de visualización")
            print("  3. Identifica qué clase corresponde a qué objeto")
        
        elif output_shape == [1, 84, 8400] or output_shape == ['batch', 84, 8400]:
            print("\n✅ Formato detectado: YOLO estándar COCO (80 clases)")
            print("   Shape: [batch, 84, predictions]")
            print("   84 = 4 (bbox) + 80 (COCO classes)")
        
        else:
            print(f"\n⚠️  Shape no reconocido: {output_shape}")
            print("   Modelo puede tener formato custom")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error inspeccionando modelo: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    model_path = "/home/simonll4/Desktop/final-scripting/tpfinal-v3/data/models/yolo11s.onnx"
    
    if len(sys.argv) > 1:
        model_path = sys.argv[1]
    
    success = inspect_model(model_path)
    
    print("\n" + "="*60)
    if success:
        print("✅ Inspección completada")
    else:
        print("❌ Inspección fallida")
    print("="*60)
