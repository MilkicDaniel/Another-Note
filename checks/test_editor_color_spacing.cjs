// Run the real textarea/source adapter with display-only space for color widgets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Textarea{
 constructor(){this._value='';this._start=this._end=0;this.listeners=new Map();this.selectionDirection='none';this.readOnly=false;}
 get value(){return this._value;}set value(value){this._value=String(value);this._start=this._end=this._value.length;}
 get selectionStart(){return this._start;}set selectionStart(value){this._start=value;}get selectionEnd(){return this._end;}set selectionEnd(value){this._end=value;}
 setSelectionRange(start,end,direction='none'){this._start=start;this._end=end;this.selectionDirection=direction;}
 addEventListener(name,fn,capture=false){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push({fn,capture});}
 emit(name,event={}){event.preventDefault??=()=>event.defaultPrevented=true;event.stopImmediatePropagation??=()=>event.stopped=true;for(const item of [...(this.listeners.get(name)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){item.fn(event);if(event.stopped)break;}return event;}
 focus(){}
}
const editor=new Textarea(),file={id:'a',mode:'css',content:''},nodes=new Map();
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const c=vm.createContext({HTMLTextAreaElement:Textarea,editor,state:{activeId:'a',notes:[file],settings:{openIds:['a']}},note:()=>file,
 $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,style:{},addEventListener(){}});return nodes.get(id);},actions:{},
 CSS:{supports:(_property,value)=>/^(?:transparent|red|blue|#[\da-f]{3,8}|rgba?\([^)]*\))$/i.test(value)},document:{addEventListener(){},activeElement:editor},
 requestAnimationFrame:()=>1,ready:true,editorLayout:{key:null,offsets:[],lineHeight:24},closeCompletions(){},paintEditor(){},escape,
 editorLineAt:offset=>c.sourceLineAt(c.sourceLineStarts(editor.value),offset),
});
for(const name of ['editor-colors.js','code-structure.js','editor-color-spacing.js','editor-structure.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../source',name),'utf8'),c);
c.replaceText=(start,end,insert)=>{editor.setRangeText(insert,start,end,'end');file.content=editor.value;};
c.wireCodeStructure();
const raw=()=>Object.getOwnPropertyDescriptor(Textarea.prototype,'value').get.call(editor),rawStart=()=>Object.getOwnPropertyDescriptor(Textarea.prototype,'selectionStart').get.call(editor);
const nativeSelect=(start,end=start)=>Textarea.prototype.setSelectionRange.call(editor,start,end);
function load(text,mode='css'){file.mode=mode;file.content=text;editor.value=text;editor.setSelectionRange(0,0);}
function type(text){
 const event=editor.emit('beforeinput',{inputType:'insertText',data:text});if(event.defaultPrevented)return;
 const before=raw(),start=rawStart(),end=Object.getOwnPropertyDescriptor(Textarea.prototype,'selectionEnd').get.call(editor);
 Object.getOwnPropertyDescriptor(Textarea.prototype,'value').set.call(editor,before.slice(0,start)+text+before.slice(end));nativeSelect(start+text.length);editor.emit('input',{inputType:'insertText',data:text});file.content=editor.value;
}
const sample='background-color: transparent;\nbox-shadow: 0 4px 8px rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);\n';
load(sample);assert.equal(editor.value,sample);assert.equal(file.content,sample);assert.match(raw(),/background-color: {4}transparent/);assert.equal(c.codeProjectionForCurrent().pads.length,3,'The screenshot sample has dedicated padding for each of its three color boxes');
for(let offset=0;offset<=sample.length;offset++)assert.equal(c.foldSourceOffset(c.codeProjectionForCurrent(),c.foldDisplayOffset(c.codeProjectionForCurrent(),offset)),offset,'Round-trip source offset '+offset);
assert.equal(c.projectFoldedHTML(escape(sample),c.codeProjectionForCurrent()),escape(raw()),'Syntax text and native editing surface have identical display spacing');
assert.equal(c.codeDisplayText(0,sample.indexOf('\n')),raw().split('\n')[0]);
nativeSelect(0,raw().length);let copied;editor.emit('copy',{clipboardData:{setData:(_type,text)=>copied=text}});assert.equal(copied,sample,'Copy excludes every generated space');
let start=sample.indexOf('transparent');editor.setSelectionRange(start,start+'transparent'.length);type('red');assert.equal(editor.value,sample.replace('transparent','red'));assert.equal(editor.selectionStart,start+3);assert.match(raw(),/ {4}red/);
editor.setSelectionRange(start,start+3);type('notacolor');assert.equal(editor.value,sample.replace('transparent','notacolor'));assert.equal(editor.selectionStart,start+9,'Removing a color widget keeps the caret after the inserted source text');
load(sample);let pad=c.codeProjectionForCurrent().pads[0];nativeSelect(pad.displayAt+1);type('x');assert.equal(editor.value,sample.slice(0,pad.at)+'x'+sample.slice(pad.at));assert.equal(editor.selectionStart,pad.at+1,'Typing inside a widget gap inserts actual source text at its boundary');
load(sample);pad=c.codeProjectionForCurrent().pads[0];nativeSelect(pad.displayAt+pad.length);const back=editor.emit('beforeinput',{inputType:'deleteContentBackward'});assert.equal(back.defaultPrevented,true);assert.equal(editor.value,sample.replace(': transparent',':transparent'),'Backspace skips decoration and deletes the real preceding space');
load(sample);pad=c.codeProjectionForCurrent().pads[0];nativeSelect(pad.displayAt+pad.length);const left=editor.emit('keydown',{key:'ArrowLeft'});assert.equal(left.defaultPrevented,true);assert.equal(rawStart(),pad.displayAt,'One arrow key crosses the display-only gap');
load(sample);pad=c.codeProjectionForCurrent().pads[0];nativeSelect(pad.displayAt+1);editor.emit('paste',{clipboardData:{getData:()=> 'blue '}});assert.equal(editor.value,sample.slice(0,pad.at)+'blue '+sample.slice(pad.at));
const folded='function outer() {\n  return "red";\n}\nconst color = "blue";\n';load(folded,'javascript');let record=c.codeRecord();c.toggleCodeFold(record.structure.regions[0].key,false);
assert.equal(editor.value,folded);assert.doesNotMatch(raw(),/red/);assert.match(raw(),/blue/);assert.equal(c.codeProjectionForCurrent().pads.length,1,'Hidden colors do not leave orphaned widget spaces');assert.equal(c.projectFoldedHTML(escape(folded),c.codeProjectionForCurrent()),escape(raw()));
c.foldAllSections(true);assert.equal(editor.value,folded);assert.equal(c.codeProjectionForCurrent().pads.length,2);nativeSelect(0,raw().length);editor.emit('copy',{clipboardData:{setData:(_type,text)=>copied=text}});assert.equal(copied,folded);
load('const name="日本語"; const color="#abc";\n','javascript');const unicode=editor.value;for(let at=0;at<=unicode.length;at++)assert.equal(c.foldSourceOffset(c.codeProjectionForCurrent(),c.foldDisplayOffset(c.codeProjectionForCurrent(),at)),at);
console.log('Passed: screenshot color spacing, full-source offset mapping, identical syntax/textarea display, exact copying, color edits, caret preservation, typing/pasting in gaps, Backspace/arrow handling, folded colors and Unicode.');
