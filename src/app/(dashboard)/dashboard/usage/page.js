"use client";

import { Suspense, useState, useEffect } from "react";
import { profileOptions } from "@/lib/monitoring/profileFilter";
import { useSearchParams, useRouter } from "next/navigation";
import { RequestLogger, CardSkeleton, SegmentedControl } from "@/shared/components";
import UsageStats from "@/shared/components/UsageStats";
import RequestDetailsTab from "./components/RequestDetailsTab";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
  { value: "all", label: "All" },
];

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [period, setPeriod] = useState("today");

  // Profiles name the PERSON who owns a connection, so usage can be read the
  // way the question is asked. Loaded here and handed down, so UsageStats
  // stays usable without them.
  const [profileId, setProfileId] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [connectionIds, setConnectionIds] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          fetch("/api/profiles", { cache: "no-store" }),
          fetch("/api/providers?provider=claude", { cache: "no-store" }),
        ]);
        const p = await pRes.json().catch(() => ({}));
        const c = await cRes.json().catch(() => ({}));
        if (cancelled) return;
        setProfiles(p.profiles || []);
        setAssignments(p.assignments || {});
        setConnectionIds(
          (Array.isArray(c) ? c : c?.connections || []).map((x) => x.id).filter(Boolean)
        );
      } catch {
        // No profiles is a valid state: the filter simply offers "all".
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Tabs + period selector on same row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={[
            { value: "overview", label: "Overview" },
            { value: "details", label: "Details" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
        {activeTab === "overview" && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {profiles.length ? (
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                aria-label="Filter usage by profile"
                className="rounded-lg border bg-transparent px-2 py-1.5 text-xs"
                style={{ borderColor: "var(--line-soft)" }}
              >
                {profileOptions(profiles, assignments, connectionIds).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : null}
            <SegmentedControl
              options={PERIODS}
              value={period}
              onChange={setPeriod}
              size="sm"
              className="w-full sm:w-auto"
            />
          </div>
        )}
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats period={period} setPeriod={setPeriod} hidePeriodSelector profileId={profileId} profileAssignments={assignments} />
        </Suspense>
      )}
      {activeTab === "logs" && <RequestLogger />}
      {activeTab === "details" && <RequestDetailsTab />}
    </div>
  );
}
