function ticketDate(value){return fieldDate(value);}
function canUpdateFieldOrder(ticket){
  const employee=loggedEmployee();
  return !!employee&&(isAdminEmployee(employee)||workOrderEmployeeIds(ticket).includes(employee.id));
}
function openFieldWorkOrder(id){
  const ticket=(state.tickets||[]).find(t=>t.id===id);if(!ticket)return;
  const root=$('fieldWorkOrderContent');
  $('fieldWorkOrderKind').textContent=workItemLabel(ticket);
  $('fieldWorkOrderModal').setAttribute('aria-label',workItemLabel(ticket));
  root.innerHTML=workOrderDetailsHtml(ticket)+`<div class="workActions"><button class="action" onclick="printWorkOrder('${esc(id)}')">Drucken / PDF</button></div>`;
  if(ticket.completionNote)root.innerHTML+=`<section class="workDetailSection"><h3>Rückmeldung / Prüfergebnis</h3><div class="workText">${esc(ticket.completionNote)}</div></section>`;
  if(canUpdateFieldOrder(ticket)&&!isClosedTicketStatus(ticket.status))root.innerHTML+=`<section class="workDetailSection"><label for="fieldOrderResult">Rückmeldung / Prüfergebnis</label><textarea id="fieldOrderResult" rows="3" placeholder="Was wurde geprüft oder erledigt? Mängel und Hinweise."></textarea><label for="fieldOrderMaterial">Materialbedarf</label><textarea id="fieldOrderMaterial" rows="2">${esc(ticket.materialNeeded||'')}</textarea><p id="fieldOrderError" class="workError" role="alert"></p><div class="workActions"><button class="action ghost" onclick="saveFieldWorkOrder('${esc(id)}','In Arbeit',this)">In Arbeit</button><button class="action" onclick="saveFieldWorkOrder('${esc(id)}','Erledigt',this)">Als erledigt markieren</button></div></section>`;
  $('fieldWorkOrderModal').hidden=false;$('fieldWorkOrderClose').focus();
}
function closeFieldWorkOrder(){$('fieldWorkOrderModal').hidden=true;}
async function saveFieldWorkOrder(id,status,button){
  const ticket=(state.tickets||[]).find(t=>t.id===id);
  if(!ticket||!canUpdateFieldOrder(ticket)||button.disabled)return;
  const result=$('fieldOrderResult').value.trim();
  if(status==='Erledigt'&&!result){$('fieldOrderError').textContent='Bitte das Ergebnis der Arbeit oder Kontrolle eintragen.';return;}
  const buttons=[...$('fieldWorkOrderContent').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  const item={...ticket,status,materialNeeded:$('fieldOrderMaterial').value,completionNote:[ticket.completionNote,result?`${new Date().toLocaleString('de-CH')} · ${loggedEmployee()?.name||''}:\n${result}`:''].filter(Boolean).join('\n\n')};
  try{state=await api('PATCH',{collection:'tickets',item});renderTasks();renderNotifications();updateBell();openFieldWorkOrder(id);}
  catch(error){$('fieldOrderError').textContent=error.message||'Speichern fehlgeschlagen. Die Eingaben bleiben erhalten.';}
  finally{buttons.forEach(b=>b.disabled=false);}
}
