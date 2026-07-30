function init(){
  statuses.forEach(status=>$('#statusFilter').insertAdjacentHTML('beforeend',`<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`));
  $('#newEventTopBtn').addEventListener('click',()=>openWizard());
  $('#newEventSideBtn').addEventListener('click',()=>openWizard());
  $('#closeWizardBtn').addEventListener('click',closeWizard);
  $('#wizardBackBtn').addEventListener('click',()=>setWizardStep(wizardStep-1));
  $('#wizardNextBtn').addEventListener('click',nextWizardStep);
  $('#eventWizardForm').addEventListener('submit',submitWizard);
  $('#searchInput').addEventListener('input',render);
  $('#statusFilter').addEventListener('change',render);
  $('#exportCsvBtn').addEventListener('click',exportCsv);
  $('#exportJsonBtn').addEventListener('click',exportJson);
  $('#resetDataBtn').addEventListener('click',resetDemoData);
  $('#documentFileInput').addEventListener('change',event=>handleDocumentFiles(event.target.files));
  all('.tab').forEach(tab=>tab.addEventListener('click',()=>{ activeTab=tab.dataset.tab; render(); }));
  checkGmailStatus(false);
  render();
  maybeNotifyDueItems();
}

function openWizard(eventId=''){
  wizardEditingId=eventId;
  wizardStep=0;
  const form=$('#eventWizardForm'); form.reset();
  const event=events.find(item=>item.id===eventId);
  $('#wizardTitle').textContent=event?'Update Guided Event Setup':'Create Complete Event Record';
  if(event) fillWizard(event); else { form.elements.namedItem('city').value='Las Vegas'; form.elements.namedItem('state').value='NV'; form.elements.namedItem('internalOwner').value='Matt'; form.elements.namedItem('nextAction').value='Complete discovery, prepare quote, and confirm missing logistics.'; }
  setWizardStep(0);
  $('#eventWizardDialog').showModal();
}
function closeWizard(){ $('#eventWizardDialog').close(); wizardEditingId=''; }
function fillWizard(event){
  const form=$('#eventWizardForm');
  const values={eventName:event.eventName,company:event.company,contactName:event.contactName,contactEmail:event.contactEmail,contactPhone:event.contactPhone,eventDate:event.eventDate,startTime:event.startTime,endTime:event.endTime,city:event.city,state:event.state,venue:event.venue,eventType:event.eventType,guestCount:event.guestCount,studentCount:event.studentCount,skillLevel:event.skillLevel,leadSource:event.leadSource,eventGoal:event.eventGoal,clientExpectations:event.clientExpectations,knownRisks:event.knownRisks,nextAction:event.nextAction,nextActionDue:event.nextActionDue,...event.setup};
  Object.entries(values).forEach(([key,value])=>{ const control=form.elements.namedItem(key); if(control) control.value=value??''; });
}
function setWizardStep(step){
  wizardStep=Math.max(0,Math.min(wizardLabels.length-1,step));
  all('.wizard-step').forEach(section=>section.hidden=Number(section.dataset.step)!==wizardStep);
  $('#wizardProgress').innerHTML=wizardLabels.map((label,index)=>`<button type="button" data-go-step="${index}" class="${index===wizardStep?'active':index<wizardStep?'complete':''}">${index+1}. ${label}</button>`).join('');
  all('[data-go-step]').forEach(button=>button.addEventListener('click',()=>{ if(Number(button.dataset.goStep)<=wizardStep) setWizardStep(Number(button.dataset.goStep)); }));
  $('#wizardBackBtn').hidden=wizardStep===0;
  $('#wizardNextBtn').hidden=wizardStep===wizardLabels.length-1;
  $('#wizardSubmitBtn').hidden=wizardStep!==wizardLabels.length-1;
  if(wizardStep===wizardLabels.length-1) renderWizardReview();
}
function visibleRequiredValid(){ const required=all(`.wizard-step[data-step="${wizardStep}"] [required]`); for(const field of required){ if(!field.value.trim()){ field.focus(); field.reportValidity(); return false; } } return true; }
function nextWizardStep(){ if(!visibleRequiredValid()) return; setWizardStep(wizardStep+1); }
function renderWizardReview(){
  const data=new FormData($('#eventWizardForm'));
  $('#wizardReview').innerHTML=`<h3>Setup Summary</h3><div class="review-grid"><div><span>Client</span><strong>${escapeHtml(data.get('company')||'Missing')}</strong></div><div><span>Date</span><strong>${escapeHtml(data.get('eventDate')||'TBD')}</strong></div><div><span>Venue</span><strong>${escapeHtml(data.get('venue')||'TBD')}</strong></div><div><span>Guests</span><strong>${escapeHtml(data.get('guestCount')||'0')}</strong></div><div><span>Staff Plan</span><strong>${escapeHtml(data.get('proCount')||'0')} pros / ${escapeHtml(data.get('dealerCount')||'0')} dealers</strong></div><div><span>Target</span><strong>${money(data.get('targetQuote'))}</strong></div></div>`;
}
function statusFromStage(stage){ return ({'Booked':'Booked','Verbal Approval':'Proposal Sent','Proposal Requested':'Quote Needed','Ready for Custom Quote':'Quote Needed','Needs Discovery':'Needs Discovery','Exploring Options':'New Lead'})[stage]||'New Lead'; }
function probabilityFromStage(stage){ return ({'Booked':100,'Verbal Approval':85,'Proposal Requested':65,'Ready for Custom Quote':60,'Needs Discovery':40,'Exploring Options':20})[stage]||25; }
function submitWizard(event){
  event.preventDefault(); if(!visibleRequiredValid()) return;
  const data=new FormData(event.currentTarget); const get=name=>String(data.get(name)||'').trim();
  const setupKeys=['invoiceEmail','planningStage','budgetRange','poRequired','poNumber','stakeholders','timeZone','venueStatus','venueContact','venueEmail','setupTime','strikeTime','parkingInstructions','travelNeeds','primaryGoal','experienceDuration','trainingFormat','gameFormat','competitionLevel','foodPlan','addOns','tableCount','dealerCount','proCount','leadProNeeded','tdNeeded','avNeeded','equipmentSource','brandingRequired','shippingRequired','powerInternet','dressCode','accessibilityNeeds','layoutNotes','productionNotes','targetQuote','depositPercent','finalPaymentTiming','taxStatus','coiRequired','w9Required','vendorRegistration','licenseRequired','contractRequired','paymentNotes','complianceNotes','internalOwner','reminderCadence','gmailKeywords','autoEmailMatch','communicationNotes','miscNotes'];
  const setup={}; setupKeys.forEach(key=>setup[key]=['tableCount','dealerCount','proCount','targetQuote','depositPercent'].includes(key)?num(get(key)):get(key));
  const base={eventName:get('eventName')||'New LVPT Event',company:get('company')||'New Client',contactName:get('contactName'),contactEmail:get('contactEmail'),contactPhone:get('contactPhone'),eventType:get('eventType'),status:statusFromStage(setup.planningStage),eventDate:get('eventDate'),startTime:get('startTime'),endTime:get('endTime'),city:get('city'),state:get('state'),venue:get('venue')||'TBD',guestCount:num(get('guestCount')),studentCount:num(get('studentCount')),skillLevel:get('skillLevel'),leadSource:get('leadSource'),probabilityToClose:probabilityFromStage(setup.planningStage),eventGoal:get('eventGoal'),eventFormat:[setup.trainingFormat,setup.gameFormat,setup.experienceDuration].filter(Boolean).join(' · '),clientExpectations:get('clientExpectations'),knownRisks:get('knownRisks'),nextAction:get('nextAction'),nextActionDue:get('nextActionDue'),setup};
  let record=events.find(item=>item.id===wizardEditingId);
  if(record){ Object.assign(record,base); ensureEventShape(record); addGeneratedTasks(record,false); addGeneratedCompliance(record,false); addGeneratedStaff(record,false); saveEvents('Guided setup updated'); }
  else {
    record=ensureEventShape({id:id(),...base,quote:[],payment:{amountPaid:0,depositRequired:Math.round(setup.targetQuote*(setup.depositPercent/100)),status:'Not Invoiced',balanceDueDate:paymentDueDate(base.eventDate,setup.finalPaymentTiming)},staff:[],compliance:[],tasks:[],documents:[],emailActivity:[],postEvent:{}});
    if(setup.targetQuote>0) record.quote.push({id:id(),category:'Planning',name:'Target event budget placeholder',quantity:1,unitPrice:setup.targetQuote,internalCost:0});
    addGeneratedTasks(record,true); addGeneratedCompliance(record,true); addGeneratedStaff(record,true);
    events.unshift(record); selectedId=record.id; saveEvents('Event created with tasks and checklists');
  }
  closeWizard(); activeTab='setup'; render();
}
function paymentDueDate(eventDate,timing){ const map={'10 Days Before Event':-10,'14 Days Before Event':-14,'30 Days Before Event':-30,'Day of Event':0}; return map[timing]!==undefined?shiftDate(eventDate,map[timing]):''; }
function addUnique(collection,item,matchKey='title'){ if(!collection.some(existing=>String(existing[matchKey]).toLowerCase()===String(item[matchKey]).toLowerCase())) collection.push(item); }
function addGeneratedTasks(event,isNew){
  const owner=event.setup.internalOwner||'Matt'; const date=event.eventDate;
  const generated=[
    ['Complete discovery and confirm missing event details',event.nextActionDue||shiftDate(date,-75),'High'],
    ['Finalize quote and proposal scope',shiftDate(date,-60),'Critical'],
    ['Send invoice / confirm PO and procurement requirements',shiftDate(date,-50),'High'],
    ['Complete venue forms, COI, W-9 and vendor registration',shiftDate(date,-45),'High'],
    ['Lock lead pro, instructors, dealers and tournament staff',shiftDate(date,-30),'Critical'],
    ['Confirm equipment, branding, shipping and floor plan',shiftDate(date,-21),'High'],
    ['Confirm final guest count, agenda and venue access',shiftDate(date,-14),'High'],
    ['Collect final payment and send final client confirmation',paymentDueDate(date,event.setup.finalPaymentTiming)||shiftDate(date,-10),'Critical'],
    ['Send staff call sheet, parking and arrival instructions',shiftDate(date,-3),'High'],
    ['Complete post-event thank-you, review and rebooking follow-up',shiftDate(date,1),'Medium']
  ];
  generated.forEach(([title,dueDate,priority])=>addUnique(event.tasks,{id:id(),title,owner,dueDate,priority,status:'Open'}));
  if(isNew && event.nextAction && !event.tasks.some(task=>task.title===event.nextAction)) event.tasks.unshift({id:id(),title:event.nextAction,owner,dueDate:event.nextActionDue,priority:'High',status:'Open'});
}
function addGeneratedCompliance(event){
  const date=event.eventDate; const items=[['Certificate of Insurance',event.setup.coiRequired],['W-9',event.setup.w9Required],['Vendor registration / procurement portal',event.setup.vendorRegistration],['Gaming / local business license review',event.setup.licenseRequired],['Client contract / service agreement',event.setup.contractRequired]];
  items.forEach(([name,required])=>{ if(required==='no') return; addUnique(event.compliance,{id:id(),name,status:required==='yes'?'Needed':'Pending',dueDate:shiftDate(date,-45)},'name'); });
}
function addGeneratedStaff(event){
  if(event.setup.leadProNeeded!=='no') addUnique(event.staff,{id:id(),name:'Lead Pro TBD',role:'Lead Pro / MC',confirmed:false,arrivalTime:event.setup.setupTime||'',rate:0},'role');
  if(num(event.setup.proCount)>0) addUnique(event.staff,{id:id(),name:`Instructor Team (${event.setup.proCount}) TBD`,role:'Poker Instructors',confirmed:false,arrivalTime:event.setup.setupTime||'',rate:0},'role');
  if(num(event.setup.dealerCount)>0) addUnique(event.staff,{id:id(),name:`Dealer Team (${event.setup.dealerCount}) TBD`,role:'Dealers',confirmed:false,arrivalTime:event.setup.setupTime||'',rate:0},'role');
  if(event.setup.tdNeeded==='yes') addUnique(event.staff,{id:id(),name:'Tournament Director TBD',role:'Tournament Director',confirmed:false,arrivalTime:event.setup.setupTime||'',rate:0},'role');
}

