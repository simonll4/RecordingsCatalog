"""Modelo YOLO11 con ONNX Runtime"""
import numpy as np
import onnxruntime as ort
import cv2
from typing import List, Tuple
from dataclasses import dataclass

from ..core.logger import setup_logger

logger = setup_logger("inference")


# YOLO11 COCO classes
COCO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
    "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
    "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush"
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
            int(y2 * img_height)
        )


class YOLO11Model:
    """Modelo YOLO11 con ONNX Runtime"""
    
    def __init__(self, model_path: str, conf_threshold: float = 0.35):
        """
        Args:
            model_path: Ruta al modelo ONNX
            conf_threshold: Umbral de confianza (0-1)
        """
        self.model_path = model_path
        self.conf_threshold = conf_threshold
        
        # Crear sesión ONNX
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        self.session = ort.InferenceSession(model_path, providers=providers)
        
        # Obtener metadata del modelo
        self.input_name = self.session.get_inputs()[0].name
        self.input_shape = self.session.get_inputs()[0].shape
        
        # Si el shape es dinámico (strings), usar valores por defecto de YOLO11
        if isinstance(self.input_shape[2], str) or isinstance(self.input_shape[3], str):
            self.input_height = 640
            self.input_width = 640
        else:
            self.input_height = self.input_shape[2]
            self.input_width = self.input_shape[3]
        
        logger.info(f"Modelo cargado: {model_path}")
        logger.info(f"Input shape: {self.input_shape}")
        logger.info(f"Umbral confianza: {conf_threshold}")
    
    def preprocess(self, image: np.ndarray) -> Tuple[np.ndarray, float, Tuple[int, int]]:
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
        padded[pad_h:pad_h+new_h, pad_w:pad_w+new_w] = resized
        
        # Convertir a formato ONNX: (1, 3, H, W), float32, normalizado
        input_tensor = padded.transpose(2, 0, 1).astype(np.float32) / 255.0
        input_tensor = np.expand_dims(input_tensor, axis=0)
        
        return input_tensor, scale, (pad_w, pad_h)
    
    def postprocess(
        self,
        output: np.ndarray,
        scale: float,
        pad: Tuple[int, int],
        orig_shape: Tuple[int, int]
    ) -> List[Detection]:
        """
        Procesa salida del modelo YOLO11 (replicando lógica de CV/worker)
        
        Args:
            output: Salida del modelo shape (1, 84, num_predictions)
            scale: Factor de escala usado en preproceso
            pad: (pad_w, pad_h) usado en preproceso
            orig_shape: (height, width) de la imagen original
        
        Returns:
            Lista de detecciones filtradas por NMS
        """
        orig_h, orig_w = orig_shape
        pad_w, pad_h = pad
        
        # Transponer: (1, 84, N) -> (N, 84) o detectar orientación
        if output.ndim == 3:
            output = output[0]
        
        # Determinar orientación: (C, N) o (N, C)
        if output.shape[0] < output.shape[1] and output.shape[0] <= 512:
            # Formato (C, N) donde C=84
            preds = output
        else:
            # Formato (N, C)
            preds = output.T
        
        # Extraer boxes (xywh) y class scores
        xywh = preds[0:4, :].T  # (N, 4)
        class_scores = preds[4:, :].T  # (N, 80)
        
        # Obtener clase con mayor confianza
        class_ids = np.argmax(class_scores, axis=1)
        confidences = class_scores[np.arange(len(class_scores)), class_ids]
        
        # Filtrar por clase "person" (class_id = 0 en COCO)
        person_mask = class_ids == 0
        xywh = xywh[person_mask]
        confidences = confidences[person_mask]
        class_ids = class_ids[person_mask]
        
        # Filtrar por umbral de confianza
        conf_mask = confidences >= self.conf_threshold
        xywh = xywh[conf_mask]
        confidences = confidences[conf_mask]
        class_ids = class_ids[conf_mask]
        
        if len(xywh) == 0:
            return []
        
        # Convertir de xywh a xyxy en espacio letterbox
        x_center, y_center, width, height = xywh[:, 0], xywh[:, 1], xywh[:, 2], xywh[:, 3]
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
        
        # NMS
        keep_indices = YOLO11Model.nms(xyxy, confidences, 0.45)
        
        # Normalizar a 0-1 para las coordenadas
        xyxy_norm = xyxy.copy()
        xyxy_norm[:, [0, 2]] /= orig_w
        xyxy_norm[:, [1, 3]] /= orig_h
        xyxy_norm = np.clip(xyxy_norm, 0, 1)
        
        # Crear detecciones
        detections = []
        for idx in keep_indices:
            det = Detection(
                class_id=int(class_ids[idx]),
                class_name=COCO_CLASSES[class_ids[idx]],
                confidence=float(confidences[idx]),
                bbox=(float(xyxy_norm[idx, 0]), float(xyxy_norm[idx, 1]), 
                      float(xyxy_norm[idx, 2]), float(xyxy_norm[idx, 3]))
            )
            detections.append(det)
        
        return detections
    
    @staticmethod
    def nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float = 0.45) -> List[int]:
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
    
    def infer(self, image: np.ndarray) -> List[Detection]:
        """
        Ejecuta inferencia en una imagen
        
        Args:
            image: Imagen BGR (HxWx3)
        
        Returns:
            Lista de detecciones
        """
        orig_h, orig_w = image.shape[:2]
        
        # Preprocesar
        input_tensor, scale, pad = self.preprocess(image)
        
        # Inferencia
        output = self.session.run(None, {self.input_name: input_tensor})[0]
        
        # Postprocesar
        detections = self.postprocess(output, scale, pad, (orig_h, orig_w))
        
        return detections
