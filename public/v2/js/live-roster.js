const LIVE_ROSTER_VERSION='2026-07-29-real-events-v1';
const LIVE_ROSTER_KEY='lvptLiveRosterVersion';
function cloneLiveRoster(){return JSON.parse(JSON.stringify(window.LVPT_LIVE_EVENTS||[])).map(ensureEventShape);}
function installLiveRoster(force=false){
  if(!force&&localStorage.getItem(LIVE_ROSTER_KEY)===LIVE_ROSTER_VERSION)return;
  events=cloneLiveRoster();
  selectedId=events[0]?.id||'';
  localStorage.setItem(STORAGE_KEY,JSON.stringify(events));
  localStorage.setItem(LIVE_ROSTER_KEY,LIVE_ROSTER_VERSION);
  render();
}
resetDemoData=function(){
  if(!confirm('Replace all browser-saved event records with the official 2026 LVPT roster? Local uploaded file blobs are not deleted automatically.'))return;
  events=cloneLiveRoster();
  selectedId=events[0]?.id||'';
  localStorage.setItem(LIVE_ROSTER_KEY,LIVE_ROSTER_VERSION);
  saveEvents('Official 2026 event roster restored');
  render();
};
installLiveRoster();
