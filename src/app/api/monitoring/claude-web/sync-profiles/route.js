// GET  /api/monitoring/claude-web/sync-profiles  — what syncing would do
// POST /api/monitoring/claude-web/sync-profiles  — do it
//
// Matches workspace profiles against the claude.ai organization's members, so
// the people in the dashboard are the people in the team rather than a list
// retyped by hand.
//
// GET is a dry run on purpose: the POST creates rows, and an operator should
// be able to see what it would create before it does.
//
// Auth: covered by dashboardGuard's deny-by-default rule for /api/*.

import { NextResponse } from "next/server";
import { claudeWebSettingsFromEnv } from "@/lib/monitoring/claudeWeb/client.js";
import { fetchMembers } from "@/lib/monitoring/claudeWeb/activity.js";
import { planProfileSync, describePlan } from "@/lib/monitoring/claudeWeb/syncProfiles.js";
import {
  listProfiles,
  createProfile,
  setProfileEmail,
} from "@/lib/db/repos/profilesRepo.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

async function buildPlan() {
  const settings = claudeWebSettingsFromEnv();
  if (!settings.configured) {
    return { error: "CLAUDE_WEB_ORG_ID / CLAUDE_WEB_SESSION_KEY belum diisi", status: 400 };
  }

  const res = await fetchMembers(settings);
  if (!res.ok) return { error: res.error, status: 502 };

  const members = Array.isArray(res.data) ? res.data : res.data?.members || [];
  const profiles = await listProfiles();
  return { plan: planProfileSync(members, profiles), memberCount: members.length };
}

export async function GET() {
  try {
    const { plan, error, status, memberCount } = await buildPlan();
    if (error) return NextResponse.json({ error }, { status, headers: NO_STORE });
    return NextResponse.json(
      { plan, memberCount, summary: describePlan(plan) },
      { headers: NO_STORE }
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: NO_STORE });
  }
}

export async function POST() {
  try {
    const { plan, error, status, memberCount } = await buildPlan();
    if (error) return NextResponse.json({ error }, { status, headers: NO_STORE });

    const created = [];
    const linked = [];
    const failed = [];

    // One member's failure must not abandon the rest: a duplicate name is a
    // per-row problem, and stopping would leave the sync half-applied with no
    // record of which half.
    for (const c of plan.create) {
      try {
        created.push(await createProfile({ name: c.name, email: c.email }));
      } catch (e) {
        failed.push({ email: c.email, name: c.name, error: e.message });
      }
    }

    for (const l of plan.link) {
      try {
        await setProfileEmail(l.profileId, l.email);
        linked.push(l);
      } catch (e) {
        failed.push({ email: l.email, name: l.name, error: e.message });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        memberCount,
        created: created.length,
        linked: linked.length,
        matched: plan.matched.length,
        unmatched: plan.unmatched.map((p) => p.name),
        failed,
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: NO_STORE });
  }
}
