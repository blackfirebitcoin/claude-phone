# Claude Phone

Voice-controlled Claude assistant for Android via Termux. Push-to-talk floating orb overlay that feeds into a persistent Claude Code session with full phone permissions.

## Architecture

```
┌──────────────┐   tap    ┌──────────────┐  HTTP   ┌──────────────┐
│  Android Orb │ ──────── │  Node Server │ ─────── │  Claude CLI  │
│  (overlay)   │ ◄─────── │  :3000       │ ◄────── │  (sonnet)    │
│  OrbService  │   TTS    │  server.js   │  JSON   │  -p --resume │
└──────────────┘          └──────────────┘         └──────────────┘
       │                        │                         │
       │                   STT: termux-                   │
       │                   speech-to-text            am start, etc
       │                                            (shell commands)
       ▼
  OrbView.java
  (animated canvas)
```

## How It Works

1. **User taps the floating orb** → OrbService POSTs to `/api/listen`
2. **Server runs `termux-speech-to-text`** → returns transcribed text
3. **Server POSTs transcription to `/api/ask`** → spawns `claude -p` CLI
4. **Claude executes actions** via shell (am start, termux-api, etc.) and returns spoken response
5. **OrbService speaks response** via Android TTS

## Key Files

- `server.js` — HTTP server on :3000. Three endpoints: `/api/listen` (STT), `/api/ask` (Claude), `/api/status`
- `executor.js` — Spawns `claude -p --resume SESSION --dangerously-skip-permissions`. Persists session ID in `.session`
- `system-prompt.txt` — Tells Claude what commands are available and how to respond (short, spoken English)
- `listener.js` — Wake word detection ("hey claude" + 25 STT misrecognition variants)
- `speaker.js` — TTS via `termux-tts-speak`, strips markdown before speaking
- `index.js` — Terminal mode (push-to-talk or always-on). Alternative to the Android orb
- `start.sh` — One-shot launcher: starts server, waits for ready, launches orb app
- `android/` — Native Android overlay app (OrbService + OrbView + MainActivity)
- `web/` — Browser-based interface at localhost:3000

## Session Persistence

- `.session` file stores the Claude session ID
- `--resume SESSION_ID` reattaches to the same conversation across restarts
- Session survives server restarts — only `executor.reset()` clears it
- `.history.json` logs user/claude message pairs with timestamps

## App Execution (CURRENT BUG)

Claude can run any shell command via its tool use. For opening apps:
- `am start -a android.intent.action.VIEW -d "google.navigation:q=DESTINATION"` — Google Maps routing
- `am start -a android.intent.action.VIEW -d "geo:0,0?q=SEARCH"` — Maps search
- `termux-open "https://..."` — Open URLs

**Known issue:** Claude claims to execute `am start` commands but they may not actually fire from within the Claude CLI subprocess. The `am start` command works fine when run directly from Termux. Investigating whether this is:
1. Claude not actually running the command (just generating text saying it did)
2. The subprocess environment missing something needed for `am start`
3. `--output-format json` suppressing tool execution somehow

**Debug approach:** Need to see the actual tool calls Claude makes. The JSON output only shows `num_turns` (confirms tools were used) but not which commands ran or their exit codes.

## Running

```bash
# Start everything (server + app)
bash ~/claude-phone/start.sh

# Or manually:
cd ~/claude-phone
node server.js &          # start server
am start -n com.claude.phone/.MainActivity  # launch orb

# Terminal mode (no Android app needed):
node index.js --mode push-to-talk
node index.js --mode always-on
```

## Building the APK

```bash
cd ~/claude-phone/android
bash build.sh
# Install from /storage/emulated/0/Download/claude-orb.apk
```

Requires Termux packages: `aapt2`, `ecj`, `dx`, `zipalign`, `apksigner`

## Orb States

| State     | Color  | Animation              |
|-----------|--------|------------------------|
| IDLE      | Stone  | Gentle pulse           |
| LISTENING | Amber  | Rapid expansion + rings|
| THINKING  | Bronze | Slow rotation + arcs   |
| SPEAKING  | Gold   | Sound wave ripples     |

## Changes Log

### 2026-04-08 — Bugfix + Prompt Engineering
- **Fixed:** `executor.js` stdin pipe was never closed, causing 3s "no stdin data" delay on every request. Changed to `stdio: ["ignore", ...]`
- **Fixed:** System prompt now has concrete `am start` URI patterns instead of vague `am start -n <package/activity>`. Claude was guessing activity class names
- **Added:** `start.sh` — single script to boot server + orb app
- **Active bug:** App execution (am start) may not be firing from within Claude's subprocess
