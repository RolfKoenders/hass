#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const source = fs
  .readFileSync(path.join(__dirname, "..", "Connection.js"), "utf8")
  .replace(/^\.pragma library\s*$/m, "");
const names = [...source.matchAll(/^function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
const Connection = new Function(`${source}\nreturn {${names.join(",")}};`)();

let failures = 0;
let checks = 0;

function eq(label, actual, expected) {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;
    console.log(`  FAIL ${label}\n       got      ${JSON.stringify(actual)}` +
                `\n       expected ${JSON.stringify(expected)}`);
  }
}

console.log("connection identity and generation isolation");
eq("bare host assumes TLS and its effective port",
   Connection.normalizeOrigin("HomeAssistant.local"),
   "https://homeassistant.local:443");
eq("https default port is explicit",
   Connection.normalizeOrigin("https://HA.local/path/"),
   "https://ha.local:443");
eq("wss shares the secure HTTP credential origin",
   Connection.normalizeOrigin("wss://HA.local:8123/api/websocket"),
   "https://ha.local:8123");
eq("ws shares the plaintext HTTP credential origin",
   Connection.normalizeOrigin("ws://HA.local:8123"),
   "http://ha.local:8123");
eq("IPv6 is canonicalized without losing brackets",
   Connection.normalizeOrigin("https://[FD00::1]:8123"),
   "https://[fd00::1]:8123");
eq("a protocol-relative URL is understood",
   Connection.normalizeOrigin("//ha.local:8123"), "https://ha.local:8123");
// A stray bracket used to pass the host check and produce a plausible origin,
// which the bridge's urlsplit then refused by raising — killing the process
// for what is only a half-pasted URL. Both parsers must call this a non-host.
eq("a trailing bracket is not a host",
   Connection.normalizeOrigin("https://ha.local:8123]"), "");
eq("a markdown-wrapped URL is not a host",
   Connection.normalizeOrigin("[https://ha.local:8123]"), "");
eq("an unopened bracket is not a host",
   Connection.normalizeOrigin("https://a]b"), "");
eq("brackets around a name are not an IPv6 literal",
   Connection.normalizeOrigin("https://a[b]c"), "");
eq("a bracketed port is not an IPv6 literal",
   Connection.normalizeOrigin("https://[8123]"), "");
eq("userinfo is rejected", Connection.normalizeOrigin("https://u:p@ha.local"), "");
eq("bad ports are rejected", Connection.normalizeOrigin("https://ha.local:99999"), "");
eq("an empty explicit port is rejected", Connection.normalizeOrigin("https://ha.local:"), "");
eq("unknown schemes are rejected", Connection.normalizeOrigin("ftp://ha.local"), "");
eq("demo has a separate signature", Connection.signature(true, ""), "demo");
// The signature is what reconcileConnection compares to decide whether the
// running bridge is still the right one, so it has to pin the URL text and not
// just the credential origin.
eq("a live signature pins the origin and the URL it came from",
   Connection.signature(false, "  https://HA.local:8123/lovelace  "),
   "https://ha.local:8123|https://HA.local:8123/lovelace");
eq("same origin, different path is a different connection",
   Connection.signature(false, "https://ha.local:8123")
     === Connection.signature(false, "https://ha.local:8123/sub"),
   false);
eq("the same URL is the same connection",
   Connection.signature(false, "https://ha.local:8123")
     === Connection.signature(false, "https://ha.local:8123"),
   true);
eq("an unusable URL has no signature",
   Connection.signature(false, "ftp://ha.local"), "");
eq("a bracket typo has no signature",
   Connection.signature(false, "https://ha.local:8123]"), "");
// The local URL shares the primary URL's credential origin — it must never
// appear as, or affect, the credential scope — but it does have to change the
// signature so reconcileConnection restarts the bridge when it is edited.
eq("a blank local URL does not change the signature",
   Connection.signature(false, "https://ha.local:8123", ""),
   Connection.signature(false, "https://ha.local:8123"));
eq("a local URL is folded into the signature",
   Connection.signature(false, "https://ha.local:8123", "https://192.168.1.50:8123"),
   "https://ha.local:8123|https://ha.local:8123|https://192.168.1.50:8123");
eq("changing only the local URL changes the signature",
   Connection.signature(false, "https://ha.local:8123", "https://192.168.1.50:8123")
     === Connection.signature(false, "https://ha.local:8123", "https://192.168.1.51:8123"),
   false);
eq("a blank trusted network does not change the signature",
   Connection.signature(false, "https://ha.local:8123", "https://192.168.1.50:8123", ""),
   Connection.signature(false, "https://ha.local:8123", "https://192.168.1.50:8123"));
eq("the trusted network is folded into the signature",
   Connection.signature(false, "https://ha.local:8123", "https://192.168.1.50:8123", "Home"),
   "https://ha.local:8123|https://ha.local:8123|https://192.168.1.50:8123|Home");
eq("changing only the trusted network changes the signature",
   Connection.signature(false, "https://ha.local:8123", "https://192.168.1.50:8123", "Home")
     === Connection.signature(false, "https://ha.local:8123",
                              "https://192.168.1.50:8123", "Office"),
   false);
eq("a blank trusted network list is empty",
   Connection.trustedNetworkList(""), []);
eq("a single trusted network is a one-item list",
   Connection.trustedNetworkList("Home"), ["Home"]);
eq("comma-separated names are split and trimmed",
   Connection.trustedNetworkList(" Home , Home 5G ,Office "),
   ["Home", "Home 5G", "Office"]);
eq("only commas and whitespace is still empty",
   Connection.trustedNetworkList(" , , "), []);
eq("no active line means no detected ssid",
   Connection.parseNmcliActiveSsid("no:Neighbor\nno:CoffeeShop"), "");
eq("the active line's ssid is detected",
   Connection.parseNmcliActiveSsid("no:Neighbor\nyes:Home\nno:CoffeeShop"), "Home");
eq("an escaped colon in the ssid is unescaped",
   Connection.parseNmcliActiveSsid("yes:Office\\:5G"), "Office:5G");
eq("an escaped backslash in the ssid is unescaped",
   Connection.parseNmcliActiveSsid("yes:Back\\\\slash"), "Back\\slash");
eq("empty input has no detected ssid", Connection.parseNmcliActiveSsid(""), "");
eq("matching generation is accepted", Connection.acceptsGeneration(4, 4), true);
eq("old generation is rejected", Connection.acceptsGeneration(5, 4), false);
eq("missing generation is rejected", Connection.acceptsGeneration(5, undefined), false);
const reduced = Connection.reducePhase(
  { generation: 5, phase: "connecting", error: "", errorKind: "" },
  { ev: "phase", generation: 5, phase: "connected" }
);
eq("phase reducer accepts the active generation", reduced.accepted, true);
eq("phase reducer advances state", reduced.state.phase, "connected");
eq("phase reducer rejects unknown phases",
   Connection.reducePhase(
     { generation: 5, phase: "connected" },
     { ev: "phase", generation: 5, phase: "ready-ish" }
   ).accepted, false);

console.log();
if (failures) {
  console.log(`FAILED: ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`all ${checks} checks passed`);
