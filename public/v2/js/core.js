const STORAGE_KEY = 'lvptEvents2026V2';
const DB_NAME = 'lvptCommandCenterFiles';
const DB_STORE = 'documents';
const GMAIL_KEY_SESSION = 'lvptGmailSyncKey';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const statuses = ['New Lead','Needs Discovery','Quote Needed','Proposal Sent','Invoice Sent','Deposit Paid','Booked','Pre-Production','Event Day','Completed','Post-Event Follow-Up','Closed Won','Closed Lost'];
const wizardLabels = ['Client','Schedule','Experience','Production','Financials','Follow-Up'];
let activeTab = 'setup';
let selectedId = '';
let wizardStep = 0;
let wizardEditingId = '';
let gmailStatus = { checked:false, configured:false, email:'book@pokertraininglasvegas.com', message:'Not checked' };

const seedEvents = [
  {
    id:'evt-neo-2026', eventName:'Neo Reunion 2026 Poker Experience', company:'Mosaic Events / Neo', contactName:'Demo Planner', contactEmail:'planner@example.com', contactPhone:'555-0100', eventType:'Corporate Training + Tournament', status:'Quote Needed', eventDate:'2026-10-03', startTime:'14:00', endTime:'22:00', city:'Marana', state:'AZ', venue:'Ritz-Carlton Dove Mountain', guestCount:150, studentCount:40, skillLevel:'Mixed Audience', leadSource:'Repeat Client', probabilityToClose:85, eventGoal:'Repeat a premium poker training and tournament experience with stronger year-two execution.', eventFormat:'Afternoon training followed by an evening tournament.', clientExpectations:'Bring back a world-class professional team, keep the event polished, and improve guest access to instructors.', knownRisks:'Venue compliance packet; instructor availability; branded asset production timing; tournament scope creep.', nextAction:'Prepare year-two quote with improvement recommendations.', nextActionDue:'2026-08-07',
    setup:{invoiceEmail:'',planningStage:'Ready for Custom Quote',budgetRange:'$40,000+',poRequired:'unknown',poNumber:'',stakeholders:'Event planner and client leadership',timeZone:'America/Phoenix',venueStatus:'Confirmed',venueContact:'',venueEmail:'',setupTime:'12:00',strikeTime:'23:30',parkingInstructions:'Venue loading instructions pending.',travelNeeds:'Instructor flights and lodging may be required.',primaryGoal:'Corporate Team Building',experienceDuration:'Full afternoon and evening',trainingFormat:'Classroom + Hand Analysis',gameFormat:'Tournament',competitionLevel:'High-Energy Championship',foodPlan:'Venue-managed food and beverage',addOns:'Branded cards and chips; final-table commentary',tableCount:18,dealerCount:18,proCount:5,leadProNeeded:'yes',tdNeeded:'yes',avNeeded:'yes',equipmentSource:'LVPT Provides Everything',brandingRequired:'yes',shippingRequired:'yes',powerInternet:'Timer displays, microphone and final-table AV',dressCode:'Premium LVPT event attire',accessibilityNeeds:'',layoutNotes:'Training tables transition into tournament floor.',productionNotes:'Protect instructor interaction time.',targetQuote:49168,depositPercent:90,finalPaymentTiming:'10 Days Before Event',taxStatus:'Not Reviewed',coiRequired:'yes',w9Required:'yes',vendorRegistration:'yes',licenseRequired:'unknown',contractRequired:'yes',paymentNotes:'90% deposit structure expected.',complianceNotes:'Begin venue packet at least 45 days out.',internalOwner:'Matt',reminderCadence:'Daily for overdue tasks',gmailKeywords:'Mosaic Neo Reunion Ritz-Carlton',autoEmailMatch:'yes',communicationNotes:'Keep Mosaic copied on major production decisions.',miscNotes:''},
    quote:[{id:id(),category:'Training',name:'Premium instructor team',quantity:5,unitPrice:4500,internalCost:2500},{id:id(),category:'Tournament',name:'Tournament operations package',quantity:1,unitPrice:14500,internalCost:8500},{id:id(),category:'Assets',name:'Branded cards and chips allowance',quantity:1,unitPrice:4000,internalCost:2600}],
    payment:{amountPaid:0,depositRequired:44251,status:'Not Invoiced',balanceDueDate:'2026-09-23'},
    staff:[{id:id(),name:'Kenna James',role:'Lead Pro / MC',confirmed:false,arrivalTime:'13:00',rate:0},{id:id(),name:'Instructor Team TBD',role:'Poker Instructors',confirmed:false,arrivalTime:'13:00',rate:0},{id:id(),name:'Dealer Team TBD',role:'Dealers',confirmed:false,arrivalTime:'17:30',rate:0}],
    compliance:[{id:id(),name:'Certificate of Insurance',status:'Needed',dueDate:'2026-08-19'},{id:id(),name:'W-9 / vendor packet',status:'Pending',dueDate:'2026-08-19'},{id:id(),name:'Venue business license requirement',status:'Pending',dueDate:'2026-08-19'}],
    tasks:[{id:id(),title:'Build revised year-two quote',owner:'Matt',dueDate:'2026-08-07',priority:'Critical',status:'Open'},{id:id(),title:'Confirm preferred instructor availability',owner:'Matt',dueDate:'2026-09-03',priority:'High',status:'Open'}],
    documents:[], emailActivity:[], postEvent:{clientFeedback:'',whatWentWell:'Prior-year feedback was strong.',painPoints:'Guests may have wanted more time with pros.',changesForNextTime:'Add more pro access and begin compliance earlier.',reviewRequested:false,reviewReceived:false,rebookingLikelihood:'High'}
  },
  {
    id:'evt-private-demo', eventName:'Executive Private Poker Workshop', company:'Private Group Demo', contactName:'Demo Guest', contactEmail:'guest@example.com', contactPhone:'555-0120', eventType:'Executive Workshop', status:'Needs Discovery', eventDate:'2026-09-12', startTime:'13:00', endTime:'16:00', city:'Las Vegas', state:'NV', venue:'Client suite or private venue', guestCount:9, studentCount:9, skillLevel:'Mostly Beginners', leadSource:'Organic SEO', probabilityToClose:50, eventGoal:'Build confidence and decision-making skills through premium poker instruction.', eventFormat:'Business-focused introduction followed by guided hand analysis.', clientExpectations:'Fun, impressive, beginner-friendly, and led by a credible world-class professional.', knownRisks:'Location not confirmed; final group count pending.', nextAction:'Confirm location and send two-hour and three-hour pricing options.', nextActionDue:'2026-08-03',
    setup:{planningStage:'Needs Discovery',budgetRange:'Not Provided',invoiceEmail:'',poRequired:'unknown',poNumber:'',stakeholders:'',timeZone:'America/Los_Angeles',venueStatus:'TBD',venueContact:'',venueEmail:'',setupTime:'12:00',strikeTime:'16:30',parkingInstructions:'',travelNeeds:'',primaryGoal:'Executive Development',experienceDuration:'2–3 hours',trainingFormat:'Business-First Workshop',gameFormat:"Texas Hold'em",competitionLevel:'Friendly Competition',foodPlan:'TBD',addOns:'',tableCount:1,dealerCount:1,proCount:1,leadProNeeded:'yes',tdNeeded:'no',avNeeded:'no',equipmentSource:'LVPT Provides Everything',brandingRequired:'no',shippingRequired:'no',powerInternet:'',dressCode:'Professional',accessibilityNeeds:'',layoutNotes:'',productionNotes:'',targetQuote:0,depositPercent:50,finalPaymentTiming:'10 Days Before Event',taxStatus:'Not Reviewed',coiRequired:'unknown',w9Required:'unknown',vendorRegistration:'unknown',licenseRequired:'unknown',contractRequired:'yes',paymentNotes:'',complianceNotes:'',internalOwner:'Matt',reminderCadence:'Every 3 days',gmailKeywords:'Executive Private Poker Workshop',autoEmailMatch:'yes',communicationNotes:'',miscNotes:''},
    quote:[], payment:{amountPaid:0,depositRequired:0,status:'Not Invoiced',balanceDueDate:'2026-09-02'}, staff:[{id:id(),name:'Instructor TBD',role:'Lead Pro / Instructor',confirmed:false,arrivalTime:'12:30',rate:450}], compliance:[], tasks:[{id:id(),title:'Confirm location and participant count',owner:'Matt',dueDate:'2026-08-03',priority:'High',status:'Open'}], documents:[], emailActivity:[], postEvent:{clientFeedback:'',whatWentWell:'',painPoints:'',changesForNextTime:'',reviewRequested:false,reviewReceived:false,rebookingLikelihood:'Medium'}
  }
];

let events = loadEvents();
selectedId = events[0]?.id || '';

function id(){ return 'id-' + Math.random().toString(36).slice(2,10) + '-' + Date.now().toString(36); }
function $(selector){ return document.querySelector(selector); }
function all(selector){ return Array.from(document.querySelectorAll(selector)); }
function money(value){ return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value)||0); }
function num(value){ return Number(value) || 0; }
function current(){ return events.find(event => event.id === selectedId) || events[0]; }
function quoteTotal(event){ return (event.quote || []).reduce((sum,item)=>sum + num(item.quantity)*num(item.unitPrice),0); }
function quoteCost(event){ return (event.quote || []).reduce((sum,item)=>sum + num(item.quantity)*num(item.internalCost),0); }
function balance(event){ return Math.max(quoteTotal(event)-num(event.payment?.amountPaid),0); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
function humanTime(value){ if(!value) return 'TBD'; const [h,m] = String(value).split(':').map(Number); if(Number.isNaN(h)) return value; const suffix=h>=12?'PM':'AM'; const hour=h%12||12; return `${hour}:${String(m||0).padStart(2,'0')} ${suffix}`; }
function formatBytes(bytes){ if(!bytes) return '0 B'; const units=['B','KB','MB','GB']; const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1); return `${(bytes/Math.pow(1024,i)).toFixed(i?1:0)} ${units[i]}`; }
function isoDate(date){ return date.toISOString().slice(0,10); }
function shiftDate(dateString, days){ if(!dateString) return ''; const date=new Date(`${dateString}T12:00:00`); if(Number.isNaN(date.getTime())) return ''; date.setDate(date.getDate()+days); return isoDate(date); }
function daysFromToday(dateString){ if(!dateString) return Infinity; const today=new Date(); today.setHours(0,0,0,0); const date=new Date(`${dateString}T00:00:00`); return Math.round((date-today)/86400000); }
function taskIsComplete(task){ return ['complete','completed','resolved','done'].includes(String(task?.status||'').trim().toLowerCase()); }
function taskCompletionStatus(task){ return task?.sourceId || task?.source === 'Email Intelligence' ? 'Resolved' : 'Complete'; }
function completeTask(task){
  if(!task) return;
  task.status=taskCompletionStatus(task);
  task.completedAt=new Date().toISOString();
  task.completedBy='Command Center';
  task.dueDate='';
}
function taskStatusLabel(task){ return taskIsComplete(task) ? 'Completed' : (task?.status || 'Open'); }
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }

function ensureEventShape(event){
  const setupDefaults={invoiceEmail:'',planningStage:'Needs Discovery',budgetRange:'',poRequired:'unknown',poNumber:'',stakeholders:'',timeZone:'America/Los_Angeles',venueStatus:'TBD',venueContact:'',venueEmail:'',setupTime:'',strikeTime:'',parkingInstructions:'',travelNeeds:'',primaryGoal:'Corporate Team Building',experienceDuration:'',trainingFormat:'Hand Analysis at Tables',gameFormat:"Texas Hold'em",competitionLevel:'Friendly Competition',foodPlan:'',addOns:'',tableCount:Math.max(1,Math.ceil(num(event.guestCount||9)/9)),dealerCount:Math.max(1,Math.ceil(num(event.guestCount||9)/9)),proCount:Math.max(1,Math.ceil(num(event.studentCount||9)/9)),leadProNeeded:'yes',tdNeeded:'unknown',avNeeded:'unknown',equipmentSource:'TBD',brandingRequired:'unknown',shippingRequired:'unknown',powerInternet:'',dressCode:'',accessibilityNeeds:'',layoutNotes:'',productionNotes:'',targetQuote:quoteTotal(event),depositPercent:50,finalPaymentTiming:'10 Days Before Event',taxStatus:'Not Reviewed',coiRequired:'unknown',w9Required:'unknown',vendorRegistration:'unknown',licenseRequired:'unknown',contractRequired:'yes',paymentNotes:'',complianceNotes:'',internalOwner:'Matt',reminderCadence:'Daily for overdue tasks',gmailKeywords:[event.company,event.eventName].filter(Boolean).join(' '),autoEmailMatch:'yes',communicationNotes:'',miscNotes:''};
  event.setup={...setupDefaults,...(event.setup||{})};
  event.quote=event.quote||[]; event.tasks=event.tasks||[]; event.staff=event.staff||[]; event.compliance=event.compliance||[]; event.documents=event.documents||[]; event.emailActivity=event.emailActivity||[];
  event.payment={amountPaid:0,depositRequired:0,status:'Not Invoiced',balanceDueDate:'',...(event.payment||{})};
  event.postEvent={clientFeedback:'',whatWentWell:'',painPoints:'',changesForNextTime:'',reviewRequested:false,reviewReceived:false,rebookingLikelihood:'Medium',...(event.postEvent||{})};
  return event;
}
function loadEvents(){ try { const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)); return (stored||seedEvents).map(ensureEventShape); } catch { return seedEvents.map(ensureEventShape); } }
function saveEvents(message='Saved to this browser'){ events=events.map(ensureEventShape); localStorage.setItem(STORAGE_KEY,JSON.stringify(events)); if(message) toast(message); }
