import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const names=['openDocFor','openDocModal','openDocumentRecord','closeDocumentModal','saveDocument'];
const functions=[];
for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){
  const source=ts.createSourceFile('index.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  for(const declaration of source.statements)if(ts.isFunctionDeclaration(declaration)&&names.includes(declaration.name?.text))functions.push(declaration.getText(source));
}
function app(){
  const fields={};
  const context=vm.createContext({selected:'floor',documentParentId:'',documentReturnAnlage:'',documentEditingId:'',state:{docs:[]},uploadDocBase64:null,uploadDocContentType:'',uploadDocFileName:'',
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

test('attaching a missing file updates the existing document and keeps its metadata and location',async()=>{
  const a=app();a.state.docs=[{id:'contract',parent:'asset',title:'Keller Heizungen',type:'Vertrag',folder:'Service',tags:'Heizung',note:'Original note'}];
  a.openDocumentRecord('contract');
  assert.equal(a.$('docTitle').value,'Keller Heizungen');assert.equal(a.$('docModalTitle').textContent,'Datei hinzufügen');
  a.uploadDocBase64='dGVzdA==';a.uploadDocFileName='vertrag.pdf';a.uploadDocContentType='application/pdf';
  let item;a.api=async(_method,body)=>{item=body.item;return {docs:[item]};};await a.saveDocument();
  assert.equal(item.id,'contract');assert.equal(item.parent,'asset');assert.equal(item.note,'Original note');assert.equal(item.type,'Vertrag');
  assert.equal(item.blobKey,'documents/contract/vertrag.pdf');assert.equal(a.state.docs.length,1);assert.equal(a.selected,'floor');
});

test('editing document metadata preserves the attached file and cancel does not change the record',async()=>{
  const a=app();const original={id:'manual',parent:'asset',title:'Anleitung',type:'Manual',blobKey:'documents/manual/file.pdf',fileName:'file.pdf',contentType:'application/pdf'};a.state.docs=[{...original}];
  a.openDocumentRecord('manual');a.$('docTitle').value='Unsaved';a.closeDocumentModal();
  assert.equal(a.state.docs[0].title,'Anleitung');assert.equal(a.documentEditingId,'');
  a.openDocumentRecord('manual');a.$('docTitle').value='Neue Anleitung';
  let item;a.api=async(_method,body)=>{item=body.item;return {docs:[item]};};await a.saveDocument();
  assert.equal(item.id,'manual');assert.equal(item.blobKey,original.blobKey);assert.equal(item.contentType,original.contentType);assert.equal(item.title,'Neue Anleitung');assert.equal(item.base64,undefined);
});

test('a document deleted while its editor is open is not recreated or uploaded under a new ID',async()=>{
  const a=app();a.state.docs=[{id:'deleted',parent:'asset',title:'Old',type:'Vertrag'}];a.openDocumentRecord('deleted');a.state.docs=[];
  let calls=0;a.api=async()=>{calls++;};await a.saveDocument();
  assert.equal(calls,0);assert.equal(a.$('docModal').style.display,'flex');
});
