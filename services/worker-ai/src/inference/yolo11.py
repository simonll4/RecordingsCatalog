"""Modelo YOLO11 con ONNX Runtime"""

import numpy as np
import onnxruntime as ort
import cv2
from typing import List, Tuple, Optional
from dataclasses import dataclass

from ..core.logger import setup_logger

logger = setup_logger("inference")


# YOLO11 COCO classes
COCO_CLASSES = [
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "airplane",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "parking meter",
    "bench",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
    "backpack",
    "umbrella",
    "handbag",
    "tie",
    "suitcase",
    "frisbee",
    "skis",
    "snowboard",
    "sports ball",
    "kite",
    "baseball bat",
    "baseball glove",
    "skateboard",
    "surfboard",
    "tennis racket",
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "broccoli",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
]


@dataclass
class Detection:
    """Una detección YOLO"""

    class_id: int
    class_name: str
    confidence: float
    bbox: Tuple[float, float, float, float]  # x1, y1, x2, y2 (normalized 0-1)

    def to_xyxy(self, img_width: int, img_height: int) -> Tuple[int, int, int, int]:
        """Convierte bbox normalizada a pixeles"""
        x1, y1, x2, y2 = self.bbox
        return (
            int(x1 * img_width),
            int(y1 * img_height),
            int(x2 * img_width),
            int(y2 * img_height),
        )


class YOLO11Model:
    """Modelo YOLO11 con ONNX Runtime"""

    def __init__(self, model_path: str):
        """
        Args:
            model_path: Ruta al modelo ONNX
        """
        self.model_path = model_path

        # Crear sesión ONNX
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        self.session = ort.InferenceSession(model_path, providers=providers)

        # Obtener metadata del modelo
        self.input_name = self.session.get_inputs()[0].name
        self.input_shape = self.session.get_inputs()[0].shape
        self.output_shape = self.session.get_outputs()[0].shape

        # Si el shape es dinámico (strings), usar valores por defecto de YOLO11
        if isinstance(self.input_shape[2], str) or isinstance(self.input_shape[3], str):
            self.input_height = 640
            self.input_width = 640
        else:
            self.input_height = self.input_shape[2]
            self.input_width = self.input_shape[3]

        # Detectar si el modelo tiene NMS integrado
        # Formato con NMS: [batch, max_detections, 6] donde 6 = [x1, y1, x2, y2, conf, class]
        # Formato sin NMS: [batch, 84/85, num_predictions] donde 84/85 = [x, y, w, h, ...classes]
        self.has_integrated_nms = False
        if len(self.output_shape) == 3:
            last_dim = self.output_shape[-1]
            # Si la última dimensión es 6, probablemente tiene NMS integrado
            if (isinstance(last_dim, int) and last_dim == 6) or (isinstance(last_dim, str) and last_dim == '6'):
                self.has_integrated_nms = True
                logger.info("Modelo con NMS integrado detectado")

        logger.info(f"Modelo cargado: {model_path}")
        logger.info(f"Input shape: {self.input_shape}")
        logger.info(f"Output shape: {self.output_shape}")
        logger.info(f"NMS integrado: {self.has_integrated_nms}")

    def preprocess(
        self, image: np.ndarray
    ) -> Tuple[np.ndarray, float, Tuple[int, int]]:
        """
        Preprocesa imagen para YOLO11

        Returns:
            (input_tensor, scale, (pad_w, pad_h))
        """
        img_h, img_w = image.shape[:2]

        # Calcular escala manteniendo aspect ratio
        scale = min(self.input_width / img_w, self.input_height / img_h)
        new_w = int(img_w * scale)
        new_h = int(img_h * scale)

        # Resize
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        # Padding para llegar a input_width x input_height
        pad_w = (self.input_width - new_w) // 2
        pad_h = (self.input_height - new_h) // 2

        padded = np.full((self.input_height, self.input_width, 3), 114, dtype=np.uint8)
        padded[pad_h : pad_h + new_h, pad_w : pad_w + new_w] = resized

        # Convertir a formato ONNX: (1, 3, H, W), float32, normalizado
        input_tensor = padded.transpose(2, 0, 1).astype(np.float32) / 255.0
        input_tensor = np.expand_dims(input_tensor, axis=0)

        return input_tensor, scale, (pad_w, pad_h)

    def postprocess_with_nms(
        self,
        output: np.ndarray,
        scale: float,
        pad: Tuple[int, int],
        orig_shape: Tuple[int, int],
        conf_thres: float = 0.5,
        classes_filter: Optional[List[int]] = None,
    ) -> List[Detection]:
        """
        Procesa salida de modelo YOLO con NMS integrado
        
        Args:
            output: Salida del modelo shape (1, N, 6) donde 6 = [x1, y1, x2, y2, conf, class]
            scale: Factor de escala usado en preproceso
            pad: (pad_w, pad_h) usado en preproceso
            orig_shape: (height, width) de la imagen original
            conf_thres: Umbral de confianza
            classes_filter: Lista de class_id a incluir (si es None, todas)
            
        Returns:
            Lista de detecciones
        """
        orig_h, orig_w = orig_shape
        pad_w, pad_h = pad
        
        # El modelo con NMS ya devuelve [batch, num_dets, 6]
        if output.ndim == 3:
            output = output[0]  # Quitar batch dimension
        
        # output ahora es (N, 6) donde N es número de detecciones
        # Formato: [x1, y1, x2, y2, confidence, class_id]
        
        detections = []
        for det in output:
            x1, y1, x2, y2, conf, class_id = det
            
            # Filtrar por confianza
            if conf < conf_thres:
                continue
            
            # Convertir class_id a entero
            class_id = int(class_id)
            
            # Filtrar por clase si es necesario
            if classes_filter is not None and len(classes_filter) > 0:
                if class_id not in classes_filter:
                    continue
            
            # Las coordenadas ya están en formato xyxy en espacio letterbox
            # Deshacer padding y escala
            x1 = (x1 - pad_w) / scale
            y1 = (y1 - pad_h) / scale
            x2 = (x2 - pad_w) / scale
            y2 = (y2 - pad_h) / scale
            
            # Clip a dimensiones originales
            x1 = max(0, min(x1, orig_w))
            y1 = max(0, min(y1, orig_h))
            x2 = max(0, min(x2, orig_w))
            y2 = max(0, min(y2, orig_h))
            
            # Validar bbox
            if x2 <= x1 or y2 <= y1:
                continue
            
            # Normalizar a [0, 1]
            x1_norm = x1 / orig_w
            y1_norm = y1 / orig_h
            x2_norm = x2 / orig_w
            y2_norm = y2 / orig_h
            
            # Nombre de clase
            class_name = COCO_CLASSES[class_id] if class_id < len(COCO_CLASSES) else f"class_{class_id}"
            
            detection = Detection(
                class_id=class_id,
                class_name=class_name,
                confidence=float(conf),
                bbox=(
                    float(x1_norm),
                    float(y1_norm),
                    float(x2_norm),
                    float(y2_norm)
                )
            )
            detections.append(detection)
        
        return detections

    def postprocess(
        self,
        output: np.ndarray,
        scale: float,
        pad: Tuple[int, int],
        orig_shape: Tuple[int, int],
        conf_thres: float = 0.5,
        nms_iou: float = 0.6,
        classes_filter: Optional[List[int]] = None,
    ) -> List[Detection]:
        """
        Procesa salida del modelo YOLO11 (replicando lógica de CV/worker)

        Args:
            output: Salida del modelo shape (1, 84, num_predictions)
            scale: Factor de escala usado en preproceso
            pad: (pad_w, pad_h) usado en preproceso
            orig_shape: (height, width) de la imagen original
            conf_thres: Umbral de confianza para filtrar detecciones
            nms_iou: Umbral de IoU para Non-Maximum Suppression
            classes_filter: Lista de class_id a incluir (si es None, todas)

        Returns:
            Lista de detecciones filtradas por NMS
        """
        orig_h, orig_w = orig_shape
        pad_w, pad_h = pad

        # Transponer: (1, 84, N) -> (N, 84) o detectar orientación
        if output.ndim == 3:
            output = output[0]

        # Determinar orientación: asegurar preds como (C, N)
        if output.shape[0] < output.shape[1] and output.shape[0] <= 512:
            preds = output  # (C, N)
        else:
            preds = output.T  # (C, N)

        # Canalizar salida: xywh + [obj?] + class scores
        C = preds.shape[0]
        xywh = preds[0:4, :].T  # (N, 4)

        # YOLOv5: 85 (4 + obj + 80), YOLOv8/11: 84 (4 + 80)
        has_objectness = (C - 4) == 81
        if has_objectness:
            obj = preds[4, :].T  # (N,)
            class_scores = preds[5:, :].T  # (N, 80)
        else:
            obj = None
            class_scores = preds[4:, :].T  # (N, 80)

        # Si los puntajes no parecen probabilidades [0,1], aplicar sigmoide
        try:
            if class_scores.size and (
                float(class_scores.max()) > 1.0 or float(class_scores.min()) < 0.0
            ):
                class_scores = 1.0 / (1.0 + np.exp(-class_scores))
            if obj is not None and (float(obj.max()) > 1.0 or float(obj.min()) < 0.0):
                obj = 1.0 / (1.0 + np.exp(-obj))
        except Exception:
            pass

        # Número de clases del modelo (puede NO ser 80 si es un modelo custom)
        N = class_scores.shape[0]
        num_classes = class_scores.shape[1]

        # Selección de clase y confianza
        if classes_filter is not None and len(classes_filter) > 0:
            # Elegir la mejor clase dentro del conjunto permitido
            allowed = np.array(classes_filter, dtype=int)
            # Sanitizar índices fuera de rango (por si el modelo no es COCO-80)
            valid_mask = (allowed >= 0) & (allowed < num_classes)
            if not np.all(valid_mask):
                try:
                    invalid = allowed[~valid_mask].tolist()
                    logger.warning(
                        f"Clases fuera de rango {invalid} para num_classes={num_classes}. Ignorando."
                    )
                except Exception:
                    pass
                allowed = allowed[valid_mask]
            # Si no hay clases permitidas válidas, no hay detecciones
            if allowed.size == 0:
                # Si no hay mapeo válido, hacer selección global (fallback)
                class_ids = np.argmax(class_scores, axis=1)
                # Evitar indexación avanzada con ids → usar take_along_axis
                class_max = np.take_along_axis(
                    class_scores, class_ids[:, None], axis=1
                ).squeeze(1)
            else:
                scores_allowed = class_scores[:, allowed]  # (N, K)
                # Si K==0, salir
                if scores_allowed.shape[1] == 0:
                    return []
                local_idx = np.argmax(scores_allowed, axis=1)  # (N,)
                class_ids = allowed[local_idx]  # (N,)
                # Evitar errores de index → take_along_axis en el subespacio permitido
                class_max = np.take_along_axis(
                    scores_allowed, local_idx[:, None], axis=1
                ).squeeze(1)
        else:
            # Elegir la mejor clase global
            class_ids = np.argmax(class_scores, axis=1)
            class_max = np.take_along_axis(
                class_scores, class_ids[:, None], axis=1
            ).squeeze(1)

        confidences = class_max if obj is None else (class_max * obj)

        # --- FILTROS ---
        # 1. Filtrar por umbral de confianza (después de elegir clase efectiva)
        conf_mask = confidences >= conf_thres
        xywh = xywh[conf_mask]
        confidences = confidences[conf_mask]
        class_ids = class_ids[conf_mask]

        if len(xywh) == 0:
            return []

        # --- TRANSFORMACIÓN DE COORDENADAS ---
        # Convertir de xywh a xyxy en espacio letterbox
        x_center, y_center, width, height = (
            xywh[:, 0],
            xywh[:, 1],
            xywh[:, 2],
            xywh[:, 3],
        )
        x1 = x_center - width / 2
        y1 = y_center - height / 2
        x2 = x_center + width / 2
        y2 = y_center + height / 2
        xyxy = np.stack([x1, y1, x2, y2], axis=1).astype(np.float32)

        # Deshacer padding y escala para volver al espacio original
        xyxy -= np.array([pad_w, pad_h, pad_w, pad_h], dtype=np.float32)
        xyxy /= scale

        # Clip a dimensiones de imagen original
        xyxy[:, 0] = np.clip(xyxy[:, 0], 0, orig_w)
        xyxy[:, 1] = np.clip(xyxy[:, 1], 0, orig_h)
        xyxy[:, 2] = np.clip(xyxy[:, 2], 0, orig_w)
        xyxy[:, 3] = np.clip(xyxy[:, 3], 0, orig_h)

        # Remover boxes inválidas
        valid = (xyxy[:, 2] > xyxy[:, 0]) & (xyxy[:, 3] > xyxy[:, 1])
        xyxy = xyxy[valid]
        confidences = confidences[valid]
        class_ids = class_ids[valid]

        if len(xyxy) == 0:
            return []

        # --- NMS por clase (evita suprimir objetos de distinta clase) ---
        keep_indices_list: List[int] = []
        unique_classes = np.unique(class_ids)
        for cid in unique_classes:
            idxs = np.where(class_ids == cid)[0]
            if idxs.size == 0:
                continue
            kept_local = YOLO11Model.nms(xyxy[idxs], confidences[idxs], nms_iou)
            # Mapear índices locales a globales
            keep_indices_list.extend(idxs[kept_local].tolist())
        if not keep_indices_list:
            return []
        keep_indices = np.array(keep_indices_list, dtype=int)

        # Mantener solo los elementos que NMS conservó
        xyxy_kept = xyxy[keep_indices]
        confidences_kept = confidences[keep_indices]
        class_ids_kept = class_ids[keep_indices]

        # --- CREACIÓN DE OBJETOS DETECTION ---
        # Normalizar a 0-1 para las coordenadas
        xyxy_norm = xyxy_kept.copy()
        xyxy_norm[:, [0, 2]] /= orig_w
        xyxy_norm[:, [1, 3]] /= orig_h
        xyxy_norm = np.clip(xyxy_norm, 0, 1)

        # Crear detecciones
        detections = []
        for i in range(len(xyxy_norm)):
            cid = int(class_ids_kept[i])
            # Si el modelo no es COCO-80, asignar nombre genérico
            cname = COCO_CLASSES[cid] if cid < len(COCO_CLASSES) else f"class_{cid}"
            det = Detection(
                class_id=cid,
                class_name=cname,
                confidence=float(confidences_kept[i]),
                bbox=(
                    float(xyxy_norm[i, 0]),
                    float(xyxy_norm[i, 1]),
                    float(xyxy_norm[i, 2]),
                    float(xyxy_norm[i, 3]),
                ),
            )
            detections.append(det)

        return detections

    @staticmethod
    def nms(
        boxes: np.ndarray, scores: np.ndarray, iou_threshold: float = 0.45
    ) -> List[int]:
        """Non-Maximum Suppression"""
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]

        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]

        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)

            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])

            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h

            iou = inter / (areas[i] + areas[order[1:]] - inter)

            inds = np.where(iou <= iou_threshold)[0]
            order = order[inds + 1]

        return keep

    def infer(
        self,
        image: np.ndarray,
        conf_thres: float = 0.5,
        nms_iou: float = 0.6,
        classes_filter: Optional[List[int]] = None,
    ) -> List[Detection]:
        """
        Ejecuta inferencia en una imagen

        Args:
            image: Imagen BGR (HxWx3)
            conf_thres: Umbral de confianza
            nms_iou: Umbral IoU para NMS (ignorado si modelo tiene NMS integrado)
            classes_filter: Lista de IDs de clases a detectar

        Returns:
            Lista de detecciones
        """
        orig_h, orig_w = image.shape[:2]

        # Preprocesar
        input_tensor, scale, pad = self.preprocess(image)

        # Inferencia
        output = self.session.run(None, {self.input_name: input_tensor})[0]

        # Postprocesar según el tipo de modelo
        if self.has_integrated_nms:
            detections = self.postprocess_with_nms(
                output,
                scale,
                pad,
                (orig_h, orig_w),
                conf_thres=conf_thres,
                classes_filter=classes_filter,
            )
        else:
            detections = self.postprocess(
                output,
                scale,
                pad,
                (orig_h, orig_w),
                conf_thres=conf_thres,
                nms_iou=nms_iou,
                classes_filter=classes_filter,
            )

        return detections
