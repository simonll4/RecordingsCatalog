"""Handler del protocolo Protobuf v1"""
import struct
import asyncio
from typing import Optional

# Import protobuf (debe estar en el directorio raíz del worker)
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
import ai_pb2 as pb

from ..core.logger import setup_logger

logger = setup_logger("protocol")


class ProtocolHandler:
    """Maneja comunicación Protobuf v1"""
    
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """
        Args:
            reader: StreamReader de asyncio
            writer: StreamWriter de asyncio
        """
        self.reader = reader
        self.writer = writer
        self.peer = writer.get_extra_info('peername')
    
    async def read_envelope(self) -> Optional[pb.Envelope]:
        """
        Lee un Envelope del stream
        
        Returns:
            Envelope o None si la conexión se cerró
        """
        try:
            # Leer tamaño del mensaje (4 bytes, little-endian)
            length_bytes = await self.reader.readexactly(4)
            length = struct.unpack("<I", length_bytes)[0]
            
            # Validar tamaño
            if length == 0 or length > 50 * 1024 * 1024:  # Max 50MB
                logger.error(f"Tamaño de mensaje inválido: {length}")
                return None
            
            # Leer mensaje
            msg_bytes = await self.reader.readexactly(length)
            
            # Parsear Envelope
            envelope = pb.Envelope()
            envelope.ParseFromString(msg_bytes)
            
            # Validar versión del protocolo
            if envelope.protocol_version != 1:
                logger.error(f"Versión de protocolo no soportada: {envelope.protocol_version}")
                await self.send_error(
                    pb.VERSION_UNSUPPORTED,
                    f"Protocol version {envelope.protocol_version} not supported"
                )
                return None
            
            return envelope
            
        except asyncio.IncompleteReadError:
            logger.info(f"Cliente desconectado: {self.peer}")
            return None
        except Exception as e:
            logger.error(f"Error leyendo envelope: {e}")
            return None
    
    async def send_response(self, detections: list, frame_id: int, session_id: str):
        """
        Envía respuesta con detecciones
        
        Args:
            detections: Lista de dicts con detecciones (coords normalizadas)
            frame_id: ID del frame
            session_id: ID de la sesión
        """
        try:
            # Crear DetectionSet
            detection_set = pb.DetectionSet()
            for det in detections:
                pb_det = detection_set.items.add()
                pb_det.bbox.x1 = det["x1"]
                pb_det.bbox.y1 = det["y1"]
                pb_det.bbox.x2 = det["x2"]
                pb_det.bbox.y2 = det["y2"]
                pb_det.conf = det["confidence"]
                pb_det.cls = det["class_name"]
                pb_det.track_id = str(det.get("track_id", 0))
            
            # Crear Result
            result = pb.Result()
            result.frame_id = frame_id
            result.frame_ref.session_id = session_id
            result.detections.CopyFrom(detection_set)
            
            # Crear Response
            response = pb.Response()
            response.result.CopyFrom(result)
            
            # Crear Envelope
            envelope = pb.Envelope()
            envelope.protocol_version = 1
            envelope.msg_type = pb.MT_RESULT
            envelope.res.CopyFrom(response)
            
            # Serializar y enviar
            msg_bytes = envelope.SerializeToString()
            length = len(msg_bytes)
            
            self.writer.write(struct.pack("<I", length))
            self.writer.write(msg_bytes)
            await self.writer.drain()
            
        except Exception as e:
            logger.error(f"Error enviando respuesta: {e}")
    
    async def send_error(self, error_code: int, message: str):
        """
        Envía mensaje de error
        
        Args:
            error_code: Código de error (de ai_pb2.ErrorCode)
            message: Mensaje descriptivo
        """
        try:
            # Crear Error
            error = pb.Error()
            error.code = error_code
            error.message = message
            
            # Crear Response con error
            response = pb.Response()
            response.error.CopyFrom(error)
            
            # Crear Envelope
            envelope = pb.Envelope()
            envelope.protocol_version = 1
            envelope.msg_type = pb.MT_ERROR
            envelope.res.CopyFrom(response)
            
            # Serializar y enviar
            msg_bytes = envelope.SerializeToString()
            length = len(msg_bytes)
            
            self.writer.write(struct.pack("<I", length))
            self.writer.write(msg_bytes)
            await self.writer.drain()
            
        except Exception as e:
            logger.error(f"Error enviando error: {e}")
    
    async def send_heartbeat(self):
        """Envía respuesta de heartbeat"""
        try:
            # Crear Envelope con heartbeat
            envelope = pb.Envelope()
            envelope.protocol_version = 1
            envelope.msg_type = pb.MT_HEARTBEAT
            envelope.hb.CopyFrom(pb.Heartbeat())
            
            # Serializar y enviar
            msg_bytes = envelope.SerializeToString()
            length = len(msg_bytes)
            
            self.writer.write(struct.pack("<I", length))
            self.writer.write(msg_bytes)
            await self.writer.drain()
            
        except Exception as e:
            logger.error(f"Error enviando heartbeat: {e}")
    
    async def send_init_ok(self, max_frame_bytes: int = 10 * 1024 * 1024, initial_credits: int = 4):
        """
        Envía respuesta InitOk después de Init exitoso
        
        Args:
            max_frame_bytes: Tamaño máximo de frame (default 10MB)
            initial_credits: Ventana de créditos iniciales (default 4)
        """
        try:
            # Crear Chosen
            chosen = pb.Chosen()
            chosen.pixel_format = pb.PF_NV12
            chosen.codec = pb.CODEC_JPEG
            chosen.width = 640
            chosen.height = 640
            chosen.fps_target = 5.0
            chosen.policy = pb.LATEST_WINS
            chosen.initial_credits = initial_credits
            
            # Crear InitOk
            init_ok = pb.InitOk()
            init_ok.chosen.CopyFrom(chosen)
            init_ok.max_frame_bytes = max_frame_bytes
            
            # Crear Response
            response = pb.Response()
            response.init_ok.CopyFrom(init_ok)
            
            # Crear Envelope
            envelope = pb.Envelope()
            envelope.protocol_version = 1
            envelope.msg_type = pb.MT_INIT_OK
            envelope.res.CopyFrom(response)
            
            # Serializar y enviar
            msg_bytes = envelope.SerializeToString()
            length = len(msg_bytes)
            
            self.writer.write(struct.pack("<I", length))
            self.writer.write(msg_bytes)
            await self.writer.drain()
            
            logger.info("InitOk enviado")
            
        except Exception as e:
            logger.error(f"Error enviando InitOk: {e}")
    
    def close(self):
        """Cierra el writer"""
        self.writer.close()
