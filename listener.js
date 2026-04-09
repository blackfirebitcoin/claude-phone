const { execSync, spawn } = require("child_process");

const WAKE_PHRASE = "hey claude";

// Common STT misrecognitions of "hey claude"
const WAKE_VARIANTS = [
  "hey claude",
  "hey claud",
  "hey clod",
  "hey cloud",
  "hey clawed",
  "hey clogged",
  "hey klaud",
  "hey klaude",
  "a claude",
  "hay claude",
  "hey cloth",
  "hey clyde",
  "hey glad",
  "hey clad",
  "hey quad",
  "hey clawd",
  "hey clog",
  "hey clock",
  "hey club",
  "hey plod",
  "hey cla",
  "hey claude's",
  "ok claude",
  "okay claude",
];

function listen(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn("termux-speech-to-text", [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let timer = null;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        proc.kill();
        resolve(null); // silence — no input
      }, timeoutMs);
    }

    proc.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      // ignore stderr noise
    });

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const text = output.trim();
      if (!text || text === "") {
        resolve(null);
      } else {
        resolve(text);
      }
    });

    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Listen with automatic retry on empty results.
 * Useful when STT returns nothing due to brief silence or mic latency.
 */
async function listenWithRetry(timeoutMs = 30000, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await listen(timeoutMs);
    if (result) return result;
    if (attempt < maxRetries) {
      // Brief pause before retry
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return null;
}

/**
 * Find which wake variant matched and return its index in the text, or -1.
 */
function findWakePhrase(text) {
  if (!text) return { index: -1, variant: null };
  const lower = text.toLowerCase();

  // Sort variants longest-first to match the most specific one
  const sorted = [...WAKE_VARIANTS].sort((a, b) => b.length - a.length);

  for (const variant of sorted) {
    const idx = lower.indexOf(variant);
    if (idx !== -1) {
      return { index: idx, variant, endIndex: idx + variant.length };
    }
  }
  return { index: -1, variant: null };
}

function extractCommand(text) {
  if (!text) return null;
  const { index, variant } = findWakePhrase(text);
  if (index === -1) return null;
  const after = text.slice(index + variant.length).trim();
  // Strip leading punctuation/comma that STT sometimes adds
  return after.replace(/^[,.\s]+/, "").trim() || null;
}

function containsWakeWord(text) {
  if (!text) return false;
  return findWakePhrase(text).index !== -1;
}

/**
 * Play a short beep to give audio feedback that wake word was detected.
 */
function beep() {
  try {
    execSync("termux-vibrate -d 100", { timeout: 3000 });
  } catch (_) {}
}

module.exports = {
  listen,
  listenWithRetry,
  extractCommand,
  containsWakeWord,
  findWakePhrase,
  beep,
  WAKE_PHRASE,
  WAKE_VARIANTS,
};
