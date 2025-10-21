"""Framing de mensajes length-prefixed para TCP streams"""
import struct
import asyncio
from typing import Optional

from ..core.logger import setup_logger

logger = setup_logger("transport.framing")


class FrameReader:
    """Lee mensajes length-prefixed desde un StreamReader"""
    
    def __init__(self, reader: asyncio.StreamReader, max_size: int = 50 * 1024 * 1024):
        """
        Args:
            reader: StreamReader de asyncio
            max_size: Tamaño máximo de mensaje en bytes (default 50MB)
        """
        self.reader = reader
        self.max_size = max_size
    
    async def read_frame(self) -> Optional[bytes]:
        """
        Lee un frame completo del stream
        
        Returns:
            Bytes del mensaje o None si la conexión se cerró
        """
        try:
            # Leer tamaño del mensaje (4 bytes, little-endian)
            length_bytes = await self.reader.readexactly(4)
            length = struct.unpack("<I", length_bytes)[0]
            
            # Validar tamaño
            if length == 0 or length > self.max_size:
                logger.error(f"Tamaño de mensaje inválido: {length} bytes")
                return None
            
            # Leer mensaje
            msg_bytes = await self.reader.readexactly(length)
            return msg_bytes
            
        except asyncio.IncompleteReadError:
            logger.debug("Conexión cerrada por el cliente")
            return None
        except Exception as e:
            logger.error(f"Error leyendo frame: {e}")
            return None


class FrameWriter:
    """Escribe mensajes length-prefixed a un StreamWriter"""
    
    def __init__(self, writer: asyncio.StreamWriter):
        """
        Args:
            writer: StreamWriter de asyncio
        """
        self.writer = writer
    
    async def write_frame(self, data: bytes) -> bool:
        """
        Escribe un frame al stream
        
        Args:
            data: Bytes del mensaje a enviar
            
        Returns:
            True si se envió correctamente, False en caso de error
        """
        try:
            length = len(data)
            
            # Escribir tamaño + datos
            self.writer.write(struct.pack("<I", length))
            self.writer.write(data)
            await self.writer.drain()
            
            return True
            
        except Exception as e:
            logger.error(f"Error escribiendo frame: {e}")
            return False
    
    def is_closing(self) -> bool:
        """Verifica si el writer está cerrándose"""
        return self.writer.is_closing()
    
    def close(self):
        """Cierra el writer"""
        self.writer.close()
    
    async def wait_closed(self):
        """Espera a que el writer se cierre completamente"""
        await self.writer.wait_closed()
