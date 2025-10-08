#!/bin/bash
# Comandos útiles para debugging del Worker AI

echo "=== Worker AI - Debugging Tools ==="
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function check_protobuf() {
    echo -e "${YELLOW}Checking Protobuf files...${NC}"
    
    if [ -f "services/worker-ai/ai_pb2.py" ]; then
        echo -e "${GREEN}✓ Python Protobuf generated${NC}"
        ls -lh services/worker-ai/ai_pb2.py
    else
        echo -e "${RED}✗ Python Protobuf missing${NC}"
    fi
    
    if [ -f "services/edge-agent/src/proto/ai_pb.js" ]; then
        echo -e "${GREEN}✓ TypeScript Protobuf generated${NC}"
        ls -lh services/edge-agent/src/proto/ai_pb.*
    else
        echo -e "${RED}✗ TypeScript Protobuf missing${NC}"
    fi
    echo ""
}

function check_model() {
    echo -e "${YELLOW}Checking ONNX model...${NC}"
    
    if [ -f "data/models/yolov8n.onnx" ]; then
        echo -e "${GREEN}✓ Model found${NC}"
        ls -lh data/models/yolov8n.onnx
    else
        echo -e "${RED}✗ Model not found${NC}"
        echo "Download with:"
        echo "  mkdir -p data/models"
        echo "  cd data/models"
        echo "  wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx"
    fi
    echo ""
}

function check_services() {
    echo -e "${YELLOW}Checking Docker services...${NC}"
    docker-compose ps
    echo ""
}

function check_worker_logs() {
    echo -e "${YELLOW}Worker AI logs (last 20 lines):${NC}"
    docker-compose logs --tail=20 worker-ai
    echo ""
}

function check_agent_logs() {
    echo -e "${YELLOW}Edge Agent logs (last 20 lines):${NC}"
    docker-compose logs --tail=20 edge-agent
    echo ""
}

function test_worker_port() {
    echo -e "${YELLOW}Testing Worker AI port...${NC}"
    
    if docker-compose exec -T worker-ai python3 -c "import socket; s = socket.socket(); s.connect(('127.0.0.1', 7001)); print('Port 7001 is open'); s.close()" 2>/dev/null; then
        echo -e "${GREEN}✓ Worker is listening on port 7001${NC}"
    else
        echo -e "${RED}✗ Worker not listening${NC}"
    fi
    echo ""
}

function test_model_load() {
    echo -e "${YELLOW}Testing model loading...${NC}"
    
    docker-compose exec -T worker-ai python3 << 'EOF'
try:
    import onnxruntime as ort
    session = ort.InferenceSession('/models/yolov8n.onnx')
    print('✓ Model loaded successfully')
    print(f'  Inputs: {[i.name for i in session.get_inputs()]}')
    print(f'  Outputs: {[o.name for o in session.get_outputs()]}')
    print(f'  Providers: {session.get_providers()}')
except Exception as e:
    print(f'✗ Error: {e}')
EOF
    echo ""
}

function test_connectivity() {
    echo -e "${YELLOW}Testing connectivity from edge-agent to worker-ai...${NC}"
    
    if docker-compose exec -T edge-agent nc -zv worker-ai 7001 2>&1 | grep -q "succeeded"; then
        echo -e "${GREEN}✓ Connectivity OK${NC}"
    else
        echo -e "${RED}✗ Cannot connect${NC}"
    fi
    echo ""
}

function show_metrics() {
    echo -e "${YELLOW}Recent metrics from logs:${NC}"
    echo ""
    echo "Worker inference times:"
    docker-compose logs worker-ai | grep "Inference done" | tail -5
    echo ""
    echo "Agent frames sent:"
    docker-compose logs edge-agent | grep "Frame sent" | tail -5
    echo ""
}

function show_menu() {
    echo "Available commands:"
    echo "  1) Check Protobuf files"
    echo "  2) Check ONNX model"
    echo "  3) Check Docker services status"
    echo "  4) Show worker logs"
    echo "  5) Show agent logs"
    echo "  6) Test worker port"
    echo "  7) Test model loading"
    echo "  8) Test connectivity"
    echo "  9) Show metrics"
    echo "  a) Run all checks"
    echo "  q) Quit"
    echo ""
}

# Main
if [ "$1" = "all" ]; then
    check_protobuf
    check_model
    check_services
    check_worker_logs
    test_worker_port
    test_model_load
    test_connectivity
    show_metrics
    exit 0
fi

if [ "$1" != "" ]; then
    case $1 in
        protobuf) check_protobuf ;;
        model) check_model ;;
        services) check_services ;;
        worker-logs) check_worker_logs ;;
        agent-logs) check_agent_logs ;;
        port) test_worker_port ;;
        load) test_model_load ;;
        connect) test_connectivity ;;
        metrics) show_metrics ;;
        *) echo "Unknown command: $1"; show_menu ;;
    esac
    exit 0
fi

# Interactive mode
while true; do
    show_menu
    read -p "Select option: " choice
    case $choice in
        1) check_protobuf ;;
        2) check_model ;;
        3) check_services ;;
        4) check_worker_logs ;;
        5) check_agent_logs ;;
        6) test_worker_port ;;
        7) test_model_load ;;
        8) test_connectivity ;;
        9) show_metrics ;;
        a) 
            check_protobuf
            check_model
            check_services
            test_worker_port
            test_model_load
            test_connectivity
            ;;
        q) echo "Bye!"; exit 0 ;;
        *) echo "Invalid option" ;;
    esac
done
