// Run the actual editor search/replacement and undo functions against a textarea model.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {workerPlatform}=require('./worker_harness.cjs');
const searchFeatures=fs.readFileSync(path.join(__dirname,'../source/search-features.js'),'utf8');
const source = fs.readFileSync(path.join(__dirname,'../source/app.js'),'utf8');
function functionSource(name) {
  const start=source.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));
  assert.ok(start>=0,`Found actual function ${name}`);
  const rest=source.slice(start),end=rest.slice(1).search(/^  (?:async )?function /m);
  return rest.slice(0,end+1);
}
const functions=['fileSignature','isFileModified','trimUndoHistory','rememberHistory','undo','afterEdit','replaceText','searchPattern'].map(functionSource).join('\n')+
  source.slice(source.indexOf('  function findHistorySnapshot(){'),source.indexOf('  const actions='));
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(content,{live=false}={}) {
  const f={elements:{},messages:[],saves:[],dirtyUpdates:0},platform=workerPlatform();
  const document={activeElement:null};
  const element=id=>f.elements[id] ||= {
    id,value:'',checked:false,hidden:false,disabled:false,attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    focus(){document.activeElement=this;},select(){this.selected=true;},
    contains(node){return node&&['findInput','replaceInput','replaceOneButton','replaceAllButton','findNextButton','findPreviousButton'].includes(node.id);},
  };
  const editor={id:'editor',value:content,selectionStart:0,selectionEnd:0,scrollTop:0,readOnly:false,
    setSelectionRange(start,end,direction='none'){this.selectionStart=Math.max(0,Math.min(start,this.value.length));this.selectionEnd=Math.max(this.selectionStart,Math.min(end,this.value.length));this.selectionDirection=direction;},
    setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.setSelectionRange(start+text.length,start+text.length);},
    focus(){document.activeElement=this;},
  };
  const context=vm.createContext({
    ...platform,editor,document,$:element,state:{activeId:'a',settings:{},notes:[
      {id:'a',title:'a.txt',mode:'text',content,trashedAt:0,removedAt:0,updatedAt:1},
      {id:'b',title:'b.txt',mode:'text',content,trashedAt:0,removedAt:0,updatedAt:1},
    ]},
    histories:new Map(),currentView:'edit',startupBlocked:false,findSession:null,pendingFindInput:null,listTimer:0,findAllState:null,findAllContext:{id:null,selection:null},
    note:()=>context.state.notes.find(file=>file.id===context.state.activeId),
    clock:(()=>{let time=10;return()=>++time;})(),
    checkpointVersion:()=>Promise.resolve(true),scheduleVersion(){},paintEditor(){},updateStats(){},updatePosition(){},syncScroll(){},scrollToEditorMatch(){},renderList(){},renderPreview(){},refreshFindAllStatus(){},
    updateFileIndicators(){f.dirtyUpdates++;},
    save(){f.saves.push(plain(context.state));},
    setView(view){context.currentView=view;},
    getComputedStyle:()=>({lineHeight:'24px'}),
    setTimeout:live?setTimeout:()=>1,clearTimeout:live?clearTimeout:()=>{},toast:message=>f.messages.push(message),
  });
  vm.runInContext(source.match(/^  const escape = .*$/m)[0]+'\n'+['tokenize','colorJSON'].map(functionSource).join('\n')+'\n'+functions+'\n'+searchFeatures,context);element('searchWorkerSource').textContent=platform.engine;
  element('findBar').hidden=true;element('replaceRow').hidden=true;element('findAllPanel').hidden=true;
  context.state.notes.forEach(file=>file.savedSignature=context.fileSignature(file));
  f.context=context;f.editor=editor;f.document=document;
  f.call=(name,...args)=>context[name](...args);
  f.open=async(query,replacement='',options={})=>{
    if(options.selection)editor.setSelectionRange(...options.selection);
    element('findInput').value=query;element('replaceInput').value=replacement;
    element('findRegex').checked=Boolean(options.regex);element('findCase').checked=Boolean(options.matchCase);
    await f.call('findInFile',true);
    if(options.scoped){element('findSelection').checked=true;await f.call('toggleFindSelection');}
  };
  f.replace=all=>f.call('replaceFindMatch',Boolean(all));
  f.text=()=>context.state.notes.find(file=>file.id===context.state.activeId).content;
  f.matches=async()=>plain((await f.call('collectFindMatches')).matches);
  f.scope=()=>plain(context.findSession.scope);
  f.selected=()=>editor.value.slice(editor.selectionStart,editor.selectionEnd);
  f.marked=(json=false)=>f.call('decorateEditorMatches',json?context.colorJSON(editor.value):vm.runInContext('escape(editor.value)',context));
  f.dirty=()=>context.isFileModified(context.state.notes.find(file=>file.id===context.state.activeId));
  return f;
}

(async()=>{
// Case-insensitive literal search navigates with wrap; replacements proceed one at a time.
{
  const f=fixture('cat CAT cat');await f.open('cat','dog');
  assert.equal((await f.matches()).length,3);assert.equal(f.editor.selectionStart,0);
  await f.call('findMatches',true);assert.equal(f.editor.selectionStart,4);
  await f.call('findMatches',true);assert.equal(f.editor.selectionStart,8);
  await f.call('findMatches',true);assert.equal(f.editor.selectionStart,0);
  await f.call('findMatches',true,true);assert.equal(f.editor.selectionStart,8);
  await f.call('findMatches',true);assert.equal(f.editor.selectionStart,0);
  f.elements.replaceInput.focus();await f.replace();
  assert.equal(f.text(),'dog CAT cat');assert.equal(f.selected(),'CAT');
  assert.equal(f.document.activeElement,f.elements.replaceInput,'Enter can continue replacing from the replacement field');
  await f.replace();assert.equal(f.text(),'dog dog cat');assert.equal(f.selected(),'cat');
  await f.replace();assert.equal(f.text(),'dog dog dog');assert.equal(f.elements.findCount.textContent,'No matches');
  assert.equal(f.dirty(),true);assert.ok(f.dirtyUpdates>0);assert.ok(f.saves.length>0);
  assert.equal(f.context.state.notes[1].content,'cat CAT cat','Another file is never changed');
}
{
  const f=fixture('cat CAT cat');await f.open('cat','dog',{matchCase:true});
  assert.equal((await f.matches()).length,2);await f.replace(true);assert.equal(f.text(),'dog CAT dog');
}

// Literal mode escapes pattern punctuation and does not expand replacement syntax.
{
  const f=fixture(String.raw`a+b? [x] \ a+b?`);await f.open('a+b?',String.raw`$1-$&-\n`);await f.replace(true);
  assert.equal(f.text(),String.raw`$1-$&-\n [x] \ $1-$&-\n`);
}

// Real line breaks work in literal/regex replacements, selection scopes and undo.
{
  const f=fixture('first\n\nlast');f.editor.setSelectionRange(0,7,'backward');f.call('replaceText',0,7,'changed');f.call('undo');
  assert.equal(f.text(),'first\n\nlast');assert.equal(f.editor.selectionStart,0);assert.equal(f.editor.selectionEnd,7);assert.equal(f.editor.selectionDirection,'backward','Undo restores the active end of a backward selection');
}
{
  const before='start\nalpha\nbeta\nend\nalpha\nbeta\n',f=fixture(before);
  await f.open('alpha\nbeta','first\n$&\nlast');assert.equal((await f.matches()).length,2);assert.equal(f.selected(),'alpha\nbeta');
  await f.replace(true);assert.equal(f.text(),'start\nfirst\n$&\nlast\nend\nfirst\n$&\nlast\n','Literal multiline replacement retains real newlines and dollar syntax verbatim');
  assert.equal(f.context.histories.get('a').undo.length,1);f.call('undo');assert.equal(f.text(),before);f.call('undo',true);assert.match(f.text(),/first\n\$&\nlast/);
}
{
  const before='a\nb OUT a\nb END a\nb',f=fixture(before),start=before.indexOf('a\nb',4),end=start+3;
  await f.open('a\nb','one\ntwo\nthree',{selection:[start,end],scoped:true});await f.replace();
  assert.equal(f.text(),'a\nb OUT one\ntwo\nthree END a\nb');assert.deepEqual(f.scope(),{start,end:start+'one\ntwo\nthree'.length});
  f.call('undo');assert.equal(f.text(),before);assert.deepEqual(f.scope(),{start,end});
}
{
  const f=fixture('item: a\nvalue: 1\nitem: b\nvalue: 2');await f.open('item: (.)\nvalue: (\\d)','$2\n$1',{regex:true});await f.replace(true);
  assert.equal(f.text(),'1\na\n2\nb','Regex captures work with actual line breaks in both fields');
}

// Newly inserted occurrences are skipped when moving to the next original match.
{
  const f=fixture('foo foo');await f.open('foo','foofoo');await f.replace();
  assert.equal(f.text(),'foofoo foo');assert.equal(f.editor.selectionStart,7);
  await f.replace();assert.equal(f.text(),'foofoo foofoo');
}
{
  const f=fixture('foo foo foo');await f.open('foo','');await f.replace();await f.replace();await f.replace();
  assert.equal(f.text(),'  ');assert.equal((await f.matches()).length,0);
}

// A single regex replacement retains captures, anchors and surrounding lookaround context.
{
  const f=fixture('id:12 id:34');await f.open(String.raw`(?<=id:)(\d+)`,'[$1]',{regex:true});await f.replace();
  assert.equal(f.text(),'id:[12] id:34');assert.equal(f.selected(),'34');
  await f.replace();assert.equal(f.text(),'id:[12] id:[34]');
}
{
  const f=fixture('key=12 other=34');await f.open(String.raw`(?<item>\w+)=(?<n>\d+)`,'$<n>:$<item>',{regex:true});await f.replace(true);
  assert.equal(f.text(),'12:key 34:other');
}
{
  const f=fixture('abc');await f.open('b',"$`-$&-$'",{regex:true});await f.replace();assert.equal(f.text(),'aa-b-cc');
}
{
  const f=fixture('ab');await f.open('(ab)',String.raw`$1\n\t$$`,{regex:true});await f.replace(true);
  assert.equal(f.text(),'ab\n\t$');
}

// Invalid and empty patterns leave text unchanged and disable replacement.
{
  const f=fixture('keep this');await f.open('[','changed',{regex:true});
  assert.match(f.elements.findError.textContent,/Invalid regex/);assert.equal(f.elements.findInput.attributes['aria-invalid'],'true');
  assert.equal(f.elements.replaceAllButton.disabled,true);await f.replace(true);assert.equal(f.text(),'keep this');assert.equal(f.dirty(),false);
  f.elements.findInput.value='';await f.call('findMatches');await f.replace(true);
  assert.equal(f.text(),'keep this');assert.equal(f.context.histories.size,0);
}

// Zero-width and Unicode matches advance safely, including one-by-one replacement.
{
  const f=fixture('😀a\n😀b');await f.open('(?=😀)','-',{regex:true});assert.deepEqual((await f.matches()).map(m=>m.start),[0,4]);
  await f.replace();assert.equal(f.text(),'-😀a\n😀b');assert.equal(f.editor.selectionStart,5);
  await f.replace();assert.equal(f.text(),'-😀a\n-😀b');
}
{
  const f=fixture('a\nb');await f.open('^|$','|',{regex:true});await f.replace(true);assert.equal(f.text(),'|a|\n|b|');
  assert.equal(f.context.histories.get('a').undo.length,1,'Replace All is one undo action');
  f.call('undo');assert.equal(f.text(),'a\nb');assert.equal(f.dirty(),false);
  f.call('undo',true);assert.equal(f.text(),'|a|\n|b|');assert.equal(f.dirty(),true);
}
{
  const f=fixture('😀a');await f.open('(?=.)','x',{regex:true});await f.replace(true);assert.equal(f.text(),'x😀xa');
}

// Selection scope keeps the original range while matches are selected and lengths change.
{
  const f=fixture('foo OUT foo foo END foo');await f.open('foo','longer',{selection:[8,15],scoped:true});
  assert.deepEqual(f.scope(),{start:8,end:15});assert.equal((await f.matches()).length,2);
  f.call('captureFindSelection');assert.deepEqual(f.scope(),{start:8,end:15},'Programmatic match selection does not shrink scope');
  await f.replace();assert.equal(f.text(),'foo OUT longer foo END foo');assert.deepEqual(f.scope(),{start:8,end:18});
  assert.equal(f.selected(),'foo');await f.replace();assert.equal(f.text(),'foo OUT longer longer END foo');
  assert.deepEqual(f.scope(),{start:8,end:21});
  f.call('undo');assert.equal(f.text(),'foo OUT longer foo END foo');assert.deepEqual(f.scope(),{start:8,end:18});
  f.call('undo');assert.equal(f.text(),'foo OUT foo foo END foo');assert.deepEqual(f.scope(),{start:8,end:15});
}
{
  const f=fixture('foo |foofoo| foo');await f.open('foo','',{selection:[5,11],scoped:true});await f.replace(true);
  assert.equal(f.text(),'foo || foo');assert.deepEqual(f.scope(),{start:5,end:5});
  assert.equal(f.elements.replaceAllButton.disabled,true);await f.replace(true);assert.equal(f.text(),'foo || foo','An empty scope never falls back to the entire file');
}
// Identical adjacent text must not move into the selection when selected text is deleted.
for(const selection of [[0,3],[3,6]]) {
  const f=fixture('foofoo');await f.open('foo','',{selection,scoped:true});await f.replace(true);
  assert.equal(f.text(),'foo');assert.deepEqual(f.scope(),{start:selection[0],end:selection[0]});
  await f.replace(true);assert.equal(f.text(),'foo','The adjacent occurrence stays outside scope');
  f.call('undo');assert.equal(f.text(),'foofoo');assert.deepEqual(f.scope(),{start:selection[0],end:selection[1]});
  f.call('undo',true);assert.equal(f.text(),'foo');assert.deepEqual(f.scope(),{start:selection[0],end:selection[0]});
}
{
  const f=fixture('foofoo');await f.open('foo','',{selection:[0,3],scoped:true});
  f.context.pendingFindInput={id:'a',text:f.editor.value,start:0,end:3,type:'deleteContentBackward'};
  f.call('rememberHistory',undefined,true);f.editor.setRangeText('',0,3);f.call('trackFindInput');
  f.context.state.notes[0].content=f.editor.value;f.call('afterEdit');await f.call('findMatches',false,false,null,false);
  assert.deepEqual(f.scope(),{start:0,end:0});await f.replace(true);assert.equal(f.text(),'foo');
  f.call('undo');assert.deepEqual(f.scope(),{start:0,end:3});
}
{
  const f=fixture('foofoo');await f.open('foo','bar',{selection:[3,6],scoped:true});
  f.editor.setSelectionRange(3,3);
  f.context.pendingFindInput={id:'a',text:f.editor.value,start:3,end:3,type:'deleteContentBackward'};
  f.editor.setRangeText('',2,3);f.call('trackFindInput');f.context.state.notes[0].content=f.editor.value;f.call('afterEdit');await f.call('findMatches',false,false,null,false);
  assert.deepEqual(f.scope(),{start:2,end:5});await f.replace(true);assert.equal(f.text(),'fobar');
}
{
  const f=fixture('foofoo');await f.open('foo','bar',{selection:[0,3],scoped:true});
  // An unexpected text update without an edit range must require a new selection.
  f.editor.value='foo';f.context.state.notes[0].content='foo';f.call('afterEdit');await f.call('findMatches',false,false,null,false);
  assert.equal(f.scope(),null);assert.equal(f.elements.replaceAllButton.disabled,true);
  await f.replace(true);assert.equal(f.text(),'foo');
}
{
  const f=fixture('foo foo foo');await f.open('foo','bar');f.elements.findSelection.checked=true;await f.call('toggleFindSelection');
  assert.equal(f.elements.replaceAllButton.disabled,true);assert.match(f.elements.findError.textContent,/Select text/);
  await f.replace(true);assert.equal(f.text(),'foo foo foo');
  f.editor.setSelectionRange(4,11);f.call('captureFindSelection');
  assert.deepEqual(f.scope(),{start:4,end:11});await f.replace(true);assert.equal(f.text(),'foo bar bar');
}
{
  const f=fixture('xx foo foo yy');await f.open('foo','bar',{selection:[3,10],scoped:true});
  f.call('replaceText',0,0,'start ');assert.deepEqual(f.scope(),{start:9,end:16});
  f.call('undo');assert.equal(f.text(),'xx foo foo yy');assert.deepEqual(f.scope(),{start:3,end:10});
  await f.replace(true);assert.equal(f.text(),'xx bar bar yy');f.call('undo');assert.equal(f.text(),'xx foo foo yy');
}

// Closing or changing files discards the previous file's selection scope.
{
  const f=fixture('foo foo');await f.open('foo','bar',{selection:[0,3],scoped:true});f.call('closeFind',false);
  assert.equal(f.context.findSession,null);assert.equal(f.elements.findBar.hidden,true);
  f.context.state.activeId='b';f.editor.value='foo foo';f.editor.setSelectionRange(0,0);await f.open('foo','bar');
  assert.equal(f.elements.findSelection.checked,false);await f.replace(true);
  assert.equal(f.context.state.notes[0].content,'foo foo');assert.equal(f.context.state.notes[1].content,'bar bar');
}

// Read-only files and failed startup never allow replacement, including direct actions.
for(const blocked of ['readOnly','trashed','startup']) {
  const f=fixture('foo');if(blocked==='readOnly')f.editor.readOnly=true;
  if(blocked==='trashed')f.context.state.notes[0].trashedAt=10;
  if(blocked==='startup')f.context.startupBlocked=true;
  await f.open('foo','bar');if(blocked==='trashed')assert.equal(f.elements.findBar.hidden,true);else assert.equal(f.elements.replaceAllButton.disabled,true);await f.replace(true);assert.equal(f.text(),'foo');
}
// Cancelling a costly replacement leaves text and undo history untouched.
{
  const content='a'.repeat(20000)+'!';const f=fixture(content);await f.open('!','changed');
  f.elements.findInput.value='(a+)+$';f.elements.findRegex.checked=true;
  const replacing=f.replace(true);await new Promise(resolve=>setTimeout(resolve,80));f.call('cancelInlineSearch');await replacing;
  assert.equal(f.text(),content);assert.equal(f.context.histories.size,0);assert.equal(f.elements.findCount.textContent,'Search cancelled.');
  assert.equal(f.elements.cancelFindButton.hidden,true);
}
// Editing while a replacement is pending invalidates its original document snapshot.
{
  const content='a'.repeat(20000)+'!';const f=fixture(content);await f.open('!','changed');
  f.elements.findInput.value='(a+)+$';f.elements.findRegex.checked=true;
  const replacing=f.replace(true);await new Promise(resolve=>setTimeout(resolve,80));
  f.editor.value='new editor contents';f.context.state.notes[0].content=f.editor.value;f.call('afterEdit');await replacing;
  assert.equal(f.text(),'new editor contents');assert.equal(f.context.histories.size,0);
}

// Match backgrounds remain visible with focus in Find/Replace, preserve syntax, and refresh live.
{
  const f=fixture('cat CAT & cat');await f.open('cat','dog');f.elements.replaceInput.focus();
  assert.equal((f.marked().match(/class="search-hit/g)||[]).length,3);assert.match(f.marked(),/search-hit current/);
  await f.replace();assert.equal((f.marked().match(/class="search-hit/g)||[]).length,2);assert.ok(f.marked().startsWith('dog '));
  f.call('closeFind',false);assert.ok(!f.marked().includes('search-hit'));
}
{
  const f=fixture('{"message":"a < b & c"}');await f.open('< b & c');const html=f.marked(true);
  assert.match(html,/tok-property/);assert.match(html,/tok-string/);assert.match(html,/search-hit current/);assert.ok(html.includes('&lt; b &amp; c</mark>'));assert.ok(!html.includes('< b'));
}
{
  const f=fixture('x😀x\nx😀x');await f.open('(?=😀)','',{regex:true});assert.equal((f.marked().match(/zero-width/g)||[]).length,2);
  f.elements.findInput.value='';await f.call('findMatches',false,false,null,false);assert.ok(!f.marked().includes('search-hit'));
}
{
  const f=fixture('cat dog dog',{live:true});await f.open('cat');f.elements.findInput.value='dog';f.call('refreshInlineFind');
  for(let tries=0;tries<200&&!f.marked().includes('>dog</mark>');tries++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal((f.marked().match(/class="search-hit/g)||[]).length,2);assert.ok(!f.marked().includes('>cat</mark>'));
}
console.log('Passed: literal and regex search, captures, one/all replacement, Unicode and zero-width matches, fixed selection scope, undo/redo, file isolation, cancellation and stale-replacement guards.');

})().catch(error=>{console.error(error);process.exitCode=1;});
