"""
Healthcheck para Docker
"""
import socket
import sys

def check_health():
    """Verificar que el worker esté escuchando"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(("127.0.0.1", 7001))
        sock.close()
        return result == 0
    except Exception:
        return False

if __name__ == "__main__":
    if check_health():
        sys.exit(0)
    else:
        sys.exit(1)
