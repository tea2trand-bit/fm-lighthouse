import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let code;
for (const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  const source=ts.createSourceFile('index.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const declaration=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='saveNewRoom');
  if(declaration) code=declaration.getText(source);
}
assert.ok(code,'test the room-save function from the actual app');

function app(save) {
  const button={disabled:false,textContent:'Speichern'};
  const ctx=vm.createContext({
    state:{nodes:[{id:'floor',name:'UG'}]},selected:'floor',roomSaveInFlight:false,
    $:()=>button,node:id=>ctx.state.nodes.find(n=>n.id===id),
    save,render:()=>{},closed:0,qr:[],history:0,
    closeModals:()=>ctx.closed++,pushNavigationState:()=>ctx.history++,
    openQrModal:(id,options)=>ctx.qr.push({id,created:options.created}),
  });
  vm.runInContext(code,ctx);
  return {ctx,button};
}
const room={id:'room',parent:'floor',type:'Raum / Bereich',name:'Technikraum'};

test('a new room opens its QR only after successful save and stays selected',async()=>{
  let finish; const {ctx,button}=app(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=ctx.saveNewRoom(room);
  assert.equal(button.disabled,true); assert.equal(ctx.qr.length,0); assert.equal(ctx.selected,'floor');
  finish(true); await pending;
  assert.deepEqual(ctx.qr,[{id:'room',created:true}]);
  assert.equal(ctx.selected,'room'); assert.equal(ctx.closed,1); assert.equal(ctx.history,1);
  assert.equal(button.disabled,false);
});

test('failed room creation keeps the form and parent, discards only the unsaved room',async()=>{
  const {ctx,button}=app(async()=>false);
  await ctx.saveNewRoom(room);
  assert.equal(ctx.state.nodes.length,1); assert.equal(ctx.state.nodes[0].id,'floor');
  assert.equal(ctx.selected,'floor'); assert.equal(ctx.closed,0); assert.equal(ctx.qr.length,0);
  assert.equal(button.disabled,false); assert.equal(ctx.roomSaveInFlight,false);
});

test('double submission creates only one room',async()=>{
  let finish,requests=0;
  const {ctx}=app(()=>{requests++;return new Promise(resolve=>{finish=resolve;});});
  const first=ctx.saveNewRoom(room);
  await ctx.saveNewRoom({...room,id:'duplicate'});
  assert.equal(requests,1); assert.equal(ctx.state.nodes.length,2);
  finish(true); await first;
  assert.equal(ctx.qr.length,1);
});

test('no QR opens if the successful response does not contain the new room',async()=>{
  const {ctx}=app(async()=>{ctx.state.nodes=[{id:'floor'}];return true;});
  await ctx.saveNewRoom(room);
  assert.equal(ctx.qr.length,0); assert.equal(ctx.closed,0); assert.equal(ctx.selected,'floor');
});
