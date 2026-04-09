// ── UI System ─────────────────────────────────────────────────────
// Consistent visual language for Claude Phone.
// Inspired by clarity, restraint, and human warmth.

const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  italic:  "\x1b[3m",

  // Palette — eggshell / vintage beige PC / classic Claude tan
  white:   "\x1b[38;5;230m",  // eggshell white
  grey:    "\x1b[38;5;144m",  // warm grey, like aged plastic
  mid:     "\x1b[38;5;180m",  // mid tan
  peach:   "\x1b[38;5;180m",  // warm tan accent (classic beige)
  sand:    "\x1b[38;5;223m",  // light sand / cream
  sky:     "\x1b[38;5;144m",  // muted olive-grey (vintage CRT feel)
  rose:    "\x1b[38;5;174m",  // muted rose for errors
  green:   "\x1b[38;5;186m",  // warm chartreuse (old phosphor green-ish)
  bg:      "\x1b[48;5;235m",  // deep warm bg
  bgLight: "\x1b[48;5;237m",
};

const WIDTH = Math.min(process.stdout.columns || 60, 60);
const PAD = "  ";

// ── Primitives ────────────────────────────────────────────────────

function clear() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function line(text = "", style = "") {
  console.log(`${style}${PAD}${text}${c.reset}`);
}

function blank(n = 1) {
  for (let i = 0; i < n; i++) console.log("");
}

function divider(char = "\u2500") {
  line(c.grey + char.repeat(WIDTH - 4) + c.reset);
}

function thinDivider() {
  line(c.grey + "\u2508".repeat(WIDTH - 4) + c.reset);
}

// ── Branding ──────────────────────────────────────────────────────

function logo() {
  clear();
  blank(2);
  line(`${c.sand}${c.bold}C L A U D E${c.reset}`);
  line(`${c.grey}${c.dim}phone${c.reset}`);
  blank();
}

function versionTag() {
  line(`${c.grey}v1.0${c.reset}`);
}

// ── Mode Selector ─────────────────────────────────────────────────

function showModeMenu() {
  logo();
  divider();
  blank();
  line(`${c.white}${c.bold}Choose how you'd like to talk.${c.reset}`);
  blank();
  line(`${c.sand}  1 ${c.reset}${c.white}  Push to Talk${c.reset}`);
  line(`${c.grey}      Press Enter, then speak.${c.reset}`);
  blank();
  line(`${c.sand}  2 ${c.reset}${c.white}  Always Listening${c.reset}`);
  line(`${c.grey}      Say "Hey Claude" anytime.${c.reset}`);
  blank();
  divider();
  blank();
}

// ── Status States ─────────────────────────────────────────────────

const SPINNER_FRAMES = ["    ", ".   ", "..  ", "... ", "...."];
let spinnerInterval = null;

function startSpinner(label) {
  let i = 0;
  process.stdout.write(`${PAD}${c.sky}${label} ${c.reset}`);
  spinnerInterval = setInterval(() => {
    process.stdout.write(`\r${PAD}${c.sky}${label} ${c.dim}${SPINNER_FRAMES[i % SPINNER_FRAMES.length]}${c.reset}`);
    i++;
  }, 300);
}

function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write("\r\x1b[K"); // clear line
  }
}

function stateListening() {
  stopSpinner();
  blank();
  line(`${c.peach}${c.bold}\u25CF${c.reset}  ${c.white}Listening${c.reset}`);
}

function stateHeard(text) {
  stopSpinner();
  line(`${c.green}\u25CF${c.reset}  ${c.dim}"${text}"${c.reset}`);
}

function stateThinking() {
  startSpinner("Thinking");
}

function stateError(msg) {
  stopSpinner();
  line(`${c.rose}\u25CB${c.reset}  ${c.rose}${msg}${c.reset}`);
}

function stateSilence() {
  stopSpinner();
  line(`${c.grey}\u25CB  Nothing heard${c.reset}`);
}

// ── Response Card ─────────────────────────────────────────────────

function showResponse(text) {
  stopSpinner();
  blank();
  divider();
  blank();

  // Word-wrap the response to fit the terminal
  const maxW = WIDTH - 8;
  const words = text.split(/\s+/);
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length > maxW) {
      line(`${c.white}${currentLine.trim()}${c.reset}`);
      currentLine = word;
    } else {
      currentLine += " " + word;
    }
  }
  if (currentLine.trim()) {
    line(`${c.white}${currentLine.trim()}${c.reset}`);
  }

  blank();
  divider();
}

// ── Mode Headers ──────────────────────────────────────────────────

function showPushToTalkHeader() {
  clear();
  blank();
  line(`${c.peach}${c.bold}C L A U D E${c.reset}  ${c.dim}push to talk${c.reset}`);
  blank();
  divider();
  blank();
  line(`${c.grey}Press ${c.sand}Enter${c.grey} to speak  \u00B7  type ${c.sand}quit${c.grey} to exit${c.reset}`);
  line(`${c.grey}Or just type a message.${c.reset}`);
}

function showAlwaysOnHeader() {
  clear();
  blank();
  line(`${c.peach}${c.bold}C L A U D E${c.reset}  ${c.dim}always on${c.reset}`);
  blank();
  divider();
  blank();
  line(`${c.grey}Say ${c.sand}"Hey Claude"${c.grey} followed by your request.${c.reset}`);
  line(`${c.grey}Press ${c.sand}Ctrl+C${c.grey} to stop.${c.reset}`);
}

function showAlwaysOnIdle() {
  stopSpinner();
  blank();
  line(`${c.dim}\u25CB  Waiting for wake word${c.reset}`);
}

function showWakeDetected() {
  line(`${c.peach}\u25CF${c.reset}  ${c.sand}Wake word detected${c.reset}`);
}

// ── Goodbye ───────────────────────────────────────────────────────

function showGoodbye() {
  stopSpinner();
  blank();
  divider();
  blank();
  line(`${c.sand}See you.${c.reset}`);
  blank();
}

// ── Prompt ─────────────────────────────────────────────────────────

function promptSymbol() {
  return `${c.peach}\u276F${c.reset} `;
}

module.exports = {
  c,
  clear,
  line,
  blank,
  divider,
  thinDivider,
  logo,
  versionTag,
  showModeMenu,
  stateListening,
  stateHeard,
  stateThinking,
  stateError,
  stateSilence,
  showResponse,
  showPushToTalkHeader,
  showAlwaysOnHeader,
  showAlwaysOnIdle,
  showWakeDetected,
  showGoodbye,
  stopSpinner,
  promptSymbol,
};
