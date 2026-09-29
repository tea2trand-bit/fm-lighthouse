import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const wanted = new Set(['toLocalDateString','planningWeekStart','planningPeriod','planningDates','hasShiftInPeriod','hasTaskInPeriod','navigateCalendar','saveCalendarPlan','renderWeeklyPlan','esc','escJsArg','getStGallenHolidays','getEasterSunday']);
const declarations = scripts.flatMap(code => {
  const source = ts.createSourceFile('index.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return source.statements.filter(n => ts.isFunctionDeclaration(n) && wanted.has(n.name?.text)).map(n => n.getText(source));
});
assert.equal(declarations.length, wanted.size, 'all planning functions must be exercised from the real app');

function app() {
  const fields = {};
  let nextId = 0;
  const ctx = vm.createContext({
    Date, console,
    state: { employees:[{id:'anna',name:'Anna'}], shifts:[] },
    currentCalendarDate:new Date(2026,8,29), currentCalendarView:'week', calendarFilters:{},
    getTodayDate:() => new Date(2026,8,29),
    $: id => fields[id] ||= {value:'',style:{},hidden:false,disabled:false,textContent:''},
    operationalEmployees:() => ctx.state.employees,
    uid:() => `new-${++nextId}`,
    renderCalendar:() => {}, clearCalendarFilters:() => {},
    saves:0, closes:0,
    save:async () => { ctx.saves++; return true; },
    closeModals:() => {ctx.closes++;},
  });
  vm.runInContext(declarations.join('\n'), ctx);
  vm.runInContext(readFileSync(new URL('../assets/work-orders.js', import.meta.url), 'utf8'), ctx);
  ctx.ticketDate=value=>value;
  ctx.isClosedTicketStatus=value=>/erledigt|abgeschlossen/i.test(value||'');
  const values = {planEmpSelect:'anna',planRangeType:'single',planDateSingle:'2026-09-29',planShiftType:'Normaldienst',planTask:'Lüftung prüfen',planWorkLocation:'Neubau / UG / Technikraum'};
  for (const [id,value] of Object.entries(values)) ctx.$(id).value=value;
  ctx.$('planEmpSelectGroup').style.display='block';
  return ctx;
}

test('desktop inline JavaScript remains syntactically valid after integration', () => {
  for (const code of scripts) assert.doesNotThrow(() => new vm.Script(code));
  assert.doesNotMatch(html,/^(<<<<<<<|=======|>>>>>>>)/m);
});

test('weekly dates cross months, years and daylight-saving changes without losing days', () => {
  const a=app();
  assert.deepEqual({...a.planningPeriod(new Date(2026,0,1),'week')},{start:'2025-12-29',end:'2026-01-04'});
  assert.deepEqual({...a.planningPeriod(new Date(2026,8,29),'week')},{start:'2026-09-28',end:'2026-10-04'});
  for (const [start,end] of [['2026-03-23','2026-03-29'],['2026-10-19','2026-10-25']]) {
    const days=Array.from(a.planningDates(start,end));
    assert.equal(days.length,7); assert.equal(days[0],start); assert.equal(days[6],end);
  }
  assert.equal(a.planningDates('2026-02-30','2026-03-01').length,0);
  assert.equal(a.planningDates('2026-10-01','2026-09-30').length,0);
  assert.equal(a.planningDates('2026-01-01','2028-01-01').length,0);
});

test('optional workday ranges skip weekends and regional holidays', () => {
  const a=app();
  assert.deepEqual(Array.from(a.planningDates('2026-12-24','2026-12-28',true)),['2026-12-24','2026-12-28']);
  assert.equal(a.planningDates('2026-12-24','2026-12-28').length,5);
});

test('month navigation from the 31st does not skip February', () => {
  const a=app(); a.currentCalendarView='month'; a.currentCalendarDate=new Date(2026,0,31);
  a.navigateCalendar(1); assert.equal(a.toLocalDateString(a.currentCalendarDate),'2026-02-01');
  a.currentCalendarView='week'; a.currentCalendarDate=new Date(2026,11,30);
  a.navigateCalendar(1); assert.equal(a.toLocalDateString(a.currentCalendarDate),'2027-01-06');
});

test('weekly filters include Sunday and exclude the following Monday', () => {
  const a=app();
  a.state.shifts=[{employeeId:'anna',date:'2026-10-04',shiftType:'Krank'},{employeeId:'anna',date:'2026-10-05',shiftType:'Ferien Antrag',taskAssignment:'Later'}];
  assert.equal(a.hasShiftInPeriod('anna','Krank'),true);
  assert.equal(a.hasShiftInPeriod('anna','Ferien Antrag'),false);
  assert.equal(a.hasTaskInPeriod('anna'),false);
});

test('weekly calendar shows only a compact safe title and keeps locations in details', () => {
  const a=app();
  const shifts=[{id:'s1',employeeId:'anna',date:'2026-09-29',shiftType:'Normaldienst',workLocation:'UG <script>',taskAssignment:'Heizung & Lüftung'},{id:'s2',employeeId:'anna',date:'2026-09-30',shiftType:'Krank',taskAssignment:'Private health note'}];
  const result=a.renderWeeklyPlan(a.state.employees,shifts);
  assert.doesNotMatch(result,/UG &lt;script&gt;/); assert.match(result,/Heizung &amp; Lüftung/);
  assert.match(result,/Abwesend/); assert.doesNotMatch(result,/Private health note/);
  assert.equal((result.match(/class="workAdd"/g)||[]).length,7);
  assert.match(result,/<table class="workCalendar weeklyCalendar">/);
  assert.equal((result.match(/scope="col"/g)||[]).length,8);
  assert.equal(a.$('planningSummary').textContent,'0 Arbeitsaufträge · 1 Mitarbeiter');
});

test('editing moves the existing entry and keeps its identity and manager', async () => {
  const a=app();
  a.state.shifts=[{id:'s1',employeeId:'anna',date:'2026-09-28',managedByEmployeeId:'boss',workload:'Hoch'}];
  a.$('planEditId').value='s1';
  await a.saveCalendarPlan();
  assert.equal(a.state.shifts.length,1);
  assert.equal(a.state.shifts[0].id,'s1'); assert.equal(a.state.shifts[0].date,'2026-09-29');
  assert.equal(a.state.shifts[0].managedByEmployeeId,'boss');
  assert.equal(a.state.shifts[0].workLocation,'Neubau / UG / Technikraum');
  assert.equal(a.closes,1); assert.equal(a.saves,1);
});

test('a conflicting entry is left intact and no save is attempted', async () => {
  const a=app(); const old=[{id:'s1',employeeId:'anna',date:'2026-09-29',taskAssignment:'Existing'}];
  a.state.shifts=old; await a.saveCalendarPlan();
  assert.equal(a.state.shifts,old); assert.equal(a.saves,0); assert.equal(a.closes,0);
  assert.match(a.$('planFormError').textContent,/29\.09\.2026/);
});

test('multi-day planning includes both endpoints and persists the place for each day', async () => {
  const a=app(); a.$('planRangeType').value='range';
  a.$('planDateStart').value='2026-10-23'; a.$('planDateEnd').value='2026-10-26';
  a.$('planSkipWeekends').checked=false;
  await a.saveCalendarPlan();
  assert.deepEqual(Array.from(a.state.shifts,s=>s.date),['2026-10-23','2026-10-24','2026-10-25','2026-10-26']);
  assert.ok(a.state.shifts.every(s=>s.workLocation==='Neubau / UG / Technikraum'));
});

test('a failed save restores the old plan and keeps the form open', async () => {
  const a=app(); const old=[]; a.state.shifts=old; a.save=async()=>false;
  await a.saveCalendarPlan();
  assert.equal(a.state.shifts,old); assert.equal(a.closes,0);
  assert.equal(a.$('planFormError').hidden,false); assert.equal(a.$('planSaveBtn').disabled,false);
});

test('absences need no workplace or task', async () => {
  const a=app(); a.$('planShiftType').value='Ferien Antrag'; a.$('planTask').value=''; a.$('planWorkLocation').value='';
  await a.saveCalendarPlan();
  assert.equal(a.saves,1); assert.equal(a.state.shifts[0].shiftType,'Ferien Antrag');
  assert.equal(a.state.shifts[0].workLocation,'');
});
