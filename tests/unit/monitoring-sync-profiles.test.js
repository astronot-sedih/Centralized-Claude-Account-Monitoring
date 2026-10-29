import { describe, expect, it } from "vitest";
import { planProfileSync, profileNameFor, describePlan } from "../../src/lib/monitoring/claudeWeb/syncProfiles.js";

// Shaped like /api/organizations/{org}/members.
const member = (email, full_name, over = {}) => ({
  account: { email_address: email, full_name, uuid: email },
  role: "user",
  seat_tier: "team_standard",
  ...over,
});

describe("profileNameFor", () => {
  it("prefers the member's display name", () => {
    expect(profileNameFor(member("a@x.io", "Durahman Firmansyah"))).toBe("Durahman Firmansyah");
  });

  it("falls back to the local part, not the whole email", () => {
    // The raw email crowds out everything else in the Usage filter, where it
    // sits beside provider names.
    expect(profileNameFor(member("durahman@x.co.id", ""))).toBe("durahman");
  });
});

describe("planProfileSync", () => {
  it("creates a profile for a member nobody has yet", () => {
    const plan = planProfileSync([member("a@x.io", "Agy")], []);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({ email: "a@x.io", name: "Agy" });
  });

  it("matches on email, never on name", () => {
    // Two people called "Agy" would collapse into one profile if names were
    // the key — and their usage with them.
    const profiles = [{ id: "p1", name: "Agy", email: "other@x.io" }];
    const plan = planProfileSync([member("a@x.io", "Agy")], profiles);
    expect(plan.create).toHaveLength(1);
    expect(plan.matched).toHaveLength(0);
  });

  it("links a hand-made profile by name instead of creating a twin", () => {
    // This is the case that would otherwise split one person's usage across
    // two rows in every report.
    const profiles = [{ id: "p1", name: "Rafli", email: null }];
    const plan = planProfileSync([member("rafli@x.co.id", "Rafli")], profiles);
    expect(plan.create).toHaveLength(0);
    expect(plan.link).toEqual([{ email: "rafli@x.co.id", profileId: "p1", name: "Rafli" }]);
  });

  it("leaves an already-linked profile alone", () => {
    const profiles = [{ id: "p1", name: "Rafli", email: "rafli@x.co.id" }];
    const plan = planProfileSync([member("rafli@x.co.id", "Rafli")], profiles);
    expect(plan.create).toHaveLength(0);
    expect(plan.link).toHaveLength(0);
    expect(plan.matched).toHaveLength(1);
  });

  it("compares emails case-insensitively", () => {
    const profiles = [{ id: "p1", name: "Rafli", email: "Rafli@X.co.id" }];
    const plan = planProfileSync([member("rafli@x.co.id", "Rafli")], profiles);
    expect(plan.matched).toHaveLength(1);
  });

  it("reports a profile the organization does not know, and never deletes it", () => {
    // Deleting would silently unassign every connection it owns.
    const profiles = [{ id: "p1", name: "Mantan", email: "gone@x.io" }];
    const plan = planProfileSync([member("a@x.io", "Agy")], profiles);
    expect(plan.unmatched.map((p) => p.name)).toEqual(["Mantan"]);
    expect(plan).not.toHaveProperty("delete");
  });

  it("does not create a second profile for a repeated member", () => {
    const plan = planProfileSync([member("a@x.io", "Agy"), member("a@x.io", "Agy")], []);
    expect(plan.create).toHaveLength(1);
  });

  it("skips a member with no email rather than inventing a profile", () => {
    // Nothing could ever link to it, so it would be a permanent orphan row.
    const plan = planProfileSync([{ account: { full_name: "No Mail" } }], []);
    expect(plan.create).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
  });

  it("handles an empty organization without throwing", () => {
    expect(planProfileSync([], []).create).toEqual([]);
  });
});

describe("describePlan", () => {
  it("says plainly when there is nothing to do", () => {
    expect(describePlan(planProfileSync([], []))).toBe("Tidak ada perubahan");
  });

  it("counts each kind of change", () => {
    const plan = planProfileSync(
      [member("a@x.io", "Agy"), member("rafli@x.co.id", "Rafli")],
      [{ id: "p1", name: "Rafli", email: null }]
    );
    const text = describePlan(plan);
    expect(text).toMatch(/1 profil baru/);
    expect(text).toMatch(/1 ditautkan ke email/);
  });
});
