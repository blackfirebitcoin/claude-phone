const { listen, listenWithRetry, extractCommand, containsWakeWord, beep } = require("./listener");
const { execute } = require("./executor");
const { speak, stopSpeaking } = require("./speaker");
const readline = require("readline");
const orb = require("./orb");
const ui = require("./ui");

const MODE_PUSH_TO_TALK = "push-to-talk";
const MODE_ALWAYS_ON = "always-on";

function getMode() {
  const idx = process.argv.indexOf("--mode");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return null;
}

// ── Push-to-Talk ──────────────────────────────────────────────────

async function pushToTalkLoop() {
  orb.init();

  // Raw mode so we can catch single keypresses
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  orb.setIdle();

  process.stdin.on("data", async (key) => {
    // Ctrl+C
    if (key === "\x03") {
      orb.showGoodbye();
      process.exit(0);
    }

    // Enter key — start listening
    if (key === "\r" || key === "\n") {
      orb.setListening();
      beep();

      try {
        const command = await listenWithRetry(15000, 1);

        if (!command) {
          orb.setIdle();
          return;
        }

        orb.setHeard(command);
        orb.addToLog("you", command);
        orb.setThinking();

        const response = await execute(command);
        orb.addToLog("claude", response);
        orb.setSpeaking();
        await speak(response);
        orb.setIdle();
      } catch (err) {
        orb.setError(err.message);
        setTimeout(() => orb.setIdle(), 2000);
      }
    }
  });
}

// ── Always-On ─────────────────────────────────────────────────────

async function alwaysOnLoop() {
  orb.init();
  orb.setIdle();

  let running = true;

  process.on("SIGINT", () => {
    running = false;
    stopSpeaking();
    orb.showGoodbye();
    process.exit(0);
  });

  while (running) {
    try {
      const text = await listen(0);

      if (!text) continue;

      orb.setHeard(text);

      if (containsWakeWord(text)) {
        beep();
        const command = extractCommand(text);

        if (!command) {
          orb.setListening();
          await speak("I'm listening.");
          const followUp = await listenWithRetry(20000, 1);
          if (followUp) {
            orb.setHeard(followUp);
            orb.addToLog("you", followUp);
            orb.setThinking();
            const response = await execute(followUp);
            orb.addToLog("claude", response);
            orb.setSpeaking();
            await speak(response);
          } else {
            await speak("I didn't catch that.");
          }
        } else {
          orb.addToLog("you", command);
          orb.setThinking();
          const response = await execute(command);
          orb.addToLog("claude", response);
          orb.setSpeaking();
          await speak(response);
        }
      }

      orb.setIdle();
    } catch (err) {
      orb.setError(err.message);
      await new Promise((r) => setTimeout(r, 1000));
      orb.setIdle();
    }
  }
}

// ── Mode Selection ────────────────────────────────────────────────

async function selectMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    ui.showModeMenu();
    rl.question(`  ${ui.promptSymbol()}`, (answer) => {
      rl.close();
      if (answer.trim() === "2") {
        resolve(MODE_ALWAYS_ON);
      } else {
        resolve(MODE_PUSH_TO_TALK);
      }
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  let mode = getMode();

  if (!mode) {
    mode = await selectMode();
  }

  try {
    const { execSync } = require("child_process");
    execSync('termux-toast "Claude Phone started"');
  } catch (_) {}

  if (mode === MODE_ALWAYS_ON) {
    await alwaysOnLoop();
  } else {
    await pushToTalkLoop();
  }
}

main().catch((err) => {
  process.stdout.write("\x1b[?25h");
  console.error(`\n  Fatal: ${err.message}\n`);
  process.exit(1);
});
