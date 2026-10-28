// Local-time helpers for the monitoring scheduler and date keys.
//
// A UTC day boundary would split an Indonesian working day in half: usage from
// 7am Monday and 7am Tuesday Jakarta time would land in the same UTC "day" for
// part of the year. Everything that says "today" in this feature goes through
// here.

export const DEFAULT_TZ = "Asia/Jakarta";

// Intl rather than manual offset arithmetic, so DST and offset changes are the
// platform's problem rather than ours.
function formatter(timeZone, options) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, ...options });
  } catch {
    // An operator typo in MONITOR_TZ must not crash the scheduler every tick.
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, ...options });
  }
}

/**
 * Local calendar date in `timeZone`, as YYYY-MM-DD.
 * @returns {string}
 */
export function dateKeyFor(date = new Date(), timeZone = DEFAULT_TZ) {
  // en-CA formats as YYYY-MM-DD, so no part reassembly is needed.
  return formatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Local hour in `timeZone`, 0–23.
 * @returns {number}
 */
export function localHourFor(date = new Date(), timeZone = DEFAULT_TZ) {
  const hour = formatter(timeZone, { hour: "2-digit", hour12: false }).format(date);
  // hourCycle can render midnight as "24" depending on platform/locale data.
  return Number(hour) % 24;
}
