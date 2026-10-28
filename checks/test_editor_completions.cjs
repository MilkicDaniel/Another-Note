const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixture(){
  const f={changes:[]},elements=new Map(),file={id:'a',mode:'javascript'},editor={value:'console.lo',selectionStart:10,selectionEnd:10,readOnly:false,setAttribute(){},removeAttribute(){},focus(){}};
  const $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,children:[],setAttribute(){},scrollIntoView(){}});return elements.get(id);};
  const c=vm.createContext({editor,note:()=>file,$,clearTimeout(){},setTimeout(){return 1;},composing:false,
    replaceText(from,to,insert,start,end){f.changes.push({from,to,insert,start,end});editor.value=editor.value.slice(0,from)+insert+editor.value.slice(to);editor.selectionStart=start;editor.selectionEnd=end;}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/code-intelligence.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../source/editor-completions.js'),'utf8'),c);
  vm.runInContext("completionSession={id:'a',mode:'javascript',text:editor.value,offset:10,index:0,result:completeCode(editor.value,10,'javascript')}",c);
  return {...f,c,editor,file,$};
}
{
  const f=fixture();assert.equal(f.c.acceptCompletion(),true);assert.equal(f.editor.value,'console.log()');assert.equal(f.editor.selectionStart,12);assert.equal(f.changes.length,1);
}
for(const mutate of [f=>f.editor.value+='g',f=>f.file.id='b',f=>f.file.mode='css',f=>f.editor.readOnly=true,f=>f.file.trashedAt=1,f=>f.editor.selectionStart=2,f=>f.editor.selectionEnd=9]){
  const f=fixture();mutate(f);const before=f.editor.value;assert.equal(f.c.acceptCompletion(),false);assert.equal(f.editor.value,before);assert.equal(f.changes.length,0,'A stale/read-only completion cannot edit the file');
}
for(const [key,code,shiftKey]of [['Tab','Tab',false],['Tab','Tab',true],['Unidentified','Tab',true]]){
  const f=fixture();let prevented=false;f.c.handleCompletionKey({key,code,shiftKey,preventDefault(){prevented=true;},stopImmediatePropagation(){throw Error('Tab must reach line indentation');}});
  assert.equal(prevented,false);assert.equal(f.changes.length,0);assert.equal(vm.runInContext('completionSession',f.c),null,'Tab dismisses hints and remains available for indentation');
}
{
  const f=fixture();f.editor.value+='g';let prevented=false;f.c.handleCompletionKey({key:'Enter',preventDefault(){prevented=true;},stopImmediatePropagation(){throw Error('Stale hints cannot consume Enter');}});assert.equal(prevented,false,'Stale Enter retains its normal editor behavior');
}
{
  const f=fixture();vm.runInContext("completionSession.result.items=[{detail:'a'},{detail:'b'},{detail:'c'}]",f.c);
  f.$('codeCompletionList').children=[0,1,2].map(index=>({dataset:{completionIndex:String(index)},id:'option-'+index,setAttribute(){},scrollIntoView(){}}));
  const key=key=>f.c.handleCompletionKey({key,preventDefault(){},stopImmediatePropagation(){}});
  key('PageUp');assert.equal(vm.runInContext('completionSession.index',f.c),1);key('PageDown');assert.equal(vm.runInContext('completionSession.index',f.c),0);key('ArrowUp');assert.equal(vm.runInContext('completionSession.index',f.c),2);
}
{
  const f=fixture();f.file.mode='html';f.editor.value='<article';f.editor.selectionStart=f.editor.selectionEnd=8;let prevented=false;
  assert.equal(f.c.autoCloseHTMLInput({inputType:'insertText',data:'>',preventDefault(){prevented=true;}}),true);assert.equal(prevented,true);assert.equal(f.editor.value,'<article></article>');assert.equal(f.editor.selectionStart,9);assert.equal(f.changes.length,1);
}
for(const event of [{inputType:'insertFromPaste',data:'>'},{inputType:'insertText',data:'>',isComposing:true},{inputType:'insertText',data:'x'}]){
  const f=fixture();f.file.mode='html';f.editor.value='<div';f.editor.selectionStart=f.editor.selectionEnd=4;assert.equal(f.c.autoCloseHTMLInput(event),false);assert.equal(f.changes.length,0);
}
console.log('PASS: completion insertion, stale/read-only guards, normal stale Enter, short-list Page navigation and composition/paste-safe HTML closing');
