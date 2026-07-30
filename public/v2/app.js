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
  ];

  modules.forEach((modulePath) => {
    const source = new URL(modulePath, baseUrl).href;
    document.write(`<script src="${source}"><\/script>`);
  });
})();
