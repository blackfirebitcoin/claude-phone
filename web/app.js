// ── Claude Phone — Web Interface ──────────────────────────────────
// WebSocket-driven orb with streaming text display.

const canvas = document.getElementById("orb");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const heardEl = document.getElementById("heard");
const hintEl = document.getElementById("hint");
const sessionEl = document.getElementById("session");
const orbContainer = document.getElementById("orb-container");
const streamEl = document.getElementById("stream");

// ── Hi-DPI ────────────────────────────────────────────────────────

const dpr = window.devicePixelRatio || 1;
canvas.width = 300 * dpr;
canvas.height = 300 * dpr;
ctx.scale(dpr, dpr);

// ── Colors ────────────────────────────────────────────────────────

const COLORS = {
  idle:      { r: 212, g: 196, b: 160 },  // sand
  listening: { r: 232, g: 213, b: 168 },  // warm glow
  thinking:  { r: 184, g: 166, b: 126 },  // tan
  streaming: { r: 220, g: 210, b: 175 },  // warm mid-tone
  speaking:  { r: 245, g: 230, b: 200 },  // bright cream
  error:     { r: 196, g: 144, b: 144 },  // rose
};

// ── State ─────────────────────────────────────────────────────────

let state = "idle";
let time = 0;
let targetColor = COLORS.idle;
let currentColor = { ...COLORS.idle };
let busy = false;
let chunkPulse = 0;

// ── WebSocket Connection ─────────────────────────────────────────

let ws = null;
let wsReconnectDelay = 1000;

function connectWS() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    wsReconnectDelay = 1000;
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    } catch (_) {}
  };

  ws.onclose = () => {
    setTimeout(connectWS, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
  };

  ws.onerror = () => {};
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case "state":
      setState(msg.state, msg.state === "idle" ? "" : msg.state);
      if (msg.state === "idle") {
        busy = false;
        // Clear streaming display
        if (streamEl) {
          streamEl.textContent = "";
          streamEl.className = "";
        }
      }
      break;

    case "chunk":
      // Streaming text from Claude
      chunkPulse = 1.0;
      if (streamEl) {
        streamEl.textContent = msg.accumulated || "";
        streamEl.className = "visible";
      }
      break;

    case "heard":
      setHeard(msg.text);
      addSession("you", msg.text);
      break;

    case "response":
      addSession("claude", msg.text);
      if (streamEl) {
        streamEl.textContent = "";
        streamEl.className = "";
      }
      break;

    case "history":
      // Load history on connect
      if (msg.history) {
        sessionEl.innerHTML = "";
        msg.history.forEach((e) => addSession(e.role === "user" ? "you" : "claude", e.text));
      }
      break;

    case "pong":
      break;
  }
}

connectWS();

// ── Orb Drawing ───────────────────────────────────────────────────

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(current, target, t) {
  current.r = lerp(current.r, target.r, t);
  current.g = lerp(current.g, target.g, t);
  current.b = lerp(current.b, target.b, t);
}

function drawOrb() {
  const w = 300;
  const h = 300;
  const cx = w / 2;
  const cy = h / 2;

  ctx.clearRect(0, 0, w, h);

  lerpColor(currentColor, targetColor, 0.04);
  const { r, g, b } = currentColor;

  // Decay chunk pulse
  chunkPulse *= 0.92;
  if (chunkPulse < 0.01) chunkPulse = 0;

  let baseR, points, noiseAmt, speed;

  switch (state) {
    case "listening":
      baseR = 65 + Math.sin(time * 3) * 8;
      points = 120;
      noiseAmt = 12;
      speed = 0.04;
      break;
    case "thinking":
      baseR = 55 + Math.sin(time * 2) * 3;
      points = 100;
      noiseAmt = 6;
      speed = 0.06;
      break;
    case "streaming":
      baseR = 58 + Math.sin(time * 3) * 5 + chunkPulse * 12;
      points = 110;
      noiseAmt = 8 + chunkPulse * 6;
      speed = 0.045;
      break;
    case "speaking":
      baseR = 60 + Math.sin(time * 4) * 10;
      points = 120;
      noiseAmt = 15;
      speed = 0.05;
      break;
    default:
      baseR = 50 + Math.sin(time * 0.8) * 4;
      points = 80;
      noiseAmt = 3;
      speed = 0.015;
  }

  time += speed;

  // Outer glow
  const glowR = baseR + 30;
  const grd = ctx.createRadialGradient(cx, cy, baseR * 0.5, cx, cy, glowR);
  grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.08)`);
  grd.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Orb body — deformed circle
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const noise =
      Math.sin(angle * 3 + time * 2.5) * noiseAmt * 0.5 +
      Math.sin(angle * 5 + time * 1.8) * noiseAmt * 0.3 +
      Math.sin(angle * 7 + time * 3.2) * noiseAmt * 0.2;
    const rad = baseR + noise;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const bodyGrd = ctx.createRadialGradient(
    cx - baseR * 0.3, cy - baseR * 0.3, 0,
    cx, cy, baseR * 1.2
  );
  bodyGrd.addColorStop(0, `rgba(${Math.min(r + 40, 255)}, ${Math.min(g + 30, 255)}, ${Math.min(b + 20, 255)}, 0.9)`);
  bodyGrd.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.6)`);
  bodyGrd.addColorStop(1, `rgba(${r * 0.5 | 0}, ${g * 0.5 | 0}, ${b * 0.5 | 0}, 0.3)`);
  ctx.fillStyle = bodyGrd;
  ctx.fill();

  // Inner highlight
  const hlGrd = ctx.createRadialGradient(
    cx - baseR * 0.25, cy - baseR * 0.25, 0,
    cx, cy, baseR * 0.6
  );
  hlGrd.addColorStop(0, `rgba(255, 252, 240, 0.15)`);
  hlGrd.addColorStop(1, `rgba(255, 252, 240, 0)`);
  ctx.fillStyle = hlGrd;
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Speaking: sound wave rings
  if (state === "speaking") {
    for (let w = 0; w < 3; w++) {
      const waveR = (baseR * 0.3) + ((time * 30 + w * 20) % (baseR * 0.6));
      const waveAlpha = 0.15 * (1 - waveR / (baseR * 0.9));
      if (waveAlpha > 0) {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${waveAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Streaming: flowing arcs + chunk pulse
  if (state === "streaming") {
    const arcSpeed = 2 + chunkPulse * 4;
    ctx.strokeStyle = `rgba(${Math.min(r + 30, 255)}, ${Math.min(g + 20, 255)}, ${b}, ${0.2 + chunkPulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.45, time * arcSpeed, time * arcSpeed + Math.PI * (0.7 + chunkPulse * 0.4));
    ctx.stroke();

    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.3, -time * arcSpeed * 1.3, -time * arcSpeed * 1.3 + Math.PI * 0.5);
    ctx.stroke();

    if (chunkPulse > 0.05) {
      ctx.strokeStyle = `rgba(${Math.min(r + 40, 255)}, ${Math.min(g + 30, 255)}, ${Math.min(b + 20, 255)}, ${chunkPulse * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * (1 + chunkPulse * 0.3), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Thinking: rotating arcs
  if (state === "thinking") {
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.35, time * 2, time * 2 + Math.PI * 1.2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.2, -time * 3, -time * 3 + Math.PI * 0.8);
    ctx.stroke();
  }
}

// ── Pulse Rings (listening) ───────────────────────────────────────

function addPulseRing() {
  const ring = document.createElement("div");
  ring.className = "pulse-ring";
  orbContainer.appendChild(ring);
  setTimeout(() => ring.remove(), 1500);
}

let pulseInterval = null;

function startPulseRings() {
  stopPulseRings();
  addPulseRing();
  pulseInterval = setInterval(addPulseRing, 800);
}

function stopPulseRings() {
  if (pulseInterval) {
    clearInterval(pulseInterval);
    pulseInterval = null;
  }
  orbContainer.querySelectorAll(".pulse-ring").forEach((r) => r.remove());
}

// ── State Transitions ─────────────────────────────────────────────

function setState(newState, status = "") {
  state = newState;
  targetColor = COLORS[newState] || COLORS.idle;

  statusEl.textContent = status;
  statusEl.className = status ? "visible" : "";

  if (newState === "listening") {
    startPulseRings();
    hintEl.className = "hidden";
  } else {
    stopPulseRings();
  }

  if (newState === "idle") {
    hintEl.className = "";
  } else {
    hintEl.className = "hidden";
  }
}

function setHeard(text) {
  heardEl.textContent = `"${text}"`;
  heardEl.className = "visible";
  setTimeout(() => {
    heardEl.className = "";
  }, 4000);
}

function addSession(role, text) {
  const line = document.createElement("div");
  line.className = `session-line ${role} fresh`;
  const prefix = role === "you" ? "\u25B8 " : "\u25BE ";
  line.textContent = prefix + text;
  sessionEl.appendChild(line);

  setTimeout(() => line.classList.remove("fresh"), 2000);

  while (sessionEl.children.length > 20) {
    sessionEl.removeChild(sessionEl.firstChild);
  }
}

// ── Voice Recognition (Web Speech API) ────────────────────────────

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function listenForSpeech() {
  return new Promise((resolve, reject) => {
    if (!SpeechRecognition) {
      reject(new Error("Speech recognition not supported"));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let resolved = false;

    recognition.onresult = (event) => {
      resolved = true;
      resolve(event.results[0][0].transcript);
    };

    recognition.onerror = (event) => {
      if (!resolved) resolve(null);
    };

    recognition.onend = () => {
      if (!resolved) resolve(null);
    };

    recognition.start();
  });
}

// ── Main Interaction ──────────────────────────────────────────────

async function handleTap() {
  if (busy) return;
  busy = true;

  try {
    // Listen via Web Speech API
    setState("listening", "listening");
    const heard = await listenForSpeech();

    if (!heard) {
      setState("idle");
      busy = false;
      return;
    }

    setHeard(heard);
    addSession("you", heard);

    // Send via WebSocket — server handles thinking/streaming/speaking/idle transitions
    setState("thinking", "thinking");
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ask", command: heard }));
    } else {
      // Fallback to HTTP
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: heard }),
      });
      const data = await res.json();
      if (data.response) addSession("claude", data.response);
      setState("idle");
      busy = false;
    }
    // WS state messages will handle the rest (streaming → speaking → idle)

  } catch (err) {
    targetColor = COLORS.error;
    statusEl.textContent = "something went wrong";
    statusEl.className = "visible";
    setTimeout(() => setState("idle"), 3000);
    busy = false;
  }
}

// ── Event Listeners ───────────────────────────────────────────────

document.getElementById("app").addEventListener("click", handleTap);
document.getElementById("app").addEventListener("touchend", (e) => {
  e.preventDefault();
  handleTap();
});

// ── Render Loop ───────────────────────────────────────────────────

function animate() {
  drawOrb();
  requestAnimationFrame(animate);
}

animate();
