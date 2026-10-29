"use client";

import { Suspense, useState, useEffect } from "react";
import useProfileStore from "@/store/profileStore";
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

  // The active workspace comes from the header switcher, so one control
  // drives Providers, Usage and the rest rather than a dropdown per page.
  const {
    activeProfileId: profileId,
    assignments,
    profiles,
    load: loadProfiles,
    loaded,
  } = useProfileStore();
  const activeName = profiles.find((p) => p.id === profileId)?.name || null;

  useEffect(() => { if (!loaded) loadProfiles(); }, [loaded, loadProfiles]);

  // The tab lives in the URL so a link to Details opens on Details.
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

      {/* Which accounts these numbers cover. Without it a workspace with no
          traffic is indistinguishable from a broken page, and a filtered
          total looks like the team total. */}
      {activeTab === "overview" && activeName ? (
        <p className="-mt-3 text-[11px]" style={{ color: "var(--sev-info-text)" }}>
          Workspace &quot;{activeName}&quot;:{" "}
          {Object.values(assignments).filter((id) => id === profileId).length} akun
          {" "}· monitoring &amp; laporan harian tetap memakai semua akun
        </p>
      ) : null}

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
