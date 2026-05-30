const STORAGE_KEY = 'lvptEvents2026V2';
const statuses = ['New Lead','Needs Discovery','Quote Needed','Proposal Sent','Invoice Sent','Deposit Paid','Booked','Pre-Production','Event Day','Completed','Post-Event Follow-Up','Closed Won','Closed Lost'];
let activeTab = 'quote';
let selectedId = '';

const seedEvents = [
  {
    id:'evt-neo-2026', eventName:'Neo Reunion 2026 Poker Experience', company:'Mosaic Events / Neo', contactName:'Demo Planner', contactEmail:'planner@example.com', contactPhone:'555-0100', eventType:'Corporate Poker Training + Tournament', status:'Quote Needed', eventDate:'2026-10-03', startTime:'2:00 PM', endTime:'10:00 PM', city:'Marana', state:'AZ', venue:'Ritz-Carlton Dove Mountain', guestCount:150, studentCount:40, skillLevel:'Mixed corporate audience', leadSource:'Repeat Client', probabilityToClose:85, eventGoal:'Repeat premium poker training and tournament experience with stronger year-two execution.', eventFormat:'Afternoon training block, evening tournament, 4-5 instructors, branded materials likely.', clientExpectations:'Bring back a strong pro team, keep the event polished, and improve guest access to pros.', knownRisks:'Venue compliance packet; Instructor availability; Branded card/chip production timing; Tournament scope creep', nextAction:'Prepare year-two quote with inflation adjustment and improvement recommendations.', nextActionDue:'2026-06-07',
    quote:[{id:id(),category:'Training',name:'Premium instructor team',quantity:5,unitPrice:4500,internalCost:2500},{id:id(),category:'Tournament',name:'Tournament operations package',quantity:1,unitPrice:14500,internalCost:8500},{id:id(),category:'Assets',name:'Branded cards and chips allowance',quantity:1,unitPrice:4000,internalCost:2600}],
    payment:{amountPaid:0,depositRequired:20500,status:'Not Invoiced',balanceDueDate:'2026-09-23'},
    staff:[{id:id(),name:'Kenna James',role:'Lead Pro / MC',confirmed:false,arrivalTime:'1:00 PM',rate:0},{id:id(),name:'Instructor TBD',role:'Poker Instructor',confirmed:false,arrivalTime:'1:00 PM',rate:0},{id:id(),name:'Dealer Team TBD',role:'Dealers',confirmed:false,arrivalTime:'5:30 PM',rate:0}],
    compliance:[{id:id(),name:'Certificate of Insurance',status:'Needed',dueDate:'2026-09-01'},{id:id(),name:'Venue business license requirement',status:'Pending',dueDate:'2026-09-01'},{id:id(),name:'Vendor policies and code of conduct',status:'Pending',dueDate:'2026-09-01'}],
    tasks:[{id:id(),title:'Build revised year-two quote',owner:'Matt',dueDate:'2026-06-07',priority:'Critical',status:'Open'},{id:id(),title:'Confirm preferred instructor availability',owner:'Matt',dueDate:'2026-06-14',priority:'High',status:'Open'}],
    postEvent:{clientFeedback:'',whatWentWell:'Prior year feedback was strong; client appears open to repeating and upgrading.',painPoints:'Guests may have wanted more time with pros. Year-two design should protect instructor interaction time.',changesForNextTime:'Add more pro access, clarify tournament facilitation scope, begin compliance earlier.',reviewRequested:false,reviewReceived:false,rebookingLikelihood:'High'}
  },
  {
    id:'evt-vegas-corp-demo', eventName:'Venetian Corporate Poker Workshop', company:'WFM Restoration Demo Account', contactName:'Demo Contact', contactEmail:'contact@example.com', contactPhone:'555-0110', eventType:'Corporate Poker Training', status:'Proposal Sent', eventDate:'2026-07-18', startTime:'6:00 PM', endTime:'9:00 PM', city:'Las Vegas', state:'NV', venue:'Venetian Poker Room', guestCount:40, studentCount:18, skillLevel:'Beginner to intermediate', leadSource:'Corporate Events Page', probabilityToClose:65, eventGoal:'Premium Las Vegas client entertainment with real poker training and optional tournament play.', eventFormat:'90-minute guided hand analysis followed by casual dealer-run Sit & Go tables.', clientExpectations:'High-touch, polished, easy for beginners, impressive for executives.', knownRisks:'Private table availability; Food and beverage coordination; Guest count may change', nextAction:'Follow up on proposal and confirm whether custom cards are desired.', nextActionDue:'2026-06-03',
    quote:[{id:id(),category:'Training',name:'Corporate training package',quantity:1,unitPrice:6900,internalCost:3300},{id:id(),category:'Venue',name:'Venetian private table option',quantity:1,unitPrice:1500,internalCost:1200},{id:id(),category:'Assets',name:'Custom cards',quantity:1,unitPrice:2000,internalCost:1200}],
    payment:{amountPaid:0,depositRequired:5200,status:'Invoice Sent',balanceDueDate:'2026-07-08'},
    staff:[{id:id(),name:'Lead Pro TBD',role:'Lead Instructor',confirmed:false,arrivalTime:'5:15 PM',rate:450},{id:id(),name:'Dealer TBD',role:'Dealer',confirmed:false,arrivalTime:'5:30 PM',rate:250}],
    compliance:[{id:id(),name:'Private table confirmation',status:'Pending',dueDate:'2026-06-21'},{id:id(),name:'Food and beverage confirmation',status:'Pending',dueDate:'2026-06-28'}],
    tasks:[{id:id(),title:'Follow up on proposal',owner:'Matt',dueDate:'2026-06-03',priority:'High',status:'Open'},{id:id(),title:'Confirm Venetian table availability',owner:'Matt',dueDate:'2026-06-21',priority:'High',status:'Open'}],
    postEvent:{clientFeedback:'',whatWentWell:'',painPoints:'',changesForNextTime:'',reviewRequested:false,reviewReceived:false,rebookingLikelihood:'Medium'}
  },
  {
    id:'evt-private-beginner-demo', eventName:'Beginner Friends Private Lesson', company:'Private Group Demo', contactName:'Demo Guest', contactEmail:'guest@example.com', contactPhone:'555-0120', eventType:'Private Poker Lesson', status:'Needs Discovery', eventDate:'2026-09-12', startTime:'1:00 PM', endTime:'4:00 PM', city:'Las Vegas', state:'NV', venue:'Client suite or Spanish Trail', guestCount:6, studentCount:6, skillLevel:'Beginner', leadSource:'Organic SEO', probabilityToClose:50, eventGoal:'Help a beginner group learn enough to feel confident before playing in Las Vegas.', eventFormat:'2-3 hour beginner-friendly private group lesson with world-class pro instructor.', clientExpectations:'Fun, not intimidating, clear basics, table confidence.', knownRisks:'Location not confirmed; Group may need simple pricing explanation', nextAction:'Send tightened pricing options for 2-hour and 3-hour lessons.', nextActionDue:'2026-06-02',
    quote:[{id:id(),category:'Training',name:'3-hour private beginner group lesson',quantity:1,unitPrice:2850,internalCost:1350},{id:id(),category:'Venue',name:'Spanish Trail private setting fee',quantity:1,unitPrice:100,internalCost:100}],
    payment:{amountPaid:0,depositRequired:1475,status:'Not Invoiced',balanceDueDate:'2026-09-02'},
    staff:[{id:id(),name:'Instructor TBD',role:'Private Lesson Pro',confirmed:false,arrivalTime:'12:30 PM',rate:450}],
    compliance:[{id:id(),name:'Lesson location confirmation',status:'Pending',dueDate:'2026-08-12'}],
    tasks:[{id:id(),title:'Send private lesson pricing options',owner:'Matt',dueDate:'2026-06-02',priority:'High',status:'Open'}],
    postEvent:{clientFeedback:'',whatWentWell:'',painPoints:'',changesForNextTime:'',reviewRequested:false,reviewReceived:false,rebookingLikelihood:'Medium'}
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
function quoteTotal(event){ return event.quote.reduce((sum,item)=>sum + num(item.quantity)*num(item.unitPrice),0); }
function quoteCost(event){ return event.quote.reduce((sum,item)=>sum + num(item.quantity)*num(item.internalCost),0); }
function balance(event){ return Math.max(quoteTotal(event)-num(event.payment.amountPaid),0); }
function loadEvents(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seedEvents; } catch { return seedEvents; }
}
function saveEvents(message='Saved to localStorage'){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  toast(message);
}
function toast(message){
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),1600);
}
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }

function init(){
  statuses.forEach(status => {
    $('#statusFilter').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`);
    $('#newStatusSelect').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(status)}" ${status==='New Lead'?'selected':''}>${escapeHtml(status)}</option>`);
  });
  $('#newEventTopBtn').addEventListener('click', openNewEvent);
  $('#newEventSideBtn').addEventListener('click', openNewEvent);
  $('#closeNewEventBtn').addEventListener('click', closeNewEvent);
  $('#cancelNewEventBtn').addEventListener('click', closeNewEvent);
  $('#newEventForm').addEventListener('submit', createEventFromForm);
  $('#searchInput').addEventListener('input', render);
  $('#statusFilter').addEventListener('change', render);
  $('#exportCsvBtn').addEventListener('click', exportCsv);
  $('#exportJsonBtn').addEventListener('click', exportJson);
  $('#resetDataBtn').addEventListener('click', resetDemoData);
  all('.tab').forEach(tab => tab.addEventListener('click', () => { activeTab = tab.dataset.tab; render(); }));
  render();
}

function openNewEvent(){ $('#newEventDialog').showModal(); }
function closeNewEvent(){ $('#newEventDialog').close(); }
function createEventFromForm(event){
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const newEvent = {
    id:id(), eventName:data.get('eventName') || 'New LVPT Event', company:data.get('company') || 'New Client', contactName:data.get('contactName') || '', contactEmail:data.get('contactEmail') || '', contactPhone:data.get('contactPhone') || '', eventType:data.get('eventType') || 'Corporate Poker Training', status:data.get('status') || 'New Lead', eventDate:data.get('eventDate') || '', startTime:'TBD', endTime:'TBD', city:data.get('city') || '', state:data.get('state') || '', venue:data.get('venue') || 'TBD', guestCount:num(data.get('guestCount')), studentCount:num(data.get('studentCount')), skillLevel:'TBD', leadSource:data.get('leadSource') || 'Manual Entry', probabilityToClose:25, eventGoal:'', eventFormat:'', clientExpectations:'', knownRisks:'', nextAction:data.get('nextAction') || 'Complete discovery and prepare quote.', nextActionDue:'',
    quote:[], payment:{amountPaid:0,depositRequired:0,status:'Not Invoiced',balanceDueDate:''}, staff:[], compliance:[], tasks:[{id:id(),title:'Complete discovery call',owner:'Matt',dueDate:'',priority:'High',status:'Open'}], postEvent:{clientFeedback:'',whatWentWell:'',painPoints:'',changesForNextTime:'',reviewRequested:false,reviewReceived:false,rebookingLikelihood:'Medium'}
  };
  events.unshift(newEvent);
  selectedId = newEvent.id;
  saveEvents('New event created');
  closeNewEvent();
  event.currentTarget.reset();
  render();
}

function render(){
  if(!events.length){ selectedId=''; }
  if(!current() && events.length){ selectedId = events[0].id; }
  renderMetrics();
  renderEventList();
  renderEditor();
  renderTab();
}

function renderMetrics(){
  const quoted = events.reduce((sum,event)=>sum+quoteTotal(event),0);
  const paid = events.reduce((sum,event)=>sum+num(event.payment.amountPaid),0);
  const cost = events.reduce((sum,event)=>sum+quoteCost(event),0);
  const openTasks = events.flatMap(event=>event.tasks).filter(task=>task.status !== 'Complete').length;
  const complianceGaps = events.flatMap(event=>event.compliance).filter(item=>['Needed','Pending'].includes(item.status)).length;
  const booked = events.filter(event=>['Booked','Pre-Production','Event Day','Completed','Closed Won'].includes(event.status)).length;
  const metrics = [['Quoted Revenue',money(quoted)],['Collected',money(paid)],['Outstanding',money(quoted-paid)],['Est. Profit',money(quoted-cost)],['Open Tasks',openTasks],['Compliance Gaps',complianceGaps],['Booked Events',booked],['Avg Event Value',money(events.length ? quoted/events.length : 0)]];
  $('#metricsGrid').innerHTML = metrics.map(metric => `<div class="metric"><span>${metric[0]}</span><strong>${metric[1]}</strong></div>`).join('');
}

function filteredEvents(){
  const q = $('#searchInput').value.trim().toLowerCase();
  const status = $('#statusFilter').value;
  return events.filter(event => {
    const haystack = [event.eventName,event.company,event.city,event.state,event.venue,event.leadSource,event.status].join(' ').toLowerCase();
    const matchesSearch = !q || haystack.includes(q);
    const matchesStatus = status === 'All' || event.status === status;
    return matchesSearch && matchesStatus;
  });
}

function renderEventList(){
  const list = filteredEvents();
  $('#eventList').innerHTML = list.map(event => `
    <button class="event-card ${event.id===selectedId?'active':''}" data-select-event="${event.id}">
      <div class="event-top">
        <div><h3>${escapeHtml(event.eventName)}</h3><p>${escapeHtml(event.company)}<br>${escapeHtml(event.city)}, ${escapeHtml(event.state)}</p></div>
        <span class="badge ${['Quote Needed','Proposal Sent','Invoice Sent','Booked','Pre-Production'].includes(event.status)?'hot':''}">${escapeHtml(event.status)}</span>
      </div>
      <div class="mini-grid"><span>${escapeHtml(event.eventDate || 'No date')}</span><span>${num(event.guestCount)} guests</span><span>${money(quoteTotal(event))}</span></div>
      <p><strong>Next:</strong> ${escapeHtml(event.nextAction || 'No next action set')}</p>
    </button>
  `).join('') || '<p class="muted">No matching events.</p>';
  all('[data-select-event]').forEach(button => button.addEventListener('click', () => { selectedId = button.dataset.selectEvent; render(); }));
}

function renderEditor(){
  const event = current();
  if(!event){ $('#eventEditorPanel').innerHTML = '<h2>No event selected</h2>'; return; }
  $('#eventEditorPanel').innerHTML = `
    <div class="panel-head">
      <div><p class="eyebrow small">Full Event Editor</p><h2>${escapeHtml(event.eventName)}</h2></div>
      <span class="badge hot">${escapeHtml(event.status)}</span>
    </div>
    <div class="form-grid three-col">
      ${input('eventName','Event Name',event.eventName)}
      ${input('company','Company / Client',event.company)}
      ${input('eventType','Event Type',event.eventType)}
      ${input('contactName','Contact Name',event.contactName)}
      ${input('contactEmail','Contact Email',event.contactEmail,'email')}
      ${input('contactPhone','Contact Phone',event.contactPhone)}
      ${input('eventDate','Event Date',event.eventDate,'date')}
      ${input('startTime','Start Time',event.startTime)}
      ${input('endTime','End Time',event.endTime)}
      ${input('city','City',event.city)}
      ${input('state','State',event.state)}
      ${input('venue','Venue',event.venue)}
      ${input('guestCount','Guest Count',event.guestCount,'number')}
      ${input('studentCount','Student Count',event.studentCount,'number')}
      ${input('skillLevel','Skill Level',event.skillLevel)}
      ${input('leadSource','Lead Source',event.leadSource)}
      ${input('probabilityToClose','Close Probability %',event.probabilityToClose,'number')}
      ${input('nextActionDue','Next Action Due',event.nextActionDue,'date')}
      <label>Status<select class="input" data-field="status">${statuses.map(status => `<option ${event.status===status?'selected':''}>${status}</option>`).join('')}</select></label>
      <label>Payment Status<select class="input" data-payment-field="status">${['Not Invoiced','Invoice Sent','Payment Initiated','Deposit Paid','Paid In Full','Overdue'].map(status => `<option ${event.payment.status===status?'selected':''}>${status}</option>`).join('')}</select></label>
      ${paymentInput('amountPaid','Amount Paid',event.payment.amountPaid,'number')}
      ${paymentInput('depositRequired','Deposit Required',event.payment.depositRequired,'number')}
      ${paymentInput('balanceDueDate','Balance Due Date',event.payment.balanceDueDate,'date')}
    </div>
    <div class="form-grid two-col" style="margin-top:12px">
      ${textarea('eventGoal','Event Goal',event.eventGoal)}
      ${textarea('eventFormat','Event Format',event.eventFormat)}
      ${textarea('clientExpectations','Client Expectations',event.clientExpectations)}
      ${textarea('knownRisks','Known Risks / Red Flags',event.knownRisks)}
      ${textarea('nextAction','Next Action',event.nextAction)}
    </div>
    <div class="editor-actions">
      <button class="btn danger" id="deleteEventBtn">Delete Event</button>
      <div class="actions"><button class="btn" id="duplicateEventBtn">Duplicate Event</button><button class="btn primary" id="saveEditorBtn">Save Event Details</button></div>
    </div>
  `;
  all('[data-field]').forEach(field => field.addEventListener('change', () => updateField(field.dataset.field, field.value)));
  all('[data-payment-field]').forEach(field => field.addEventListener('change', () => updatePaymentField(field.dataset.paymentField, field.value)));
  $('#saveEditorBtn').addEventListener('click', () => { saveEvents('Event details saved'); render(); });
  $('#deleteEventBtn').addEventListener('click', deleteSelectedEvent);
  $('#duplicateEventBtn').addEventListener('click', duplicateSelectedEvent);
}

function input(field,label,value,type='text'){ return `<label>${label}<input class="input" type="${type}" value="${escapeHtml(value)}" data-field="${field}" /></label>`; }
function paymentInput(field,label,value,type='text'){ return `<label>${label}<input class="input" type="${type}" value="${escapeHtml(value)}" data-payment-field="${field}" /></label>`; }
function textarea(field,label,value){ return `<label>${label}<textarea class="input" data-field="${field}">${escapeHtml(value)}</textarea></label>`; }
function updateField(field,value){
  const event = current(); if(!event) return;
  if(['guestCount','studentCount','probabilityToClose'].includes(field)) event[field] = num(value); else event[field] = value;
  saveEvents('Saved');
  renderMetrics(); renderEventList(); renderTab();
}
function updatePaymentField(field,value){
  const event = current(); if(!event) return;
  if(['amountPaid','depositRequired'].includes(field)) event.payment[field] = num(value); else event.payment[field] = value;
  saveEvents('Payment saved');
  renderMetrics(); renderEventList(); renderTab();
}
function deleteSelectedEvent(){
  const event = current(); if(!event) return;
  if(!confirm(`Delete ${event.eventName}? This only removes it from localStorage/browser data.`)) return;
  events = events.filter(item => item.id !== event.id);
  selectedId = events[0]?.id || '';
  saveEvents('Event deleted');
  render();
}
function duplicateSelectedEvent(){
  const event = current(); if(!event) return;
  const copy = JSON.parse(JSON.stringify(event));
  copy.id = id(); copy.eventName = `${event.eventName} Copy`; copy.status = 'New Lead';
  copy.quote = copy.quote.map(item => ({...item,id:id()})); copy.tasks = copy.tasks.map(item => ({...item,id:id()})); copy.staff = copy.staff.map(item => ({...item,id:id()})); copy.compliance = copy.compliance.map(item => ({...item,id:id()}));
  events.unshift(copy); selectedId = copy.id; saveEvents('Event duplicated'); render();
}

function renderTab(){
  all('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === activeTab));
  const event = current(); if(!event){ $('#tabContent').innerHTML = ''; return; }
  const renderers = {quote:renderQuoteTab,tasks:renderTasksTab,staff:renderStaffTab,compliance:renderComplianceTab,post:renderPostTab,reports:renderReportsTab,roadmap:renderRoadmapTab};
  renderers[activeTab](event);
}

function renderQuoteTab(event){
  $('#tabContent').innerHTML = `
    <div class="panel-head"><div><p class="eyebrow small">Editable Quote Builder</p><h2>Quote Line Items</h2></div><button class="btn primary small" id="addQuoteBtn">+ Add Line Item</button></div>
    <div class="summary-strip"><div class="info"><span class="label">Quote Total</span><strong>${money(quoteTotal(event))}</strong></div><div class="info"><span class="label">Internal Cost</span><strong>${money(quoteCost(event))}</strong></div><div class="info"><span class="label">Est. Profit</span><strong>${money(quoteTotal(event)-quoteCost(event))}</strong></div><div class="info"><span class="label">Balance</span><strong>${money(balance(event))}</strong></div></div>
    <div class="table-like">${event.quote.map(item => quoteRow(item)).join('') || '<p class="muted">No quote line items yet.</p>'}</div>
  `;
  $('#addQuoteBtn').addEventListener('click', () => { event.quote.push({id:id(),category:'Training',name:'New line item',quantity:1,unitPrice:0,internalCost:0}); saveEvents('Quote line item added'); render(); });
  bindCollectionFields('quote');
}
function quoteRow(item){ return `<div class="row"><label>Category<input class="input" data-collection="quote" data-id="${item.id}" data-key="category" value="${escapeHtml(item.category)}" /></label><label>Name<input class="input" data-collection="quote" data-id="${item.id}" data-key="name" value="${escapeHtml(item.name)}" /></label><label>Qty<input class="input" type="number" data-collection="quote" data-id="${item.id}" data-key="quantity" value="${item.quantity}" /></label><label>Client Price<input class="input" type="number" data-collection="quote" data-id="${item.id}" data-key="unitPrice" value="${item.unitPrice}" /></label><label>Cost<input class="input" type="number" data-collection="quote" data-id="${item.id}" data-key="internalCost" value="${item.internalCost}" /></label><button class="btn danger small" data-remove="quote" data-id="${item.id}">Remove</button></div>`; }

function renderTasksTab(event){
  $('#tabContent').innerHTML = `<div class="panel-head"><div><p class="eyebrow small">Task Manager</p><h2>Open / Completed Tasks</h2></div><button class="btn primary small" id="addTaskBtn">+ Add Task</button></div><div class="table-like">${event.tasks.map(taskRow).join('') || '<p class="muted">No tasks yet.</p>'}</div>`;
  $('#addTaskBtn').addEventListener('click', () => { event.tasks.push({id:id(),title:'New task',owner:'Matt',dueDate:'',priority:'Medium',status:'Open'}); saveEvents('Task added'); render(); });
  bindCollectionFields('tasks');
}
function taskRow(item){ return `<div class="row task"><label>Task<input class="input" data-collection="tasks" data-id="${item.id}" data-key="title" value="${escapeHtml(item.title)}" /></label><label>Owner<input class="input" data-collection="tasks" data-id="${item.id}" data-key="owner" value="${escapeHtml(item.owner)}" /></label><label>Due<input class="input" type="date" data-collection="tasks" data-id="${item.id}" data-key="dueDate" value="${escapeHtml(item.dueDate)}" /></label><label>Status<select class="input" data-collection="tasks" data-id="${item.id}" data-key="status">${['Open','In Progress','Complete','Blocked'].map(s=>`<option ${item.status===s?'selected':''}>${s}</option>`).join('')}</select></label><button class="btn danger small" data-remove="tasks" data-id="${item.id}">Remove</button></div>`; }

function renderStaffTab(event){
  $('#tabContent').innerHTML = `<div class="panel-head"><div><p class="eyebrow small">Staffing Tracker</p><h2>Pros, Dealers, MCs, TDs</h2></div><button class="btn primary small" id="addStaffBtn">+ Add Staff</button></div><div class="table-like">${event.staff.map(staffRow).join('') || '<p class="muted">No staff assigned yet.</p>'}</div>`;
  $('#addStaffBtn').addEventListener('click', () => { event.staff.push({id:id(),name:'Staff TBD',role:'Poker Instructor',confirmed:false,arrivalTime:'',rate:0}); saveEvents('Staff added'); render(); });
  bindCollectionFields('staff');
}
function staffRow(item){ return `<div class="row staff"><label>Name<input class="input" data-collection="staff" data-id="${item.id}" data-key="name" value="${escapeHtml(item.name)}" /></label><label>Role<input class="input" data-collection="staff" data-id="${item.id}" data-key="role" value="${escapeHtml(item.role)}" /></label><label>Confirmed<select class="input" data-collection="staff" data-id="${item.id}" data-key="confirmed"><option value="false" ${!item.confirmed?'selected':''}>No</option><option value="true" ${item.confirmed?'selected':''}>Yes</option></select></label><label>Arrival<input class="input" data-collection="staff" data-id="${item.id}" data-key="arrivalTime" value="${escapeHtml(item.arrivalTime)}" /></label><button class="btn danger small" data-remove="staff" data-id="${item.id}">Remove</button></div>`; }

function renderComplianceTab(event){
  $('#tabContent').innerHTML = `<div class="panel-head"><div><p class="eyebrow small">Venue / Vendor / Legal</p><h2>Compliance Checklist</h2></div><button class="btn primary small" id="addComplianceBtn">+ Add Item</button></div><div class="table-like">${event.compliance.map(complianceRow).join('') || '<p class="muted">No compliance items yet.</p>'}</div>`;
  $('#addComplianceBtn').addEventListener('click', () => { event.compliance.push({id:id(),name:'New compliance item',status:'Pending',dueDate:''}); saveEvents('Compliance item added'); render(); });
  bindCollectionFields('compliance');
}
function complianceRow(item){ return `<div class="row compliance"><label>Item<input class="input" data-collection="compliance" data-id="${item.id}" data-key="name" value="${escapeHtml(item.name)}" /></label><label>Status<select class="input" data-collection="compliance" data-id="${item.id}" data-key="status">${['Not Needed','Needed','Pending','Complete'].map(s=>`<option ${item.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Due<input class="input" type="date" data-collection="compliance" data-id="${item.id}" data-key="dueDate" value="${escapeHtml(item.dueDate)}" /></label><button class="btn danger small" data-remove="compliance" data-id="${item.id}">Remove</button></div>`; }

function renderPostTab(event){
  $('#tabContent').innerHTML = `<div class="panel-head"><div><p class="eyebrow small">After Action Review</p><h2>Post-Event Tracker</h2></div><button class="btn primary small" id="savePostBtn">Save Post-Event Notes</button></div><div class="form-grid two-col"><label>Client Feedback<textarea class="input" data-post="clientFeedback">${escapeHtml(event.postEvent.clientFeedback)}</textarea></label><label>What Went Well<textarea class="input" data-post="whatWentWell">${escapeHtml(event.postEvent.whatWentWell)}</textarea></label><label>Pain Points<textarea class="input" data-post="painPoints">${escapeHtml(event.postEvent.painPoints)}</textarea></label><label>Changes Next Time<textarea class="input" data-post="changesForNextTime">${escapeHtml(event.postEvent.changesForNextTime)}</textarea></label><label>Review Requested<select class="input" data-post="reviewRequested"><option value="false" ${!event.postEvent.reviewRequested?'selected':''}>No</option><option value="true" ${event.postEvent.reviewRequested?'selected':''}>Yes</option></select></label><label>Review Received<select class="input" data-post="reviewReceived"><option value="false" ${!event.postEvent.reviewReceived?'selected':''}>No</option><option value="true" ${event.postEvent.reviewReceived?'selected':''}>Yes</option></select></label><label>Rebooking Likelihood<select class="input" data-post="rebookingLikelihood">${['Low','Medium','High'].map(s=>`<option ${event.postEvent.rebookingLikelihood===s?'selected':''}>${s}</option>`).join('')}</select></label></div>`;
  all('[data-post]').forEach(field => field.addEventListener('change', () => { const key = field.dataset.post; event.postEvent[key] = ['reviewRequested','reviewReceived'].includes(key) ? field.value === 'true' : field.value; saveEvents('Post-event note saved'); renderTab(); }));
  $('#savePostBtn').addEventListener('click', () => saveEvents('Post-event notes saved'));
}

function renderReportsTab(event){
  $('#tabContent').innerHTML = `<div class="panel-head"><div><p class="eyebrow small">Partner Reports</p><h2>Before, After, and 2026 Summary</h2></div><select class="input" id="reportSelect" style="max-width:230px"><option value="pre">Pre-Event Report</option><option value="post">Post-Event Report</option><option value="year">Overall 2026 Report</option></select></div><textarea class="input report-box" id="reportBox" readonly></textarea><div class="actions" style="margin-top:12px"><button class="btn primary" id="copyReportBtn">Copy Report</button><button class="btn" onclick="window.print()">Print / Save PDF</button></div>`;
  const select = $('#reportSelect');
  const box = $('#reportBox');
  const refresh = () => { box.value = generateReport(event, select.value); };
  select.addEventListener('change', refresh);
  $('#copyReportBtn').addEventListener('click', () => navigator.clipboard.writeText(box.value).then(()=>toast('Report copied')));
  refresh();
}

function renderRoadmapTab(){
  $('#tabContent').innerHTML = `<div class="panel-head"><div><p class="eyebrow small">Future Database Upgrade</p><h2>Supabase Login + Database Roadmap</h2></div><span class="badge green">Ready Later</span></div><div class="roadmap-list"><div class="roadmap-item"><h3>Phase 1: LocalStorage MVP</h3><p>Current version. Fast, private to the browser, exportable, and useful for shaping the exact workflow before paying database complexity costs.</p></div><div class="roadmap-item"><h3>Phase 2: Supabase Auth</h3><p>Add login roles: Admin, Event Manager, Staff/Pro, and Finance. Restrict partner/finance/client data by role.</p></div><div class="roadmap-item"><h3>Phase 3: PostgreSQL Tables</h3><p>Move events, contacts, quotes, tasks, staff, compliance, payments, and post-event reports into normalized Supabase tables.</p></div><div class="roadmap-item"><h3>Phase 4: Integrations</h3><p>Connect Gmail threads, Google Calendar events, Stripe invoices, GoHighLevel lead forms, and partner report email drafts.</p></div></div>`;
}

function bindCollectionFields(collection){
  all(`[data-collection="${collection}"]`).forEach(field => field.addEventListener('change', () => {
    const event = current(); const item = event[collection].find(row => row.id === field.dataset.id); if(!item) return;
    let value = field.value;
    if(['quantity','unitPrice','internalCost','rate'].includes(field.dataset.key)) value = num(value);
    if(field.dataset.key === 'confirmed') value = field.value === 'true';
    item[field.dataset.key] = value;
    saveEvents('Saved'); render();
  }));
  all(`[data-remove="${collection}"]`).forEach(button => button.addEventListener('click', () => {
    const event = current(); event[collection] = event[collection].filter(row => row.id !== button.dataset.id); saveEvents('Removed'); render();
  }));
}

function generateReport(event,type){
  const total = quoteTotal(event), cost = quoteCost(event), profit = total - cost;
  if(type === 'year'){
    const quoted = events.reduce((sum,e)=>sum+quoteTotal(e),0), paid = events.reduce((sum,e)=>sum+num(e.payment.amountPaid),0), costs = events.reduce((sum,e)=>sum+quoteCost(e),0);
    return `LVPT 2026 PARTNER REPORT\n\nTotal Event Records: ${events.length}\nQuoted Revenue: ${money(quoted)}\nCollected Revenue: ${money(paid)}\nOutstanding Balance: ${money(quoted-paid)}\nEstimated Profit: ${money(quoted-costs)}\nAverage Event Value: ${money(events.length ? quoted/events.length : 0)}\n\nPipeline Snapshot:\n${events.map(e=>`- ${e.eventName}: ${e.status} | ${money(quoteTotal(e))} | Next: ${e.nextAction}`).join('\n')}\n\nOperational Recommendations:\n- Keep follow-ups assigned immediately after every proposal.\n- Lock staffing earlier for repeat/high-headcount corporate events.\n- Start COI, venue forms, business license, and vendor paperwork 30-45 days before event day.\n- Use post-event reports to create Google reviews, testimonials, referrals, and rebooking conversations.`;
  }
  if(type === 'post'){
    return `LVPT POST-EVENT PARTNER REPORT\n\nEvent: ${event.eventName}\nClient/Company: ${event.company}\nDate: ${event.eventDate}\nLocation: ${event.venue}, ${event.city}, ${event.state}\nFinal / Expected Attendance: ${event.guestCount}\nRevenue: ${money(total)}\nEstimated Cost: ${money(cost)}\nEstimated Profit: ${money(profit)}\nPayment Status: ${event.payment.status}\nBalance Due: ${money(balance(event))}\n\nClient Feedback:\n${event.postEvent.clientFeedback || 'Not entered yet.'}\n\nWhat Went Well:\n${event.postEvent.whatWentWell || 'Not entered yet.'}\n\nPain Points:\n${event.postEvent.painPoints || 'Not entered yet.'}\n\nChanges For Next Time:\n${event.postEvent.changesForNextTime || 'Not entered yet.'}\n\nReview Requested: ${event.postEvent.reviewRequested ? 'Yes' : 'No'}\nReview Received: ${event.postEvent.reviewReceived ? 'Yes' : 'No'}\nRebooking Likelihood: ${event.postEvent.rebookingLikelihood}\n\nNext Recommended Action:\n${event.nextAction}`;
  }
  return `LVPT PRE-EVENT PARTNER REPORT\n\nEvent: ${event.eventName}\nClient/Company: ${event.company}\nPrimary Contact: ${event.contactName} | ${event.contactEmail} | ${event.contactPhone}\nDate/Time: ${event.eventDate}, ${event.startTime} - ${event.endTime}\nLocation: ${event.venue}, ${event.city}, ${event.state}\nEvent Type: ${event.eventType}\nFormat: ${event.eventFormat}\nGuest Count: ${event.guestCount}\nStudent Count: ${event.studentCount}\nPipeline Status: ${event.status}\nClose Probability: ${event.probabilityToClose}%\n\nFinancial Summary:\nQuote Total: ${money(total)}\nAmount Paid: ${money(event.payment.amountPaid)}\nBalance Due: ${money(balance(event))}\nEstimated Cost: ${money(cost)}\nEstimated Profit: ${money(profit)}\nDeposit Required: ${money(event.payment.depositRequired)}\nPayment Status: ${event.payment.status}\n\nClient Expectations:\n${event.clientExpectations}\n\nKnown Risks:\n${event.knownRisks}\n\nStaffing Plan:\n${event.staff.map(s=>`- ${s.name} | ${s.role} | Confirmed: ${s.confirmed ? 'Yes' : 'No'} | Arrival: ${s.arrivalTime}`).join('\n') || 'No staff assigned yet.'}\n\nCompliance Status:\n${event.compliance.map(c=>`- ${c.name}: ${c.status} | Due: ${c.dueDate || 'N/A'}`).join('\n') || 'No compliance items yet.'}\n\nOpen Tasks:\n${event.tasks.filter(t=>t.status !== 'Complete').map(t=>`- ${t.title} | Owner: ${t.owner} | Due: ${t.dueDate || 'N/A'} | Priority: ${t.priority}`).join('\n') || 'No open tasks.'}\n\nNext Action:\n${event.nextAction}\nDue: ${event.nextActionDue || 'Not set'}`;
}

function exportJson(){ download('lvpt-2026-events-v2-export.json', JSON.stringify(events,null,2), 'application/json'); }
function exportCsv(){
  const rows = [['Event','Company','Date','City','State','Status','Lead Source','Guests','Quote Total','Paid','Balance Due','Next Action'], ...events.map(event => [event.eventName,event.company,event.eventDate,event.city,event.state,event.status,event.leadSource,event.guestCount,quoteTotal(event),event.payment.amountPaid,balance(event),event.nextAction])];
  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n');
  download('lvpt-2026-events-v2-export.csv', csv, 'text/csv');
}
function download(name,content,type){ const blob = new Blob([content],{type}); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
function resetDemoData(){ if(!confirm('Reset all browser-saved V2 data back to demo seed data?')) return; events = JSON.parse(JSON.stringify(seedEvents)); selectedId = events[0].id; saveEvents('Demo data reset'); render(); }

init();
