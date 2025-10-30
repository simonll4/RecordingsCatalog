"""Codec para traducir entre DTOs de dominio y mensajes Protobuf"""

from typing import Optional, List, Dict, Any
from dataclasses import dataclass

import ai_pb2 as pb

from ..core.logger import setup_logger

logger = setup_logger("transport.codec")


@dataclass
class EnvelopeData:
    """Datos extraídos de un Envelope"""

    msg_type: int
    protocol_version: int
    stream_id: Optional[str]
    request: Optional[pb.Request]
    heartbeat: Optional[pb.Heartbeat]


class ProtobufCodec:
    """Codifica y decodifica mensajes Protobuf"""

    def __init__(self):
        self.stream_id: Optional[str] = None
        self._stream_id_logged = False

    def decode_envelope(self, data: bytes) -> Optional[EnvelopeData]:
        """
        Decodifica un Envelope desde bytes

        Args:
            data: Bytes del mensaje protobuf

        Returns:
            EnvelopeData o None si hay error
        """
        try:
            envelope = pb.Envelope()
            envelope.ParseFromString(data)

            # Actualizar stream_id si está presente
            if envelope.stream_id:
                self.stream_id = envelope.stream_id
                if not self._stream_id_logged:
                    logger.debug(f"Stream ID asociado: {self.stream_id}")
                    self._stream_id_logged = True

            # Validar versión del protocolo
            if envelope.protocol_version != 1:
                logger.error(
                    f"Versión de protocolo no soportada: {envelope.protocol_version}"
                )
                return None

            # Extraer contenido
            request = envelope.req if envelope.HasField("req") else None
            heartbeat = envelope.hb if envelope.HasField("hb") else None

            return EnvelopeData(
                msg_type=envelope.msg_type,
                protocol_version=envelope.protocol_version,
                stream_id=self.stream_id,
                request=request,
                heartbeat=heartbeat,
            )

        except Exception as e:
            logger.error(f"Error decodificando envelope: {e}")
            return None

    def encode_init_ok(
        self,
        max_frame_bytes: int = 10 * 1024 * 1024,
        initial_credits: int = 4,
        pixel_format: int = pb.PF_NV12,
        codec: int = pb.CODEC_JPEG,
        width: int = 640,
        height: int = 640,
        fps_target: float = 5.0,
        policy: int = pb.LATEST_WINS,
    ) -> bytes:
        """
        Codifica un mensaje InitOk

        Args:
            max_frame_bytes: Tamaño máximo de frame
            initial_credits: Créditos iniciales de backpressure
            pixel_format: Formato de pixel preferido
            codec: Codec preferido
            width: Ancho preferido
            height: Alto preferido
            fps_target: FPS objetivo
            policy: Política de backpressure

        Returns:
            Bytes del mensaje serializado
        """
        chosen = pb.Chosen()
        chosen.pixel_format = pixel_format
        chosen.codec = codec
        chosen.width = width
        chosen.height = height
        chosen.fps_target = fps_target
        chosen.policy = policy
        chosen.initial_credits = initial_credits

        init_ok = pb.InitOk()
        init_ok.chosen.CopyFrom(chosen)
        init_ok.max_frame_bytes = max_frame_bytes

        response = pb.Response()
        response.init_ok.CopyFrom(init_ok)

        envelope = pb.Envelope()
        envelope.protocol_version = 1
        envelope.msg_type = pb.MT_INIT_OK
        if self.stream_id:
            envelope.stream_id = self.stream_id
        envelope.res.CopyFrom(response)

        return envelope.SerializeToString()

    def encode_result(
        self, detections: List[Dict[str, Any]], frame_id: int, session_id: str
    ) -> bytes:
        """
        Codifica un mensaje Result con detecciones

        Args:
            detections: Lista de dicts con detecciones
            frame_id: ID del frame
            session_id: ID de la sesión

        Returns:
            Bytes del mensaje serializado
        """
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

        result = pb.Result()
        result.frame_id = frame_id
        result.frame_ref.session_id = session_id
        result.detections.CopyFrom(detection_set)

        response = pb.Response()
        response.result.CopyFrom(result)

        envelope = pb.Envelope()
        envelope.protocol_version = 1
        envelope.msg_type = pb.MT_RESULT
        if self.stream_id:
            envelope.stream_id = self.stream_id
        envelope.res.CopyFrom(response)

        return envelope.SerializeToString()

    def encode_error(self, error_code: int, message: str) -> bytes:
        """
        Codifica un mensaje de error

        Args:
            error_code: Código de error (de ai_pb2.ErrorCode)
            message: Mensaje descriptivo

        Returns:
            Bytes del mensaje serializado
        """
        error = pb.Error()
        error.code = error_code
        error.message = message

        response = pb.Response()
        response.error.CopyFrom(error)

        envelope = pb.Envelope()
        envelope.protocol_version = 1
        envelope.msg_type = pb.MT_ERROR
        if self.stream_id:
            envelope.stream_id = self.stream_id
        envelope.res.CopyFrom(response)

        return envelope.SerializeToString()

    def encode_heartbeat(self) -> bytes:
        """
        Codifica un mensaje de heartbeat

        Returns:
            Bytes del mensaje serializado
        """
        envelope = pb.Envelope()
        envelope.protocol_version = 1
        envelope.msg_type = pb.MT_HEARTBEAT
        if self.stream_id:
            envelope.stream_id = self.stream_id
        envelope.hb.CopyFrom(pb.Heartbeat())

        return envelope.SerializeToString()
