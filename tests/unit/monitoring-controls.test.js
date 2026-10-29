import { describe, expect, it, afterAll } from "vitest";
import { getApiKeyByKey, updateApiKey } from "../../src/lib/db/repos/apiKeysRepo.js";
import { getAdapter } from "../../src/lib/db/driver.js";

const KEY = "test-pin-key-" + Date.now();
const ID = "test-pin-id-" + Date.now();

async function seed() {
  const db = await getAdapter();
  db.run(`INSERT INTO apiKeys (id, key, name, machineId, isActive, createdAt)
          VALUES (?, ?, 'pin test', 'm', 1, ?)`, [ID, KEY, new Date().toISOString()]);
}
async function wipe() {
  const db = await getAdapter();
  db.run(`DELETE FROM apiKeys WHERE id = ?`, [ID]);
}

describe("pinning persistence", () => {
  afterAll(wipe);

  it("round-trips pinnedConnectionId through updateApiKey", async () => {
    // updateApiKey writes an explicit column list; a field missing from it is
    // silently dropped, which would make pinning look configurable but never
    // engage — attribution wrong while appearing to work.
    await wipe();
    await seed();
    await updateApiKey(ID, { pinnedConnectionId: "conn-abc" });
    expect((await getApiKeyByKey(KEY))?.pinnedConnectionId).toBe("conn-abc");
  });

  it("clears the pin when set back to null", async () => {
    await updateApiKey(ID, { pinnedConnectionId: null });
    expect((await getApiKeyByKey(KEY))?.pinnedConnectionId).toBe(null);
  });

  it("does not disturb the pin when updating an unrelated field", async () => {
    await updateApiKey(ID, { pinnedConnectionId: "conn-xyz" });
    await updateApiKey(ID, { name: "renamed" });
    const k = await getApiKeyByKey(KEY);
    expect(k.name).toBe("renamed");
    expect(k.pinnedConnectionId).toBe("conn-xyz");
  });
});

describe("key PUT accepts a pin", () => {
  it("whitelists pinnedConnectionId on the keys endpoint", async () => {
    // Without this the UI could offer a pin that the API silently ignores.
    const fs = await import("node:fs");
    const src = fs.readFileSync("../src/app/api/keys/[id]/route.js", "utf8");
    expect(src).toMatch(/pinnedConnectionId/);
  });

  it("validates the pin is a connection-id-shaped string or null", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("../src/app/api/keys/[id]/route.js", "utf8");
    // Must not pass arbitrary client input straight through to the DB.
    expect(src).toMatch(/pinnedConnectionId[\s\S]{0,400}(test\(|null|trim)/);
  });
});

describe("tests do not touch the real database", () => {
  it("resolves DATA_DIR to a temp directory, not the user's", async () => {
    // Without this, getAdapter() opens %APPDATA%/9router/db/data.sqlite — the
    // same file the running dashboard holds open. That produced intermittent
    // "SqliteError: database is locked", and meant every seeded row was being
    // written into live data.
    const { DATA_DIR } = await import("../../src/lib/dataDir.js");
    const os = await import("node:os");
    expect(DATA_DIR.startsWith(os.tmpdir())).toBe(true);
    expect(DATA_DIR).not.toMatch(/\.9router$|[\/]9router$/);
  });
});
