(() => {
  const currentScript = document.currentScript;
  const baseUrl = currentScript ? new URL('./', currentScript.src) : new URL('./v2/', window.location.href);
  const modules = [
    'js/core.js?v=2026-08-17-task-completion-v4',
    'js/wizard.js',
    'js/dashboard-base.js?v=2026-08-17-task-completion-v4',
    'js/dashboard-tabs.js?v=2026-08-17-task-completion-v4',
    'js/documents.js',
    'js/gmail.js?v=2026-11-22-sheet-ledger',
    'js/reports.js?v=2026-08-17-task-completion-v4',
    'js/roster-lineaje.js',
    'js/roster-neo.js',
    'js/roster-nium.js',
    'js/roster-confirmed-updates.js',
    'js/nium-profit-lineaje-neo-update.js',
    'js/live-roster.js',
    'js/report-scroll-guard.js',
    'js/dashboard-upgrades.js?v=2026-08-17-task-completion-v4',
    'js/report-scroll-ready.js',
    'js/central-sync.js',
    'js/lifecycle-command-center.js?v=2026-11-22-acceptance-2',
    'js/event-finance.js?v=2026-11-22-recovery',
    'js/unified-hub.js?v=2026-11-22-recovery3',
    'js/responsive-polish-loader.js',
    'js/event-workspace-upgrade.js?v=2026-08-17-task-completion-v4',
    'js/authoritative-finance.js?v=2026-11-22-operations',
  ];

  modules.forEach((modulePath) => {
    const source = new URL(modulePath, baseUrl).href;
    document.write(`<script src="${source}"><\/script>`);
  });
})();
