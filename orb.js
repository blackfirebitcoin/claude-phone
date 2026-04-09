// ── The Orb ───────────────────────────────────────────────────────
// A living, breathing sphere in the terminal that responds to state.
// The Claude session scrolls dimly behind it.

const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  hide:    "\x1b[?25l",  // hide cursor
  show:    "\x1b[?25h",  // show cursor

  // Eggshell / vintage tan palette
  cream:   "\x1b[38;5;230m",
  tan:     "\x1b[38;5;180m",
  sand:    "\x1b[38;5;223m",
  warm:    "\x1b[38;5;144m",
  faint:   "\x1b[38;5;239m",
  ghost:   "\x1b[38;5;236m",
  rose:    "\x1b[38;5;174m",
  glow:    "\x1b[38;5;222m",
  bright:  "\x1b[38;5;229m",
};

// ── Sphere Frames ─────────────────────────────────────────────────

const IDLE_FRAMES = [
  [
    "       .  .       ",
    "     .      .     ",
    "    .        .    ",
    "    .        .    ",
    "     .      .     ",
    "       .  .       ",
  ],
  [
    "       .  .       ",
    "     .      .     ",
    "    .        .    ",
    "    .        .    ",
    "     .      .     ",
    "       .  .       ",
  ],
  [
    "        ..        ",
    "     .      .     ",
    "    .        .    ",
    "    .        .    ",
    "     .      .     ",
    "        ..        ",
  ],
  [
    "        ..        ",
    "      .    .      ",
    "    .        .    ",
    "    .        .    ",
    "      .    .      ",
    "        ..        ",
  ],
];

const LISTEN_FRAMES = [
  [
    "                  ",
    "       .  .       ",
    "     .      .     ",
    "    (        )    ",
    "     .      .     ",
    "       .  .       ",
    "                  ",
  ],
  [
    "      .    .      ",
    "    .        .    ",
    "   .          .   ",
    "  (            )  ",
    "   .          .   ",
    "    .        .    ",
    "      .    .      ",
  ],
  [
    "    .        .    ",
    "  .            .  ",
    " .              . ",
    " (              ) ",
    " .              . ",
    "  .            .  ",
    "    .        .    ",
  ],
  [
    "  .            .  ",
    " .              . ",
    ".                .",
    "(                )",
    ".                .",
    " .              . ",
    "  .            .  ",
  ],
];

const THINK_FRAMES = [
  [
    "       .  .       ",
    "     .  \u2502   .     ",
    "    . \u2500\u2500\u2518    .    ",
    "    .        .    ",
    "     .      .     ",
    "       .  .       ",
  ],
  [
    "       .  .       ",
    "     .      .     ",
    "    .   \u2500\u2500\u2510  .    ",
    "    .    \u2502   .    ",
    "     .      .     ",
    "       .  .       ",
  ],
  [
    "       .  .       ",
    "     .      .     ",
    "    .        .    ",
    "    .  \u250C\u2500\u2500   .    ",
    "     . \u2502    .     ",
    "       .  .       ",
  ],
  [
    "       .  .       ",
    "     . \u2502    .     ",
    "    .  \u2514\u2500\u2500  .    ",
    "    .        .    ",
    "     .      .     ",
    "       .  .       ",
  ],
];

const SPEAK_FRAMES = [
  [
    "       .  .       ",
    "     .  ))  .     ",
    "    .  )))   .    ",
    "    .  ))    .    ",
    "     .      .     ",
    "       .  .       ",
  ],
  [
    "      .    .      ",
    "    .  )))   .    ",
    "   . ))))     .   ",
    "   .  )))     .   ",
    "    .        .    ",
    "      .    .      ",
  ],
  [
    "       .  .       ",
    "     . )))  .     ",
    "    . )))))  .    ",
    "    . ))))   .    ",
    "     . ))   .     ",
    "       .  .       ",
  ],
  [
    "       .  .       ",
    "     .  ))  .     ",
    "    .  )))   .    ",
    "    .   ))   .    ",
    "     .  )   .     ",
    "       .  .       ",
  ],
];

// ── State ─────────────────────────────────────────────────────────

const STATE = {
  IDLE: "idle",
  LISTENING: "listening",
  THINKING: "thinking",
  SPEAKING: "speaking",
};

let currentState = STATE.IDLE;
let frameIndex = 0;
let animInterval = null;
let sessionLog = [];    // abstracted session history
let statusText = "";    // small status line under the orb
let lastHeard = "";     // what was last heard

const MAX_LOG_LINES = 12;

// ── Rendering ─────────────────────────────────────────────────────

function getTermSize() {
  return {
    cols: process.stdout.columns || 60,
    rows: process.stdout.rows || 24,
  };
}

function moveTo(row, col) {
  process.stdout.write(`\x1b[${row};${col}H`);
}

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function centerText(text, width) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, Math.floor((width - clean.length) / 2));
  return " ".repeat(pad) + text;
}

function getFrames() {
  switch (currentState) {
    case STATE.LISTENING: return LISTEN_FRAMES;
    case STATE.THINKING:  return THINK_FRAMES;
    case STATE.SPEAKING:  return SPEAK_FRAMES;
    default:              return IDLE_FRAMES;
  }
}

function getOrbColor() {
  switch (currentState) {
    case STATE.LISTENING: return c.glow;
    case STATE.THINKING:  return c.tan;
    case STATE.SPEAKING:  return c.bright;
    default:              return c.sand;
  }
}

function getStatusColor() {
  switch (currentState) {
    case STATE.LISTENING: return c.glow;
    case STATE.THINKING:  return c.tan;
    case STATE.SPEAKING:  return c.cream;
    default:              return c.warm;
  }
}

function render() {
  const { cols, rows } = getTermSize();
  const frames = getFrames();
  const frame = frames[frameIndex % frames.length];
  const orbColor = getOrbColor();

  // ── Brand ──
  moveTo(1, 0);
  const brand = `${c.sand}${c.dim}C L A U D E${c.reset}`;
  process.stdout.write(centerText(brand, cols));

  // ── Session log (behind the orb, ghosted) ──
  const logStartRow = 3;
  const logLines = sessionLog.slice(-MAX_LOG_LINES);
  for (let i = 0; i < MAX_LOG_LINES; i++) {
    moveTo(logStartRow + i, 0);
    process.stdout.write("\x1b[K"); // clear line
    if (i < logLines.length) {
      const logLine = logLines[i];
      const truncated = logLine.length > cols - 4
        ? logLine.slice(0, cols - 4)
        : logLine;
      process.stdout.write(centerText(`${c.ghost}${truncated}${c.reset}`, cols));
    }
  }

  // ── Orb (centered, overlaid) ──
  const orbStartRow = Math.floor(rows / 2) - Math.floor(frame.length / 2);
  for (let i = 0; i < frame.length; i++) {
    moveTo(orbStartRow + i, 0);
    process.stdout.write("\x1b[K");
    process.stdout.write(centerText(`${orbColor}${frame[i]}${c.reset}`, cols));
  }

  // ── Status text under orb ──
  const statusRow = orbStartRow + frame.length + 1;
  moveTo(statusRow, 0);
  process.stdout.write("\x1b[K");
  if (statusText) {
    process.stdout.write(centerText(`${getStatusColor()}${statusText}${c.reset}`, cols));
  }

  // ── Last heard (dim, below status) ──
  moveTo(statusRow + 1, 0);
  process.stdout.write("\x1b[K");
  if (lastHeard) {
    const heard = lastHeard.length > cols - 10
      ? lastHeard.slice(0, cols - 13) + "..."
      : lastHeard;
    process.stdout.write(centerText(`${c.faint}"${heard}"${c.reset}`, cols));
  }

  // ── Bottom hint ──
  moveTo(rows, 0);
  process.stdout.write("\x1b[K");
  const hint = currentState === STATE.IDLE
    ? `${c.ghost}say "hey claude" or press ctrl+c${c.reset}`
    : "";
  if (hint) process.stdout.write(centerText(hint, cols));

  frameIndex++;
}

// ── Animation Control ─────────────────────────────────────────────

function getSpeed() {
  switch (currentState) {
    case STATE.LISTENING: return 250;
    case STATE.THINKING:  return 200;
    case STATE.SPEAKING:  return 300;
    default:              return 800;
  }
}

function startAnimation() {
  stopAnimation();
  process.stdout.write(c.hide);
  render();
  animInterval = setInterval(render, getSpeed());
}

function stopAnimation() {
  if (animInterval) {
    clearInterval(animInterval);
    animInterval = null;
  }
}

function restartAnimation() {
  // Restart with new speed for the current state
  startAnimation();
}

// ── Public API ────────────────────────────────────────────────────

function init() {
  clearScreen();
  process.stdout.write(c.hide);
  process.on("exit", () => process.stdout.write(c.show));
  startAnimation();
}

function destroy() {
  stopAnimation();
  process.stdout.write(c.show);
  clearScreen();
}

function setState(state, status = "") {
  currentState = state;
  statusText = status;
  frameIndex = 0;
  restartAnimation();
}

function setIdle() {
  setState(STATE.IDLE, "");
}

function setListening() {
  setState(STATE.LISTENING, "listening");
}

function setHeard(text) {
  lastHeard = text;
  render();
}

function setThinking() {
  setState(STATE.THINKING, "thinking");
}

function setSpeaking() {
  setState(STATE.SPEAKING, "speaking");
}

function addToLog(role, text) {
  // Abstracted session: short lines, role-prefixed
  const prefix = role === "you" ? "\u25B8 " : "\u25BE ";
  // Word-wrap to ~50 chars
  const maxW = 50;
  const words = text.split(/\s+/);
  let line = prefix;
  for (const word of words) {
    if ((line + " " + word).length > maxW) {
      sessionLog.push(line.trim());
      line = "  " + word;
    } else {
      line += " " + word;
    }
  }
  if (line.trim()) sessionLog.push(line.trim());
  sessionLog.push(""); // blank line between entries

  // Keep bounded
  if (sessionLog.length > 100) {
    sessionLog = sessionLog.slice(-60);
  }
}

function setError(msg) {
  statusText = msg;
  render();
}

function showGoodbye() {
  stopAnimation();
  clearScreen();
  const { cols, rows } = getTermSize();
  moveTo(Math.floor(rows / 2), 0);
  process.stdout.write(centerText(`${c.sand}See you.${c.reset}`, cols));
  moveTo(rows, 0);
  process.stdout.write(c.show);
}

module.exports = {
  init,
  destroy,
  setIdle,
  setListening,
  setHeard,
  setThinking,
  setSpeaking,
  setError,
  addToLog,
  showGoodbye,
  STATE,
};
