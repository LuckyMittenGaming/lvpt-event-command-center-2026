const LIVE_ROSTER_VERSION='2026-08-05-nium-profit-lineaje-closed-neo-proposal';
const LIVE_ROSTER_KEY='lvptLiveRosterVersion';

function cloneLiveRoster(){
  return JSON.parse(JSON.stringify(window.LVPT_LIVE_EVENTS||[])).map(ensureEventShape);
}

function readStoredEvents(){
  try {
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored)?stored:[];
  } catch {
    return [];
  }
}

function mergeOfficialWithLocal(officialEvent,localEvent){
  if(!localEvent)return ensureEventShape(officialEvent);
  const priorTaskStatus=new Map((localEvent.tasks||[]).map(task=>[task.title,task.status]));
  return ensureEventShape({
    ...officialEvent,
    tasks:(officialEvent.tasks||[]).map(task=>priorTaskStatus.has(task.title)?{...task,status:priorTaskStatus.get(task.title)}:task),
    documents:localEvent.documents||officialEvent.documents||[],
    emailActivity:localEvent.emailActivity||officialEvent.emailActivity||[],
    postEvent:{...(officialEvent.postEvent||{}),...(localEvent.postEvent||{})},
  });
}

function installLiveRoster(force=false){
  if(!force&&localStorage.getItem(LIVE_ROSTER_KEY)===LIVE_ROSTER_VERSION)return;
  const localById=new Map(readStoredEvents().map(event=>[event.id,event]));
  events=cloneLiveRoster().map(event=>mergeOfficialWithLocal(event,localById.get(event.id)));
  selectedId=events[0]?.id||'';
  localStorage.setItem(STORAGE_KEY,JSON.stringify(events));
  localStorage.setItem(LIVE_ROSTER_KEY,LIVE_ROSTER_VERSION);
  render();
}

resetDemoData=function(){
  if(!confirm('Replace all browser-saved event records with the official 2026 LVPT roster? Local uploaded files and matched email activity will be retained.'))return;
  installLiveRoster(true);
  saveEvents('Official 2026 event roster restored');
};

installLiveRoster();
const originalResetButton=$('#resetDataBtn');
if(originalResetButton){
  const officialResetButton=originalResetButton.cloneNode(true);
  officialResetButton.textContent='Restore Official Roster';
  originalResetButton.replaceWith(officialResetButton);
  officialResetButton.addEventListener('click',resetDemoData);
}
