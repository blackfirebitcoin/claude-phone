const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { execute, reset, getSessionId } = require("./executor");

const PORT = 3000;
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Listen — STT via termux with custom silence detection
  if (req.method === "POST" && req.url === "/api/listen") {
    const stt = spawn("termux-speech-to-text", [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let lastChunk = "";
    let lastChunkTime = Date.now();
    let silenceTimer = null;
    let responded = false;
    const SILENCE_MS = 2500; // wait 2.5s of no new output before finishing

    const finish = () => {
      if (responded) return;
      responded = true;
      clearTimeout(overallTimer);
      clearTimeout(silenceTimer);
      stt.kill();

      let heard = lastChunk.trim();
      // termux-speech-to-text outputs partial results as lines
      // take the last non-empty line as the final result
      const lines = heard.split("\n").filter(l => l.trim());
      heard = lines.length ? lines[lines.length - 1].trim() : "";

      if (heard.startsWith('"') && heard.endsWith('"')) {
        try { heard = JSON.parse(heard); } catch (_) {}
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ heard: heard || null }));
    };

    const overallTimer = setTimeout(() => {
      finish();
    }, 30000);

    stt.stdout.on("data", (c) => {
      lastChunk += c.toString();
      lastChunkTime = Date.now();

      // Reset silence timer every time we get new output
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(finish, SILENCE_MS);
    });

    stt.on("close", finish);
    stt.on("error", () => {
      if (!responded) {
        responded = true;
        clearTimeout(overallTimer);
        clearTimeout(silenceTimer);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ heard: null }));
      }
    });
    return;
  }

  // Ask Claude
  if (req.method === "POST" && req.url === "/api/ask") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", async () => {
      try {
        const { command } = JSON.parse(body);
        const response = await execute((command || "").trim());
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ response }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Launch intent — server-side am start (bypasses background activity restriction)
  if (req.method === "POST" && req.url === "/api/launch") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      try {
        const { uri } = JSON.parse(body);
        if (!uri) { res.writeHead(400); res.end("missing uri"); return; }
        const proc = spawn("am", ["start", "-a", "android.intent.action.VIEW", "-d", uri], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        proc.stdout.on("data", (c) => out += c);
        proc.on("close", (code) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: code === 0, output: out.trim() }));
        });
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Status
  if (req.method === "GET" && req.url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, session: getSessionId() }));
    return;
  }

  // Static files
  let filePath = path.join(__dirname, "web", req.url === "/" ? "/index.html" : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Claude Phone · http://localhost:${PORT}`);
});
