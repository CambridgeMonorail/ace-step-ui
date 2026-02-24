#!/bin/bash
# ACE-Step UI - Debug Mode with Pinokio Installation (Linux/macOS)
# Starts all services in separate terminals for easier debugging
# Frontend runs on port 5173 with hot reload

echo "=================================="
echo "   ACE-Step UI - Debug Mode"
echo "=================================="
echo ""

# Set path to Pinokio installation
ACESTEP_PATH="$HOME/pinokio/api/ace-step-ui.pinokio.git/app/ACE-Step-1.5"

echo "ACESTEP_PATH: $ACESTEP_PATH"
echo ""

# Check if ACE-Step exists
if [ ! -f "$ACESTEP_PATH/env/bin/python" ] && [ ! -f "$ACESTEP_PATH/.venv/bin/python" ]; then
    echo "Error: ACE-Step not found at $ACESTEP_PATH"
    echo "Please verify your Pinokio installation path."
    exit 1
fi

echo "=================================="
echo "   Starting Services in Debug Mode"
echo "=================================="
echo ""

# Store PIDs for cleanup
PIDS=()

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping all services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null
    done
    exit 0
}

trap cleanup SIGINT SIGTERM

# Determine Python path
if [ -f "$ACESTEP_PATH/env/bin/python" ]; then
    PYTHON_PATH="$ACESTEP_PATH/env/bin/python"
elif [ -f "$ACESTEP_PATH/.venv/bin/python" ]; then
    PYTHON_PATH="$ACESTEP_PATH/.venv/bin/python"
fi

# Start ACE-Step API
echo "[1/3] Starting ACE-Step API (port 8001)..."
cd "$ACESTEP_PATH"
"$PYTHON_PATH" acestep/api_server.py > /tmp/acestep-api.log 2>&1 &
PIDS+=($!)
cd - > /dev/null

# Wait for API to start
echo "Waiting for API to initialize..."
sleep 5

# Start backend
echo "[2/3] Starting Backend Server (port 3001)..."
cd "$(dirname "$0")/../server"
ACESTEP_PATH="$ACESTEP_PATH" npm run dev > /tmp/acestep-backend.log 2>&1 &
PIDS+=($!)
cd - > /dev/null

# Wait for backend to start
echo "Waiting for backend to start..."
sleep 3

# Start frontend (Vite dev server)
echo "[3/3] Starting Frontend Dev Server (port 5173)..."
cd "$(dirname "$0")/.."
npm run dev > /tmp/acestep-frontend.log 2>&1 &
PIDS+=($!)

# Wait a moment
sleep 2

echo ""
echo "=================================="
echo "   Debug Mode Running!"
echo "=================================="
echo ""
echo "   ACE-Step API:  http://localhost:8001"
echo "   Backend:       http://localhost:3001"
echo "   Frontend:      http://localhost:3000"
echo ""
echo "   Service Logs:"
echo "   - ACE-Step API:  tail -f /tmp/acestep-api.log"
echo "   - Backend:       tail -f /tmp/acestep-backend.log"
echo "   - Frontend:      tail -f /tmp/acestep-frontend.log"
echo ""
echo "=================================="
echo ""

# Try to open browser
if command -v xdg-open &> /dev/null; then
    sleep 3
    xdg-open http://localhost:3000 &
elif command -v open &> /dev/null; then
    sleep 3
    open http://localhost:3000 &
fi

echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user interrupt
wait
