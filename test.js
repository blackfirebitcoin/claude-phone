const {
  extractCommand,
  containsWakeWord,
  findWakePhrase,
  WAKE_VARIANTS,
} = require("./listener");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label} — expected "${expected}", got "${actual}"`);
  }
}

// ── Wake Word Detection ───────────────────────────────────────────

console.log("\n=== Wake Word Detection ===\n");

assert(containsWakeWord("hey claude turn on the light"), "exact match");
assert(containsWakeWord("Hey Claude what time is it"), "case insensitive");
assert(containsWakeWord("hey cloud set a timer"), "common misrecognition: cloud");
assert(containsWakeWord("hey clod what's the weather"), "common misrecognition: clod");
assert(containsWakeWord("hey clawed open spotify"), "common misrecognition: clawed");
assert(containsWakeWord("ok claude help me"), "ok claude variant");
assert(containsWakeWord("okay claude read my texts"), "okay claude variant");
assert(containsWakeWord("hey clyde do something"), "misrecognition: clyde");
assert(!containsWakeWord("hello there"), "no wake word");
assert(!containsWakeWord(""), "empty string");
assert(!containsWakeWord(null), "null input");
assert(!containsWakeWord("hey what's up"), "partial match not enough");
assert(!containsWakeWord("the clouds are nice"), "cloud without hey");

// ── Command Extraction ────────────────────────────────────────────

console.log("\n=== Command Extraction ===\n");

assertEqual(
  extractCommand("hey claude turn on the flashlight"),
  "turn on the flashlight",
  "basic extraction"
);

assertEqual(
  extractCommand("Hey Claude, what time is it"),
  "what time is it",
  "strips comma after wake phrase"
);

assertEqual(
  extractCommand("hey cloud set a timer for 5 minutes"),
  "set a timer for 5 minutes",
  "extraction from misrecognition"
);

assertEqual(
  extractCommand("ok claude send a text"),
  "send a text",
  "extraction from ok claude"
);

assertEqual(
  extractCommand("hey claude"),
  null,
  "wake word only returns null"
);

assertEqual(
  extractCommand("hey claude   "),
  null,
  "wake word with trailing spaces returns null"
);

assertEqual(
  extractCommand("no wake word here"),
  null,
  "no wake word returns null"
);

assertEqual(
  extractCommand(null),
  null,
  "null returns null"
);

assertEqual(
  extractCommand("I said hey claude... turn it off"),
  "turn it off",
  "wake word mid-sentence"
);

// ── findWakePhrase details ────────────────────────────────────────

console.log("\n=== findWakePhrase ===\n");

let result = findWakePhrase("hey claude do it");
assert(result.index === 0, "index at start");
assertEqual(result.variant, "hey claude", "variant is exact");

result = findWakePhrase("um hey cloud do it");
assert(result.index > 0, "index mid-string");
assertEqual(result.variant, "hey cloud", "variant is cloud");

result = findWakePhrase("nothing here");
assert(result.index === -1, "no match returns -1");
assert(result.variant === null, "no match variant is null");

// ── Summary ───────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
