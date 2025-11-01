"""Manejador de conexiones TCP - Coordina servicios del pipeline"""

import asyncio
from typing import List, Optional, Tuple

import ai_pb2 as pb

from ..core.logger import setup_logger
from ..config.runtime import RuntimeConfig
from ..pipeline.dto import FramePayload
from ..pipeline.processor import FrameProcessor
from ..transport.framing import FrameReader, FrameWriter
from ..transport.protobuf_codec import ProtobufCodec
from ..visualization.viewer import Visualizer
from .heartbeat import HeartbeatTask
from .model_loader import ModelLoadJob

logger = setup_logger("server.connection")


class ConnectionHandler:
    """Maneja una conexión de cliente - Coordina codec, pipeline y visualización"""

    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        config: RuntimeConfig,
        processor: FrameProcessor,
    visualizer: Optional[Visualizer],
    class_catalog: List[str],
    ):
        """
        Args:
            reader: StreamReader de asyncio
            writer: StreamWriter de asyncio
            config: Configuración runtime
            processor: Procesador de pipeline
            visualizer: Visualizador (opcional)
            class_catalog: Catálogo de clases disponible (ordenado)
        """
        self.config = config
        self.processor = processor
        self.visualizer = visualizer
        self.class_filter_override: Optional[List[int]] = None
        self.class_catalog = class_catalog
        self.class_name_to_id = {
            name.lower(): idx for idx, name in enumerate(self.class_catalog)
        }

        # Transporte
        self.frame_reader = FrameReader(reader, max_size=config.max_frame_size)
        self.frame_writer = FrameWriter(writer)
        self.codec = ProtobufCodec()

        self.peer = writer.get_extra_info("peername")

        # Tareas auxiliares
        self.model_loader = ModelLoadJob(
            processor.model_manager,
            on_success=self._on_model_loaded,
            on_error=self._on_model_error,
        )
        self.heartbeat_task: Optional[HeartbeatTask] = None

        # DEBUG: Contador de frames recibidos
        self.frames_received_count = 0
        self.frames_processed_count = 0
        self.envelopes_received_count = 0

    async def handle(self):
        """Loop principal de la conexión"""
        logger.info(f"Cliente conectado: {self.peer}")

        try:
            while True:
                # Leer frame
                frame_data = await self.frame_reader.read_frame()
                if frame_data is None:
                    logger.info(f"[DEBUG] read_frame() retornó None, cerrando conexión")
                    break

                # Decodificar envelope
                envelope = self.codec.decode_envelope(frame_data)
                if envelope is None:
                    logger.warning(f"[DEBUG] decode_envelope() retornó None")
                    break

                self.envelopes_received_count += 1

                # DEBUG: Log cada 25 envelopes
                if self.envelopes_received_count % 25 == 0:
                    logger.info(
                        f"[DEBUG] Envelopes recibidos: {self.envelopes_received_count}, tipo: {envelope.msg_type}"
                    )

                # Procesar según tipo de mensaje
                if envelope.msg_type == pb.MT_END:
                    logger.info(f"[DEBUG] Mensaje END recibido")
                    await self._handle_end()
                    continue

                if envelope.request:
                    has_frame = envelope.request.HasField("frame")
                    has_init = envelope.request.HasField("init")
                    logger.debug(
                        f"[DEBUG] Request recibido: has_init={has_init}, has_frame={has_frame}"
                    )
                    await self._handle_request(envelope.request)
                elif envelope.heartbeat:
                    await self._send_heartbeat()
                else:
                    logger.warning(
                        f"Envelope sin contenido procesable: {envelope.msg_type}"
                    )

        except Exception as e:
            logger.error(f"Error en conexión {self.peer}: {e}", exc_info=True)

        finally:
            await self._cleanup()

    async def _handle_request(self, request: pb.Request):
        """Procesa un Request"""
        if request.HasField("init"):
            await self._handle_init(request.init)
        elif request.HasField("frame"):
            await self._handle_frame(request.frame)
        elif request.HasField("end"):
            await self._handle_end()
        else:
            logger.warning("Request sin init, frame o end")

    def _parse_classes_filter(
        self, classes: List[str]
    ) -> Tuple[List[int], List[str], List[str]]:
        """
        Normaliza lista de clases y devuelve IDs válidos, nombres resueltos y desconocidos.
        """
        class_ids: List[int] = []
        resolved_names: List[str] = []
        unknown: List[str] = []
        seen: set[str] = set()

        for raw_name in classes:
            normalized = raw_name.strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            class_id = self.class_name_to_id.get(normalized)
            if class_id is None:
                unknown.append(raw_name)
                continue
            class_ids.append(class_id)
            resolved_names.append(self.class_catalog[class_id])

        return class_ids, resolved_names, unknown

    async def _handle_init(self, init: pb.Init):
        """Maneja mensaje Init - Inicia carga de modelo"""
        logger.info(f"[DEBUG] Init recibido: model={init.model}")
        model_path = init.model.strip()

        if not model_path:
            logger.error("[DEBUG] Init sin ruta de modelo")
            await self._send_error(pb.BAD_MESSAGE, "Model path is empty")
            return

        # Aplicar filtro de clases enviado por el edge-agent (si corresponde)
        if len(init.classes_filter) > 0:
            class_ids, class_names, unknown = self._parse_classes_filter(
                list(init.classes_filter)
            )
            if class_ids:
                self.processor.set_class_filter(class_ids)
                self.class_filter_override = class_ids
                logger.info(
                    "Filtro de clases actualizado desde edge-agent: %s",
                    class_names,
                )
            else:
                self.processor.set_class_filter(None)
                self.class_filter_override = None
                if unknown:
                    logger.warning(
                        "Clases desconocidas recibidas en Init: %s. Se procesarán todas las clases.",
                        unknown,
                    )
        else:
            self.class_filter_override = None

        # Aplicar umbral de confianza si el cliente lo envía en Init
        # proto3 escalares no tienen HasField; usar getattr y validar rango
        conf_th = getattr(init, "confidence_threshold", None)
        try:
            if conf_th is not None:
                # Si la versión del proto no incluye el campo, getattr devolverá None
                # Solo aplicamos si está en (0, 1]
                val = float(conf_th)
                if 0.0 < val <= 1.0:
                    prev = self.processor.model_manager.conf_threshold
                    self.processor.model_manager.conf_threshold = val
                    logger.info(
                        "Umbral de confianza actualizado desde edge-agent: %.3f (antes: %.3f)",
                        val,
                        prev,
                    )
        except Exception:
            # Silencioso: si no se puede parsear, se ignora
            pass

        # Si el modelo ya está cargado, responder inmediatamente
        if self.processor.model_manager.get(model_path):
            logger.info(f"[DEBUG] Modelo ya cargado, reutilizando: {model_path}")
            self.processor.set_model(model_path)
            await self._send_init_ok()
            return

        # Iniciar carga asíncrona
        logger.info(
            f"[DEBUG] Modelo no cargado, iniciando carga asíncrona: {model_path}"
        )
        self.model_loader.start(model_path)

        # Iniciar heartbeats durante la carga
        logger.info(f"[DEBUG] Iniciando heartbeats durante carga de modelo")
        self.heartbeat_task = HeartbeatTask(self._send_heartbeat, interval_seconds=2.0)
        self.heartbeat_task.start(condition=lambda: self.model_loader.is_loading())

    async def _on_model_loaded(self, model_path: str):
        """Callback cuando el modelo se carga exitosamente"""
        logger.info(f"[DEBUG] Callback _on_model_loaded ejecutado para {model_path}")
        self.processor.set_model(model_path)

        # Detener heartbeats
        if self.heartbeat_task:
            logger.info(f"[DEBUG] Deteniendo heartbeats")
            self.heartbeat_task.stop()

        # Enviar InitOk
        if not self.frame_writer.is_closing():
            logger.info(f"[DEBUG] Enviando InitOk al cliente")
            await self._send_init_ok()
        else:
            logger.warning(
                f"[DEBUG] No se puede enviar InitOk, frame_writer está cerrado"
            )

    async def _on_model_error(self, model_path: str, error: Exception):
        """Callback cuando falla la carga del modelo"""
        # Detener heartbeats
        if self.heartbeat_task:
            self.heartbeat_task.stop()

        # Enviar error
        if not self.frame_writer.is_closing():
            await self._send_error(pb.INTERNAL, f"Failed to load model: {error}")

    async def _handle_frame(self, frame_msg: pb.Frame):
        """Maneja mensaje Frame - Ejecuta pipeline de procesamiento"""
        self.frames_received_count += 1

        # DEBUG: Log TODOS los frames recibidos
        logger.info(
            f"[FRAME] Frame recibido: id={frame_msg.frame_id}, session={frame_msg.session_id or 'none'}, size={len(frame_msg.data)} bytes, resolution={frame_msg.width}x{frame_msg.height}, format={frame_msg.pixel_format}, codec={frame_msg.codec}"
        )

        # Verificar que el modelo esté listo
        if self.processor.current_model_path is None:
            logger.warning(
                f"[DEBUG] Frame #{self.frames_received_count} recibido pero modelo no cargado"
            )
            await self._send_error(pb.MODEL_NOT_READY, "Model not initialized")
            return

        # Construir payload
        payload = FramePayload(
            session_id=frame_msg.session_id,
            frame_id=frame_msg.frame_id,
            codec=frame_msg.codec,
            pixel_format=frame_msg.pixel_format,
            width=frame_msg.width,
            height=frame_msg.height,
            data=frame_msg.data,
            ts_mono_ns=getattr(frame_msg, "ts_mono_ns", None) or None,
            ts_utc_ns=getattr(frame_msg, "ts_utc_ns", None) or None,
        )

        logger.debug(
            f"Frame recibido: session={payload.session_id}, frame_id={payload.frame_id}, size={len(frame_msg.data)} bytes"
        )

        # Procesar frame
        result = self.processor.process_frame(payload)

        if result is not None:
            self.frames_processed_count += 1

        if result is None:
            logger.warning(
                f"[DEBUG] Frame processing failed for frame_id={payload.frame_id}"
            )
            await self._send_error(pb.INVALID_FRAME, "Frame processing failed")
            return

        # Visualizar (si está habilitado) - MOSTRAR TODOS LOS FRAMES para debugging
        if self.visualizer:
            img = self.processor.get_image_for_visualization(payload)
            if img is not None:
                # Convertir detecciones a tracks para visualización
                from ..tracking.botsort import Track
                import cv2

                tracks = []
                for det in result.detections:
                    if det.track_id and not det.track_id.startswith("det-"):
                        track = Track(
                            track_id=int(det.track_id),
                            class_id=0,  # No lo usamos en visualización
                            class_name=det.class_name,
                            confidence=det.confidence,
                            bbox=(det.x1, det.y1, det.x2, det.y2),
                            last_seen_frame=0,
                        )
                        tracks.append(track)

                # DEBUG: Agregar info del frame en la imagen
                info_text = f"Frame: {payload.frame_id} | Detections: {len(result.detections)} | Session: {payload.session_id or 'none'}"
                cv2.putText(
                    img,
                    info_text,
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 0),
                    2,
                )

                # Mostrar frame (con o sin detecciones)
                self.visualizer.show(img, tracks)

        # Enviar respuesta
        detections_dict = [
            {
                "x1": det.x1,
                "y1": det.y1,
                "x2": det.x2,
                "y2": det.y2,
                "confidence": det.confidence,
                "class_name": det.class_name,
                "track_id": det.track_id or "",
            }
            for det in result.detections
        ]

        # DEBUG: Log detecciones cada 25 frames
        if self.frames_processed_count % 25 == 0:
            classes_detected = [d["class_name"] for d in detections_dict]
            logger.info(
                f"[DEBUG] Enviando resultado: frame_id={result.frame_id}, detecciones={len(detections_dict)}, clases={classes_detected}"
            )

        await self._send_result(detections_dict, result.frame_id, result.session_id)

    async def _handle_end(self):
        """Maneja mensaje End - Finaliza sesión"""
        logger.info("End recibido, finalizando sesión")
        self.processor.end_session()

    async def _send_init_ok(self):
        """Envía respuesta InitOk"""
        try:
            logger.info(f"[DEBUG] Preparando mensaje InitOk")
            cfg = self.config.init_ok
            data = self.codec.encode_init_ok(
                max_frame_bytes=cfg.max_frame_bytes,
                initial_credits=cfg.initial_credits,
                pixel_format=cfg.pixel_format,
                codec=cfg.codec,
                width=cfg.width,
                height=cfg.height,
                fps_target=cfg.fps_target,
                policy=cfg.policy,
            )
            logger.info(f"[DEBUG] Escribiendo InitOk al socket")
            await self.frame_writer.write_frame(data)
            logger.info(f"[DEBUG] InitOk enviado exitosamente")
        except (BrokenPipeError, ConnectionResetError) as e:
            logger.info("Cliente cerró la conexión al enviar InitOk: %s", e)
        except Exception as e:
            logger.error(f"[DEBUG] Error enviando InitOk: {e}", exc_info=True)

    async def _send_result(self, detections: list, frame_id: int, session_id: str):
        """Envía respuesta con detecciones"""
        try:
            data = self.codec.encode_result(detections, frame_id, session_id)
            await self.frame_writer.write_frame(data)
        except (BrokenPipeError, ConnectionResetError) as e:
            logger.info("Cliente cerró la conexión al enviar resultado: %s", e)
        except Exception as e:
            logger.error(f"Error enviando resultado: {e}")

    async def _send_error(self, error_code: int, message: str):
        """Envía mensaje de error"""
        try:
            data = self.codec.encode_error(error_code, message)
            await self.frame_writer.write_frame(data)
        except (BrokenPipeError, ConnectionResetError) as e:
            logger.info("Cliente cerró la conexión antes de recibir error: %s", e)
        except Exception as e:
            logger.error(f"Error enviando error: {e}")

    async def _send_heartbeat(self):
        """Envía heartbeat"""
        try:
            data = self.codec.encode_heartbeat()
            await self.frame_writer.write_frame(data)
        except (BrokenPipeError, ConnectionResetError) as e:
            logger.info("Cliente cerró la conexión antes de recibir heartbeat: %s", e)
        except Exception as e:
            logger.error(f"Error enviando heartbeat: {e}")

    async def _cleanup(self):
        """Limpieza al cerrar conexión"""
        # Cancelar tareas
        self.model_loader.cancel()
        await self.model_loader.wait()

        if self.heartbeat_task:
            self.heartbeat_task.stop()
            await self.heartbeat_task.wait()

        # Finalizar sesión
        self.processor.end_session()

        # Cerrar conexión
        try:
            self.frame_writer.close()
        except Exception as err:
            logger.debug("Error cerrando writer: %s", err)

        try:
            await self.frame_writer.wait_closed()
        except (BrokenPipeError, ConnectionResetError) as err:
            logger.info(
                "Conexión cerrada por el cliente (%s), ignorando broken pipe",
                err,
            )
        except Exception as err:
            logger.warning("Error esperando cierre del writer: %s", err)

        logger.info(f"Cliente desconectado: {self.peer}")
