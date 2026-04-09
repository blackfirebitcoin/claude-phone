#!/data/data/com.termux/files/usr/bin/bash
# Start Claude Phone — server + orb overlay
cd "$(dirname "$0")"

# Kill old server if running
pkill -f "node.*server.js" 2>/dev/null
sleep 0.3

# Start server in background, preserve .session
node server.js &
SERVER_PID=$!

# Wait for server to be ready
for i in $(seq 1 20); do
    curl -s http://localhost:3000/api/status >/dev/null 2>&1 && break
    sleep 0.5
done

# Launch the orb overlay app
am start -n com.claude.phone/.MainActivity

echo "Claude Phone running (server pid $SERVER_PID)"
echo "To stop: pkill -f 'node.*server.js'"
wait $SERVER_PID
