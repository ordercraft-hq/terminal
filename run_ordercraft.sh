#!/usr/bin/env bash
set -e

# Ensure ~/.local/bin and standard paths are in PATH
export PATH="$HOME/.local/bin:$PATH"

# Resolve project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$PROJECT_DIR"

echo "=================================================="
echo "  ORDERCRAFT — Financial Workstation   "
echo "=================================================="
echo "Starting backend and frontend services..."

# Cleanup function on script exit or interrupt
cleanup() {
    echo ""
    echo "[ORDERCRAFT] Shutting down services..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    # Also terminate any processes still listening on ports 8448 or 3000
    fuser -k 8448/tcp 2>/dev/null || true
    fuser -k 3000/tcp 2>/dev/null || true
    echo "[ORDERCRAFT] Services stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Free up ports if already in use
fuser -k 8448/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

# Start Go backend
echo "[1/2] Launching Go backend (127.0.0.1:8448)..."
go run main.go --port 8448 --no-browser &
BACKEND_PID=$!

# Wait for backend to be healthy
for i in {1..20}; do
    if curl -s http://127.0.0.1:8448/api/health >/dev/null 2>&1; then
        echo "      ✓ Backend is ready."
        break
    fi
    sleep 0.5
done

# Start Vite frontend
echo "[2/2] Launching Vite React frontend (http://localhost:3000)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend to respond
for i in {1..20}; do
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        echo "      ✓ Frontend is ready."
        break
    fi
    sleep 0.5
done

# Launch browser
echo "Opening ORDERCRAFT in browser (http://localhost:3000)..."
xdg-open "http://localhost:3000" >/dev/null 2>&1 &

echo "=================================================="
echo "  ORDERCRAFT is running!"
echo "  - Backend:  http://127.0.0.1:8448"
echo "  - Frontend: http://localhost:3000"
echo "  Press Ctrl+C in this terminal to stop services."
echo "=================================================="

# Wait for background processes
wait
