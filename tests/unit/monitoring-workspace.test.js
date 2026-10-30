import { describe, expect, it } from "vitest";
import {
  qualifyComboName, displayComboName, comboBelongsToProfile, PROFILE_SEP,
} from "../../src/lib/monitoring/workspace.js";

describe("combo names are namespaced by profile", () => {
  // Routing resolves a combo by NAME ALONE (src/sse/services/model.js:71) with
  // no profile context. Two combos called "main" would make that lookup
  // ambiguous — a request could silently use another person's accounts. So
  // the stored name carries the profile; the UI shows the bare one.

  it("stores a profile-qualified name", () => {
    expect(qualifyComboName("main", { id: "p1", name: "Rafli" })).toBe(`rafli${PROFILE_SEP}main`);
  });

  it("leaves a name unqualified when there is no profile", () => {
    expect(qualifyComboName("main", null)).toBe("main");
    expect(qualifyComboName("main", undefined)).toBe("main");
  });

  it("does not double-qualify a name that already carries its prefix", () => {
    const p = { id: "p1", name: "Rafli" };
    const once = qualifyComboName("main", p);
    expect(qualifyComboName(once, p)).toBe(once);
  });

  it("shows the bare name back to the user", () => {
    expect(displayComboName(`rafli${PROFILE_SEP}main`)).toBe("main");
    expect(displayComboName("main")).toBe("main");
  });

  it("keeps a separator that appears inside the bare name", () => {
    // Only the FIRST separator is the namespace boundary.
    expect(displayComboName(`rafli${PROFILE_SEP}a${PROFILE_SEP}b`)).toBe(`a${PROFILE_SEP}b`);
  });

  it("matches a combo to its profile by the stored prefix", () => {
    const p = { id: "p1", name: "Rafli" };
    expect(comboBelongsToProfile({ name: `rafli${PROFILE_SEP}main` }, p)).toBe(true);
    expect(comboBelongsToProfile({ name: `dimas${PROFILE_SEP}main` }, p)).toBe(false);
  });

  it("treats an unprefixed combo as belonging to every profile", () => {
    // Combos that existed before profiles must not vanish from the UI.
    const p = { id: "p1", name: "Rafli" };
    expect(comboBelongsToProfile({ name: "legacy-combo" }, p)).toBe(true);
    expect(comboBelongsToProfile({ name: "legacy-combo" }, null)).toBe(true);
  });

  it("is case-insensitive on the profile part", () => {
    expect(comboBelongsToProfile({ name: `RAFLI${PROFILE_SEP}main` }, { id: "p1", name: "rafli" })).toBe(true);
  });
});

describe("an API key's profile is inherited, never stored", () => {
  // A key already carries pinnedConnectionId, which is what attributes usage
  // to a person. A second, independent profile field could disagree with it,
  // and then the report and the workspace would name different people for
  // the same traffic.
  const connProfiles = { "conn-rafli": "p1", "conn-dimas": "p2" };

  it("takes the profile of the connection it pins", async () => {
    const { apiKeyProfileId } = await import("../../src/lib/monitoring/workspace.js");
    expect(apiKeyProfileId({ pinnedConnectionId: "conn-rafli" }, connProfiles)).toBe("p1");
    expect(apiKeyProfileId({ pinnedConnectionId: "conn-dimas" }, connProfiles)).toBe("p2");
  });

  it("has no profile when unpinned, so it shows in every workspace", async () => {
    const { apiKeyProfileId } = await import("../../src/lib/monitoring/workspace.js");
    expect(apiKeyProfileId({ pinnedConnectionId: null }, connProfiles)).toBe(null);
    expect(apiKeyProfileId({}, connProfiles)).toBe(null);
  });

  it("has no profile when pinned to a connection nobody owns", async () => {
    const { apiKeyProfileId } = await import("../../src/lib/monitoring/workspace.js");
    expect(apiKeyProfileId({ pinnedConnectionId: "conn-orphan" }, connProfiles)).toBe(null);
  });
});

describe("scopeToProfile", () => {
  const items = [
    { id: 1, owner: "p1" },
    { id: 2, owner: "p2" },
    { id: 3, owner: null },
  ];
  const ownerOf = (x) => x.owner;

  it("returns everything with no filter", async () => {
    const { scopeToProfile } = await import("../../src/lib/monitoring/workspace.js");
    expect(scopeToProfile(items, ownerOf, "")).toBe(items);
  });

  it("keeps the profile's own items AND the unowned ones", async () => {
    // Hiding unowned items would make pre-existing configuration look deleted
    // the moment someone creates their first profile.
    const { scopeToProfile } = await import("../../src/lib/monitoring/workspace.js");
    expect(scopeToProfile(items, ownerOf, "p1").map((x) => x.id)).toEqual([1, 3]);
    expect(scopeToProfile(items, ownerOf, "p2").map((x) => x.id)).toEqual([2, 3]);
  });
});

describe("monitoring stays global", () => {
  const read = (p) => require("node:fs").readFileSync(p, "utf8");

  it("the collector does not filter by profile", () => {
    // The daily report is the case for the WHOLE team. Scoping it to a
    // workspace would quietly understate it — the opposite of its purpose.
    const src = read("../src/lib/monitoring/quotaCollector.js");
    expect(src).not.toMatch(/profileId|activeProfile|scopeToProfile/);
  });

  it("the report builder does not filter by profile", () => {
    expect(read("../src/lib/monitoring/report/buildReport.js"))
      .not.toMatch(/profileId|activeProfile|scopeToProfile/);
  });

  it("the monitoring page does not read the workspace switcher", () => {
    expect(read("../src/app/(dashboard)/dashboard/monitoring/page.js"))
      .not.toMatch(/useProfileStore|activeProfileId/);
  });

  it("the report assembler only NAMES workspaces, never filters by them", () => {
    // tickDeps reads the profile map for the report's Profil column. That is
    // a label: the moment it narrowed the snapshot set, the report would
    // understate the team and the upgrade case built on it.
    const src = read("../src/lib/monitoring/tickDeps.js");
    expect(src).toMatch(/profileNames/);
    expect(src).not.toMatch(/scopeToProfile|activeProfile/);
    // No snapshot/usage collection filtered by a profile.
    expect(src).not.toMatch(/getSnapshotsForDate\([^)]*profile/i);
    expect(src).not.toMatch(/getUsageHistory\([^)]*profileId/i);
  });

  it("the report API does not take a profile parameter", () => {
    expect(read("../src/app/api/monitoring/report/route.js"))
      .not.toMatch(/profileId|activeProfile/);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 7 }, (_, i) => i + 1);

  it("slices the requested page", async () => {
    const { paginate } = await import("../../src/lib/monitoring/workspace.js");
    expect(paginate(items, 1, 3)).toEqual({ items: [1, 2, 3], page: 1, pageCount: 3 });
    expect(paginate(items, 3, 3)).toEqual({ items: [7], page: 3, pageCount: 3 });
  });

  it("clamps a page past the end instead of showing nothing", async () => {
    // Deleting the last workspace on the last page must not leave an empty
    // grid that reads as "my workspaces are gone".
    const { paginate } = await import("../../src/lib/monitoring/workspace.js");
    expect(paginate(items, 99, 3).page).toBe(3);
    expect(paginate(items, 0, 3).page).toBe(1);
  });

  it("reports one page for an empty list", async () => {
    const { paginate } = await import("../../src/lib/monitoring/workspace.js");
    expect(paginate([], 1, 6)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});

describe("API keys are scoped by the connection they are pinned to", () => {
  // connectionId -> profileId, as /api/profiles returns it.
  const assignments = { "conn-rafli": "p-rafli", "conn-dimas": "p-dimas" };
  const keys = [
    { id: "k1", name: "rafli key", pinnedConnectionId: "conn-rafli" },
    { id: "k2", name: "dimas key", pinnedConnectionId: "conn-dimas" },
    { id: "k3", name: "shared key", pinnedConnectionId: null },
  ];

  const ownerOf = async () => {
    const { apiKeyProfileId } = await import("../../src/lib/monitoring/workspace.js");
    return (k) => apiKeyProfileId(k, assignments);
  };

  it("shows a workspace its own keys plus the unpinned ones", async () => {
    // An unpinned key can land on ANY account, so it is every workspace's
    // business; hiding it would make it look deleted while it is still live.
    const { scopeToProfile } = await import("../../src/lib/monitoring/workspace.js");
    const ids = scopeToProfile(keys, await ownerOf(), "p-rafli").map((k) => k.id);
    expect(ids).toEqual(["k1", "k3"]);
  });

  it("hides a key pinned to another workspace's account", async () => {
    const { scopeToProfile } = await import("../../src/lib/monitoring/workspace.js");
    const ids = scopeToProfile(keys, await ownerOf(), "p-dimas").map((k) => k.id);
    expect(ids).not.toContain("k1");
  });

  it("shows every key when no workspace is selected", async () => {
    const { scopeToProfile } = await import("../../src/lib/monitoring/workspace.js");
    expect(scopeToProfile(keys, await ownerOf(), "")).toHaveLength(3);
  });

  it("treats a key pinned to an unclaimed connection as unowned", async () => {
    // The connection exists but nobody has claimed it, so the key cannot be
    // attributed either — and must not vanish from every workspace at once.
    const { scopeToProfile } = await import("../../src/lib/monitoring/workspace.js");
    const orphan = [{ id: "k4", pinnedConnectionId: "conn-unclaimed" }];
    expect(scopeToProfile(orphan, await ownerOf(), "p-rafli")).toHaveLength(1);
  });

  it("never stores a key's workspace separately from its pin", () => {
    // A second field could disagree with the pin — a key labelled "Dimas"
    // pinned to Rafli's account — and then the report and the key list would
    // name different people for the same traffic.
    const src = require("node:fs").readFileSync(
      "../src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js",
      "utf8"
    );
    expect(src).toMatch(/apiKeyProfileId/);
    expect(src).not.toMatch(/key\.profileId|profileId:\s*activeProfileId/);
  });
});

describe("a new key is pinned to the workspace that made it", () => {
  const read = (p) => require("node:fs").readFileSync(p, "utf8");
  const src = () => read("../src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js");

  it("pins the key after creating it, as a separate request", () => {
    // The key exists either way, so a failed pin must lose the attribution,
    // never the key itself.
    expect(src()).toMatch(/pinnedConnectionId: newKeyPin/);
  });

  it("says so when the pin failed instead of only logging it", () => {
    // A key that silently stayed unpinned attributes its usage to nobody.
    expect(src()).toMatch(/setKeyPinError/);
    expect(src()).toMatch(/Pin manual di daftar di bawah/);
  });

  it("never offers a monitor-only connection", () => {
    // Monitor-only connections are never routed to, so a key pinned to one
    // is dead on arrival — the pin is hard and does not fail over.
    expect(src()).toMatch(/!c\.providerSpecificData\?\.monitorOnly/);
  });

  it("preselects only when the workspace owns exactly one account", () => {
    // With several, guessing would put traffic on the wrong account
    // silently; with one there is nothing to decide.
    expect(src()).toMatch(/owned\.length === 1 \? owned\[0\]\.id : ""/);
  });
});
