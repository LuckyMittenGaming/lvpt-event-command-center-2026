(() => {
  const id = 'lvpt-responsive-polish-css';
  if (document.getElementById(id)) return;

  const currentScript = document.currentScript;
  const baseUrl = currentScript ? new URL('../', currentScript.src) : new URL('./v2/', window.location.href);
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL('responsive-polish.css?v=20260805-260px-premium', baseUrl).href;
  document.head.appendChild(link);
})();
