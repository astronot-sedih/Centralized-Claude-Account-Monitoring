// Pulls every JS chunk the analytics page loads and extracts the /api/ paths
// it references, so the endpoint list comes from the app itself rather than
// from guessing. Writes nothing but path strings.
import fs from "node:fs";
const html = fs.readFileSync("tools/claude-web/out/https_claude_ai_analytics_overview.json", "utf8");
const urls = [...new Set(html.match(/https:\/\/assets-proxy[^"]*\.js/g) || [])];
const found = new Set();
let done = 0;
await Promise.all(urls.map(async (u) => {
  try {
    const t = await (await fetch(u)).text();
    for (const m of t.match(/["'`]\/api\/[a-zA-Z_0-9/{}$.:-]{3,80}/g) || []) found.add(m.slice(1));
    for (const m of t.match(/metrics_aggs\/[a-z_0-9]+/g) || []) found.add("…/" + m);
  } catch {}
  done++;
}));
console.log(`scanned ${done}/${urls.length} chunks`);
for (const p of [...found].sort()) console.log(p);
