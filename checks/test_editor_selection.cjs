// Exercise the actual selection decorations on the editor's source/display adapter.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Textarea{
 constructor(){this._value='';this._start=this._end=0;this.selectionDirection='none';this.listeners=new Map();this.readOnly=false;}
 get value(){return this._value;}set value(value){this._value=String(value);this._start=this._end=this._value.length;}
 get selectionStart(){return this._start;}set selectionStart(value){this._start=value;}get selectionEnd(){return this._end;}set selectionEnd(value){this._end=value;}
 setSelectionRange(start,end,direction='none'){this._start=start;this._end=end;this.selectionDirection=direction;}
 addEventListener(type,fn,capture=false){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({fn,capture});}
 emit(type,event={}){event.preventDefault??=()=>event.defaultPrevented=true;event.stopImmediatePropagation??=()=>event.stopped=true;for(const {fn} of [...(this.listeners.get(type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){fn(event);if(event.stopped)break;}return event;}
 focus(){}
}
const editor=new Textarea(),file={id:'a',mode:'text',content:''},nodes=new Map(),frames=[];let paints=0;
const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,style:{},addEventListener(){},classList:{remove(){}}});return nodes.get(id);};
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode=text=>text.replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[key]);
const visibleText=html=>decode(html.replace(/<[^>]*>/g,''));
const c=vm.createContext({HTMLTextAreaElement:Textarea,editor,$,state:{activeId:'a',notes:[file],settings:{openIds:['a']}},note:()=>file,escape,ready:true,actions:{},
 document:{activeElement:editor,addEventListener(){}},requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},paintEditor(){paints++;},closeCompletions(){},
 editorLayout:{key:null,offsets:[],lineHeight:24},CSS:{supports:(_name,value)=>/^(red|blue|transparent|#[\da-f]{3,8})$/i.test(value)},
});
for(const name of ['editor-colors.js','code-structure.js','editor-color-spacing.js','editor-structure.js','search-features.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../source',name),'utf8'),c);
c.wireCodeStructure();
const raw=()=>Object.getOwnPropertyDescriptor(Textarea.prototype,'value').get.call(editor);
const nativeSelect=(start,end,direction='forward')=>Textarea.prototype.setSelectionRange.call(editor,start,end,direction);
const html=()=>c.decorateCodeStructure(escape(editor.value));
const breaks=value=>(value.match(/class="editor-selection-newline"/g)||[]).length;
const caret=value=>{const at=value.indexOf('<mark class="editor-selection-caret');return at<0?null:visibleText(value.slice(0,at)).length;};
function load(text,mode='text'){file.content=text;file.mode=mode;editor.value=text;c.document.activeElement=editor;}
load('alpha\n\nbeta\n');editor.setSelectionRange(6,7,'forward');let result=html();assert.equal(breaks(result),1);assert.equal(caret(result),7);assert.equal(visibleText(result),editor.value);assert.equal(raw(),file.content,'Selection marks never insert characters into the editable source');
editor.setSelectionRange(0,7,'backward');result=html();assert.equal(breaks(result),2);assert.equal(caret(result),0,'Backward selection puts the I-shaped caret at its active start');
editor.setSelectionRange(1,4,'forward');result=html();assert.equal(breaks(result),0);assert.equal(caret(result),4);
editor.setSelectionRange(0,editor.value.length,'forward');result=html();assert.equal(breaks(result),3);assert.equal(caret(result),editor.value.length,'The caret can follow the final selected newline');
c.document.activeElement={};assert.equal(caret(html()),null,'The custom caret hides when focus leaves the editor');assert.equal(breaks(html()),3,'Unfocused selected text stays visible');
c.document.activeElement=editor;editor.emit('focus');while(frames.length)frames.shift()();const painted=paints;c.document.activeElement={};editor.emit('blur');while(frames.length)frames.shift()();assert.ok(paints>painted,'Focus changes schedule the caret repaint');
c.document.activeElement=editor;editor.setSelectionRange(6,6);assert.equal(caret(html()),null);assert.equal(breaks(html()),0,'Collapsed selections use the ordinary native caret');
load('<em>\n\n&','html');editor.setSelectionRange(0,editor.value.length,'forward');result=c.decorateCodeStructure('<span class="tok-tag">&lt;em&gt;</span>\n\n&amp;');assert.equal(visibleText(result),file.content);assert.equal(breaks(result),2);assert.equal(caret(result),file.content.length,'Entities and syntax spans preserve caret offsets');
load('function outer() {\n\n  return "red";\n}\nconst color = "blue";\n','javascript');c.toggleCodeFold(c.codeRecord().structure.regions[0].key,false);nativeSelect(0,raw().length);result=html();assert.equal(visibleText(result),raw());assert.equal(breaks(result),(raw().match(/\n/g)||[]).length,'Folded newlines do not leave orphaned selection markers');assert.equal(caret(result),raw().length);
let copied='';editor.emit('copy',{clipboardData:{setData:(_type,text)=>copied=text}});assert.equal(copied,file.content,'Copying a folded selection retains the exact complete original source');
load('color: red;\n\n','css');editor.setSelectionRange(0,file.content.indexOf(';'),'forward');result=html();assert.equal(caret(result),file.content.indexOf(';')+3,'Caret follows the same display-only spacing as color swatches');assert.equal(c.codeDisplayCaretColumn(0),caret(result));
const pad=c.codeProjectionForCurrent().pads[0];nativeSelect(pad.displayAt,pad.displayAt+1);assert.equal(caret(html()),pad.displayAt+1,'Selecting within display padding uses the native display endpoint');
load('😀\tfirst\n\n日本語\n');editor.setSelectionRange(2,editor.value.length,'forward');result=html();assert.equal(visibleText(result),file.content);assert.equal(caret(result),file.content.length);assert.equal(breaks(result),3,'Unicode, tabs and empty lines remain exact');
console.log('Passed: selected empty/newline cells, forward/backward active caret, focus cleanup, exact source/clipboard text, EOF, syntax/entities, folds, display-only color gaps, Unicode and tabs.');
