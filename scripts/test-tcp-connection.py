#!/usr/bin/env python3
"""
Script de diagnóstico para verificar la comunicación TCP + Protobuf
"""
import socket
import struct
import sys
sys.path.append('services/worker-ai')
import ai_pb2

def test_connection():
    print("[TEST] Connecting to localhost:7001...")
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5.0)
    
    try:
        sock.connect(('localhost', 7001))
        print("[TEST] ✓ Connected!")
        
        # Crear mensaje Init
        init = ai_pb2.Init()
        init.model_path = "yolov8n.onnx"
        init.width = 640
        init.height = 480
        init.conf_threshold = 0.35
        
        req = ai_pb2.Request()
        req.init.CopyFrom(init)
        
        envelope = ai_pb2.Envelope()
        envelope.req.CopyFrom(req)
        
        # Serializar
        msg_bytes = envelope.SerializeToString()
        length = len(msg_bytes)
        
        print(f"[TEST] Sending Init message ({length} bytes)...")
        
        # Enviar length-prefix
        sock.sendall(struct.pack('<I', length))
        # Enviar mensaje
        sock.sendall(msg_bytes)
        
        print("[TEST] Message sent, waiting for response...")
        
        # Leer respuesta
        length_bytes = sock.recv(4)
        if len(length_bytes) != 4:
            print(f"[TEST] ✗ Failed to read length prefix (got {len(length_bytes)} bytes)")
            return
        
        resp_length = struct.unpack('<I', length_bytes)[0]
        print(f"[TEST] Response length: {resp_length} bytes")
        
        # Leer mensaje completo
        resp_bytes = b''
        while len(resp_bytes) < resp_length:
            chunk = sock.recv(resp_length - len(resp_bytes))
            if not chunk:
                print("[TEST] ✗ Connection closed while reading response")
                return
            resp_bytes += chunk
        
        # Decodificar
        resp_env = ai_pb2.Envelope()
        resp_env.ParseFromString(resp_bytes)
        
        if resp_env.HasField('res'):
            if resp_env.res.HasField('initOk'):
                print(f"[TEST] ✓ Received InitOk!")
                print(f"  Runtime: {resp_env.res.initOk.runtime}")
                print(f"  Model: {resp_env.res.initOk.model_id}")
                print(f"  Classes: {len(resp_env.res.initOk.class_names)}")
                print(f"  Providers: {', '.join(resp_env.res.initOk.providers)}")
            elif resp_env.res.HasField('error'):
                print(f"[TEST] ✗ Received error: {resp_env.res.error.message}")
        else:
            print(f"[TEST] ✗ Unexpected response type")
        
        sock.close()
        print("[TEST] Connection closed gracefully")
        
    except socket.timeout:
        print("[TEST] ✗ Timeout connecting to worker")
    except ConnectionRefusedError:
        print("[TEST] ✗ Connection refused - is the worker running?")
    except Exception as e:
        print(f"[TEST] ✗ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_connection()
