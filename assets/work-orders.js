// Desktop work-order UI. The API remains the source of truth for recurrence and reminders.
function workOrderUnit(unit, amount){return ({days:amount===1?'Tag':'Tage',weeks:amount===1?'Woche':'Wochen',months:amount===1?'Monat':'Monate'})[unit]||unit;}
function workItemKind(ticket){return ticket?.planningKind||(ticket?.recurrence?'inspection':'work_order');}
function workItemLabel(ticket){return workItemKind(ticket)==='inspection'?'Inspektion / Kontrollticket':'Arbeitsauftrag';}
function workOrderInterval(r){return r?`Alle ${r.every} ${workOrderUnit(r.unit,r.every)}`:'Einmaliger Arbeitsauftrag';}
function workOrderEmployeeIds(ticket){
  const ids=new Set();
  if(ticket.assignedEmployeeId)ids.add(ticket.assignedEmployeeId);
  (state.taskAssignments||[]).filter(a=>a.ticketId===ticket.id).forEach(a=>ids.add(a.employeeId));
  return [...ids];
}
function workOrderAssignee(ticket){
  return workOrderEmployeeIds(ticket).map(id=>(state.employees||[]).find(e=>e.id===id)?.name||'Unbekannter Mitarbeiter').join(', ')||ticket.resp||'Noch nicht zugeteilt';
}
function workCalendarEntries(start,end,shifts=state.shifts||[]){
  const tickets=(state.tickets||[]).filter(t=>t.due>=start&&t.due<=end).flatMap(t=>{
    const ids=workOrderEmployeeIds(t);
    return (ids.length?ids:['']).map(employeeId=>({id:t.id,kind:'ticket',inspection:workItemKind(t)==='inspection',employeeId,date:t.due,title:t.title||t.type||workItemLabel(t),done:isClosedTicketStatus(t.status)}));
  });
  const services=shifts.filter(s=>s.date>=start&&s.date<=end).map(s=>({id:s.id,kind:'shift',employeeId:s.employeeId,date:s.date,title:s.shiftType==='Krank'?'Abwesend':/ferien/i.test(s.shiftType)?s.shiftType:(s.taskAssignment&&s.taskAssignment!=='-'?s.taskAssignment:s.shiftType||'Dienst'),away:/krank|ferien/i.test(s.shiftType)}));
  return [...tickets,...services].sort((a,b)=>Number(a.done||false)-Number(b.done||false)||a.title.localeCompare(b.title,'de'));
}
function workCalendarEmployees(employees){
  const {start,end}=planningPeriod();
  const entries=workCalendarEntries(start,end);
  const ids=new Set(employees.map(e=>e.id));
  const result=[...employees];
  if(!Object.values(calendarFilters).some(Boolean))entries.forEach(entry=>{
    if(ids.has(entry.employeeId))return;
    const emp=(state.employees||[]).find(e=>e.id===entry.employeeId);
    if(emp||!entry.employeeId){result.push(emp||{id:'',name:'Nicht zugeteilt'});ids.add(entry.employeeId);}
  });
  return result;
}
function workLineHtml(entry,showName=false){
  const employee=(state.employees||[]).find(e=>e.id===entry.employeeId);
  const title=(showName?(employee?.name||'Nicht zugeteilt')+' · ':'')+entry.title;
  const action=entry.kind==='ticket'?`openWorkOrder('${escJsArg(entry.id)}')`:`openCalendarPlan('${escJsArg(entry.employeeId)}','${escJsArg(entry.date)}','${escJsArg(entry.id)}')`;
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
      html+=`<tr><th scope="row" class="weekEmployee">${esc(emp.name)}<span>${count} Aufträge</span></th>`;
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
  const parent=t?.parent||options.parentId||'';
  $('ticketParent').innerHTML='<option value="">Ort / Anlage wählen</option>'+(state.nodes||[]).filter(n=>!inspection||isAssetNode(n)||n.id===parent).map(n=>`<option value="${esc(n.id)}">${esc(path(n.id))}</option>`).join('');
  $('ticketParent').value=parent;
  $('ticketParent').disabled=inspection;
  $('ticketAssignedEmployee').innerHTML='<option value="">Noch nicht zugeteilt</option>'+(state.employees||[]).map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  $('ticketAssignedEmployee').value=t?.assignedEmployeeId||options.employeeId||'';
  const defaults={ticketTitle:t?.title||'',ticketType:t?.type||(inspection?'Kontrolle / Prüfung':options.kind==='maintenance'?'Wartung / Service':options.kind==='repair'?'Störung / Ausfall':'Reparatur'),ticketDue:t?.due||options.date||'',ticketText:t?.text||'',ticketStatus:t?.status||'Offen',ticketPrio:t?.prio||'Mittel',ticketResp:t?.resp||'',ticketExecutionBy:t?.executionBy||'Intern (Hausdienst / FM)',ticketCostChf:t?.costChf||'',ticketInvoiceReceived:t?.invoiceReceived||'',ticketDeliveryNoteReceived:t?.deliveryNoteReceived||'',ticketMaterial:t?.materialNeeded||'',ticketIntervalType:'',ticketInterval:'',ticketPart:'',ticketQuantity:'',ticketFailureState:'',ticketClosedAt:'',ticketMeasure:'',ticketCloseNote:''};
  Object.entries(defaults).forEach(([key,value])=>{if($(key))$(key).value=value;});
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
  const facts=[['Ort / Anlage',node(t.parent)?path(t.parent):'Ort nicht mehr vorhanden'],['FM-Code',displayCode(node(t.parent))||'—'],['Mitarbeiter',workOrderAssignee(t)],['Termin',ticketDate(t.due)||'Nicht geplant'],['Status',t.status],['Priorität',t.prio],['Auftragsart',t.type],['Ausführung',t.executionBy||'—']];
  return `<p class="smallText">FM Lighthouse 360° · ${esc(workItemLabel(t))} ${esc(t.id)}</p><h2>${esc(t.title)}</h2><div class="workDetailGrid">${facts.map(([key,value])=>`<div><span>${key}</span><strong>${esc(value)}</strong></div>`).join('')}</div><section class="workDetailSection"><h3>Aufgabe / Kontrollpunkte</h3><div class="workText">${esc(t.text||'Keine zusätzliche Beschreibung.')}</div></section><section class="workDetailSection"><h3>Materialbedarf</h3><div class="workText">${esc(t.materialNeeded||'Kein Materialbedarf erfasst.')}</div></section>${r?`<section class="workDetailSection"><h3>Regelmäßige Kontrolle</h3><p>${esc(workOrderInterval(r))} · Hinweis ${esc(r.remindBefore)} ${esc(workOrderUnit(r.remindUnit,r.remindBefore))} vorher an ${esc((state.employees||[]).find(e=>e.id===r.managerId)?.name||'Chef')}.</p><p class="smallText">Nach „Erledigt“ folgt der nächste Kontrolltermin im festgelegten Intervall. Diese Kontrolle bleibt mit ihrem Ergebnis als Nachweis erhalten.</p></section>`:''}`;
}
function workOrderMobileUrl(t){const url=new URL('field.html',location.href);url.searchParams.set('node',t.parent);url.searchParams.set('ticket',t.id);return url.toString();}
function openWorkOrder(id){
  const t=(state.tickets||[]).find(t=>t.id===id);if(!t)return;
  closeModals();$('workOrderDetail').dataset.ticketId=id;
  $('workOrderHeading').textContent=workItemLabel(t);
  $('workOrderDetail').setAttribute?.('aria-label',workItemLabel(t));
  $('workOrderContent').innerHTML=workOrderDetailsHtml(t);
  if(t.completionNote)$('workOrderContent').innerHTML+=`<section class="workDetailSection"><h3>Rückmeldung / Prüfergebnis</h3><div class="workText">${esc(t.completionNote)}</div></section>`;
  if(!isClosedTicketStatus(t.status))$('workOrderContent').innerHTML+='<section class="workDetailSection"><label for="workCompletionInput">Rückmeldung / Prüfergebnis</label><textarea id="workCompletionInput" rows="2" placeholder="Ergebnis oder Hinweis zur Ausführung"></textarea></section>';
  if(t.nextTicketId)$('workOrderContent').innerHTML+=`<button class="btn small secondary" onclick="openWorkOrder('${escJsArg(t.nextTicketId)}')">Nächste Kontrolle öffnen</button>`;
  $('workOrderActions').innerHTML=`<button class="btn secondary" onclick="openWorkOrderEditor('${escJsArg(id)}')">Bearbeiten</button><button class="btn secondary" onclick="printWorkOrder('${escJsArg(id)}')">Drucken / PDF</button><a class="btn secondary" target="_blank" rel="noopener" href="${esc(workOrderMobileUrl(t))}">Telefon / Tablet</a>${!isClosedTicketStatus(t.status)?`<button class="btn secondary" onclick="setWorkOrderStatus('${escJsArg(id)}','In Arbeit',this)">In Arbeit</button><button class="btn" onclick="setWorkOrderStatus('${escJsArg(id)}','Erledigt',this)">Als erledigt markieren</button>`:''}`;
  $('workOrderDetail').style.display='flex';$('workOrderClose').focus();
}
async function setWorkOrderStatus(id,status,btn){
  const ticket=(state.tickets||[]).find(t=>t.id===id);if(!ticket||btn?.disabled)return;
  if(btn)btn.disabled=true;
  const note=$('workCompletionInput')?.value?.trim();
  const completionNote=[ticket.completionNote,note?`${new Date().toLocaleString('de-CH')} · ${storedSessionEmployee()?.name||''}:\n${note}`:''].filter(Boolean).join('\n\n');
  try{state=await api('PATCH',{collection:'tickets',item:{...ticket,status,completionNote}});render();openWorkOrder(id);}
  catch(error){alert(error.serverMessage||'Status konnte nicht gespeichert werden.');}
  finally{if(btn)btn.disabled=false;}
}
function printWorkOrder(id){
  const t=(state.tickets||[]).find(t=>t.id===id);if(!t)return;
  $('workOrderPrint').innerHTML=workOrderDetailsHtml(t)+(t.completionNote?`<section class="workDetailSection"><h3>Prüfergebnis</h3><div class="workText">${esc(t.completionNote)}</div></section>`:'')+'<section class="workDetailSection"><h3>Ausführung / Unterschrift</h3><p>Datum: ____________________ &nbsp; Mitarbeiter: ____________________</p></section>';
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
