// Desktop work-order UI. The API remains the source of truth for recurrence and reminders.
function workOrderUnit(unit, amount){return ({days:amount===1?'Tag':'Tage',weeks:amount===1?'Woche':'Wochen',months:amount===1?'Monat':'Monate'})[unit]||unit;}
function workItemKind(ticket){return ticket?.planningKind||(ticket?.recurrence?'inspection':'work_order');}
function workItemLabel(ticket){return workItemKind(ticket)==='inspection'?'Inspektion / Kontrollticket':'Arbeitsauftrag';}
function workOrderInterval(r){return r?`Alle ${r.every} ${workOrderUnit(r.unit,r.every)}`:'Einmaliger Arbeitsauftrag';}
function workOrderAssignments(ticket){return (state.taskAssignments||[]).filter(a=>a.ticketId===ticket.id);}
function workOrderEmployeeIds(ticket){
  const assigned=workOrderAssignments(ticket);
  return [...new Set(assigned.length?assigned.map(a=>a.employeeId):ticket.assignedEmployeeId?[ticket.assignedEmployeeId]:[])];
}
function workOrderSchedule(ticket){
  const assigned=workOrderAssignments(ticket);
  if(assigned.length)return assigned.map(a=>({employeeId:a.employeeId,date:a.dueDate||ticket.due,assignmentId:a.id}));
  if(ticket.assignedEmployeeId)return [{employeeId:ticket.assignedEmployeeId,date:ticket.due}];
  return workItemKind(ticket)==='inspection'?[]:[{employeeId:'',date:ticket.due}];
}
function workOrderAssignee(ticket){
  return workOrderEmployeeIds(ticket).map(id=>(state.employees||[]).find(e=>e.id===id)?.name||'Unbekannter Mitarbeiter').join(', ')||ticket.resp||'Noch nicht zugeteilt';
}
function workCalendarEntries(start,end,shifts=state.shifts||[]){
  const tickets=(state.tickets||[]).flatMap(t=>workOrderSchedule(t).filter(a=>a.date>=start&&a.date<=end).map(a=>({id:t.id,kind:'ticket',inspection:workItemKind(t)==='inspection',employeeId:a.employeeId,date:a.date,title:t.title||t.type||workItemLabel(t),done:isClosedTicketStatus(t.status)})));
  const services=shifts.filter(s=>s.date>=start&&s.date<=end).map(s=>({id:s.id,kind:'shift',employeeId:s.employeeId,date:s.date,title:s.shiftType==='Krank'?'Abwesend':/ferien/i.test(s.shiftType)?s.shiftType:(s.taskAssignment&&s.taskAssignment!=='-'?s.taskAssignment:s.shiftType||'Dienst'),away:/krank|ferien/i.test(s.shiftType)}));
  return [...tickets,...services].sort((a,b)=>Number(a.done||false)-Number(b.done||false)||a.title.localeCompare(b.title,'de'));
}
function workCalendarEmployees(employees){
  const {start,end}=planningPeriod();
  const entries=workCalendarEntries(start,end);
  const ids=new Set(employees.map(e=>e.id));
  const result=[...employees];
  entries.forEach(entry=>{
    if(ids.has(entry.employeeId))return;
    const emp=(state.employees||[]).find(e=>e.id===entry.employeeId);
    if(emp||!entry.employeeId){result.push(emp||{id:'',name:'Nicht zugeteilt'});ids.add(entry.employeeId);}
  });
  return result;
}
function workLineHtml(entry,showName=false){
  const employee=(state.employees||[]).find(e=>e.id===entry.employeeId);
  const title=(showName?(employee?.name||'Nicht zugeteilt')+' · ':'')+entry.title;
  const action=entry.kind==='ticket'?`openWorkOrder('${escJsArg(entry.id)}')`:`openTeamPlan('${entry.away?'absenzen':'schicht'}','${escJsArg(entry.employeeId)}','${escJsArg(entry.date)}','${escJsArg(entry.id)}')`;
  return `<button class="workLine ${entry.done?'done':''} ${entry.away?'away':''} ${entry.inspection?'inspection':''}" title="${esc(title)}" aria-label="${esc(title)}" onclick="${action}">${entry.done?'✓ ':entry.inspection?'↻ ':''}${esc(title)}</button>`;
}
function workDayCell(entries,employeeId,date,showName=false){
  const remaining=Math.max(0,entries.length-3);
  return entries.slice(0,3).map(e=>workLineHtml(e,showName)).join('')+(remaining?`<button class="workMore" onclick="openWorkDay('${escJsArg(employeeId)}','${escJsArg(date)}',${showName})">+ ${remaining} weitere</button>`:'')+`<button class="workAdd" aria-label="Arbeitsauftrag am ${esc(date)} erstellen" onclick="openNewWorkOrder('${escJsArg(employeeId)}','${escJsArg(date)}')">＋</button>`;
}
function renderWorkCalendar(emps,shifts,view='week'){
  let {start,end}=planningPeriod(currentCalendarDate,view);
  const today=toLocalDateString(getTodayDate());
  const entries=workCalendarEntries(start,end,shifts);
  const employeeIds=new Set(emps.map(e=>e.id));
  const relevant=entries.filter(e=>employeeIds.has(e.employeeId));
  const orders=new Set(relevant.filter(e=>e.kind==='ticket').map(e=>e.id)).size;
  $('planningSummary').textContent=`${orders} Arbeitsaufträge · ${emps.filter(e=>e.id).length} Mitarbeiter`;
  const weekdays=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  let html=`<table class="workCalendar ${view==='month'?'workMonth':'weeklyCalendar'}"><caption>Arbeitsaufträge und Inspektionen. Anklicken für Details.</caption><thead><tr>`;
  if(view==='week'){
    const dates=planningDates(start,end);
    html+='<th scope="col" class="weekEmployee">Mitarbeiter</th>'+dates.map((date,i)=>`<th scope="col" class="${date===today?'calendarToday':''}">${esc(weekdays[i])}<span>${esc(ticketDate(date))}</span></th>`).join('')+'</tr></thead><tbody>';
    emps.forEach(emp=>{
      const count=relevant.filter(e=>e.employeeId===emp.id&&e.kind==='ticket').length;
      html+=`<tr><th scope="row" class="weekEmployee">${esc(emp.name)}${count?`<span>${count} ${count===1?'Auftrag':'Aufträge'}</span>`:''}</th>`;
      dates.forEach((date,i)=>{html+=`<td class="${date===today?'calendarToday':''} ${i>4?'weekend':''}">${workDayCell(relevant.filter(e=>e.employeeId===emp.id&&e.date===date),emp.id,date)}</td>`;});
      html+='</tr>';
    });
  }else{
    html+=weekdays.map(day=>`<th scope="col">${day}</th>`).join('')+'</tr></thead><tbody>';
    const first=planningWeekStart(new Date(start+'T12:00:00'));
    const last=new Date(end+'T12:00:00');last.setDate(last.getDate()+6-(last.getDay()+6)%7);
    const dates=planningDates(toLocalDateString(first),toLocalDateString(last));
    dates.forEach((date,i)=>{
      if(i%7===0)html+='<tr>';
      html+=`<td class="${date===today?'calendarToday':''} ${date<start||date>end?'outsideMonth':''} ${i%7>4?'weekend':''}"><span class="dayNumber">${Number(date.slice(-2))}</span>${workDayCell(relevant.filter(e=>e.date===date),'',date,true)}</td>`;
      if(i%7===6)html+='</tr>';
    });
  }
  return html+'</tbody></table>';
}
function openWorkDay(employeeId,date,all=false){
  closeModals();
  const entries=workCalendarEntries(date,date).filter(e=>all||e.employeeId===employeeId);
  $('workDayTitle').textContent=ticketDate(date)+' · '+(all?'Alle Aufträge':(state.employees||[]).find(e=>e.id===employeeId)?.name||'Nicht zugeteilt');
  $('workDayList').innerHTML=entries.map(e=>workLineHtml(e,all)).join('');
  $('workDayModal').style.display='flex';
}
function openNewWorkOrder(employeeId='',date=''){
  openWorkOrderEditor('',{planningKind:'work_order',employeeId,date:date||toLocalDateString(getTodayDate()),parentId:selected||''});
}
function openNewInspection(assetId=selected){
  const asset=node(assetId);
  if(!asset||!isAssetNode(asset)){alert('Bitte zuerst die Anlage öffnen. Kontrolltickets werden direkt an einer Anlage eingerichtet.');return;}
  openWorkOrderEditor('',{planningKind:'inspection',date:toLocalDateString(getTodayDate()),parentId:asset.id});
  $('ticketTitle').value=asset.name+' kontrollieren';
}
let inspectionQueueExpanded=false;
function unplannedInspections(){
  return (state.tickets||[]).filter(t=>workItemKind(t)==='inspection'&&!isClosedTicketStatus(t.status)&&!workOrderSchedule(t).length).sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999'))||String(a.title).localeCompare(String(b.title),'de'));
}
function renderInspectionQueue(){
  const root=$('inspectionQueue');if(!root)return;
  const tickets=unplannedInspections(),today=toLocalDateString(getTodayDate());
  $('inspectionQueueCount').textContent=tickets.length?String(tickets.length):'';
  root.innerHTML=(inspectionQueueExpanded?tickets:tickets.slice(0,5)).map(t=>{
    const asset=node(t.parent),room=asset?node(asset.parent):null;
    const place=[room?.name,asset?.name].filter(Boolean).join(' · ');
    return `<div class="inspectionQueueRow"><button type="button" class="inspectionQueueTitle" onclick="openWorkOrder('${escJsArg(t.id)}')"><strong>${esc(t.title)}</strong><span title="${esc(path(t.parent))}">${esc(place||path(t.parent))}</span></button><span class="inspectionDue ${t.due&&t.due<today?'late':''}">${t.due&&t.due<today?'Überfällig:':'Fällig:'} ${esc(ticketDate(t.due)||'offen')}</span><button type="button" class="btn small" onclick="openInspectionPlanning('${escJsArg(t.id)}')">Einplanen</button></div>`;
  }).join('')||'<p class="smallText inspectionQueueEmpty">Keine offenen Kontrollen einzuplanen. Neue Kontrolltickets legen Sie direkt an der Anlage an.</p>';
  if(tickets.length>5)root.innerHTML+=`<button type="button" class="btn small secondary" onclick="inspectionQueueExpanded=!inspectionQueueExpanded;renderInspectionQueue()">${inspectionQueueExpanded?'Weniger anzeigen':`Alle ${tickets.length} Kontrollen anzeigen`}</button>`;
}
function openInspectionPlanning(id){
  const ticket=(state.tickets||[]).find(t=>t.id===id);
  if(!ticket||workItemKind(ticket)!=='inspection'||isClosedTicketStatus(ticket.status))return;
  const assignment=workOrderAssignments(ticket)[0];
  const previous=(state.tickets||[]).find(t=>t.id===ticket.previousTicketId);
  closeModals();
  $('inspectionPlanTicket').value=id;
  $('inspectionPlanTitle').textContent=ticket.title;
  $('inspectionPlanDue').textContent=`Fällig am ${ticketDate(ticket.due)} · ${node(ticket.parent)?.name||''}`;
  $('inspectionPlanEmployee').innerHTML='<option value="">Mitarbeiter wählen</option>'+(state.employees||[]).map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  $('inspectionPlanEmployee').value=assignment?.employeeId||ticket.assignedEmployeeId||(previous?workOrderEmployeeIds(previous)[0]:'')||'';
  $('inspectionPlanDate').value=assignment?.dueDate||ticket.due||toLocalDateString(getTodayDate());
  $('inspectionPlanError').textContent='';$('inspectionPlanSave').disabled=false;
  $('inspectionPlanModal').style.display='flex';$('inspectionPlanEmployee').focus();
}
async function saveInspectionPlanning(){
  const button=$('inspectionPlanSave');if(button.disabled)return false;
  const ticket=(state.tickets||[]).find(t=>t.id===$('inspectionPlanTicket').value);
  const employeeId=$('inspectionPlanEmployee').value,date=$('inspectionPlanDate').value;
  const fail=message=>{$('inspectionPlanError').textContent=message;return false;};
  if(!ticket||isClosedTicketStatus(ticket.status))return fail('Diese Kontrolle ist nicht mehr offen.');
  if(!(state.employees||[]).some(e=>e.id===employeeId)||!planningDates(date,date).length)return fail('Bitte Mitarbeiter und einen gültigen Tag wählen.');
  const old=workOrderAssignments(ticket)[0];
  const item={...(old||{}),id:old?.id||'plan-'+ticket.id,ticketId:ticket.id,employeeId,dueDate:date,status:'new',assignedByEmployeeId:storedSessionEmployee()?.id||null,assignedAt:new Date().toISOString(),completedAt:null};
  button.disabled=true;$('inspectionPlanError').textContent='';
  try{
    state=await api('PATCH',{collection:'taskAssignments',item});
    currentCalendarDate=new Date(date+'T12:00:00');currentCalendarView='week';calendarFilters.assignedTasks=false;
    render();closeModals();activate('mitarbeiter','Arbeitsplanung');
    $('planningStatus').textContent='Kontrolle eingeplant: '+ticket.title+' · '+ticketDate(date);
    $('calendarContainer').scrollIntoView?.({block:'nearest',behavior:'smooth'});
    return true;
  }catch(error){return fail(error.serverMessage||'Einplanen fehlgeschlagen. Die Eingaben bleiben erhalten.');}
  finally{button.disabled=false;}
}
function openWorkOrderEditor(id='',options={}){
  closeModals();
  const t=id?(state.tickets||[]).find(t=>t.id===id):null;
  if(id&&!t)return;
  $('ticketEditId').value=id;
  const inspection=(t?workItemKind(t):options.planningKind)==='inspection';
  $('ticketPlanningKind').value=inspection?'inspection':'work_order';
  $('ticketEditorTitle').textContent=inspection?(t?'Inspektion bearbeiten':'Inspektion / Kontrollticket einrichten'):(t?'Arbeitsauftrag bearbeiten':'Arbeitsauftrag erstellen');
  $('ticketSaveBtn').textContent=inspection?'Inspektion speichern':'Arbeitsauftrag speichern';
  $('ticketDueLabel').textContent=inspection?(t?'Kontrolltermin':'Erster Kontrolltermin'):'Termin';
  $('ticketTypeField').hidden=inspection;
  $('ticketAssignedField').hidden=inspection;
  $('ticketBillingFields').hidden=!t;
  $('ticketBillingFields').open=false;
  const parent=t?.parent||options.parentId||'';
  $('ticketParent').innerHTML='<option value="">Ort / Anlage wählen</option>'+(state.nodes||[]).filter(n=>!inspection||isAssetNode(n)||n.id===parent).map(n=>`<option value="${esc(n.id)}">${esc(path(n.id))}</option>`).join('');
  $('ticketParent').value=parent;
  $('ticketParent').disabled=inspection;
  $('ticketAssignedEmployee').innerHTML='<option value="">Noch nicht zugeteilt</option>'+(state.employees||[]).map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  $('ticketAssignedEmployee').value=t?.assignedEmployeeId||(!inspection?options.employeeId:'')||'';
  const defaults={ticketTitle:t?.title||'',ticketType:t?.type||(inspection?'Kontrolle / Prüfung':options.kind==='maintenance'?'Wartung / Service':options.kind==='repair'?'Störung / Ausfall':'Reparatur'),ticketDue:t?.due||options.date||'',ticketText:t?.text||'',ticketStatus:t?.status||'Offen',ticketPrio:t?.prio||'Mittel',ticketResp:t?.resp||'',ticketExecutionBy:t?.executionBy||'Intern (Hausdienst / FM)',ticketCostChf:t?.costChf||'',ticketInvoiceReceived:t?.invoiceReceived||'',ticketDeliveryNoteReceived:t?.deliveryNoteReceived||'',ticketMaterial:t?.materialNeeded||'',ticketIntervalType:'',ticketInterval:'',ticketPart:'',ticketQuantity:'',ticketFailureState:'',ticketClosedAt:'',ticketMeasure:'',ticketCloseNote:''};
  Object.entries(defaults).forEach(([key,value])=>{if($(key))$(key).value=value;});
  // Optionale Bereiche: Material nur wenn erfasst, weitere Angaben beim Bearbeiten.
  setWorkOrderSection('ticketMaterialFields',!!t?.materialNeeded);
  setWorkOrderSection('ticketMoreFields',!!t);
  $('ticketModal').querySelector?.('.workOrderModal')?.classList.toggle('inspectionEditor',inspection);
  Array.from($('ticketStatus').options||[]).forEach(option=>{if(option.value==='Abgeschlossen')option.hidden=option.disabled=!t;});
  const managers=(state.employees||[]).filter(e=>/admin|chef/i.test(e.role||''));
  const session=storedSessionEmployee();
  $('ticketReminderManager').innerHTML='<option value="">Chef wählen</option>'+managers.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  $('ticketReminderManager').value=t?.recurrence?.managerId||(/admin|chef/i.test(session?.role||'')?session.id:managers[0]?.id)||'';
  $('ticketRepeat').value=inspection?'repeat':'once';
  $('ticketRepeatEvery').value=t?.recurrence?.every||1;
  $('ticketRepeatUnit').value=t?.recurrence?.unit||'months';
  $('ticketReminderBefore').value=t?.recurrence?.remindBefore??7;
  $('ticketReminderUnit').value=t?.recurrence?.remindUnit||'days';
  $('ticketSaveError').textContent='';$('ticketSaveBtn').disabled=false;
  updateWorkOrderRepeat();updateWorkOrderPath();
  $('ticketModal').style.display='flex';$('ticketTitle').focus();
}
const WORK_ORDER_SECTION_TOGGLES={ticketMaterialFields:'ticketMaterialToggle',ticketMoreFields:'ticketMoreToggle'};
function setWorkOrderSection(id,open){
  const panel=$(id),toggle=$(WORK_ORDER_SECTION_TOGGLES[id]);
  if(panel)panel.hidden=!open;
  if(toggle){toggle.setAttribute?.('aria-expanded',String(open));toggle.classList?.toggle('active',open);}
}
function toggleWorkOrderSection(id){
  const open=$(id).hidden;
  setWorkOrderSection(id,open);
  if(open)$(id).querySelector?.('textarea,select,input')?.focus();
}
function updateWorkOrderPath(){$('ticketPath').textContent=$('ticketParent').value?'Zugeordnet zu: '+path($('ticketParent').value):'Den vorhandenen Ort oder die Anlage auswählen.';}
function updateWorkOrderRepeat(){
  $('ticketRecurrenceFields').hidden=$('ticketRepeat').value!=='repeat';
  ['ticketRepeatEvery','ticketRepeatUnit','ticketReminderBefore','ticketReminderUnit','ticketReminderManager'].forEach(id=>{$(id).disabled=$('ticketRepeat').value!=='repeat';});
  const max={days:3650,weeks:520,months:120};
  $('ticketRepeatEvery').max=max[$('ticketRepeatUnit').value]||3650;
  $('ticketReminderBefore').max=max[$('ticketReminderUnit').value]||3650;
}
async function saveWorkOrder(){
  const btn=$('ticketSaveBtn');if(btn.disabled)return false;
  const fail=message=>{$('ticketSaveError').textContent=message;return false;};
  const id=$('ticketEditId').value,old=(state.tickets||[]).find(t=>t.id===id);
  const title=$('ticketTitle').value.trim(),parent=$('ticketParent').value,due=$('ticketDue').value;
  if(!title||!node(parent)||!planningDates(due,due).length)return fail('Bitte Titel, vorhandenen Ort und einen gültigen Termin eingeben.');
  let recurrence=null;
  if($('ticketPlanningKind').value==='inspection'){
    const every=Number($('ticketRepeatEvery').value),remindBefore=Number($('ticketReminderBefore').value),managerId=$('ticketReminderManager').value;
    const max={days:3650,weeks:520,months:120};
    if(!Number.isInteger(every)||every<1||every>max[$('ticketRepeatUnit').value]||!Number.isInteger(remindBefore)||remindBefore<0||remindBefore>max[$('ticketReminderUnit').value]||!managerId)return fail('Bitte ein gültiges Intervall, einen Vorlauf und einen Chef wählen. Höchstens 3650 Tage, 520 Wochen oder 120 Monate.');
    recurrence={every,unit:$('ticketRepeatUnit').value,remindBefore,remindUnit:$('ticketReminderUnit').value,managerId};
  }
  const assignedEmployeeId=$('ticketAssignedEmployee').value||null;
  const item={...(old||{}),id:id||uid(),parent,title,due,type:$('ticketType').value,status:$('ticketStatus').value,prio:$('ticketPrio').value,resp:$('ticketResp').value,executionBy:$('ticketExecutionBy').value,text:$('ticketText').value,materialNeeded:$('ticketMaterial').value,recurrence,assignedEmployeeId,assignedByEmployeeId:old?.assignedByEmployeeId||storedSessionEmployee()?.id||null,assignedAt:old?.assignedEmployeeId===assignedEmployeeId?old?.assignedAt:(assignedEmployeeId?new Date().toISOString():null),created:old?.created||new Date().toLocaleString('de-CH'),costChf:$('ticketCostChf').value,invoiceReceived:$('ticketInvoiceReceived').value,deliveryNoteReceived:$('ticketDeliveryNoteReceived').value};
  item.planningKind=$('ticketPlanningKind').value==='inspection'?'inspection':'work_order';
  if(item.status==='Abgeschlossen'&&(!canCloseTicketForParent(parent)||!item.costChf||!item.invoiceReceived||!item.deliveryNoteReceived))return fail('Für den kaufmännischen Abschluss zuerst Belege und Kosten ergänzen. Eine ausgeführte Kontrolle kann als „Erledigt“ markiert werden.');
  btn.disabled=true;$('ticketSaveError').textContent='';
  try{state=await api('PATCH',{collection:'tickets',item});render();openWorkOrder(item.id);return true;}
  catch(error){return fail(error.serverMessage||'Arbeitsauftrag konnte nicht gespeichert werden. Die Eingaben bleiben erhalten.');}
  finally{btn.disabled=false;}
}
function workOrderDetailsHtml(t){
  const r=t.recurrence;
  const inspection=workItemKind(t)==='inspection',schedule=workOrderSchedule(t);
  const facts=[['Ort / Anlage',node(t.parent)?path(t.parent):'Ort nicht mehr vorhanden'],['FM-Code',displayCode(node(t.parent))||'—'],['Mitarbeiter',workOrderAssignee(t)],[inspection?'Fällig am':'Termin',ticketDate(t.due)||'Nicht geplant'],['Status',t.status],['Priorität',t.prio],['Auftragsart',t.type],['Ausführung',t.executionBy||'—']];
  if(inspection)facts.splice(4,0,['Im Kalender',schedule.length?schedule.map(a=>ticketDate(a.date)).join(', '):'Noch nicht eingeplant']);
  return `<p class="smallText">FM Lighthouse 360° · ${esc(workItemLabel(t))} ${esc(t.id)}</p><h2>${esc(t.title)}</h2><div class="workDetailGrid">${facts.map(([key,value])=>`<div><span>${key}</span><strong>${esc(value)}</strong></div>`).join('')}</div><section class="workDetailSection"><h3>Aufgabe / Kontrollpunkte</h3><div class="workText">${esc(t.text||'Keine zusätzliche Beschreibung.')}</div></section>${t.materialNeeded?`<section class="workDetailSection"><h3>Materialbedarf</h3><div class="workText">${esc(t.materialNeeded)}</div></section>`:''}${r?`<section class="workDetailSection"><h3>Regelmäßige Kontrolle</h3><p>${esc(workOrderInterval(r))} · Hinweis ${esc(r.remindBefore)} ${esc(workOrderUnit(r.remindUnit,r.remindBefore))} vorher an ${esc((state.employees||[]).find(e=>e.id===r.managerId)?.name||'Chef')}.</p><p class="smallText">Nach „Erledigt“ folgt der nächste Kontrolltermin im festgelegten Intervall. Diese Kontrolle bleibt mit ihrem Ergebnis als Nachweis erhalten.</p></section>`:''}`;
}
function workOrderMobileUrl(t){const url=new URL('field.html',location.href);url.searchParams.set('node',t.parent);url.searchParams.set('ticket',t.id);return url.toString();}
// Arbeitsansicht: zuerst Aufgabe und Ort, dann Arbeit erfassen. Verwaltungsdaten liegen unter „Details“.
function workArg(value){return typeof escJsArg==='function'?escJsArg(value):esc(value);}
function workLogs(t){return Array.isArray(t?.workLogs)?t.workLogs:[];}
function workOrderLegacyNote(t){
  let note=String(t.completionNote||'');
  for(const log of workLogs(t)){
    const report=`${log.date} · ${log.employeeName} (${log.minutes} Min.):\n${log.note}`;
    note=note.replace(report,'');
  }
  return note.replace(/\n{3,}/g,'\n\n').trim();
}
function workOrderMinutes(t){return workLogs(t).reduce((sum,l)=>sum+(Number(l.minutes)||0),0);}
function formatWorkMinutes(total){const h=Math.floor(total/60),m=total%60;return h&&m?`${h} h ${m} min`:h?`${h} h`:`${m} min`;}
function workTodayString(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function workOrderPhotos(t){return (state.photos||[]).filter(p=>p.ticketId===t.id);}
function workOrderPhotosHtml(t,opts){
  const thumbs=workOrderPhotos(t).map(p=>opts.photoViewer?`<button type="button" class="woThumb" onclick="showLargePhoto('${workArg(p.id)}')" title="${esc(p.description||'Foto')}"><img src="/api/fm360?photoId=${esc(p.id)}" alt=""></button>`:`<a class="woThumb" href="/api/fm360?photoId=${esc(p.id)}" target="_blank" rel="noopener" title="${esc(p.description||'Foto')}"><img src="/api/fm360?photoId=${esc(p.id)}" alt=""></a>`).join('');
  return thumbs+(opts.photoAdd||'');
}
function refreshWorkOrderPhotos(id){
  const t=(state.tickets||[]).find(t=>t.id===id),root=$('woPhotos');
  if(t&&root&&root.dataset.ticketId===id&&workOrderViewOptions)root.innerHTML=workOrderPhotosHtml(t,workOrderViewOptions);
}
let workOrderViewOptions=null;
function workOrderViewHtml(t,opts){
  workOrderViewOptions=opts;
  const adminHtml=opts.adminHtml||'',legacyNote=workOrderLegacyNote(t); // von der Seite gebaut, Werte dort bereits maskiert
  const inspection=workItemKind(t)==='inspection',closed=isClosedTicketStatus(t.status),place=node(t.parent),r=t.recurrence,schedule=workOrderSchedule(t);
  const today=workTodayString(),late=!closed&&t.due&&t.due<today,logs=[...workLogs(t)].sort((x,y)=>String(y.date||'').localeCompare(String(x.date||''))||String(y.createdAt||'').localeCompare(String(x.createdAt||''))),total=workOrderMinutes(t);
  const photos=`<div class="woPhotoRow" id="woPhotos" data-ticket-id="${esc(t.id)}">${workOrderPhotosHtml(t,opts)}</div>`;
  const facts=[['Mitarbeiter',workOrderAssignee(t)],[inspection?'Fällig am':'Termin',ticketDate(t.due)||'Nicht geplant'],['Status',t.status||'Offen'],['Priorität',t.prio||'—'],['Auftragsart',t.type||'—'],['Ausführung',t.executionBy||'—'],['FM-Code',displayCode(place)||'—'],['Nummer',t.id]];
  if(inspection)facts.splice(2,0,['Im Kalender',schedule.length?schedule.map(a=>ticketDate(a.date)).join(', '):'Noch nicht eingeplant']);
  const recurrence=r?`<p class="woAdminNote">${esc(workOrderInterval(r))} · Hinweis ${esc(r.remindBefore)} ${esc(workOrderUnit(r.remindUnit,r.remindBefore))} vorher an ${esc((state.employees||[]).find(e=>e.id===r.managerId)?.name||'Chef')}. Nach „Erledigt“ folgt die nächste Kontrolle; diese bleibt als Nachweis erhalten.</p>`:'';
  const form=opts.canWork?`<form class="woWork" id="woWorkForm" onsubmit="event.preventDefault();submitWorkEntry('${workArg(t.id)}',false,this)">
    <h3>${inspection?'Kontrolle erfassen':'Arbeit erfassen'}</h3>
    <textarea id="woWorkNote" rows="3" aria-label="Erledigte Arbeit" placeholder="${inspection?'Was wurde geprüft? Ergebnis, Mängel':'Was wurde gemacht?'}"></textarea>
    <div class="woWorkRow">
      <label class="woField"><span>Datum</span><input id="woWorkDate" type="date" value="${esc(today)}" required></label>
      <div class="woField"><span id="woWorkTimeLabel">Arbeitszeit</span><div class="woTime" role="group" aria-labelledby="woWorkTimeLabel"><input id="woWorkHours" type="number" min="0" max="24" step="1" inputmode="numeric" placeholder="0" aria-label="Stunden"><em>h</em><input id="woWorkMins" type="number" min="0" max="59" step="1" inputmode="numeric" placeholder="0" aria-label="Minuten"><em>min</em></div></div>
    </div>
    ${photos}
    <details class="woMaterialEdit"><summary>Material</summary><textarea id="woWorkMaterial" rows="2" aria-label="Material" placeholder="Benötigtes oder verbrauchtes Material">${esc(t.materialNeeded||'')}</textarea></details>
    <p id="woWorkError" class="workError" role="alert"></p>
    <div class="woWorkActions"><button type="submit" class="${esc(opts.secondaryClass)}">Speichern</button><button type="button" class="${esc(opts.primaryClass)}" onclick="submitWorkEntry('${workArg(t.id)}',true,this)">Abschließen</button></div>
  </form>`:(workOrderPhotos(t).length||opts.photoAdd?photos:'');
  const history=logs.length?`<section class="woLog"><div class="woLogHead"><h3>Erfasste Arbeit</h3><strong>${esc(formatWorkMinutes(total))}</strong></div><ul>${logs.map(l=>`<li><span>${esc(ticketDate(l.date))} · ${esc(l.employeeName||'')} · ${esc(formatWorkMinutes(Number(l.minutes)||0))}</span>${l.note?`<p>${esc(l.note)}</p>`:''}</li>`).join('')}</ul></section>`:'';
  return `<div class="woView${closed?' closed':''}">
    <div class="woHeadInfo"><span class="woStatus status-${closed?'closed':/arbeit/i.test(t.status||'')?'progress':'open'}">${esc(t.status||'Offen')}</span>${t.due?`<span class="woDue${late?' late':''}">${late?'Überfällig · ':''}${esc(ticketDate(t.due))}</span>`:''}${inspection?'<span>↻ Kontrolle</span>':''}</div>
    <h2 class="woViewTitle">${esc(t.title||t.type||'Auftrag')}</h2>
    <p class="woWhere"><strong>${esc(place?.name||'Ort nicht mehr vorhanden')}</strong>${place?`<span>${esc(path(place.id))}</span>`:''}</p>
    ${t.text?`<div class="workText woTask">${esc(t.text)}</div>`:''}
    ${t.materialNeeded?`<p class="woMaterial"><span>Material</span>${esc(t.materialNeeded)}</p>`:''}
    ${form}${history}
    ${legacyNote?`<section class="woLog"><h3>Frühere Rückmeldungen</h3><div class="workText">${esc(legacyNote)}</div></section>`:''}
    <details class="woAdmin"><summary>Details</summary><div class="workDetailGrid">${facts.map(([key,value])=>`<div><span>${esc(key)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>${recurrence}${adminHtml}</details>
  </div>`;
}
// Seiten-spezifisch: Desktop zeichnet neu und öffnet den Auftrag wieder; field-work-orders.js überschreibt dies.
function refreshWorkOrderView(id){render();openWorkOrder(id);}
const workEntryDrafts={};
async function submitWorkEntry(id,finish,source){
  const ticket=(state.tickets||[]).find(t=>t.id===id);if(!ticket)return false;
  const form=$('woWorkForm'),buttons=form?.querySelectorAll?[...form.querySelectorAll('button')]:[];
  if(buttons.some(b=>b.disabled))return false;
  const fail=message=>{$('woWorkError').textContent=message;return false;};
  const note=$('woWorkNote').value.trim(),date=$('woWorkDate').value,hours=Number($('woWorkHours').value||0),mins=Number($('woWorkMins').value||0);
  const minutes=hours*60+mins;
  if(!Number.isInteger(hours)||!Number.isInteger(mins)||hours<0||mins<0||mins>59||minutes>24*60)return fail('Bitte ganze Stunden und Minuten eingeben (höchstens 24 h pro Eintrag).');
  const hasEntry=minutes>0||!!note;
  if(hasEntry&&(!minutes||!note||!date))return fail('Bitte Arbeitszeit, Datum und erledigte Arbeit eintragen.');
  if(finish&&!hasEntry&&!(workOrderMinutes(ticket)>0&&workLogs(ticket).some(l=>String(l.note||'').trim())))return fail('Zum Abschließen bitte Arbeitszeit und erledigte Arbeit eintragen.');
  if(!finish&&!hasEntry&&ticket.status==='In Arbeit')return fail('Bitte Arbeitszeit und erledigte Arbeit eintragen.');
  const payload={action:'recordWork',ticketId:id};
  if(hasEntry){
    // Gleiche Eingabe = gleiche ID, damit ein erneuter Versuch nach einem Fehler nichts doppelt bucht.
    const signature=JSON.stringify([date,minutes,note]),draft=workEntryDrafts[id];
    if(!draft||draft.signature!==signature)workEntryDrafts[id]={signature,entryId:'wl-'+uid()+Date.now().toString(36)};
    payload.entry={id:workEntryDrafts[id].entryId,date,minutes,note};
  }
  if(finish)payload.status='Erledigt';else if(ticket.status!=='In Arbeit')payload.status='In Arbeit';
  const material=$('woWorkMaterial')?.value;
  buttons.forEach(b=>b.disabled=true);$('woWorkError').textContent='';
  try{
    if(material!==undefined&&material.trim()!==String(ticket.materialNeeded||'').trim())state=await api('PATCH',{collection:'tickets',item:{...ticket,materialNeeded:material.trim()}});
    state=await api('PATCH',payload);
    delete workEntryDrafts[id];
    refreshWorkOrderView(id);return true;
  }catch(error){if(error.sessionExpired)return false;return fail(error.serverMessage||'Speichern fehlgeschlagen. Die Eingaben bleiben erhalten.');}
  finally{buttons.forEach(b=>b.disabled=false);}
}
function closeOverWorkOrder(id){if($('workOrderDetail')?.style.display==='flex')$(id).style.display='none';else closeModals();}
function openWorkOrder(id){
  const t=(state.tickets||[]).find(t=>t.id===id);if(!t)return;
  closeModals();$('workOrderDetail').dataset.ticketId=id;
  const closed=isClosedTicketStatus(t.status),inspection=workItemKind(t)==='inspection';
  $('workOrderHeading').textContent=workItemLabel(t);
  $('workOrderDetail').setAttribute?.('aria-label',workItemLabel(t));
  const adminHtml=`<div class="woAdminActions"><a class="btn small secondary" target="_blank" rel="noopener" href="${esc(workOrderMobileUrl(t))}">Auf Telefon / Tablet öffnen</a>${t.nextTicketId?`<button class="btn small secondary" onclick="openWorkOrder('${escJsArg(t.nextTicketId)}')">Nächste Kontrolle</button>`:''}</div>`;
  $('workOrderContent').innerHTML=workOrderViewHtml(t,{canWork:!closed,primaryClass:'btn',secondaryClass:'btn secondary',photoViewer:true,photoAdd:`<button type="button" class="woThumb woPhotoAdd" onclick="openPhotoModal('${escJsArg(id)}')">+ Foto</button>`,adminHtml});
  $('workOrderActions').innerHTML=`<button class="btn secondary small" onclick="openWorkOrderEditor('${escJsArg(id)}')">Bearbeiten</button><button class="btn secondary small" onclick="printWorkOrder('${escJsArg(id)}')">Drucken</button>${inspection&&!closed?`<button class="btn secondary small" onclick="openInspectionPlanning('${escJsArg(id)}')">${workOrderSchedule(t).length?'Plan ändern':'Einplanen'}</button>`:''}`;
  $('workOrderDetail').style.display='flex';$('workOrderClose').focus();
}
function printWorkOrder(id){
  const t=(state.tickets||[]).find(t=>t.id===id);if(!t)return;
  const logs=workLogs(t),legacyNote=workOrderLegacyNote(t),log=logs.length?`<section class="workDetailSection"><h3>Erfasste Arbeit · ${esc(formatWorkMinutes(workOrderMinutes(t)))}</h3>${logs.map(l=>`<p>${esc(ticketDate(l.date))} · ${esc(l.employeeName||'')} · ${esc(formatWorkMinutes(Number(l.minutes)||0))}<br>${esc(l.note||'')}</p>`).join('')}</section>`:'';
  $('workOrderPrint').innerHTML=workOrderDetailsHtml(t)+log+(legacyNote?`<section class="workDetailSection"><h3>Frühere Rückmeldungen</h3><div class="workText">${esc(legacyNote)}</div></section>`:'')+'<section class="workDetailSection"><h3>Ausführung / Unterschrift</h3><p>Datum: ____________________ &nbsp; Mitarbeiter: ____________________</p></section>';
  document.body.classList.add('printing-work-order');
  try{window.print();}finally{document.body.classList.remove('printing-work-order');}
}
function workOrderNotifications(){
  const id=storedSessionEmployee()?.id;
  return (state.notifications||[]).filter(n=>n.employeeId===id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function renderWorkOrderReminders(){
  const notes=workOrderNotifications();
  const unread=notes.filter(n=>!n.readAt);
  const badge=$('headerOpenTickets');if(badge){badge.textContent=unread.length>99?'99+':String(unread.length);badge.hidden=!unread.length;}
  const due=notes.filter(n=>!n.readAt&&!(state.tickets||[]).some(t=>t.id===n.ticketId&&isClosedTicketStatus(t.status)));
  const root=$('planningReminders');if(root){root.hidden=!due.length;root.innerHTML=due.length?`<button class="btn small secondary" onclick="openWorkOrderReminders()">${due.length} ${due.length===1?"Hinweis":"Hinweise"}</button>`:'';}
}
async function openWorkOrderReminders(){
  // An explicit refresh checks the server's due reminders without overwriting an open form.
  if(!Object.keys(pendingChanges()).length){try{state=await api();render();}catch(e){if(e.sessionExpired)return;}}
  closeModals();
  $('workReminderList').innerHTML=workOrderNotifications().map(n=>`<div class="item"><div><strong>${esc(n.title)}</strong><span>${esc(n.body||'')}</span>${!n.readAt?'<span> · Neu</span>':''}</div>${n.ticketId?`<button class="btn small secondary" onclick="openWorkOrderNotification('${escJsArg(n.id)}')">Auftrag öffnen</button>`:''}</div>`).join('')||'<p class="smallText">Keine Benachrichtigungen. Hinweise erscheinen ab dem eingestellten Vorlauf.</p>';
  $('workReminderModal').style.display='flex';
}
async function openWorkOrderNotification(id){
  const n=(state.notifications||[]).find(n=>n.id===id);if(!n)return;
  if(!n.readAt){try{state=await api('PATCH',{collection:'notifications',item:{...n,readAt:new Date().toISOString()}});render();}catch(e){if(e.sessionExpired)return;}}
  openWorkOrder(n.ticketId);
}
