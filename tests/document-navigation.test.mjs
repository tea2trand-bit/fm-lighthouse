import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const names=['openDocFor','openDocModal','closeDocumentModal','saveDocument'];
const functions=[];
for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){
  const source=ts.createSourceFile('index.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  for(const declaration of source.statements)if(ts.isFunctionDeclaration(declaration)&&names.includes(declaration.name?.text))functions.push(declaration.getText(source));
}
function app(){
  const fields={};
  const context=vm.createContext({selected:'floor',documentParentId:'',documentReturnAnlage:'',uploadDocBase64:null,uploadDocContentType:'',uploadDocFileName:'',
    $:id=>fields[id]||={value:'',textContent:'',style:{display:'none'},files:[]},
    node:id=>id==='asset'?{id,type:'Anlage'}:null,isAssetNode:n=>n?.type==='Anlage',path:()=> 'Neubau / UG / Kompressor',
    uid:()=> 'doc-new',alert:()=>{},render:()=>{},renderAnlageRelated:id=>context.refreshed=id,
  });
  vm.runInContext(functions.join('\n'),context);
  context.$('anlageEditId').value='asset';context.$('anlageModal').style.display='flex';context.$('anlageName').value='Unsaved machine name';
  return context;
}
test('canceling a document returns to the same asset and preserves the background selection and unsaved fields',()=>{
  const a=app();a.openDocFor('asset');
  assert.equal(a.selected,'floor');assert.equal(a.$('anlageModal').style.display,'none');
  a.closeDocumentModal();
  assert.equal(a.$('anlageModal').style.display,'flex');assert.equal(a.$('anlageName').value,'Unsaved machine name');assert.equal(a.selected,'floor');assert.equal(a.refreshed,'asset');
});
test('document save uses its fixed asset and returns there, while failed upload keeps the input',async()=>{
  const a=app();a.openDocFor('asset');a.$('docTitle').value='Prüfbericht';
  a.api=async()=>{throw new Error('offline');};await a.saveDocument();
  assert.equal(a.$('docModal').style.display,'flex');assert.equal(a.$('docTitle').value,'Prüfbericht');
  let item;a.api=async(_method,body)=>{item=body.item;return {docs:[item]};};await a.saveDocument();
  assert.equal(item.parent,'asset');assert.equal(a.selected,'floor');assert.equal(a.$('docModal').style.display,'none');assert.equal(a.$('anlageModal').style.display,'flex');
});
