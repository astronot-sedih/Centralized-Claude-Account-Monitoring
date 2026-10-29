// Probes the claude.ai internal analytics endpoints and writes the RAW shapes
// to disk, so the UI is built from what the API actually returns rather than
// from the Enterprise docs, whose schema may differ.
//
// Never prints the session cookie. Only status codes, sizes and key names.
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

const ORG = env.CLAUDE_WEB_ORG_ID;
const RAW = env.CLAUDE_WEB_SESSION_KEY || "";
// Accept either a bare sessionKey or a whole pasted Cookie header.
const cookie = RAW.includes("=") ? RAW : `sessionKey=${RAW}`;

const PATHS = process.argv.slice(2);
const outDir = "tools/claude-web/out";
fs.mkdirSync(outDir, { recursive: true });

for (const p of PATHS) {
  const url = p.startsWith("http") ? p : `https://claude.ai/api/organizations/${ORG}${p}`;
  try {
    const res = await fetch(url, {
      headers: {
        cookie,
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        referer: "https://claude.ai/analytics/overview",
      },
    });
    const text = await res.text();
    const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
    fs.writeFileSync(path.join(outDir, `${name}.json`), text);
    let shape = "";
    try {
      const j = JSON.parse(text);
      shape = Array.isArray(j)
        ? `array[${j.length}] keys=${Object.keys(j[0] || {}).join(",")}`
        : `object keys=${Object.keys(j).join(",")}`;
    } catch { shape = text.slice(0, 120).replace(/\s+/g, " "); }
    console.log(`${res.status} ${p}  (${text.length}b)  ${shape}`);
  } catch (e) {
    console.log(`ERR  ${p}  ${e.message}`);
  }
}
