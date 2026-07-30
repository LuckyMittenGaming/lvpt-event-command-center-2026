(() => {
  window.__lvptSuppressInitialReportScroll = false;
  if(window.__lvptOriginalScrollIntoView){
    Element.prototype.scrollIntoView = window.__lvptOriginalScrollIntoView;
  }
})();
