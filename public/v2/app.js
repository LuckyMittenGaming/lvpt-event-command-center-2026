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
    'js/reports.js?v=2026-11-24-readonly',
    'js/report-scroll-guard.js',
    'js/dashboard-upgrades.js?v=2026-08-17-task-completion-v4',
    'js/report-scroll-ready.js',
    'js/central-sync.js',
    'js/lifecycle-command-center.js?v=2026-11-23-rcs-inbox',
    'js/event-finance.js?v=2026-11-22-health',
    'js/unified-hub.js?v=2026-11-23-rcs-timeline',
    'js/responsive-polish-loader.js',
    'js/event-workspace-upgrade.js?v=2026-08-17-task-completion-v4',
    'js/authoritative-finance.js?v=2026-11-24-session',
    'js/sheet-snapshot.js?v=2026-11-24-session',
  ];

  modules.forEach((modulePath) => {
    const source = new URL(modulePath, baseUrl).href;
    document.write(`<script src="${source}"><\/script>`);
  });
})();
