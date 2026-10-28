#!/usr/bin/env node
// Progress tracker for the centralized-Claude-monitoring work.
//
// Why this exists: the work spans several plans across many sessions, and a
// session that loses context must be able to ask "where was I?" and get an
// answer from disk rather than from a summary that may have drifted.
//
// State lives in tools/monitoring-tracker/progress.sqlite (gitignored).
// Plans are the source of truth for *what* the tasks are; this tracks *status*
// and the notes/decisions that would otherwise only exist in a transcript.
//
// Usage:
//   node tools/monitoring-tracker/tracker.mjs init
//   node tools/monitoring-tracker/tracker.mjs import <plan.md>
//   node tools/monitoring-tracker/tracker.mjs status
//   node tools/monitoring-tracker/tracker.mjs next
//   node tools/monitoring-tracker/tracker.mjs start <taskRef>
//   node tools/monitoring-tracker/tracker.mjs done <taskRef> [--commit <sha>]
//   node tools/monitoring-tracker/tracker.mjs block <taskRef> "<why>"
//   node tools/monitoring-tracker/tracker.mjs note <taskRef> "<text>"
//   node tools/monitoring-tracker/tracker.mjs decide "<what>" "<why>"
//   node tools/monitoring-tracker/tracker.mjs recall
//
// taskRef is "<planSlug>/<taskNo>" (e.g. "01-schema/3") or just "<taskNo>"
// when only one plan is active.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const HERE = import.meta.dirname;
const DB_PATH = path.join(HERE, "progress.sqlite");
const REPO = path.resolve(HERE, "..", "..");

const STATUSES = ["todo", "doing", "done", "blocked"];

function open() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      slug      TEXT PRIMARY KEY,
      title     TEXT NOT NULL,
      file      TEXT NOT NULL,
      seq       INTEGER NOT NULL,
      importedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      planSlug  TEXT NOT NULL,
      taskNo    INTEGER NOT NULL,
      title     TEXT NOT NULL,
      status    TEXT NOT NULL DEFAULT 'todo',
      commitSha TEXT,
      blockedWhy TEXT,
      startedAt TEXT,
      doneAt    TEXT,
      UNIQUE (planSlug, taskNo)
    );
    CREATE TABLE IF NOT EXISTS notes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      at        TEXT NOT NULL,
      planSlug  TEXT,
      taskNo    INTEGER,
      kind      TEXT NOT NULL,   -- 'note' | 'decision'
      text      TEXT NOT NULL,
      why       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_notes_at ON notes(at DESC);
  `);
  return db;
}

const now = () => new Date().toISOString();

function resolveRef(db, ref) {
  if (!ref) die("need a task ref, e.g. 01-schema/3");
  let planSlug, taskNo;
  if (ref.includes("/")) {
    [planSlug, taskNo] = ref.split("/");
    taskNo = Number(taskNo);
  } else {
    taskNo = Number(ref);
    const open = db.prepare(
      `SELECT DISTINCT planSlug FROM tasks WHERE status IN ('todo','doing','blocked')
       ORDER BY planSlug LIMIT 2`
    ).all();
    if (open.length !== 1) die(`ambiguous task "${ref}" — use <planSlug>/<taskNo>`);
    planSlug = open[0].planSlug;
  }
  const row = db.prepare(`SELECT * FROM tasks WHERE planSlug=? AND taskNo=?`).get(planSlug, taskNo);
  if (!row) die(`no such task: ${planSlug}/${taskNo}`);
  return row;
}

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

// ---- commands -------------------------------------------------------------

function cmdInit() {
  open().close();
  console.log(`tracker ready: ${path.relative(REPO, DB_PATH)}`);
}

// Parses "### Task N: Title" headings and the plan's "# ... Plan" title.
function cmdImport(file) {
  if (!file) die("usage: import <plan.md>");
  const abs = path.isAbsolute(file) ? file : path.join(REPO, file);
  if (!fs.existsSync(abs)) die(`not found: ${abs}`);
  const src = fs.readFileSync(abs, "utf8");

  const base = path.basename(abs, ".md");
  // 2026-10-28-01-schema.md -> 01-schema
  const slug = base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const seqMatch = slug.match(/^(\d+)/);
  const seq = seqMatch ? Number(seqMatch[1]) : 999;
  const title = (src.match(/^#\s+(.+)$/m) || [, slug])[1].trim();

  const tasks = [...src.matchAll(/^###\s+Task\s+(\d+)\s*:\s*(.+)$/gm)]
    .map((m) => ({ no: Number(m[1]), title: m[2].trim() }));
  if (!tasks.length) die("no '### Task N: ...' headings found");

  const db = open();
  db.prepare(
    `INSERT INTO plans (slug,title,file,seq,importedAt) VALUES (?,?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET title=excluded.title, file=excluded.file,
       seq=excluded.seq, importedAt=excluded.importedAt`
  ).run(slug, title, path.relative(REPO, abs).replace(/\\/g, "/"), seq, now());

  const ins = db.prepare(
    `INSERT INTO tasks (planSlug,taskNo,title) VALUES (?,?,?)
     ON CONFLICT(planSlug,taskNo) DO UPDATE SET title=excluded.title`
  );
  for (const t of tasks) ins.run(slug, t.no, t.title);

  console.log(`imported ${tasks.length} task(s) from ${slug}:`);
  for (const t of tasks) console.log(`  ${slug}/${t.no}  ${t.title}`);
  db.close();
}

function cmdStatus() {
  const db = open();
  const plans = db.prepare(`SELECT * FROM plans ORDER BY seq, slug`).all();
  if (!plans.length) { console.log("nothing imported yet — run: import <plan.md>"); db.close(); return; }

  const mark = { todo: "[ ]", doing: "[~]", done: "[x]", blocked: "[!]" };
  let totalDone = 0, total = 0;

  for (const p of plans) {
    const rows = db.prepare(`SELECT * FROM tasks WHERE planSlug=? ORDER BY taskNo`).all(p.slug);
    const d = rows.filter((r) => r.status === "done").length;
    totalDone += d; total += rows.length;
    console.log(`\n${p.slug} — ${p.title}  (${d}/${rows.length})`);
    console.log(`  ${p.file}`);
    for (const r of rows) {
      let line = `  ${mark[r.status] || "[ ]"} ${p.slug}/${r.taskNo}  ${r.title}`;
      if (r.status === "done" && r.commitSha) line += `  (${r.commitSha.slice(0, 8)})`;
      if (r.status === "blocked") line += `  — BLOCKED: ${r.blockedWhy}`;
      console.log(line);
    }
  }
  console.log(`\noverall: ${totalDone}/${total} task(s) done`);
  db.close();
}

function cmdNext() {
  const db = open();
  const blocked = db.prepare(
    `SELECT t.*, p.seq FROM tasks t JOIN plans p ON p.slug=t.planSlug
     WHERE t.status='blocked' ORDER BY p.seq, t.taskNo`
  ).all();
  if (blocked.length) {
    console.log("BLOCKED — resolve before continuing:");
    for (const b of blocked) console.log(`  ${b.planSlug}/${b.taskNo}  ${b.title}\n    ${b.blockedWhy}`);
    console.log();
  }
  const doing = db.prepare(
    `SELECT t.* FROM tasks t JOIN plans p ON p.slug=t.planSlug
     WHERE t.status='doing' ORDER BY p.seq, t.taskNo`
  ).all();
  if (doing.length) {
    console.log("IN PROGRESS:");
    for (const d of doing) console.log(`  ${d.planSlug}/${d.taskNo}  ${d.title}  (started ${d.startedAt})`);
    db.close(); return;
  }
  const nxt = db.prepare(
    `SELECT t.*, p.file, p.title ptitle FROM tasks t JOIN plans p ON p.slug=t.planSlug
     WHERE t.status='todo' ORDER BY p.seq, t.taskNo LIMIT 1`
  ).get();
  if (!nxt) { console.log("all tasks done."); db.close(); return; }
  console.log(`NEXT: ${nxt.planSlug}/${nxt.taskNo}  ${nxt.title}`);
  console.log(`  plan: ${nxt.file}`);
  console.log(`  start it: node tools/monitoring-tracker/tracker.mjs start ${nxt.planSlug}/${nxt.taskNo}`);
  db.close();
}

function cmdSet(ref, status, opts = {}) {
  const db = open();
  const t = resolveRef(db, ref);
  const fields = { status };
  if (status === "doing") fields.startedAt = now();
  if (status === "done") { fields.doneAt = now(); fields.blockedWhy = null; }
  if (status === "blocked") fields.blockedWhy = opts.why || "(no reason given)";
  if (opts.commit) fields.commitSha = opts.commit;

  const sets = Object.keys(fields).map((k) => `${k}=?`).join(", ");
  db.prepare(`UPDATE tasks SET ${sets} WHERE planSlug=? AND taskNo=?`)
    .run(...Object.values(fields), t.planSlug, t.taskNo);

  console.log(`${t.planSlug}/${t.taskNo} -> ${status}${opts.why ? `: ${opts.why}` : ""}`);
  db.close();
}

function cmdNote(ref, text) {
  if (!text) die(`usage: note <taskRef> "<text>"`);
  const db = open();
  const t = resolveRef(db, ref);
  db.prepare(`INSERT INTO notes (at,planSlug,taskNo,kind,text) VALUES (?,?,?,'note',?)`)
    .run(now(), t.planSlug, t.taskNo, text);
  console.log(`noted on ${t.planSlug}/${t.taskNo}`);
  db.close();
}

function cmdDecide(what, why) {
  if (!what || !why) die(`usage: decide "<what>" "<why>"`);
  const db = open();
  db.prepare(`INSERT INTO notes (at,kind,text,why) VALUES (?,'decision',?,?)`).run(now(), what, why);
  console.log("decision recorded");
  db.close();
}

// The one a context-less session runs first.
function cmdRecall() {
  const db = open();
  console.log("=== WHERE WE ARE ===\n");

  const counts = db.prepare(
    `SELECT status, COUNT(*) n FROM tasks GROUP BY status`
  ).all().reduce((a, r) => ({ ...a, [r.status]: r.n }), {});
  console.log(`tasks: ${counts.done || 0} done, ${counts.doing || 0} doing, ${counts.todo || 0} todo, ${counts.blocked || 0} blocked\n`);

  const spec = "docs/superpowers/specs/2026-10-28-centralized-claude-monitoring-design.md";
  console.log(`spec: ${spec}`);
  const plans = db.prepare(`SELECT slug,file,title FROM plans ORDER BY seq`).all();
  for (const p of plans) console.log(`plan: ${p.file}`);

  console.log("\n--- decisions ---");
  const ds = db.prepare(`SELECT * FROM notes WHERE kind='decision' ORDER BY at`).all();
  if (!ds.length) console.log("  (none)");
  for (const d of ds) console.log(`  ${d.at.slice(0, 16)}  ${d.text}\n      why: ${d.why}`);

  console.log("\n--- recent notes ---");
  const ns = db.prepare(`SELECT * FROM notes WHERE kind='note' ORDER BY at DESC LIMIT 12`).all();
  if (!ns.length) console.log("  (none)");
  for (const n of ns) console.log(`  ${n.at.slice(0, 16)}  [${n.planSlug}/${n.taskNo}] ${n.text}`);

  console.log();
  db.close();
  cmdNext();
}

// ---- dispatch -------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);
const flagIdx = rest.indexOf("--commit");
const commit = flagIdx >= 0 ? rest[flagIdx + 1] : null;
const args = flagIdx >= 0 ? rest.slice(0, flagIdx) : rest;

switch (cmd) {
  case "init":   cmdInit(); break;
  case "import": cmdImport(args[0]); break;
  case "status": cmdStatus(); break;
  case "next":   cmdNext(); break;
  case "start":  cmdSet(args[0], "doing"); break;
  case "done":   cmdSet(args[0], "done", { commit }); break;
  case "block":  cmdSet(args[0], "blocked", { why: args[1] }); break;
  case "note":   cmdNote(args[0], args[1]); break;
  case "decide": cmdDecide(args[0], args[1]); break;
  case "recall": cmdRecall(); break;
  default:
    console.log(`commands: init | import <plan.md> | status | next | start <ref> | done <ref> [--commit <sha>]
          block <ref> "<why>" | note <ref> "<text>" | decide "<what>" "<why>" | recall`);
}
