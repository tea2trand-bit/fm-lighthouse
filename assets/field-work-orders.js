function ticketDate(value){return fieldDate(value);}
function canUpdateFieldOrder(ticket){
  const employee=loggedEmployee();
  return !!employee&&(isAdminEmployee(employee)||workOrderEmployeeIds(ticket).includes(employee.id));
}
// Mobile Arbeitsansicht: dieselbe Darstellung wie am PC, Fotos direkt mit der Kamera.
function openFieldWorkOrder(id){
  const ticket=(state.tickets||[]).find(t=>t.id===id);if(!ticket)return;
  const canUpdate=canUpdateFieldOrder(ticket);
  $('fieldWorkOrderKind').textContent=workItemLabel(ticket);
  $('fieldWorkOrderModal').setAttribute('aria-label',workItemLabel(ticket));
  $('fieldWorkOrderContent').innerHTML=workOrderViewHtml(ticket,{
    canWork:canUpdate&&!isClosedTicketStatus(ticket.status),primaryClass:'action',secondaryClass:'action ghost',
    photoAdd:canUpdate?`<label class="woThumb woPhotoAdd" role="button" tabindex="0" aria-label="Foto hinzufügen" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.querySelector('input').click()}">+ Foto<input type="file" accept="image/*" capture="environment" onchange="uploadFieldOrderPhoto('${esc(id)}',this)"></label>`:'',
    adminHtml:`<div class="woAdminActions"><button type="button" class="action ghost" onclick="printWorkOrder('${esc(id)}')">Drucken / PDF</button></div>`
  });
  $('fieldWorkOrderModal').hidden=false;$('fieldWorkOrderClose').focus();
}
function closeFieldWorkOrder(){$('fieldWorkOrderModal').hidden=true;}
function refreshWorkOrderView(id){
  renderTasks();renderNotifications();updateBell();
  if(current&&!isNavigationNode(current)){renderTicket();renderHistory();}
  openFieldWorkOrder(id);
}
async function uploadFieldOrderPhoto(id,input){
  const ticket=(state.tickets||[]).find(t=>t.id===id),file=input.files&&input.files[0];
  if(!ticket||!file)return;
  const label=input.closest('label');label?.classList.add('busy');
  try{
    const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file);});
    const photoId=uid();
    state=normalizeState(await api('PATCH',{collection:'photos',item:{id:photoId,parent:ticket.parent,description:`Foto zu Auftrag: ${ticket.title||''}`,blobKey:`photos/${photoId}`,contentType:file.type||'image/jpeg',ticketId:id,base64}}));
    refreshWorkOrderPhotos(id);
  }catch(error){if($('woWorkError'))$('woWorkError').textContent=error.serverMessage||'Foto konnte nicht gespeichert werden.';else alert('Foto konnte nicht gespeichert werden.');}
  finally{label?.classList.remove('busy');input.value='';}
}
