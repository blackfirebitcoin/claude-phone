const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "system-prompt.txt"), "utf-8");
const SESSION_FILE = path.join(__dirname, ".session");

let sessionId = null;
try { sessionId = fs.readFileSync(SESSION_FILE, "utf-8").trim() || null; } catch (_) {}

function execute(command) {
  return new Promise((resolve) => {
    const args = [
      "-p",
      "--model", "sonnet",
      "--system-prompt", SYSTEM_PROMPT,
      "--output-format", "json",
      "--dangerously-skip-permissions",
    ];
    if (sessionId) args.push("--resume", sessionId);
    args.push(command);

    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let out = "";
    let err = "";
    const timer = setTimeout(() => { proc.kill(); resolve("That took too long."); }, 120000);

    proc.stdout.on("data", (c) => out += c);
    proc.stderr.on("data", (c) => err += c);

    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const json = JSON.parse(out.trim());
        if (json.session_id) {
          sessionId = json.session_id;
          try { fs.writeFileSync(SESSION_FILE, sessionId); } catch (_) {}
        }
        let text = json.result || "";
        if (Array.isArray(text)) text = text.filter(b => b.type === "text").map(b => b.text).join("\n");
        resolve(text || "Done.");
      } catch (_) {
        resolve(out.trim() || err.trim().slice(0, 200) || "Something went wrong.");
      }
    });

    proc.on("error", () => { clearTimeout(timer); resolve("Couldn't reach Claude."); });
  });
}

function reset() {
  sessionId = null;
  try { fs.unlinkSync(SESSION_FILE); } catch (_) {}
}

module.exports = { execute, reset, getSessionId: () => sessionId };
