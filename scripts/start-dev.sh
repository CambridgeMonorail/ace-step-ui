#!/bin/bash
# ACE-Step UI - Debug Mode Startup Script for Linux/macOS
# Similar to start-all.sh but for development with hot reload
# Frontend runs on port 5173 (Vite dev server)

echo "=================================="
echo "   ACE-Step UI - Debug Mode"
echo "=================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Error: UI dependencies not installed!"
    echo "Please run ./setup.sh first."
    exit 1
fi

if [ ! -d "server/node_modules" ]; then
    echo "Error: Server dependencies not installed!"
    echo "Please run ./setup.sh first."
    exit 1
fi

# Get ACE-Step path from environment or use default
if [ -z "$ACESTEP_PATH" ]; then
    ACESTEP_PATH="../ACE-Step-1.5"
fi

# Check if ACE-Step exists
if [ ! -d "$ACESTEP_PATH" ]; then
    echo ""
    echo "Warning: ACE-Step not found at $ACESTEP_PATH"
    echo ""
    echo "Please set ACESTEP_PATH or place ACE-Step-1.5 next to ace-step-ui"
    echo "Example: export ACESTEP_PATH=/path/to/ACE-Step-1.5"
    echo ""
    exit 1
fi

# Detect installation type
if [ -f "$ACESTEP_PATH/.venv/bin/python" ]; then
    echo "[+] Detected Virtual Environment Installation"
    API_COMMAND="$ACESTEP_PATH/.venv/bin/python -m acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1"
elif command -v uv &> /dev/null; then
    echo "[+] Detected UV Installation"
    API_COMMAND="cd \"$ACESTEP_PATH\" && uv run acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1"
else
    echo "[+] Using Python Installation"
    API_COMMAND="cd \"$ACESTEP_PATH\" && python -m acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1"
fi

echo ""
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

# Start ACE-Step API
echo "[1/3] Starting ACE-Step API server..."
eval "$API_COMMAND" > /tmp/acestep-api.log 2>&1 &
PIDS+=($!)

# Wait for API to start
echo "Waiting for API to initialize..."
sleep 5

# Start backend
echo "[2/3] Starting backend server..."
cd server
ACESTEP_PATH="$ACESTEP_PATH" npm run dev > /tmp/acestep-backend.log 2>&1 &
PIDS+=($!)
cd ..

# Wait for backend to start
echo "Waiting for backend to start..."
sleep 3

# Start frontend (Vite dev server)
echo "[3/3] Starting frontend dev server..."
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
