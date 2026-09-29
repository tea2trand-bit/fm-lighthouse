import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../assets/work-orders.js',import.meta.url),'utf8');
function app(){
  const fields={};
  const ctx=vm.createContext({Date,URL,console,state:{employees:[{id:'e1',name:'Anna'},{id:'boss',name:'Chef',role:'Admin / Chef'}],tickets:[],shifts:[],nodes:[{id:'room',name:'Technikraum'}],taskAssignments:[],notifications:[]},calendarFilters:{},currentCalendarDate:new Date(2026,8,29),
    $:id=>fields[id]||={value:'',innerHTML:'',textContent:'',dataset:{},style:{},hidden:false,disabled:false,focus(){}},
    node:id=>ctx.state.nodes.find(n=>n.id===id),isAssetNode:n=>n?.type==='Anlage',alert:()=>{},path:()=> 'Neubau → UG → Technikraum',displayCode:()=> 'NEU-UG-01',ticketDate:x=>x,
    getTodayDate:()=>new Date(2026,8,29),toLocalDateString:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    planningPeriod:()=>({start:'2026-09-28',end:'2026-10-04'}),planningDates:(start,end)=>{const result=[];for(let d=new Date(start+'T12:00:00');d<=new Date(end+'T12:00:00');d.setDate(d.getDate()+1))result.push(ctx.toLocalDateString(d));return result;},
    esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),escJsArg:value=>ctx.esc(value),
    isClosedTicketStatus:status=>/erledigt|abgeschlossen|done|closed/i.test(status||''),storedSessionEmployee:()=>({id:'boss',role:'Admin / Chef'}),uid:()=> 'new-ticket',
    activate:()=>{},canCloseTicketForParent:()=>false,closes:0,renders:0,closeModals:()=>ctx.closes++,render:()=>ctx.renders++,location:{href:'https://example.test/index.html'},
    document:{body:{classList:{add(){},remove(){}}}},window:{print(){ctx.printed=true;}},
  });
  vm.runInContext(code,ctx);return ctx;
}
test('five orders in one calendar day show three short titles and an overflow action',()=>{
  const a=app();a.state.tickets=Array.from({length:5},(_,i)=>({id:'t'+i,assignedEmployeeId:'e1',due:'2026-09-29',title:'Lift '+i+' <kontrollieren>',parent:'room'}));
  const html=a.renderWorkCalendar(a.state.employees.slice(0,1),[]);
  assert.equal((html.match(/class="workLine /g)||[]).length,3);
  assert.match(html,/\+ 2 weitere/);assert.match(html,/Lift 0 &lt;kontrollieren&gt;/);assert.doesNotMatch(html,/Technikraum/);
  a.openWorkDay('e1','2026-09-29');assert.equal((a.$('workDayList').innerHTML.match(/class="workLine /g)||[]).length,5);
});
test('one ticket assigned through two sources is not duplicated for the same worker',()=>{
  const a=app();a.state.tickets=[{id:'t1',assignedEmployeeId:'e1',due:'2026-09-29',title:'Kontrolle'}];
  a.state.taskAssignments=[{ticketId:'t1',employeeId:'e1'},{ticketId:'t1',employeeId:'boss'}];
  const entries=a.workCalendarEntries('2026-09-28','2026-10-04');assert.equal(entries.length,2);assert.equal(entries.filter(e=>e.employeeId==='e1').length,1);
});
test('unassigned work stays visible instead of being lost when no operational employee exists',()=>{
  const a=app();a.state.tickets=[{id:'t',due:'2026-09-29',title:'Reparatur'}];
  assert.deepEqual(Array.from(a.workCalendarEmployees([]),x=>x.name),['Nicht zugeteilt']);
});
test('details and printable order contain place, interval and material, escaped safely',()=>{
  const a=app();const t={id:'t1',parent:'room',title:'Lift <kontrollieren>',text:'Druck & Funktion prüfen',materialNeeded:'2 Filter <A>',assignedEmployeeId:'e1',due:'2026-09-29',status:'Offen',recurrence:{every:12,unit:'days',remindBefore:1,remindUnit:'weeks',managerId:'boss'}};a.state.tickets=[t];
  a.openWorkOrder('t1');const html=a.$('workOrderContent').innerHTML;
  assert.match(html,/Neubau → UG → Technikraum/);assert.match(html,/Alle 12 Tage/);assert.match(html,/1 Woche vorher/);assert.match(html,/2 Filter &lt;A&gt;/);assert.match(html,/Anna/);
  a.printWorkOrder('t1');assert.equal(a.printed,true);assert.match(a.$('workOrderPrint').innerHTML,/Unterschrift/);assert.match(a.$('workOrderPrint').innerHTML,/2 Filter &lt;A&gt;/);
});
test('failed order save keeps form input and existing state, successful save stores assignment and recurrence',async()=>{
  const a=app();const values={ticketTitle:'Kompressor prüfen',ticketParent:'room',ticketDue:'2026-09-29',ticketAssignedEmployee:'e1',ticketPlanningKind:'inspection',ticketRepeat:'repeat',ticketRepeatEvery:'12',ticketRepeatUnit:'days',ticketReminderBefore:'1',ticketReminderUnit:'weeks',ticketReminderManager:'boss',ticketType:'Kontrolle / Prüfung',ticketStatus:'Offen',ticketPrio:'Mittel',ticketMaterial:'1 Filter'};
  Object.entries(values).forEach(([id,value])=>a.$(id).value=value);
  a.api=async()=>{throw new Error('offline');};assert.equal(await a.saveWorkOrder(),false);assert.equal(a.state.tickets.length,0);assert.equal(a.$('ticketTitle').value,values.ticketTitle);assert.equal(a.$('ticketSaveBtn').disabled,false);assert.equal(a.closes,0);
  let sent;a.api=async(method,body)=>{sent=body.item;return {...a.state,tickets:[sent]};};assert.equal(await a.saveWorkOrder(),true);assert.equal(sent.materialNeeded,'1 Filter');assert.equal(sent.assignedEmployeeId,'e1');assert.equal(sent.recurrence.every,12);assert.equal(sent.recurrence.managerId,'boss');
});
test('desktop and field additions parse as JavaScript',()=>{
  assert.doesNotThrow(()=>new vm.Script(code));assert.doesNotThrow(()=>new vm.Script(readFileSync(new URL('../assets/field-work-orders.js',import.meta.url),'utf8')));
  const html=readFileSync(new URL('../field.html',import.meta.url),'utf8');for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(m[1]));
});

test('a control starts at its asset while a one-time order has no interval fields',()=>{
  const a=app();a.state.nodes.push({id:'compressor',type:'Anlage',name:'Kompressor'});
  a.openNewInspection('room');assert.equal(a.$('ticketModal').style.display,undefined);
  a.openNewInspection('compressor');assert.equal(a.$('ticketParent').value,'compressor');assert.equal(a.$('ticketParent').disabled,true);assert.equal(a.$('ticketPlanningKind').value,'inspection');assert.equal(a.$('ticketRecurrenceFields').hidden,false);
  a.openWorkOrderEditor('',{planningKind:'work_order',parentId:'room',date:'2026-09-30'});assert.equal(a.$('ticketPlanningKind').value,'work_order');assert.equal(a.$('ticketRecurrenceFields').hidden,true);assert.equal(a.$('ticketParent').disabled,false);
});

test('only open unscheduled inspections appear in the planning queue, sorted by deadline',()=>{
  const a=app();a.state.tickets=[
    {id:'later',planningKind:'inspection',due:'2027-01-01',title:'Later'},
    {id:'first',planningKind:'inspection',due:'2026-10-10',title:'First'},
    {id:'planned',planningKind:'inspection',due:'2026-10-10',assignedEmployeeId:'e1'},
    {id:'done',planningKind:'inspection',status:'Erledigt'},
    {id:'once',planningKind:'work_order',due:'2026-09-30'}
  ];
  assert.deepEqual(Array.from(a.unplannedInspections(),t=>t.id),['first','later']);
  assert.deepEqual(Array.from(a.workCalendarEntries('2026-09-28','2026-10-04'),e=>e.id),['once']);
});

test('an inspection follows its scheduled day and worker, while details keep the original deadline',()=>{
  const a=app();a.state.tickets=[{id:'t',planningKind:'inspection',assignedEmployeeId:'boss',due:'2026-10-10',title:'Kontrolle'}];
  a.state.taskAssignments=[{id:'plan-t',ticketId:'t',employeeId:'e1',dueDate:'2026-09-30'}];
  const entries=a.workCalendarEntries('2026-09-28','2026-10-04');
  assert.equal(entries.length,1);assert.equal(entries[0].date,'2026-09-30');assert.equal(entries[0].employeeId,'e1');
  assert.deepEqual(Array.from(a.workOrderEmployeeIds(a.state.tickets[0])),['e1']);
  const html=a.workOrderDetailsHtml(a.state.tickets[0]);assert.match(html,/2026-10-10/);assert.match(html,/2026-09-30/);
  assert.equal(a.unplannedInspections().length,0);
});

test('failed scheduling keeps input; scheduling and replanning update one assignment without changing the inspection',async()=>{
  const a=app();a.state.tickets=[{id:'t',planningKind:'inspection',due:'2026-10-10',title:'Kontrolle',recurrence:{every:12,unit:'days'}}];
  a.openInspectionPlanning('t');a.$('inspectionPlanEmployee').value='e1';a.$('inspectionPlanDate').value='2026-09-30';
  a.api=async()=>{throw new Error('offline');};
  assert.equal(await a.saveInspectionPlanning(),false);assert.equal(a.$('inspectionPlanDate').value,'2026-09-30');assert.equal(a.$('inspectionPlanModal').style.display,'flex');assert.equal(a.state.taskAssignments.length,0);
  a.api=async(method,body)=>{assert.equal(body.collection,'taskAssignments');return {...a.state,taskAssignments:[body.item]};};
  assert.equal(await a.saveInspectionPlanning(),true);assert.equal(a.state.taskAssignments[0].id,'plan-t');
  a.openInspectionPlanning('t');a.$('inspectionPlanDate').value='2026-10-02';a.$('inspectionPlanEmployee').value='boss';
  assert.equal(await a.saveInspectionPlanning(),true);assert.equal(a.state.taskAssignments.length,1);assert.equal(a.state.taskAssignments[0].id,'plan-t');assert.equal(a.state.taskAssignments[0].dueDate,'2026-10-02');
  assert.equal(a.state.tickets[0].due,'2026-10-10');assert.equal(a.state.tickets[0].recurrence.every,12);
});
