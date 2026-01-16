# Label Studio - Configuración Lista ✅

## 🎉 Estado: Funcionando

Label Studio está corriendo en: **http://localhost:8081**

## 🔑 Credenciales

```
Usuario: admin@example.com
Password: admin123
```

## 📝 Cómo Usar para Fine-tuning

### 1. Acceder a Label Studio

```bash
# Abre en tu navegador
http://localhost:8081
```

### 2. Crear Proyecto

1. **Login** con las credenciales arriba
2. **Create Project**
3. **Nombre**: "Camera Detection"
4. **Template**: Object Detection with Bounding Boxes

### 3. Configurar Labels

En la configuración del proyecto, agrega tus clases:

```xml
<View>
  <Image name="image" value="$image"/>
  <RectangleLabels name="label" toName="image">
    <Label value="person" background="red"/>
    <Label value="bottle" background="blue"/>
    <Label value="backpack" background="green"/>
    <Label value="cup" background="yellow"/>
    <Label value="laptop" background="purple"/>
    <Label value="cell phone" background="orange"/>
  </RectangleLabels>
</View>
```

### 4. Importar Frames

**Método 1: Drag & Drop (recomendado)**
- Settings → Import
- Arrastra carpetas desde `../frames/`

**Método 2: Desde directorio**
```bash
# Copiar frames al directorio data de Label Studio
cp -r ../frames/* label-studio/data/upload/
```

Luego en Label Studio:
- Settings → Cloud Storage
- Add Source Storage → Local Files
- Path: `/label-studio/data/upload`

### 5. Anotar

1. **Open task** → Dibuja bounding boxes
2. **Asigna clase** a cada box
3. **Submit** cuando termines cada imagen
4. Objetivo: ~200-300 imágenes anotadas

### 6. Exportar para YOLO

1. **Export** en el proyecto
2. **Format**: JSON
3. **Download**: `project-1-at-YYYY-MM-DD.json`
4. **Guardar** en `finetuning/`

### 7. Continuar con Pipeline

```bash
cd ../finetuning

# Convertir a formato YOLO
python mini_yolo_pipeline.py labelstudio-to-yolo \
  --ls-json project-1-at-2025-10-28.json \
  --classes "person,bottle,backpack,cup,laptop,cell phone"

# Split dataset
python mini_yolo_pipeline.py split

# Entrenar
python mini_yolo_pipeline.py train --gpu

# Exportar
python mini_yolo_pipeline.py export-onnx
```

## 🛠️ Comandos Docker

```bash
# Ver logs
docker logs labelstudio

# Reiniciar
docker compose restart

# Detener
docker compose down

# Iniciar
docker compose up -d

# Ver estado
docker ps | grep labelstudio
```

## 📂 Estructura de Datos

```
label-studio/
├── docker-compose.yml
├── data/                   # Volumen persistente
│   ├── media/             # Archivos subidos
│   └── label_studio.sqlite3  # Base de datos
└── LABEL_STUDIO_SETUP.md  # Este archivo
```

## 💡 Tips

### Atajos de Teclado
- `R`: Rectángulo (bounding box)
- `1-9`: Seleccionar clase rápido
- `Ctrl+Enter`: Submit
- `←/→`: Navegar entre tareas

### Mejores Prácticas
- ✅ Bounding boxes ajustados (ni muy apretados ni muy holgados)
- ✅ Consistencia en el etiquetado
- ✅ Anotar solo objetos completamente visibles
- ✅ Ignorar objetos parcialmente cortados
- ✅ Diversidad: diferentes ángulos, luz, distancias

### Progreso
- Label Studio guarda automáticamente
- Puedes pausar y continuar después
- Ver progreso: Panel principal muestra "X / Total tasks"

## 🐛 Troubleshooting

### No carga imágenes
```bash
# Verificar que las imágenes estén accesibles
ls ../frames/

# Reiniciar Label Studio
docker compose restart
```

### Permisos
```bash
# Si hay problemas de permisos con data/
chmod -R 777 data/
docker compose restart
```

### Puerto ocupado
```bash
# Cambiar puerto en docker-compose.yml
ports:
  - "8082:8080"  # usar 8082 en lugar de 8081
```

## 📊 Estimación de Tiempo

- Anotar 1 imagen: ~30-60 segundos
- 200 imágenes: ~2-3 horas
- Tip: Anota en sesiones cortas (20-30 min)

## 🎯 Listo

Label Studio está configurado y funcionando. 
Ahora puedes comenzar a anotar tus frames para el fine-tuning.

¡Éxito con tu proyecto\! 🚀
