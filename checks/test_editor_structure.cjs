const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class NativeTextarea{
 constructor(){this._value='';this._start=0;this._end=0;this.listeners=new Map();this.selectionDirection='none';this.readOnly=false;}
 get value(){return this._value;}set value(value){this._value=String(value);this._start=this._end=this._value.length;}
 get selectionStart(){return this._start;}set selectionStart(value){this._start=value;}get selectionEnd(){return this._end;}set selectionEnd(value){this._end=value;}
 setSelectionRange(start,end,direction='none'){this._start=Math.max(0,Math.min(this._value.length,start));this._end=Math.max(this._start,Math.min(this._value.length,end));this.selectionDirection=direction;}
 addEventListener(name,fn,capture=false){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push({fn,capture});}
 emit(name,event={}){event.preventDefault??=()=>event.defaultPrevented=true;event.stopImmediatePropagation??=()=>event.stopped=true;for(const listener of [...(this.listeners.get(name)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){listener.fn(event);if(event.stopped)break;}return event;}
 focus(){}
}
const editor=new NativeTextarea(),source='function first() {\n  const hidden = "safe";\n  return hidden;\n}\n\nfunction second() {\n  return 2;\n}\n',file={id:'a',content:source,mode:'javascript'},other={id:'b',content:'<div>\n  <p>text</p>\n</div>',mode:'html'};
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,style:{},addEventListener(){},contains(){return false;}});return nodes.get(id);};
const context=vm.createContext({HTMLTextAreaElement:NativeTextarea,editor,state:{activeId:'a',notes:[file,other]},note:()=>context.state.notes.find(n=>n.id===context.state.activeId),$:node,actions:{},editorLayout:{key:null,offsets:[],lineHeight:24},ready:true,document:{activeElement:editor,addEventListener(){}},requestAnimationFrame:()=>1,closeCompletions(){},paintEditor(){},editorLineAt:at=>context.sourceLineAt(context.sourceLineStarts(editor.value),at),escape:text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
for(const name of ['code-structure.js','editor-structure.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../source',name),'utf8'),context);
context.replaceText=(start,end,insert)=>{editor.setRangeText(insert,start,end,'end');context.note().content=editor.value;};
context.wireCodeStructure();editor.value=source;editor.setSelectionRange(0,0);let record=context.codeRecord(),region=record.structure.regions[0];context.toggleCodeFold(region.key,false);
const raw=()=>Object.getOwnPropertyDescriptor(NativeTextarea.prototype,'value').get.call(editor);
const nativeSelect=(start,end=start)=>NativeTextarea.prototype.setSelectionRange.call(editor,start,end);
assert.equal(editor.value,source);assert.ok(!raw().includes('const hidden'));assert.equal(file.content,source,'Folding never rewrites the file');assert.ok(context.codeLineHidden(1));assert.ok(!context.codeLineHidden(3));
nativeSelect(0,raw().length);let copied='';editor.emit('copy',{clipboardData:{setData(type,text){assert.equal(type,'text/plain');copied=text;}}});assert.equal(copied,source,'Copy includes collapsed contents');
editor.setSelectionRange(source.indexOf('return hidden'),source.indexOf('return hidden')+6);assert.equal(raw(),source,'Navigation into hidden source opens the fold');
context.toggleCodeFold(region.key,false);editor.setSelectionRange(source.indexOf('second'),source.indexOf('second')+6);editor.setRangeText('renamed',editor.selectionStart,editor.selectionEnd,'end');file.content=editor.value;assert.match(editor.value,/function renamed/);assert.ok(!raw().includes('const hidden'),'Programmatic edits after a fold retain the unrelated collapse');assert.match(editor.value,/const hidden = "safe"/);
function type(insert,inputType='insertText'){
 editor.emit('beforeinput',{inputType,data:insert});const before=raw(),from=Object.getOwnPropertyDescriptor(NativeTextarea.prototype,'selectionStart').get.call(editor),end=Object.getOwnPropertyDescriptor(NativeTextarea.prototype,'selectionEnd').get.call(editor);
 const text=before.slice(0,from)+insert+before.slice(end);Object.getOwnPropertyDescriptor(NativeTextarea.prototype,'value').set.call(editor,text);nativeSelect(from+insert.length);editor.emit('input',{inputType,data:insert});file.content=editor.value;
}
editor.setSelectionRange(editor.value.length,editor.value.length);type('// appended\n');assert.match(editor.value,/const hidden = "safe"/);assert.match(editor.value,/appended/);assert.ok(!raw().includes('const hidden'),'Typing outside a fold preserves it');
editor.setSelectionRange(0,0);type('// prefix\n');assert.ok(!raw().includes('const hidden'),'Edits before a fold shift its source anchors');assert.ok(context.codeLineHidden(2));
context.foldAllSections(true);assert.equal(raw(),editor.value);context.foldAllSections(false);assert.equal(editor.value,file.content);assert.ok(raw().length<editor.value.length);
context.state.activeId='b';editor.value=other.content;assert.equal(raw(),other.content);context.state.activeId='a';editor.value=file.content;assert.ok(raw().length<editor.value.length,'Each tab restores its folding state');
context.foldAllSections(true);record=context.codeRecord();region=record.structure.regions.find(r=>r.label.startsWith('function first'));context.toggleCodeFold(region.key,false);
nativeSelect(context.foldDisplayOffset(context.codeProjectionForCurrent(),region.to));editor.emit('beforeinput',{inputType:'deleteContentBackward'});assert.ok(raw().includes('const hidden'),'Deleting across a folded boundary reveals hidden source first');
editor.value=source;file.content=source;context.foldAllSections(false);nativeSelect(0,raw().length);const changed=editor.emit('beforeinput',{inputType:'insertText',data:'replacement'});assert.equal(changed.defaultPrevented,true);assert.equal(editor.value,'replacement','Typing over a selection that spans a fold replaces exactly the selected full source');
editor.value=source;file.content=source;context.foldAllSections(false);nativeSelect(0,raw().length);editor.emit('paste',{clipboardData:{getData:()=> 'pasted\r\ntext'}});assert.equal(editor.value,'pasted\ntext','Paste over a collapsed selection uses full source coordinates');
const nested='function outer() {\n  function inner() {\n    return "nested body";\n  }\n  return inner();\n}\nfunction neighbor() {\n  return "neighbor body";\n}\n';
editor.value=nested;file.content=nested;record=context.codeRecord();const outer=record.structure.regions.find(r=>r.label.startsWith('function outer')),inner=record.structure.regions.find(r=>r.label.startsWith('function inner')),neighbor=record.structure.regions.find(r=>r.label.startsWith('function neighbor'));
context.toggleCodeFold(inner.key,false);context.toggleCodeFold(neighbor.key,false);context.toggleCodeFold(outer.key,false);context.toggleCodeFold(outer.key,true);
assert.ok(!record.collapsed.has(outer.key)&&!record.collapsed.has(inner.key),'Expanding a parent also expands a child folded before its parent');assert.ok(record.collapsed.has(neighbor.key),'Expanding a parent keeps unrelated sections collapsed');assert.match(raw(),/nested body/);assert.doesNotMatch(raw(),/neighbor body/);assert.equal(editor.value,nested);assert.equal(file.content,nested);
context.foldAllSections(false);editor.setSelectionRange(outer.start,outer.start);context.foldCurrentSection(true);assert.ok(!record.collapsed.has(outer.key)&&!record.collapsed.has(inner.key),'The Expand Section shortcut has the same recursive behavior');assert.ok(record.collapsed.has(neighbor.key));
console.log('Passed: full source behind folded display, exact caret offsets, copy of hidden text, navigation reveal, source edits before/after folds, programmatic replacement, per-tab folding, expand-all and safe deletion boundaries.');
