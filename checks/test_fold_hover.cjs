// Exercise the real fold rendering and pointer handlers with wrapped/scrolled rows.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function element(id){
  const names=new Set(),listeners=new Map();let markup='',writes=0;
  return {id,hidden:false,style:{},buttons:[],
    classList:{add:name=>names.add(name),remove:name=>names.delete(name),contains:name=>names.has(name),toggle(name,on){on?names.add(name):names.delete(name);}},
    addEventListener(type,callback){listeners.set(type,callback);},emit(type,event={}){listeners.get(type)?.(event);},
    get innerHTML(){return markup;},set innerHTML(value){markup=value;writes++;this.buttons=[...value.matchAll(/data-fold-line="(\d+)"/g)].map(match=>({line:Number(match[1])}));},
    get writes(){return writes;},
    querySelector(selector){const line=Number(selector.match(/"(\d+)"/)[1]);return this.buttons.find(button=>button.line===line)||null;},
  };
}
const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
const editor=$('editor');Object.assign(editor,{value:'function first() {\n  const x = 1;\n  return x;\n}\nconst middle = 2;\nfunction second() {\n  const y = 3;\n  return y;\n}',scrollTop:0,clientHeight:210,selectionStart:0,selectionEnd:0,focus(){},getBoundingClientRect:()=>({top:100,right:900})});
const file={id:'a',mode:'javascript',content:editor.value},frames=[];
const gutter=$('foldGutter'),controls=$('foldControls'),area=$('editorArea');
controls.getBoundingClientRect=()=>({top:109-editor.scrollTop});
function target(kind){return {closest(selector){if(selector==='#editorArea')return kind==='outside'?null:area;if(selector==='#foldGutter')return kind==='gutter'?gutter:null;return ['minimap','scrollbar'].includes(kind)?{}:null;}};}
let underPointer=target('editor');
const c=vm.createContext({$,editor,state:{activeId:'a',notes:[file],settings:{openIds:['a']}},note:()=>file,actions:{},ready:true,
  document:{activeElement:editor,addEventListener(){},elementFromPoint:()=>underPointer},requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},
  editorLayout:{key:'initial',offsets:[0,72,96,120,144,168,192,216,240],lineHeight:24,hidden:[]},
  closeCompletions(){},paintEditor(){},escape:text=>text,
});
for(const name of ['code-structure.js','editor-structure.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../source',name),'utf8'),c);
function flush(){while(frames.length)frames.shift()();}
function move(y,kind='editor',x=200){underPointer=target(kind);area.emit('pointermove',{pointerType:'mouse',clientX:x,clientY:y});flush();}
const visible=()=>gutter.classList.contains('controls-visible');
c.wireCodeStructure();c.renderFoldControls();flush();assert.equal(visible(),false);assert.equal(controls.buttons.length,2);
const firstMarkup=controls.innerHTML,firstWrites=controls.writes;
move(114);assert.equal(visible(),true,'A fold line reveals the entire bar');
move(114,'numbers',50);assert.equal(visible(),true,'The line number shares its fold-line hover');
move(160);assert.equal(visible(),true,'A wrapped continuation belongs to the same fold line');
move(185);assert.equal(visible(),false,'A source line without a button hides the bar');
move(285);assert.equal(visible(),true,'The second fold line also reveals every button');
assert.equal(controls.innerHTML,firstMarkup);assert.equal(controls.writes,firstWrites,'Pointer movement never rebuilds the buttons or their animation container');
move(240,'gutter',80);assert.equal(visible(),true,'The whole gutter remains a reveal target');
move(114,'minimap',800);assert.equal(visible(),false,'The minimap does not reveal fold buttons');
move(114,'scrollbar',895);assert.equal(visible(),false);
move(114,'editor',905);assert.equal(visible(),false,'The vertical scrollbar area is excluded');
move(95,'gutter',80);assert.equal(visible(),false,'Above the editor content is excluded');
move(314,'gutter',80);assert.equal(visible(),false,'Below the viewport is excluded');
move(114);area.emit('pointerleave');assert.equal(visible(),false,'Leaving the editor starts the bar fade-out immediately');
area.emit('pointermove',{pointerType:'touch',clientX:200,clientY:114});flush();assert.equal(visible(),false,'Touch motion does not leave a hover bar visible');
move(285);editor.scrollTop=72;c.renderFoldControls();flush();assert.equal(visible(),false,'Scrolling recomputes the line under a stationary pointer');
move(213);assert.equal(visible(),true,'Hover uses the scrolled fold-line position');
const bar=controls;c.toggleCodeFold(c.codeRecord().structure.regions[0].key,false);
c.editorLayout.offsets=[0,72,72,72,96,120,144,168,192];c.editorLayout.hidden=[false,true,true];c.editorLayout.key='folded';
c.renderFoldControls();move(235,'gutter',80);assert.equal($('foldControls'),bar);assert.equal(visible(),true,'Folding updates children while keeping the animated bar and its reveal state');
assert.match(controls.innerHTML,/aria-expanded="false"/);
move(158);assert.equal(visible(),true,'Collapsed hidden rows do not disrupt source-line hover');
$('notePane').hidden=true;c.updateFoldHover();assert.equal(visible(),false);$('notePane').hidden=false;
file.mode='text';c.renderFoldControls();flush();assert.equal(gutter.hidden,true);assert.equal(visible(),false,'Plain text has no visible fold bar');
file.mode='javascript';c.renderFoldControls();move(150,'gutter',80);assert.equal(visible(),true);
c.clearEmptyCodeView();assert.equal(visible(),false,'Closing the last file clears the reveal state');
console.log('Passed: whole-bar hover on any fold line, wrapped rows, line numbers, gutter, scroll updates, exclusions, touch/leave cleanup, persistent bar across folding, plain text and last-tab cleanup.');
