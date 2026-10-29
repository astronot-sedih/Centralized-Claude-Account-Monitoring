import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  listProfiles, createProfile, renameProfile, deleteProfile,
  assignConnectionProfile, getConnectionProfileMap,
} from "../../src/lib/db/repos/profilesRepo.js";
import { getAdapter } from "../../src/lib/db/driver.js";

const PREFIX = "test-profile-";

async function wipe() {
  const db = await getAdapter();
  db.run(`DELETE FROM profiles WHERE name LIKE ?`, [`${PREFIX}%`]);
  // These tests reference connection ids that do not exist, so their
  // assignments land in kv. Clear them too or they outlive the run and show
  // up in the live API.
  db.run(`DELETE FROM kv WHERE scope = 'profileAssign' AND key LIKE 'conn-%-test'`);
}

describe("profilesRepo", () => {
  beforeAll(wipe);
  afterAll(wipe);

  it("creates a profile and lists it", async () => {
    const p = await createProfile({ name: `${PREFIX}Rafli` });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe(`${PREFIX}Rafli`);
    const all = await listProfiles();
    expect(all.map((x) => x.name)).toContain(`${PREFIX}Rafli`);
  });

  it("rejects a blank name rather than creating an unnameable row", async () => {
    await expect(createProfile({ name: "   " })).rejects.toThrow(/name/i);
  });

  it("rejects a duplicate name, case-insensitively", async () => {
    // Two profiles called "Rafli" and "rafli" would be indistinguishable in a
    // filter dropdown.
    await createProfile({ name: `${PREFIX}Dimas` });
    await expect(createProfile({ name: `${PREFIX}dimas` })).rejects.toThrow(/exists/i);
  });

  it("renames a profile without changing which connections point at it", async () => {
    const p = await createProfile({ name: `${PREFIX}Before` });
    await assignConnectionProfile("conn-rename-test", p.id);
    await renameProfile(p.id, `${PREFIX}After`);
    const map = await getConnectionProfileMap();
    expect(map["conn-rename-test"]).toBe(p.id);
    const all = await listProfiles();
    expect(all.find((x) => x.id === p.id).name).toBe(`${PREFIX}After`);
  });

  it("assigns and clears a connection's profile", async () => {
    const p = await createProfile({ name: `${PREFIX}Yoga` });
    await assignConnectionProfile("conn-assign-test", p.id);
    expect((await getConnectionProfileMap())["conn-assign-test"]).toBe(p.id);
    await assignConnectionProfile("conn-assign-test", null);
    expect((await getConnectionProfileMap())["conn-assign-test"]).toBeUndefined();
  });

  it("unassigns connections when a profile is deleted, rather than orphaning them", async () => {
    // A connection pointing at a profile id that no longer exists would vanish
    // from every filter, including "no profile".
    const p = await createProfile({ name: `${PREFIX}Gone` });
    await assignConnectionProfile("conn-delete-test", p.id);
    await deleteProfile(p.id);
    expect((await getConnectionProfileMap())["conn-delete-test"]).toBeUndefined();
    expect((await listProfiles()).find((x) => x.id === p.id)).toBeUndefined();
  });
});
