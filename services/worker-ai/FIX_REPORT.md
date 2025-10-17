# Reporte de Ajustes del Worker AI

## 1. Problema Detectado

El worker de IA en `tpfinal-v3/services/worker-ai` presentaba un rendimiento de detección y tracking muy bajo. Los Bounding Boxes (BB) eran imprecisos y el seguimiento de objetos era errático.

El análisis comparativo con la implementación de referencia en `/CV` reveló que la causa principal era una serie de valores fijos y mal ajustados en la lógica de inferencia del modelo.

## 2. Análisis de la Causa Raíz

El archivo `src/inference/yolo11.py` contenía la lógica de inferencia y presentaba los siguientes problemas críticos:

1.  **Umbral de Confianza Bajo y Fijo (`0.35`):** Se aceptaban detecciones de muy baja calidad, lo que generaba una gran cantidad de "ruido" (falsos positivos) que confundía al tracker.
2.  **Umbral de NMS Agresivo (`0.45`):** El umbral para Non-Maximum Suppression era demasiado bajo, lo que causaba que se eliminaran detecciones válidas de objetos cercanos entre sí.
3.  **Filtro de Clases Fijo:** El código solo permitía detectar la clase `"person"`, ignorando cualquier otra configuración.

Estos tres factores combinados degradaban severamente la calidad de las detecciones antes de que llegaran al módulo de tracking, haciendo imposible un seguimiento estable.

## 3. Solución Implementada

Se realizaron los siguientes cambios para corregir el problema y hacer el worker más robusto y configurable:

### a. `src/inference/yolo11.py`

- Se **eliminaron los valores fijos** de la clase `YOLO11Model`.
- El método `postprocess` ahora acepta los parámetros `conf_thres`, `nms_iou` y `classes_filter`, permitiendo un control dinámico desde fuera de la clase.
- Se ajustaron los valores por defecto a los de la implementación funcional: `conf_thres=0.5` y `nms_iou=0.6`.
- Se eliminó el filtro exclusivo para la clase "person".

### b. `config.local.toml`

- Se añadió una nueva sección `[model]` para centralizar la configuración de la inferencia:
  ```toml
  [model]
  conf_threshold = 0.5
  nms_iou = 0.6
  classes = ["person", "bottle"]
  ```

### c. `worker_new.py`

- La clase `ConnectionHandler` ahora lee la configuración del modelo desde el archivo `.toml` al iniciarse.
- Se modificó la llamada al método `model.infer()` para que pase los parámetros (`conf_thres`, `nms_iou`, `classes_filter`) leídos desde la configuración.
- Esto asegura que el worker utilice los valores óptimos y sea fácilmente reconfigurable sin necesidad de cambiar el código fuente.

Con estos ajustes, el worker ahora opera con los mismos parámetros de alta calidad que la implementación de referencia, solucionando el problema de rendimiento.