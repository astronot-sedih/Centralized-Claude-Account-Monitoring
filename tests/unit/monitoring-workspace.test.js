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

  it("the report API does not take a profile parameter", () => {
    expect(read("../src/app/api/monitoring/report/route.js"))
      .not.toMatch(/profileId|activeProfile/);
  });
});
