// Point every test at its OWN database, before anything imports the db layer.
//
// Without this, a test that calls getAdapter() with no DATA_DIR resolves to
// the real one (%APPDATA%/9router/db/data.sqlite) — the same file the running
// dashboard holds open. Two consequences, both real and both observed:
//
//   1. "SqliteError: database is locked", intermittently, whenever a test run
//      overlapped a live server or another test file. It looked like a flaky
//      test; it was two processes writing one file.
//   2. Tests INSERT and DELETE rows in live data. monitoring-controls.test.js
//      seeds an apiKeys row and removes it again, so the damage happened to
//      be self-cleaning — but a failed run leaves it behind, and nothing made
//      that a rule.
//
// Each test FILE gets its own directory: vitest runs files in separate
// workers, so a shared one would reintroduce the lock between them.
//
// A test that wants a specific database still overrides process.env.DATA_DIR
// itself (key-access-migration.test.js does, to write a legacy schema); this
// only supplies the default that was previously the user's real data.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-test-"));
process.env.DATA_DIR = dir;

afterAll(() => {
  // Close the handle first: on Windows an open sqlite file cannot be removed,
  // and a failed cleanup would pile temp databases up across runs.
  try { globalThis._dbAdapter?.instance?.close?.(); } catch { /* already closed */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});
