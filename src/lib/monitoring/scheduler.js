// Hourly sampling, one report a morning.
//
// A persisted due-check, NOT a wall-clock alarm. 9router runs on a laptop; an
// alarm at 07:00 sends nothing when the machine is asleep at 07:00, and "a
// report every morning" versus "a report on days the laptop was awake at 7"
// are different products. So every tick asks "is today's report still owed?"
// and `lastSentDateKey` is the single guard that it goes out once.

import { dateKeyFor, localHourFor, DEFAULT_TZ } from "./clock.js";
import { collectOnce as realCollectOnce } from "./quotaCollector.js";
import { pruneSnapshotsOlderThan as realPrune } from "@/lib/db/repos/quotaSnapshotsRepo.js";

export const SAMPLE_INTERVAL_MS = 3600000;
export const RETENTION_DAYS = 90;
const LAST_SENT_KEY = "monitorLastSentDateKey";
const LAST_PRUNED_KEY = "monitorLastPrunedDateKey";

function shiftDays(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * One scheduler beat. Sampling, sending and pruning are independent: each is
 * wrapped on its own so a failure in one cannot suppress the others.
 *
 * @param {object} deps fully injectable; production supplies real ones
 * @returns {Promise<{sampled: boolean, sent: boolean, pruned: boolean, reason: string}>}
 */
export async function tick(deps = {}) {
  const {
    enabled = false,
    timeZone = DEFAULT_TZ,
    reportHour = 7,
    now = () => new Date(),
    collectOnce = realCollectOnce,
    sendReport,
    lastSentDateKey = null,
    setLastSentDateKey,
    pruneSnapshotsOlderThan = realPrune,
    lastPrunedDateKey = null,
    setLastPrunedDateKey,
  } = deps;

  const result = { sampled: false, sent: false, pruned: false, reason: "" };
  if (!enabled) {
    result.reason = "disabled";
    return result;
  }

  const at = now();
  const todayKey = dateKeyFor(at, timeZone);

  try {
    await collectOnce({ dateKey: todayKey });
    result.sampled = true;
  } catch (error) {
    result.reason = `sample failed: ${error?.message || error}`;
  }

  // Due when the local report hour has arrived and today's report is unsent.
  // A multi-day backlog collapses to one report for today rather than a burst.
  const due = localHourFor(at, timeZone) >= reportHour && lastSentDateKey !== todayKey;

  if (due && typeof sendReport === "function") {
    try {
      await sendReport({ dateKey: todayKey, timeZone });
      // Marked sent only after the send succeeded — otherwise one SMTP outage
      // would silently cost that day's report for good.
      if (typeof setLastSentDateKey === "function") await setLastSentDateKey(todayKey);
      result.sent = true;
    } catch (error) {
      result.reason = `${result.reason ? result.reason + "; " : ""}send failed: ${error?.message || error}`;
    }
  }

  // Pruning is daily and INDEPENDENT of the send. Gating it on a successful
  // send meant the "sample hourly, read the dashboard, skip email" mode never
  // pruned at all, so retention silently never applied.
  if (lastPrunedDateKey !== todayKey) {
    try {
      await pruneSnapshotsOlderThan(shiftDays(todayKey, -RETENTION_DAYS));
      if (typeof setLastPrunedDateKey === "function") await setLastPrunedDateKey(todayKey);
      result.pruned = true;
    } catch (error) {
      result.reason = `${result.reason ? result.reason + "; " : ""}prune failed: ${error?.message || error}`;
    }
  }

  return result;
}

/**
 * Starts the hourly beat. Returns a stop function, or null if this process is
 * already running one — Next's dev mode invokes instrumentation twice, and two
 * schedulers would double-sample and race on the send guard.
 *
 * @returns {(() => void)|null}
 */
export function startScheduler(deps = {}) {
  if (!global._monitorSchedulerRunning) global._monitorSchedulerRunning = false;
  if (global._monitorSchedulerRunning) return null;
  global._monitorSchedulerRunning = true;

  const resolveDeps = deps.resolveDeps || (async () => deps);

  // One beat at a time. A pass is 11 accounts x 1.5s plus network, well inside
  // an hour today — but a hung upstream must not leave two collectOnce runs
  // interleaved against a rate-limited endpoint.
  let beating = false;

  const beat = async () => {
    if (beating) return;
    beating = true;
    try {
      const d = await resolveDeps();
      // Read the guard fresh each beat: it lives in the DB, not in memory, so a
      // restart mid-day does not resend.
      await tick(d);
    } catch (error) {
      console.warn(`[monitoring] scheduler beat failed: ${error?.message || error}`);
    } finally {
      beating = false;
    }
  };

  const timer = setInterval(beat, deps.intervalMs || SAMPLE_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  // Run once on boot so a machine woken after the report hour catches up now
  // rather than an hour from now.
  if (deps.runImmediately !== false) beat();

  return () => {
    clearInterval(timer);
    global._monitorSchedulerRunning = false;
  };
}

export { LAST_SENT_KEY, LAST_PRUNED_KEY };
