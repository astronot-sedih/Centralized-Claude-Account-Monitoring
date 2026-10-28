export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();

    // Server-only: lets capabilities.js read the synced catalog without pulling
    // node:fs into the dashboard's browser bundle.
    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();

    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();

    // Claude account monitoring. Returns immediately when MONITOR_ENABLED is
    // not "true", so no condition is needed here. Wrapped because a monitoring
    // feature must never be able to stop the gateway from starting.
    try {
      const [{ startScheduler }, { monitorSettingsFromEnv, sendReportMail }] = await Promise.all([
        import("@/lib/monitoring/scheduler.js"),
        import("@/lib/monitoring/mailer.js"),
      ]);
      const config = monitorSettingsFromEnv();
      if (config.enabled) {
        const { buildMonitorTickDeps } = await import("@/lib/monitoring/tickDeps.js");
        startScheduler(await buildMonitorTickDeps(config, { sendReportMail }));
        console.log(`[monitoring] scheduler started (report ${config.reportHour}:00 ${config.timeZone})`);
      }
    } catch (e) {
      console.warn(`[monitoring] scheduler not started: ${e?.message || e}`);
    }
  }
}
