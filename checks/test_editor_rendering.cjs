// Real rendering/index code against measured wrapped rows; native QA covers WebKit geometry.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const main=fs.readFileSync(path.join(__dirname,'../source/app.js'),'utf8');
function extract(source,name){const start=source.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=source.slice(start),end=rest.slice(1).search(/^  (?:async )?function /m);return rest.slice(0,end+1);}
const counters={measurements:0,gutters:0,highlights:0,syntax:0};
let fastMeasure=false,cellMeasures=0,activeCaretTop=null,activeCaretReads=0;
const styles={lineHeight:'24px',fontSize:'15px',fontFamily:'monospace',tabSize:'2',letterSpacing:'0px',wordSpacing:'0px',paddingLeft:'4px',paddingRight:'23px'};
const classes=()=>{const set=new Set();return {add:name=>set.add(name),remove:name=>set.delete(name),contains:name=>set.has(name)};};
const decode=text=>text.replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[name]);
function node(id=''){
  let html='';return {id,hidden:false,style:{},children:[],classList:classes(),setAttribute(){},
    get innerHTML(){return html;},set innerHTML(value){html=value;if(id==='lineNumbers')counters.gutters++;if(id==='highlightCode')counters.highlights++;
      this.children=[...value.matchAll(/<div(?:[^>]*)>([\s\S]*?)<\/div>/g)].map(match=>({classList:classes(),getBoundingClientRect:()=>{
        counters.measurements++;const text=decode(match[1]),columns=Math.max(1,Math.floor(parseFloat(this.style.width||100)/10));
        return {height:Math.max(1,Math.ceil(text.length/columns))*parseFloat(styles.lineHeight)};
      }}));
    },
    getBoundingClientRect(){return {top:0,left:0};},
    querySelector(selector){if(selector==='[data-editor-cell]'&&fastMeasure)return {getBoundingClientRect:()=>{cellMeasures++;return {width:640};}};if(selector==='[data-active-caret]'){const prefix=decode(html.split('<span')[0]),columns=Math.max(1,Math.floor(parseFloat(this.style.width||100)/10));return {getBoundingClientRect:()=>{activeCaretReads++;return {top:activeCaretTop??Math.floor(prefix.length/columns)*parseFloat(styles.lineHeight)+3,left:0};}};}if(selector!=='[data-find-caret]')return null;const prefix=decode(html.split('<span')[0]),columns=Math.max(1,Math.floor(parseFloat(this.style.width||100)/10));return {getBoundingClientRect:()=>({top:this.style.whiteSpace==='pre'?0:Math.floor(prefix.length/columns)*parseFloat(styles.lineHeight),left:(prefix.length%columns)*10})};},
  };
}
const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id);};
const editor={value:'a'.repeat(80)+'\nneedle',clientWidth:127,selectionStart:0,get selectionEnd(){return this.rangeEnd??this.selectionStart;},selectionDirection:'none',scrollTop:0,scrollLeft:0};
const file={title:'audit.txt',content:editor.value,mode:'text'},state={settings:{wrap:true}};
const context=vm.createContext({$,editor,state,note:()=>file,document:{body:{append(){}},createElement:()=>node()},getComputedStyle:()=>styles,
  escape:text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  colorCode(text){counters.syntax++;return context.escape(text);},decorateEditorMatches:html=>html,decorateSpelling:html=>html,refreshSpellcheck(){},scheduleColorSwatches(){},
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/editor-rendering.js'),'utf8')+'\n'+['fileSignature','captureSavedState','isFileModified','trimUndoHistory'].map(name=>extract(main,name)).join('\n'),context);
context.paintEditor();assert.equal(counters.syntax,1);assert.equal(counters.measurements,2);assert.equal(counters.gutters,1);
const before={...counters};
for(let i=0;i<100;i++){editor.selectionStart=i%2?81:75;context.updatePosition();editor.scrollTop=i;context.syncScroll();context.paintEditor();}
assert.deepEqual(counters,before,'Cursor movement, scrolling and unchanged paint reuse syntax and measured geometry');
editor.selectionStart=81;context.scrollToEditorMatch(81);assert.equal(editor.scrollTop,120,'Find accounts for 8 wrapped rows before the match');
assert.equal($('position').textContent,'Line 2, Column 1');assert.ok($('lineNumbers').children[1].classList.contains('current-line-number'));
editor.selectionStart=75;context.scrollToEditorMatch(75);assert.equal(editor.scrollTop,96,'Find also accounts for wraps within the matched line');
editor.clientWidth=227;context.paintEditor();assert.equal(counters.gutters,2);assert.equal(counters.syntax,1,'Resizing does not retokenize unchanged text');
context.scrollToEditorMatch(81);assert.equal(editor.scrollTop,24);
styles.lineHeight='32px';context.paintEditor();context.scrollToEditorMatch(81);assert.equal(editor.scrollTop,32,'Font zoom invalidates measured heights');
state.settings.wrap=false;context.paintEditor();context.scrollToEditorMatch(81);assert.equal(editor.scrollTop,0);assert.equal(counters.measurements,6);
file.mode='json';context.paintEditor();assert.equal(counters.syntax,2,'A type change invalidates syntax');
editor.value='x\ny\n';file.content=editor.value;editor.selectionStart=4;context.paintEditor();assert.equal($('position').textContent,'Line 3, Column 1');assert.equal($('lineNumbers').children.length,3);
editor.selectionStart=0;editor.rangeEnd=2;editor.selectionDirection='forward';context.updatePosition();assert.equal($('position').textContent,'Line 2, Column 1');assert.ok($('lineNumbers').children[1].classList.contains('current-line-number'));
editor.selectionDirection='backward';context.updatePosition();assert.equal($('position').textContent,'Line 1, Column 1');assert.ok($('lineNumbers').children[0].classList.contains('current-line-number'),'Backward selections mark their active start');
editor.value='word abcdefgh';editor.clientWidth=107;editor.rangeEnd=7;editor.selectionDirection='forward';state.settings.wrap=true;activeCaretTop=35;context.paintEditor();
assert.equal($('activeLine').style.top,'41px','The line background follows the active wrapped row');assert.equal($('position').textContent,'Line 1, Column 8');
assert.ok(vm.runInContext('lineMeasure.innerHTML',context).endsWith('<span data-active-caret></span>cdefgh'),'Caret measurement keeps the suffix that controls word wrapping');
const caretReads=activeCaretReads;context.updatePosition();assert.equal(activeCaretReads,caretReads,'An unchanged caret reuses its wrapped-row position');
activeCaretTop=3;editor.selectionDirection='backward';context.updatePosition();assert.equal($('activeLine').style.top,'9px');
editor.rangeEnd=null;editor.selectionDirection='none';editor.clientWidth=227;activeCaretTop=null;file.content=editor.value;
// Cached signatures must still react to every saved-field edit and undo.
const original=context.fileSignature(file);assert.equal(context.fileSignature(file),original);
file.content='different';assert.notEqual(context.fileSignature(file),original);file.content=editor.value;assert.equal(context.fileSignature(file),original);
file.title='renamed.txt';assert.notEqual(context.fileSignature(file),original);file.title='audit.txt';assert.equal(context.fileSignature(file),original);
file.mode='bash';assert.notEqual(context.fileSignature(file),original);
// Thousands of non-wrapping ASCII lines need only one font-cell measurement.
fastMeasure=true;state.settings.wrap=true;editor.value=('short line\n'.repeat(2000))+'x'.repeat(80)+'\nUnicode é\n\tTabbed';
vm.runInContext('editorLayout.cellKey=null',context);const previousMeasures=counters.measurements;context.paintEditor();
assert.equal(cellMeasures,1);assert.equal(counters.measurements-previousMeasures,3,'Only long, Unicode and tabbed lines need layout reads');
editor.value+='\nmore text';context.paintEditor();assert.equal(cellMeasures,1,'Typing reuses the measured font cell');
const beforeHidden=counters.measurements;editor.clientWidth=0;editor.value='x'.repeat(200)+'\nshort';context.paintEditor();assert.equal(counters.measurements,beforeHidden,'An unmapped view does not measure text at a one-pixel width');
editor.clientWidth=227;context.paintEditor();assert.equal(counters.measurements,beforeHidden+1,'The first real allocation measures the wrapping line');context.scrollToEditorMatch(201);assert.equal(editor.scrollTop,224,'Restored viewport geometry remains accurate for search');
// Saved baselines avoid hashing a large file again on each keystroke.
const large={title:'large.py',content:'value = 1;\n'.repeat(100000),mode:'python'};large.savedState=context.captureSavedState(large);large.savedSignature=context.fileSignature(large);
const signature=context.fileSignature;let hashes=0;context.fileSignature=file=>{hashes++;return signature(file);};
assert.equal(context.isFileModified(large),false);large.content+='x';assert.equal(context.isFileModified(large),true);large.content=large.savedState.content;assert.equal(context.isFileModified(large),false);assert.equal(hashes,0);
const draft={title:'',mode:'text',content:'',savedState:null};draft.savedSignature=signature(draft);draft.content='x'.repeat(1000000);assert.equal(context.isFileModified(draft),true);assert.equal(hashes,0,'A new large draft can reject its empty baseline without hashing');
// Escapes, same-length edits and legacy signatures retain exact dirty behavior.
for(const content of ['', 'hello', '"quoted"\n\t\\path', 'é😀'])for(const change of ['', 'different', content]){
  const file={title:'draft',mode:'text',content,savedState:null};file.savedSignature=signature(file);file.content=change;assert.equal(context.isFileModified(file),file.savedSignature!==signature(file));
}
context.fileSignature=signature;
// Histories retain their newest entries and remain bounded for large files.
const h={undo:Array.from({length:80},(_,i)=>({content:'x'.repeat(512*1024)+i})),redo:[]};context.trimUndoHistory(h);
assert.ok(h.undo.length<33);assert.ok(h.undo.at(-1).content.endsWith('79'));assert.ok(h.undo.reduce((sum,item)=>sum+item.content.length*2,0)<=32*1024*1024);
const huge={undo:[{content:'a'.repeat(20*1024*1024)}],redo:[{content:'b'.repeat(20*1024*1024)}]};context.trimUndoHistory(huge);assert.equal(huge.undo.length,1);assert.equal(huge.redo.length,1,'One step per direction survives the soft byte limit');
console.log('Passed: cached syntax/signatures and line geometry, constant-work cursor/scroll updates, wrap/resize/zoom/type invalidation, visible wrapped search targets and bounded large-file undo.');
