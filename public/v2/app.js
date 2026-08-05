(() => {
  const currentScript = document.currentScript;
  const baseUrl = currentScript ? new URL('./', currentScript.src) : new URL('./v2/', window.location.href);
  const modules = [
    'js/core.js',
    'js/wizard.js',
    'js/dashboard-base.js',
    'js/dashboard-tabs.js',
    'js/documents.js',
    'js/gmail.js',
    'js/reports.js',
    'js/roster-lineaje.js',
    'js/roster-neo.js',
    'js/roster-nium.js',
    'js/roster-confirmed-updates.js',
    'js/nium-profit-lineaje-neo-update.js',
    'js/live-roster.js',
    'js/report-scroll-guard.js',
    'js/dashboard-upgrades.js',
    'js/report-scroll-ready.js',
    'js/central-sync.js',
  ];

  modules.forEach((modulePath) => {
    const source = new URL(modulePath, baseUrl).href;
    document.write(`<script src="${source}"><\/script>`);
  });
})();
