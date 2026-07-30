(() => {
  window.__lvptOriginalScrollIntoView = Element.prototype.scrollIntoView;
  window.__lvptSuppressInitialReportScroll = true;
  Element.prototype.scrollIntoView = function(options){
    if(window.__lvptSuppressInitialReportScroll && this.id==='reportCenter') return;
    return window.__lvptOriginalScrollIntoView.call(this,options);
  };
})();
