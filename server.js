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

  // Listen — STT via termux
  if (req.method === "POST" && req.url === "/api/listen") {
    const stt = spawn("termux-speech-to-text", [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let out = "";
    const timer = setTimeout(() => {
      stt.kill();
      res.writeHead(408, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ heard: null }));
    }, 30000);

    stt.stdout.on("data", (c) => out += c);
    stt.on("close", () => {
      clearTimeout(timer);
      let heard = out.trim();
      if (heard.startsWith('"') && heard.endsWith('"')) {
        try { heard = JSON.parse(heard); } catch (_) {}
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ heard: heard || null }));
    });
    stt.on("error", () => {
      clearTimeout(timer);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ heard: null }));
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
