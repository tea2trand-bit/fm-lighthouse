// Shift planning and absence entry share the existing employee/day records.
// Work orders and inspection deadlines remain separate from these records.
const teamPlanDates={schicht:new Date(),absenzen:new Date()};
function isAbsenceShift(shift){return /^(Krank|Ferien Antrag|Ferien genehmigt|Ferien approved)$/.test(shift.shiftType);}
function teamShiftLabel(shift){return ({Normaldienst:'Tagdienst',Krank:'Krank','Ferien genehmigt':'Ferien','Ferien approved':'Ferien','Ferien Antrag':'Ferienantrag'})[shift.shiftType]||shift.shiftType||'Schicht';}
function navigateTeamPlan(mode,direction){
  if(!teamPlanDates[mode])return;
  const date=direction?new Date(teamPlanDates[mode]):getTodayDate();
  if(direction)date.setDate(date.getDate()+direction*7);
  teamPlanDates[mode]=date;renderTeamPlans();
}
function teamPlanEmployees(start,end){
  const employees=[...operationalEmployees()],ids=new Set(employees.map(e=>e.id));
  (state.shifts||[]).filter(s=>s.date>=start&&s.date<=end).forEach(s=>{
    const employee=(state.employees||[]).find(e=>e.id===s.employeeId);
    if(employee&&!ids.has(employee.id)){employees.push(employee);ids.add(employee.id);}
  });
  return employees;
}
function renderTeamCalendar(mode){
  const {start,end}=planningPeriod(teamPlanDates[mode],'week');
  const dates=planningDates(start,end),today=toLocalDateString(getTodayDate());
  const employees=teamPlanEmployees(start,end),days=['Mo','Di','Mi','Do','Fr','Sa','So'];
  if(!employees.length)return '<p class="smallText">Noch keine Mitarbeiter vorhanden.</p><button class="btn" onclick="openPlanningTeam()">+ Mitarbeiter hinzufügen</button>';
  const shifts=(state.shifts||[]).filter(s=>s.date>=start&&s.date<=end&&(mode!=='absenzen'||isAbsenceShift(s)));
  return `<table class="workCalendar"><caption>${mode==='absenzen'?'Absenzen':'Schichtplan'}</caption><thead><tr><th scope="col" class="weekEmployee">Mitarbeiter</th>${dates.map((date,i)=>`<th scope="col" class="${date===today?'calendarToday':''}">${esc(days[i])}<span>${esc(ticketDate(date))}</span></th>`).join('')}</tr></thead><tbody>${employees.map(emp=>`<tr><th scope="row" class="weekEmployee">${esc(emp.name)}</th>${dates.map((date,i)=>{
    const entries=shifts.filter(s=>s.employeeId===emp.id&&s.date===date);
    return `<td class="${date===today?'calendarToday':''} ${i>4?'weekend':''}">${entries.map(s=>`<button class="workLine ${isAbsenceShift(s)?'away':''}" title="${esc([teamShiftLabel(s),s.workLocation,s.taskAssignment].filter(Boolean).join(' · '))}" onclick="openTeamPlan('${isAbsenceShift(s)?'absenzen':'schicht'}','${escJsArg(emp.id)}','${escJsArg(date)}','${escJsArg(s.id)}')">${esc(teamShiftLabel(s))}</button>`).join('')}<button class="workAdd" aria-label="${mode==='absenzen'?'Absenz':'Schicht'} für ${esc(emp.name)} am ${esc(date)}" onclick="openTeamPlan('${mode}','${escJsArg(emp.id)}','${escJsArg(date)}')">＋</button></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}
function renderTeamPlans(){
  for(const mode of ['schicht','absenzen']){
    if(!$(mode+'Calendar'))continue;
    const {start,end}=planningPeriod(teamPlanDates[mode],'week');
    $(mode+'Period').textContent=ticketDate(start)+' – '+ticketDate(end);
    $(mode+'Calendar').innerHTML=renderTeamCalendar(mode);
  }
}
function openTeamPlan(mode,employeeId='',date='',shiftId=''){
  if(!teamPlanDates[mode])return;
  const shift=(state.shifts||[]).find(s=>s.id===shiftId);
  if(shift)mode=isAbsenceShift(shift)?'absenzen':'schicht';
  activate(mode==='absenzen'?'absenzen':'piketdienst');
  if(mode==='schicht')setPiketTab('schicht');
  closeModals();
  date=date||toLocalDateString(teamPlanDates[mode]);
  if(employeeId)openCalendarPlan(employeeId,date,shiftId||null);else openNewWorkPlan(date);
  $('planEntryMode').value=mode;
  $('planModalTitle').textContent=mode==='absenzen'?(shift?'Absenz bearbeiten':'Absenz erfassen'):(shift?'Schicht bearbeiten':'Schicht planen');
  const allowed=mode==='absenzen'?['Krank','Ferien genehmigt',...(shift?.shiftType==='Ferien Antrag'?['Ferien Antrag']:[])]:['Normaldienst','Frühdienst','Spätdienst','Nachtdienst',...(shift&&!isAbsenceShift(shift)?[shift.shiftType]:[])];
  Array.from($('planShiftType').options).forEach(option=>{option.hidden=!allowed.includes(option.value);option.disabled=option.hidden;});
  if(!shift)$('planShiftType').value=mode==='absenzen'?'Krank':'Normaldienst';
  updatePlanningFields();
}
