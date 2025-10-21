"""Decodificadores de frames por formato"""
import cv2
import numpy as np
from typing import Optional, Callable, Dict

import ai_pb2 as pb

from ..core.logger import setup_logger

logger = setup_logger("pipeline.decoder")


# Tipo para funciones decodificadoras
DecoderFunc = Callable[[bytes, int, int], Optional[np.ndarray]]


class FrameDecoder:
    """Registro y aplicación de decodificadores por formato"""
    
    def __init__(self):
        self._decoders: Dict[tuple, DecoderFunc] = {}
        self._register_default_decoders()
    
    def _register_default_decoders(self):
        """Registra los decodificadores por defecto"""
        # JPEG
        self.register(
            codec=pb.CODEC_JPEG,
            pixel_format=None,
            decoder=self._decode_jpeg
        )
        
        # NV12
        self.register(
            codec=pb.CODEC_NONE,
            pixel_format=pb.PF_NV12,
            decoder=self._decode_nv12
        )
        
        # I420
        self.register(
            codec=pb.CODEC_NONE,
            pixel_format=pb.PF_I420,
            decoder=self._decode_i420
        )
    
    def register(
        self,
        codec: int,
        pixel_format: Optional[int],
        decoder: DecoderFunc
    ):
        """
        Registra un decodificador para un formato específico
        
        Args:
            codec: Código de codec (de ai_pb2)
            pixel_format: Formato de pixel (de ai_pb2) o None
            decoder: Función decodificadora
        """
        key = (codec, pixel_format)
        self._decoders[key] = decoder
        logger.debug(f"Decodificador registrado: codec={codec}, pixel_format={pixel_format}")
    
    def decode(
        self,
        data: bytes,
        codec: int,
        pixel_format: int,
        width: int,
        height: int
    ) -> Optional[np.ndarray]:
        """
        Decodifica un frame según su formato
        
        Args:
            data: Bytes del frame
            codec: Código de codec
            pixel_format: Formato de pixel
            width: Ancho del frame
            height: Alto del frame
            
        Returns:
            Imagen BGR (HxWx3) o None si falla
        """
        # Intentar con codec específico primero
        key = (codec, pixel_format)
        decoder = self._decoders.get(key)
        
        if decoder:
            return decoder(data, width, height)
        
        # Intentar con codec sin pixel_format
        key = (codec, None)
        decoder = self._decoders.get(key)
        
        if decoder:
            return decoder(data, width, height)
        
        logger.error(f"No hay decodificador para codec={codec}, pixel_format={pixel_format}")
        return None
    
    @staticmethod
    def _decode_jpeg(data: bytes, width: int, height: int) -> Optional[np.ndarray]:
        """Decodifica JPEG"""
        try:
            np_arr = np.frombuffer(data, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if img is None:
                logger.error("No se pudo decodificar JPEG")
                return None
            
            return img
            
        except Exception as e:
            logger.error(f"Error decodificando JPEG: {e}")
            return None
    
    @staticmethod
    def _decode_nv12(data: bytes, width: int, height: int) -> Optional[np.ndarray]:
        """Decodifica NV12 a BGR"""
        try:
            # NV12: Y plane (width*height) + UV plane (width*height/2)
            y_size = width * height
            uv_size = width * height // 2
            
            if len(data) < y_size + uv_size:
                logger.error(f"Frame NV12 incompleto: esperado {y_size + uv_size}, recibido {len(data)}")
                return None
            
            # Convertir NV12 a BGR usando OpenCV
            nv12_data = np.frombuffer(data[:y_size + uv_size], dtype=np.uint8)
            yuv = nv12_data.reshape((height * 3 // 2, width))
            img = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_NV12)
            
            return img
            
        except Exception as e:
            logger.error(f"Error decodificando NV12: {e}")
            return None
    
    @staticmethod
    def _decode_i420(data: bytes, width: int, height: int) -> Optional[np.ndarray]:
        """Decodifica I420 a BGR"""
        try:
            y_size = width * height
            u_size = width * height // 4
            v_size = width * height // 4
            
            if len(data) < y_size + u_size + v_size:
                logger.error("Frame I420 incompleto")
                return None
            
            i420_data = np.frombuffer(data[:y_size + u_size + v_size], dtype=np.uint8)
            yuv = i420_data.reshape((height * 3 // 2, width))
            img = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)
            
            return img
            
        except Exception as e:
            logger.error(f"Error decodificando I420: {e}")
            return None
