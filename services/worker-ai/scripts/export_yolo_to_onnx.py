#!/usr/bin/env python3
"""
Script para exportar modelos YOLO a formato ONNX

IMPORTANTE: Decidir si usar NMS integrado o no:

1. CON NMS (nms=True):
   - Output: [batch, 300, 6] donde 6 = [x1, y1, x2, y2, conf, class_id]
   - Ventajas: Más rápido, menos procesamiento post-inferencia
   - Desventajas: Menos flexible, no puedes cambiar parámetros de NMS después
   - Uso: Producción cuando sabes que los parámetros de NMS son fijos

2. SIN NMS (nms=False):
   - Output: [batch, 84, 8400] donde 84 = 4 bbox + 80 clases
   - Ventajas: Total flexibilidad, puedes ajustar NMS, conf_threshold, etc.
   - Desventajas: Más lento, más procesamiento en Python
   - Uso: Desarrollo, experimentación, cuando necesitas ajustar parámetros

NOTA: El worker-ai ahora soporta AMBOS formatos automáticamente.
"""

from ultralytics import YOLO
import argparse
from pathlib import Path


def main():
    p = argparse.ArgumentParser(
        description="Exporta modelo YOLO a ONNX",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:

1. Exportar CON NMS integrado (más rápido en producción):
   python export_yolo_to_onnx.py --weights yolo11s.pt --nms

2. Exportar SIN NMS (más flexible):
   python export_yolo_to_onnx.py --weights yolo11s.pt

3. Exportar con tamaño de imagen específico:
   python export_yolo_to_onnx.py --weights yolo11s.pt --imgsz 640 --nms

4. Exportar modelo custom:
   python export_yolo_to_onnx.py --weights path/to/custom.pt --nms
        """
    )
    
    p.add_argument(
        "--weights",
        default="yolo11s.pt",
        help="Path al modelo YOLO (.pt)"
    )
    
    p.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Tamaño de imagen (default: 640)"
    )
    
    p.add_argument(
        "--nms",
        action="store_true",
        help="Embed NMS in-graph (recomendado para producción)"
    )
    
    p.add_argument(
        "--opset",
        type=int,
        default=21,
        help="ONNX opset version (default: 21 para compatibilidad con ONNX Runtime)"
    )
    
    p.add_argument(
        "--output",
        type=str,
        default=None,
        help="Path de salida del modelo ONNX (opcional)"
    )
    
    args = p.parse_args()
    
    # Validar que el archivo existe
    weights_path = Path(args.weights)
    if not weights_path.exists():
        print(f"❌ Error: Archivo no encontrado: {args.weights}")
        return 1
    
    print("="*60)
    print("🚀 EXPORTANDO MODELO YOLO A ONNX")
    print("="*60)
    print(f"\n📁 Modelo origen: {args.weights}")
    print(f"📏 Tamaño imagen: {args.imgsz}x{args.imgsz}")
    print(f"🎯 NMS integrado: {'SÍ' if args.nms else 'NO'}")
    print(f"📦 ONNX opset: {args.opset}")
    
    if args.nms:
        print("\n⚡ NMS integrado activado:")
        print("   - Output: [batch, 300, 6]")
        print("   - Formato: [x1, y1, x2, y2, confidence, class_id]")
        print("   - Más rápido pero menos flexible")
    else:
        print("\n🔧 NMS integrado desactivado:")
        print("   - Output: [batch, 84, 8400]")
        print("   - Formato: [xywh + 80 class scores]")
        print("   - Más flexible pero requiere post-procesamiento")
    
    print("\n⏳ Cargando modelo...")
    
    try:
        m = YOLO(args.weights)
        
        print("✅ Modelo cargado")
        print(f"   Clases: {len(m.names)} ({', '.join(list(m.names.values())[:5])}...)")
        
        print("\n⏳ Exportando a ONNX...")
        
        out = m.export(
            format="onnx",
            dynamic=True,      # Permitir batch dinámico
            simplify=True,     # Simplificar el grafo ONNX
            nms=args.nms,      # NMS integrado (opcional)
            imgsz=args.imgsz,  # Tamaño de imagen
            opset=args.opset,  # Versión de ONNX opset
        )
        
        output_path = Path(out)
        size_mb = output_path.stat().st_size / (1024 * 1024)
        
        print("\n" + "="*60)
        print("✅ EXPORTACIÓN COMPLETADA")
        print("="*60)
        print(f"\n📁 Archivo ONNX: {out}")
        print(f"📏 Tamaño: {size_mb:.2f} MB")
        
        # Si se especificó un output custom, mover el archivo
        if args.output:
            import shutil
            output_dest = Path(args.output)
            output_dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(output_path), str(output_dest))
            print(f"📦 Movido a: {output_dest}")
            output_path = output_dest
        
        print("\n🎯 PRÓXIMOS PASOS:")
        print(f"\n1. Copiar modelo a data/models/:")
        print(f"   cp {output_path} data/models/")
        
        print("\n2. Actualizar config.local.toml:")
        print(f"   model_name = \"/path/to/{output_path.name}\"")
        
        print("\n3. Reiniciar worker:")
        print("   ./run.sh")
        
        print("\n4. Verificar logs del worker:")
        if args.nms:
            print("   Debería mostrar: 'NMS integrado: True'")
        else:
            print("   Debería mostrar: 'NMS integrado: False'")
        
        print("\n" + "="*60)
        
        return 0
        
    except Exception as e:
        print(f"\n❌ Error durante la exportación: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
