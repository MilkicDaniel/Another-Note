// Exercise the actual Find All search, result navigation and keyboard handlers.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {workerPlatform}=require('./worker_harness.cjs');
const searchFeatures=fs.readFileSync(path.join(__dirname,'../source/search-features.js'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../source/app.js'),'utf8');
const syntax=source.slice(source.indexOf('  function tokenize('),source.indexOf('  /* EDITOR_RENDERING */')).replace('/* SYNTAX_FORMATS */',fs.readFileSync(path.join(__dirname,'../source/syntax-formats.js'),'utf8'));
const functions=source.match(/^  function fileLabel.*$/m)[0]+'\n'+source.slice(source.indexOf('  function searchPattern('),source.indexOf('  function findHistorySnapshot()'));
const keyStart=source.indexOf("    document.addEventListener('keydown',e=>{");
const keyHandler=source.slice(keyStart,source.indexOf("    $('fontSizeButton').addEventListener",keyStart));
const wheelStart=source.indexOf('  function wheelZoom('),wheelEnd=source.indexOf('  function insertCode(',wheelStart);
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(){
  const f={elements:{},messages:[],opened:[],zoomed:[]},platform=workerPlatform();
  const classes=()=>{const values=new Set();return{add:n=>values.add(n),remove:n=>values.delete(n),contains:n=>values.has(n)};};
  const target=id=>({id,listeners:{},addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);},
    emit(type,extra={}){const event={target:this,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of this.listeners[type]||[]){fn(event);if(event.stopped)break;}return event;}});
  const document=Object.assign(target('document'),{activeElement:null,body:{classList:classes()}});
  const app={classList:classes(),style:{setProperty(name,value){this[name]=value;}}};
  document.querySelector=selector=>{assert.equal(selector,'.app-window');return app;};
  const element=id=>f.elements[id]||=Object.assign(target(id),{
    value:'',checked:false,hidden:false,open:false,innerHTML:'',textContent:'',attributes:{},children:[],captured:new Set(),
    setAttribute(name,value){this.attributes[name]=value;},
    focus(){document.activeElement=this;},select(){this.selected=true;},
    contains(node){return node&&(node.id.startsWith('findAll')||node.id.startsWith('result-'));},
    querySelector(selector){const index=selector.match(/data-find-result="(\d+)"/);return index?element(`result-${index[1]}`):null;},
    scrollIntoView(){this.scrolled=true;},
    getBoundingClientRect(){return {height:parseFloat(app.style['--find-results-height'])||280};},
    setPointerCapture(id){this.captured.add(id);},hasPointerCapture(id){return this.captured.has(id);},releasePointerCapture(id){this.captured.delete(id);},
  });
  const editor={id:'editor',value:'',selectionStart:0,selectionEnd:0,clientWidth:800,scrollTop:0,scrollLeft:0,
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},focus(){document.activeElement=this;},
  };
  const lineMeasure={style:{},innerHTML:'',querySelector:()=>({getBoundingClientRect:()=>({top:0,left:0})}),getBoundingClientRect:()=>({top:0,left:0})};
  const window=Object.assign(target('window'),{innerHeight:800});
  const context=vm.createContext({
    ...platform,setTimeout,clearTimeout,document,window,editor,lineMeasure,$:element,ready:true,composing:false,wheelZoomAmount:0,
    state:{activeId:null,settings:{openIds:[],wrap:true,fontSize:15},notes:[]},
    findAllState:null,findAllContext:{id:null,selection:null},findAllResize:null,findSession:null,trashView:false,
    note:()=>context.state.notes.find(file=>file.id===context.state.activeId&&!file.removedAt),
    liveNotes:()=>context.state.notes.filter(file=>!file.trashedAt&&!file.removedAt),
    escape:text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    paintEditor(){},scrollToEditorMatch(){},syncSelectControls(){},fileMatchesTag:()=>true,closeCompletions(){},openFiles:()=>context.state.settings.openIds.map(id=>context.state.notes.find(file=>file.id===id&&!file.removedAt&&!file.trashedAt)).filter(Boolean),toast:text=>f.messages.push(text),syncScroll(){},updatePosition(){},setView(){},closeMenus(){},
    getComputedStyle:()=>({lineHeight:'24px',paddingLeft:'4px',paddingRight:'23px'}),
    zoom:value=>f.zoomed.push(value),
    selectNote(id){context.state.activeId=id;if(!context.state.settings.openIds.includes(id))context.state.settings.openIds.push(id);editor.value=context.note().content;context.findSession=null;element('findBar').hidden=true;f.opened.push(id);},
    closeFind(){element('findBar').hidden=true;context.findSession=null;},findMatches(){f.findNextCalled=true;},
  });
  vm.runInContext(syntax+'\n'+fs.readFileSync(path.join(__dirname,'../source/code-previews.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../source/symbol-references.js'),'utf8')+'\n'+functions+source.slice(wheelStart,wheelEnd)+'\n'+searchFeatures,context);element('searchWorkerSource').textContent=platform.engine;
  context.actions={find:()=>context.showFindAll('all'),findText:()=>{},findReplace:()=>{},format:()=>context.prettyFormat()};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/keyboard-shortcuts.js'),'utf8'),context);context.wireKeyboardShortcuts();
  vm.runInContext(keyHandler,context);context.wireFindAll();
  element('findBar').hidden=true;element('findAllPanel').hidden=true;element('findAllScope').value='file';
  f.context=context;f.editor=editor;f.document=document;f.window=window;f.app=app;f.element=element;
  f.add=(id,content,title=id,options={})=>{
    const file={id,title,content,mode:'text',trashedAt:0,removedAt:0,...options};context.state.notes.push(file);
    if(!options.closed&&!options.trashedAt&&!options.removedAt)context.state.settings.openIds.push(id);if(!context.state.activeId){context.state.activeId=id;editor.value=content;}
    return file;
  };
  f.search=async(query,scope='all',options={})=>{
    element('findInput').value=query;element('findRegex').checked=Boolean(options.regex);element('findCase').checked=Boolean(options.matchCase);
    element('findBar').hidden=false;context.findSession={id:context.state.activeId,scope:options.selection||null,candidate:options.selection||null};
    element('findSelection').checked=Boolean(options.selection);
    await context.showFindAll(scope);
  };
  f.settle=async()=>{for(let i=0;i<500&&vm.runInContext('searchJobs.size||findAllSearchTimer!==null',context);i++)await new Promise(resolve=>setTimeout(resolve,5));};
  f.results=()=>context.findAllState.results;
  f.call=(name,...args)=>context[name](...args);
  f.key=(key,extras={})=>document.emit('keydown',{key,...extras});
  return f;
}

(async()=>{
{
 const f=fixture();let formatted=0;f.context.prettyFormat=()=>formatted++;
 f.key('L',{ctrlKey:true,shiftKey:true});assert.equal(formatted,1,'Ctrl+Shift+L formats the file');
 f.key('l',{ctrlKey:true,altKey:true});assert.equal(formatted,1,'The old format shortcut is no longer active');
 f.add('js','function render() { return "hello"; }','app.js',{mode:'javascript'});await f.search('render');
 assert.match(f.element('findAllResults').innerHTML,/tok-command/);assert.match(f.element('findAllPreviewCode').innerHTML,/tok-keyword/);assert.match(f.element('findAllPreviewCode').innerHTML,/tok-string/);assert.match(f.element('findAllPreviewCode').innerHTML,/<mark><span class="tok-command">render/);
}
// Reference results reuse exact-range navigation, only include open files, and
// rerun safely after edits without turning into an ordinary text search.
{
  const f=fixture(),html='<main class="card" id="main"><button onclick="render()">Go</button></main>';
  f.add('html',html,'index.html',{mode:'html'});f.add('css','.card { color: #fff; }','style.css',{mode:'css'});f.add('js','function render() {}\nrender(); document.querySelector(".card");','app.js',{mode:'javascript'});f.add('closed','.card {}','closed.css',{mode:'css',closed:true});
  const unchanged=plain(f.context.state.notes);
  await f.call('findSymbolUsages',{id:'html',text:html,name:'card',offset:html.indexOf('card')+1});
  assert.equal(f.results().length,3);assert.equal(f.element('findAllTitle').textContent,'Usages');assert.equal(f.element('findAllSearch').hidden,true);assert.equal(f.element('findAllReferenceBar').hidden,false);assert.match(f.element('findAllSummary').textContent,/CSS class “card” · 3 usages/);
  await f.call('openFindAllResult',2);assert.equal(f.context.state.activeId,'js');assert.equal(f.editor.value.slice(f.editor.selectionStart,f.editor.selectionEnd),'card');
  const js=f.context.note();js.content+='\ndocument.querySelectorAll(".card");';js.updatedAt=10;f.editor.value=js.content;
  await f.call('runFindAll');assert.equal(f.results().length,4);assert.match(f.element('findAllSummary').textContent,/4 usages/);assert.equal(f.element('findAllTitle').textContent,'Usages');
  await f.search('render');assert.equal(f.element('findAllTitle').textContent,'Find');assert.equal(f.element('findAllSearch').hidden,false);assert.equal(f.element('findAllReferenceBar').hidden,true);assert.equal(f.results().length,3);
  assert.deepEqual(plain(f.context.state.notes).slice(0,2),unchanged.slice(0,2),'Reference navigation never changes file contents');
}
// File grouping includes only open tabs and excludes closed files and Trash; every result carries exact coordinates.
{
  const f=fixture();f.add('a','first\ncat and CAT\nlast','Alpha.txt');f.add('b','cat','Beta.txt');f.add('closed','cat','Closed.txt',{closed:true});f.add('trash','cat','Trash',{trashedAt:1});f.add('gone','cat','Deleted',{removedAt:1});
  f.context.state.notes[0].tags=['Work'];f.context.state.notes[1].tags=['Personal'];f.context.state.settings.tagFilter={kind:'tag',tag:'Work'};
  await f.search('cat');assert.equal(f.results().length,3);
  assert.deepEqual(plain(f.results().map(item=>[item.source.id,item.line,item.column])),[['a',2,1],['a',2,9],['b',1,1]]);
  assert.equal(f.context.findAllState.groups.length,2);assert.match(f.elements.findAllSummary.textContent,/3 matches in 2 files/);
  assert.ok(f.elements.findAllResults.innerHTML.includes('<mark>cat</mark>'));assert.ok(f.elements.findAllResults.innerHTML.includes('Beta.txt'));
  assert.ok(f.elements.findAllPreviewCode.innerHTML.includes('first'));assert.ok(!f.elements.findAllPreviewCode.innerHTML.includes('firstfirst'));
  await f.call('openFindAllResult',2);assert.equal(f.context.state.activeId,'b');assert.deepEqual(plain(f.context.state.settings.openIds),['a','b']);
  assert.equal(f.editor.value.slice(f.editor.selectionStart,f.editor.selectionEnd),'cat');assert.equal(f.elements.findAllPanel.hidden,false);
  assert.equal(f.context.state.notes.length,5,'Navigation does not change any files');
}

// Current-file and selection scope are retained from the inline Find bar.
{
  const f=fixture();f.add('a','cat cat cat');f.add('b','cat');await f.search('cat','file');assert.equal(f.results().length,3);
  await f.search('cat','file',{selection:{start:4,end:7}});assert.equal(f.elements.findAllScope.value,'selection');
  assert.equal(f.results().length,1);assert.equal(f.results()[0].start,4);assert.equal(f.results()[0].column,5);
  const session=f.context.findSession;await f.call('openFindAllResult',0);
  assert.equal(f.context.findSession,session,'Navigating within the same file preserves its replacement scope');
  assert.deepEqual(plain(session.scope),{start:4,end:7});
}

// Regex and case options share the same engine as Find and Replace.
{
  const f=fixture();f.add('a','id:12\nID:34\na+b');await f.search(String.raw`(?<=id:)\d+`,'all',{regex:true});
  assert.deepEqual(plain(f.results().map(item=>[item.line,item.column,item.end-item.start])),[[1,4,2],[2,4,2]]);
  f.elements.findAllCase.checked=true;await f.call('runFindAll');assert.equal(f.results().length,1);
  await f.search('a+b');assert.equal(f.results().length,1);assert.equal(f.results()[0].line,3);
  await f.search('[','all',{regex:true});assert.equal(f.results().length,0);assert.match(f.elements.findAllStatus.textContent,/Invalid regex/);
  assert.equal(f.elements.findAllInput.attributes['aria-invalid'],'true');
  f.elements.findAllInput.value='id';f.call('refreshFindAllStatus');assert.match(f.elements.findAllStatus.textContent,/Searching/);
  await f.call('runFindAll');assert.equal(f.elements.findAllInput.attributes['aria-invalid'],'false');assert.equal(f.results().length,2);
}

// Unicode, zero-width, multiline and final blank-line matches have stable positions.
{
  const f=fixture();f.add('a','😀a\n😀b\n');await f.search('(?=😀)','all',{regex:true});
  assert.deepEqual(plain(f.results().map(item=>item.start)),[0,4]);assert.match(f.elements.findAllResults.innerHTML,/│/);
  await f.search('^','all',{regex:true});assert.deepEqual(plain(f.results().map(item=>item.line)),[1,2,3]);
  await f.search('a\\n😀b','all',{regex:true});assert.equal(f.results().length,1);await f.call('openFindAllResult',0);
  assert.equal(f.editor.value.slice(f.editor.selectionStart,f.editor.selectionEnd),'a\n😀b');
}

// Literal multiline searches transfer from the inline bar and retain textarea navigation.
{
  const f=fixture();f.add('a','top\nfirst\nsecond\nlast');f.add('b','first\nsecond\nfirst only');await f.search('first\nsecond');
  assert.equal(f.results().length,2);assert.equal(f.elements.findAllInput.value,'first\nsecond','Find All keeps every line copied from the inline bar');
  f.elements.findAllInput.focus();const down=f.elements.findAllInput.emit('keydown',{key:'ArrowDown'});
  assert.equal(down.defaultPrevented,undefined);assert.equal(f.document.activeElement,f.elements.findAllInput,'ArrowDown edits a multiline query without jumping to results');
  const newline=f.elements.findAllInput.emit('keydown',{key:'Enter',shiftKey:true});assert.equal(newline.defaultPrevented,undefined,'Shift+Enter is left to the textarea to insert a line break');
  await f.call('openFindAllResult',1);assert.equal(f.editor.value.slice(f.editor.selectionStart,f.editor.selectionEnd),'first\nsecond');
}
{
  const f=fixture();f.add('a','one\ntwo\nthree');f.editor.setSelectionRange(0,7);await f.call('showFindAll','file');
  assert.equal(f.elements.findAllInput.value,'one\ntwo','A selected multiline block can seed a Find All search');assert.equal(f.results().length,1);
}

// File changes mark results stale and can never jump to an old offset or deleted file.
{
  const f=fixture(),a=f.add('a','cat');f.add('b','cat');await f.search('cat');
  a.content='no match';f.call('refreshFindAllStatus');assert.equal(f.context.findAllState.stale,true);assert.match(f.elements.findAllStatus.textContent,/Searching/);
  await f.call('openFindAllResult',0);assert.equal(f.results().length,1);assert.deepEqual(f.opened,[]);assert.match(f.messages.at(-1),/Results refreshed/);
  f.context.state.notes[1].trashedAt=2;await f.call('openFindAllResult',0);assert.equal(f.results().length,0);assert.deepEqual(f.opened,[]);
}
{
  const f=fixture(),file=f.add('a','catcat');await f.search('cat','file',{selection:{start:0,end:3}});
  file.content='cat';f.editor.value='cat';await f.call('runFindAll');assert.equal(f.results().length,0);assert.match(f.elements.findAllStatus.textContent,/selected range changed/);
  assert.equal(f.elements.findAllScope.value,'selection','A changed selection never falls back to all text');
}

// Search snippets, file headings and source previews escape HTML and executable markup.
{
  const f=fixture();f.add('a','before\n<script>alert("cat")</script>\nafter','<img onerror=x>');await f.search('cat');
  for(const html of [f.elements.findAllResults.innerHTML,f.elements.findAllPreviewCode.innerHTML]){
    assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img '));assert.ok(html.includes('&lt;script&gt;'));
  }
  assert.ok(f.elements.findAllResults.innerHTML.includes('&lt;img onerror=x&gt;'));
}

// Large searches count every occurrence and progressively display results without losing navigation.
{
  const f=fixture();f.add('a','x '.repeat(450));await f.search('x');
  assert.equal(f.results().length,450);assert.equal((f.elements.findAllResults.innerHTML.match(/data-find-result=/g)||[]).length,200);
  f.call('moreFindAllResults');assert.equal((f.elements.findAllResults.innerHTML.match(/data-find-result=/g)||[]).length,400);
  f.call('selectFindAllResult',449,true);assert.equal((f.elements.findAllResults.innerHTML.match(/data-find-result=/g)||[]).length,450);
  assert.equal(f.document.activeElement.id,'result-449');
  f.call('expandFindAllGroups',false);assert.ok(f.context.findAllState.collapsed.has('a'));
  f.call('stepFindAllResult',1,false);assert.equal(f.context.findAllState.selected,0);assert.equal(f.context.findAllState.collapsed.has('a'),false);
}

// Keyboard navigation updates previews, enters source, wraps, and preserves Alt+F4.
{
  const f=fixture();f.add('a','cat cat');await f.search('cat');f.element('findAllInput').focus();
  f.element('findAllInput').emit('keydown',{key:'ArrowDown'});assert.equal(f.document.activeElement.id,'result-0');
  f.element('findAllResults').emit('keydown',{key:'ArrowDown'});assert.equal(f.context.findAllState.selected,1);
  f.element('findAllResults').emit('keydown',{key:'Enter'});assert.equal(f.editor.selectionStart,4);
  f.key('F3');assert.equal(f.editor.selectionStart,0);f.key('F3',{shiftKey:true});assert.equal(f.editor.selectionStart,4);
  assert.equal(f.key('F4',{altKey:true}).defaultPrevented,undefined);
  f.key('Escape');assert.equal(f.elements.findBar.hidden,true);f.key('Escape');assert.equal(f.elements.findAllPanel.hidden,true);
  assert.equal(f.app.classList.contains('find-all-open'),false);
  f.key('f',{ctrlKey:true,shiftKey:true});assert.equal(f.elements.findAllPanel.hidden,false);assert.equal(f.elements.findAllScope.value,'all');await f.settle();
}

// The panel resizes with pointer or keyboard controls and clamps to the viewport.
{
  const f=fixture();f.add('a','cat');await f.search('cat');const grip=f.element('findAllResize');
  grip.emit('pointerdown',{button:0,pointerId:1,clientY:500});grip.emit('pointermove',{pointerId:1,clientY:420});
  assert.equal(f.app.style['--find-results-height'],'360px');grip.emit('pointerup');assert.equal(grip.captured.size,0);
  grip.emit('keydown',{key:'ArrowDown'});assert.equal(f.app.style['--find-results-height'],'340px');
  f.call('sizeFindAll',5000);assert.equal(f.app.style['--find-results-height'],'600px');
  f.call('sizeFindAll',1);assert.equal(f.app.style['--find-results-height'],'140px');
  f.window.innerHeight=300;f.call('sizeFindAll',5000);assert.equal(f.app.style['--find-results-height'],'100px','Short windows reserve space for the editor and status bar');
}

// Search with no open tab excludes closed saved files, and Ctrl+wheel zoom remains available.
{
  const f=fixture();f.add('a','cat');f.context.state.activeId=null;f.context.state.settings.openIds=[];await f.search('cat');assert.equal(f.results().length,0);
  f.call('wheelZoom',{target:{closest:()=>null},ctrlKey:true,deltaY:-80,deltaMode:0,preventDefault(){}});assert.deepEqual(f.zoomed,[2]);
}

{
  const f=fixture();f.add('a','cat dog cat');f.add('b','dog');f.add('c','dog','closed',{closed:true});await f.search('cat');
  f.elements.findAllInput.value='dog';f.elements.findAllInput.emit('input');await f.settle();assert.equal(f.results().length,2);
  f.context.state.settings.openIds=['a'];f.call('refreshFindAllStatus');await f.settle();assert.equal(f.results().length,1);assert.equal(f.results()[0].source.id,'a');
  f.elements.findAllInput.value='';f.elements.findAllInput.emit('input');await f.settle();assert.equal(f.results().length,0);
}
console.log('Passed: grouped Find All, source previews and jumps, open-tab scope and live updates, regex/case/selection scopes, stale-result safety, escaping, result pagination, keyboard navigation and resizing.');

})().catch(error=>{console.error(error);process.exitCode=1;});
