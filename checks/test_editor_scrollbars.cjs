const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const tracks=new Map(),classes=()=>{const values=new Set();return {add:n=>values.add(n),remove:n=>values.delete(n),toggle:(n,on)=>on?values.add(n):values.delete(n)};};
const element=id=>{if(!tracks.has(id)){const handlers=new Map();tracks.set(id,{hidden:false,style:{},classList:classes(),firstElementChild:{style:{}},attrs:{},captured:false,
  setAttribute(k,v){this.attrs[k]=v;},getBoundingClientRect:()=>({left:10,top:10}),setPointerCapture(){this.captured=true;},hasPointerCapture(){return this.captured;},releasePointerCapture(){this.captured=false;},
  addEventListener(name,fn){handlers.set(name,fn);},emit(name,extras={}){const e={button:0,pointerId:1,preventDefault(){this.prevented=true;},...extras};handlers.get(name)?.(e);return e;}});}return tracks.get(id);};
const editor={clientWidth:320,clientHeight:200,scrollWidth:1000,scrollHeight:2000,scrollTop:0,scrollLeft:0,selectionStart:3,selectionEnd:9,value:'keep these contents'};
const c=vm.createContext({state:{},editor,$:element,editorLayout:{lineHeight:24},syncScroll:()=>c.syncEditorScrollbars()});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/editor-scrollbars.js'),'utf8'),c);c.wireEditorScrollbars();c.syncEditorScrollbars();
const vertical=element('editorVerticalScrollbar'),horizontal=element('editorHorizontalScrollbar');assert.equal(vertical.hidden,false);assert.equal(horizontal.hidden,false);
assert.equal(vertical.attrs['aria-valuemax'],'1800');assert.equal(horizontal.attrs['aria-valuemax'],'680');
let g=c.editorScrollbarGeometry(200,2000,188,0);vertical.emit('pointerdown',{clientY:10+g.thumb/2});vertical.emit('pointermove',{clientY:10+g.thumb/2+g.travel/2});assert.ok(Math.abs(editor.scrollTop-900)<.001);assert.equal(vertical.captured,true);vertical.emit('pointerup');assert.equal(vertical.captured,false);
g=c.editorScrollbarGeometry(320,1000,308,0);horizontal.emit('pointerdown',{clientX:10+g.thumb/2});horizontal.emit('pointermove',{clientX:10+g.thumb/2+g.travel/2});assert.ok(Math.abs(editor.scrollLeft-340)<.001);horizontal.emit('pointerup');
const wheel=horizontal.emit('wheel',{deltaY:80,deltaX:0,deltaMode:0});assert.equal(wheel.prevented,true);assert.equal(Math.round(editor.scrollLeft),420);
const unchanged=editor.scrollTop;assert.equal(vertical.emit('wheel',{ctrlKey:true,deltaY:10}).prevented,undefined);assert.equal(editor.scrollTop,unchanged,'Ctrl+wheel remains available for zoom');
vertical.emit('keydown',{key:'End'});assert.equal(editor.scrollTop,1800);vertical.emit('keydown',{key:'Home'});assert.equal(editor.scrollTop,0);
assert.deepEqual([editor.selectionStart,editor.selectionEnd,editor.value],[3,9,'keep these contents'],'Scrollbar drags do not move the caret, select text or edit the file');
editor.scrollHeight=200;editor.scrollWidth=320;c.syncEditorScrollbars();assert.equal(vertical.hidden,true);assert.equal(horizontal.hidden,true);assert.equal(element('editorScrollbarCorner').hidden,true);
const css=fs.readFileSync(path.join(__dirname,'../source/editor-scrollbars.css'),'utf8');assert.match(css,/#editor::-webkit-scrollbar[^}]+display:none/);assert.match(css,/\.editor-scrollbar[^}]+cursor:default!important/);
console.log('Passed: independent scrollbar tracks, exact vertical/horizontal dragging, keyboard/wheel operation, zoom passthrough, automatic visibility and intact caret/content.');
