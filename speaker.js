const { spawn } = require("child_process");

let currentSpeech = null;

function speak(text) {
  return new Promise((resolve, reject) => {
    if (!text) return resolve();

    // Kill any ongoing speech
    if (currentSpeech) {
      currentSpeech.kill();
      currentSpeech = null;
    }

    // Clean up text for TTS — remove markdown artifacts, code blocks, etc.
    const clean = text
      .replace(/```[\s\S]*?```/g, "code block omitted")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[_~|>]/g, "")
      .trim();

    if (!clean) return resolve();

    const proc = spawn("termux-tts-speak", [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    currentSpeech = proc;

    proc.stdin.write(clean);
    proc.stdin.end();

    proc.on("close", () => {
      currentSpeech = null;
      resolve();
    });

    proc.on("error", (err) => {
      currentSpeech = null;
      reject(err);
    });
  });
}

function stopSpeaking() {
  if (currentSpeech) {
    currentSpeech.kill();
    currentSpeech = null;
  }
}

module.exports = { speak, stopSpeaking };
