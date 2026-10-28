// Run the complete built application, including initialization, against browser/native hosts.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../dist/Another-Note.html'),'utf8');
const build=html.match(/<meta name="another-note-build" content="([^"]+)"/)[1];
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const app=scripts.find(script=>!script[1].includes('text/plain')&&!script[1].includes('startupTheme'))[2];
const worker=scripts.find(script=>script[1].includes('searchWorkerSource'))[2];
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const plain=value=>JSON.parse(JSON.stringify(value));
function classList(){const names=new Set();return {add(...items){items.forEach(item=>names.add(item));},remove(...items){items.forEach(item=>names.delete(item));},toggle(name,force){if(force===undefined)force=!names.has(name);force?names.add(name):names.delete(name);return force;},contains:name=>names.has(name)};}
function element(id=''){
  let markup='';const children=[],listeners=new Map();
  return {id,value:'',hidden:false,disabled:false,checked:false,open:false,dataset:{},classList:classList(),style:{setProperty(){},overflowY:''},children,
    scrollTop:0,scrollLeft:0,selectionStart:0,selectionEnd:0,clientWidth:960,clientHeight:600,
    get scrollHeight(){return this.value.split('\n').length*18+8;},
    get innerHTML(){return markup;},set innerHTML(value){markup=value;},
    append(...items){children.push(...items);},addEventListener(type,callback,capture=false){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({callback,capture:capture===true||capture.capture===true});},emit(type,event={}){event.target??=this;event.preventDefault??=()=>event.defaultPrevented=true;event.stopImmediatePropagation??=()=>event.stopped=true;event.stopPropagation??=()=>{};let result;for(const {callback}of [...(listeners.get(type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){result=callback(event);if(event.stopped)break;}return result;},setAttribute(){},removeAttribute(){},
    closest(){return this;},querySelectorAll(){return [];},querySelector(selector){return selector==='span'||selector==='[value="cancel"]'?element():null;},
    getBoundingClientRect(){return {x:0,y:0,top:0,left:0,bottom:600,right:960,width:960,height:24};},
    setSelectionRange(start,end,direction='none'){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;},select(){this.setSelectionRange(0,this.value.length);},focus(){},scrollIntoView(){},
    showModal(){this.open=true;},close(){this.open=false;this.emit('close');},contains(){return false;},
  };
}
function browserDatabase(workspace,failHandles=false){
  const stores=new Map([['workspace',new Map([['current',workspace]])],['fileVersions',new Map()],['fileHandles',new Map()]]);
  return {objectStoreNames:{contains:name=>stores.has(name)},transaction(name){
    if(name==='fileHandles'&&failHandles)throw new Error('Saved handles unavailable');
    const store=stores.get(name),tx={};
    const request=fn=>{const op={};queueMicrotask(()=>{op.result=fn();op.onsuccess?.();});return op;};
    tx.objectStore=()=>({get:key=>request(()=>store.get(key)),put:(value,key)=>request(()=>store.set(key,value)),
      delete:key=>request(()=>store.delete(key)),openCursor(){const op={};queueMicrotask(()=>{op.result=null;op.onsuccess?.();});return op;}});
    setImmediate(()=>tx.oncomplete?.());return tx;
  }};
}
async function launch({native=false,failHandles=false,fallback=false,theme='light',systemDark=false,transfer=null,nativeWindows=1,freshWindow=false}={}){
  const resolved=theme==='system'?(systemDark?'dark':'light'):theme;
  const workspace={format:'vista-notes',version:1,updatedAt:100,activeId:'existing',settings:{theme,openIds:['existing']},
    notes:[{id:'existing',title:'keep.json',content:'{"keep":true}',mode:'json',createdAt:1,updatedAt:100,trashedAt:0,removedAt:0,fileKey:'remembered-key',diskPath:'/files/keep.json'}]};
  const elements=new Map([...ids].map(id=>[id,element(id)]));elements.get('searchWorkerSource').textContent=worker;
  for(const id of ['findBar','findAllPanel','errorBanner'])elements.get(id).hidden=true;
  const document={body:element(),documentElement:element(),activeElement:null,visibilityState:'visible',
    getElementById(id){assert.ok(elements.has(id),`Referenced element exists: ${id}`);return elements.get(id);},
    createElement:()=>element(),querySelectorAll:()=>[],querySelector:selector=>selector==='meta[name="another-note-build"]'?{content:build}:element(),addEventListener(){}};
  const messages=[],saved=[],local=new Map();let serial=0,context;
  const windowListeners=new Map(),window={addEventListener(type,callback){if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(callback);},emit(type,event={}){for(const callback of windowListeners.get(type)||[])callback(event);}};
  const db=browserDatabase(workspace,failHandles);
  const indexedDB={open(){const op={};queueMicrotask(()=>{op.result=db;op.onsuccess();});return op;}};
  if(native)window.webkit={messageHandlers:{vistaNotes:{postMessage(raw){const data=JSON.parse(raw);messages.push(data);queueMicrotask(()=>{
    let result={};if(data.command==='load'){result={state:plain(workspace),transfer,windowId:freshWindow?'window-relaunch':'main',nativeDrag:'gesture'};if(freshWindow){result.state.settings.openIds=[];result.state.activeId=null;}}
    else if(data.command==='save'){saved.push(data.state);result={saved:true};}
    else if(data.command==='versions_load')result={versions:[]};
    else if(data.command==='versions_store')result={saved:true};
    else if(data.command==='close_prompt')result={waiting:true,windowCount:nativeWindows};
    else if(data.command==='save_file')result={saved:true,name:'keep.json',fileKey:'remembered-key',diskPath:'/files/keep.json'};
    window.vistaNotesNativeResult(data.id,result);
  });}}}};
  else if(!fallback)window.indexedDB=indexedDB;
  if(fallback)local.set('vista-notes.workspace.v1',JSON.stringify(workspace));
  context=vm.createContext({window,document,indexedDB,queueMicrotask,setTimeout:()=>++serial,clearTimeout(){},requestAnimationFrame:()=>++serial,
    navigator:{},localStorage:{getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value),removeItem:key=>local.delete(key)},
    getComputedStyle:()=>({lineHeight:'24px',paddingLeft:'4px',paddingRight:'23px',borderTopWidth:'1px',borderBottomWidth:'1px'}),
    matchMedia:()=>({matches:systemDark,addEventListener(){}}),ResizeObserver:class{observe(){}},
    crypto:{randomUUID:()=>`new-${++serial}`},innerWidth:1200,innerHeight:800,performance:{now:()=>1},
  });
  const instrumented=app.replace('  initialize().catch(error=>{',
    '  globalThis.appTest={getState:()=>state,getHistory:id=>histories.get(id),actions,flush,isFileModified,renderTabs,fileLabel,exportName,validateWorkspace,setFileTag,setTabTagFilter,peers:windowPeers,shouldConfirmWindowClose};globalThis.startup=initialize().catch(error=>{');
  vm.runInContext(instrumented,context);await context.startup;await context.appTest.flush();
  assert.equal(elements.get('saveState').hidden,true,'Successful recovery stays quiet in the footer');assert.equal(elements.get('saveLabel').textContent,'');
  assert.equal(elements.get('errorBanner').hidden,true,elements.get('errorBanner').textContent);
  if(freshWindow){
    const state=context.appTest.getState(),blank=state.notes.find(note=>note.id===state.activeId);
    assert.equal(state.notes.length,2,'A relaunch keeps the existing draft and adds one new file');
    assert.deepEqual(plain(state.settings.openIds),[blank.id],'Only the new file is open in the new window');
    assert.notEqual(blank.id,'existing');assert.equal(blank.content,'');assert.equal(blank.title,'');assert.equal(blank.mode,'text');
    assert.equal(state.notes.find(note=>note.id==='existing').content,'{"keep":true}','Existing draft text is unchanged');
    assert.equal(elements.get('editor').value,'');assert.equal(context.appTest.isFileModified(blank),false);
    assert.equal(saved.at(-1).activeId,blank.id,'The fresh tab is included in recovery');
    assert.ok(messages.find(message=>message.command==='ready'&&!message.failed));
    return {context,elements,messages,window,saved};
  }
  if(transfer){const editor=elements.get('editor');assert.equal(editor.selectionStart,transfer.cursor.start);assert.equal(editor.selectionEnd,transfer.cursor.end);assert.equal(editor.scrollTop,transfer.cursor.top);assert.equal(editor.scrollLeft,transfer.cursor.left);assert.equal(context.appTest.getHistory(transfer.fileId).undo[0].content,'previous');}
  assert.equal(context.appTest.getState().notes.length,1);assert.equal(elements.get('editor').value,'{"keep":true}');
  assert.equal(context.appTest.getState().notes[0].fileKey,'remembered-key');
  assert.equal(document.body.dataset.theme,resolved);assert.match(elements.get('highlightCode').innerHTML,/tok-property/);
  assert.equal(document.documentElement.style.colorScheme,resolved);assert.equal(document.documentElement.style.backgroundColor,resolved==='dark'?'#191e23':'#fcfcfc');assert.equal(elements.get('language').value,'json');
  const title=elements.get('noteTitle');
  for(const [name,mode] of [['draft.sh','bash'],['draft.md','markdown'],['draft.txt','text'],['Example.java','java'],['app.js','javascript'],['app.mjs','javascript'],['index.html','html'],['style.css','css'],['app.py','python'],['app.pyw','python'],['draft.JSON','json']]){
    title.value=name;title.emit('input');assert.equal(context.appTest.getState().notes[0].mode,mode);assert.equal(elements.get('language').value,mode);
  }
  title.value='draft';title.emit('input');assert.equal(elements.get('language').value,'json','Removing the extension preserves the selected type');
  for(const action of [...html.matchAll(/data-action="([^"]+)"/g)].map(match=>match[1]))assert.equal(typeof context.appTest.actions[action],'function',`Action ${action} is wired`);
  if(native){assert.ok(saved.length);assert.equal(messages.find(message=>message.command==='ready').theme,resolved);assert.equal(messages.find(message=>message.command==='ready').build,build);assert.equal(messages.find(message=>message.command==='appearance').theme,resolved);await context.appTest.actions.export();assert.equal(context.appTest.isFileModified(context.appTest.getState().notes[0]),false);}
  return {context,elements,messages,window,saved};
}
(async()=>{
  await launch({native:true,freshWindow:true});
  {
    const {context,elements}=await launch(),api=context.appTest,editor=elements.get('editor');
    editor.setSelectionRange(0,6,'backward');api.actions.new();api.actions.previous();
    assert.equal(editor.selectionStart,0);assert.equal(editor.selectionEnd,6);assert.equal(editor.selectionDirection,'backward','Switching tabs retains the active end of a selection');
  }
  {
    const {context,elements}=await launch(),api=context.appTest,file=api.getState().notes[0],before=file.content,find=elements.get('findInput'),replace=elements.get('replaceInput');
    replace.value='first\nsecond\n';await api.actions.findReplace();assert.equal(replace.style.height,'64px','Opening replacement sizes a remembered multiline block');
    find.value='two\nlines';find.emit('input');assert.equal(find.style.height,'46px','The generated app grows Find on input');
    replace.value='one';replace.emit('input');assert.equal(replace.style.height,'28px','The generated app shrinks Replace on input');
    assert.equal(file.content,before,'Editing search fields leaves the file unchanged');api.actions.closeFind();
  }
  {
    const {context,elements}=await launch({native:true}),api=context.appTest,file=api.getState().notes[0],before=file.content;
    assert.equal(elements.get('lineGutter').hidden,false);api.actions.lineNumbers();
    assert.equal(file.lineNumbers,false);assert.equal(elements.get('lineGutter').hidden,true);assert.equal(api.isFileModified(file),false);
    assert.equal(api.validateWorkspace(plain(api.getState())).notes[0].lineNumbers,false,'Per-file line numbers survive recovery');
    api.actions.new();assert.equal(elements.get('lineGutter').hidden,false,'New files start with line numbers');await api.actions.close();
    assert.equal(elements.get('lineGutter').hidden,true,'Switching back restores this file’s choice');assert.equal(file.content,before);
    await api.actions.close();assert.equal(api.getState().settings.openIds.length,0);assert.equal(elements.get('emptyState').hidden,false);assert.equal(elements.get('lineNumbersMenu').disabled,true);
    api.actions.new();assert.equal(elements.get('lineNumbersMenu').disabled,false,'The last empty window remains usable');
  }
  {
    const {context,elements}=await launch(),api=context.appTest,file=api.getState().notes[0],content=file.content,dirty=api.isFileModified(file);
    assert.equal(api.getState().settings.minimap,true);api.actions.minimap();assert.equal(api.getState().settings.minimap,false);assert.equal(elements.get('editorMinimap').hidden,true);
    const restored=api.validateWorkspace(plain(api.getState()));assert.equal(restored.settings.minimap,false,'Hidden minimap choice survives workspace recovery');
    api.actions.minimap();assert.equal(elements.get('editorMinimap').hidden,false);assert.equal(file.content,content);assert.equal(api.isFileModified(file),dirty);
  }
  {
    const {context,elements}=await launch(),api=context.appTest,editor=elements.get('editor');
    const incoming=plain(api.getState()),remote=incoming.notes.find(file=>file.id===incoming.activeId);
    remote.content='Other window edit';remote.updatedAt=Date.now()+100000;incoming.updatedAt=remote.updatedAt;
    context.localStorage.setItem('vista-notes.workspace.v1',JSON.stringify(incoming));
    editor.value='My local draft';editor.setSelectionRange(3,8);editor.scrollTop=22;editor.scrollLeft=4;editor.emit('input');await api.flush();
    const files=api.getState().notes;assert.ok(files.some(file=>file.content==='Other window edit'));
    assert.ok(files.some(file=>file.content==='My local draft'),'Recovery must preserve typing when another window’s journal arrives first');
    const active=files.find(file=>file.id===api.getState().activeId);assert.equal(active.content,editor.value);assert.equal(active.fileKey,undefined,'A conflict copy must not retain disk-write permission');
    assert.equal(editor.selectionStart,3);assert.equal(editor.selectionEnd,8);assert.equal(editor.scrollTop,22);assert.equal(editor.scrollLeft,4);
  }
  {
    const {context,elements}=await launch(),api=context.appTest,file=api.getState().notes[0],editor=elements.get('editor');
    file.savedState={title:file.title,content:file.content,mode:file.mode};file.savedSignature=api.validateWorkspace(plain(api.getState())).notes[0].savedSignature;
    const incoming=plain(api.getState()),remote=incoming.notes[0];remote.content='Fresh remote contents';remote.savedState.content=remote.content;remote.updatedAt=Date.now()+100000;incoming.updatedAt=remote.updatedAt;
    context.localStorage.setItem('vista-notes.workspace.v1',JSON.stringify(incoming));api.actions.wrap();await api.flush();
    assert.equal(api.getState().notes.length,1,'A clean file can refresh without creating a conflict copy');assert.equal(editor.value,'Fresh remote contents');assert.equal(api.getState().activeId,file.id);assert.equal(api.isFileModified(api.getState().notes[0]),false);
  }
  {
    const {context,elements}=await launch({native:true}),api=context.appTest,file=api.getState().notes[0];
    assert.equal(elements.get('noteList').innerHTML,'','Closed saved-file dialogs are not rebuilt in the background');
    api.actions.files();assert.match(elements.get('noteList').innerHTML,/keep\.json/);elements.get('filesDialog').close();
    file.trashedAt=100;api.getState().settings.openIds=[];
    const deleting=api.actions.permanent(),dialog=elements.get('confirmDialog');assert.equal(dialog.open,true);
    dialog.returnValue='confirm';dialog.close();await deleting;
    assert.ok(file.removedAt);assert.equal(file.content,'');assert.equal(file.title,'');assert.equal(file.savedState,null);
    assert.equal(file.fileKey,undefined);assert.equal(file.diskPath,undefined);
  }
  for(const native of [false,true]){
    const {context,elements}=await launch({native});const api=context.appTest,state=api.getState(),file=state.notes[0];
    const dirty=api.isFileModified(file),ids=plain(state.settings.openIds),content=file.content;
    api.setFileTag(file.id,'Work',true);api.setFileTag(file.id,'Ideas',true);api.setTabTagFilter({kind:'tag',tag:'Missing'});await api.flush();
    assert.deepEqual(plain(api.getState().settings.openIds),ids);assert.equal(api.getState().activeId,file.id);assert.equal(elements.get('editor').value,content);assert.equal(api.isFileModified(api.getState().notes[0]),dirty);
    assert.equal(elements.get('fileTabs').innerHTML,'');const recovered=api.validateWorkspace(plain(api.getState()));assert.deepEqual(plain(recovered.notes[0].tags),['Work','Ideas']);
    assert.equal(elements.get('tagEmptyState').hidden,false);assert.equal(elements.get('notePane').hidden,true);
    api.actions.new();const created=api.getState().notes.at(-1);assert.deepEqual(plain(created.tags),['Missing']);assert.equal(api.isFileModified(created),false);assert.equal(elements.get('tagEmptyState').hidden,true);assert.equal(elements.get('notePane').hidden,false);
    await api.actions.close();assert.equal(elements.get('closeDialog').open,false);assert.equal(elements.get('tagEmptyState').hidden,false);assert.ok(!elements.get('savedFilesMenu').innerHTML.includes(`data-open-file="${created.id}"`));
    api.actions.showAllTabs();assert.equal(elements.get('tagEmptyState').hidden,true);assert.equal(elements.get('notePane').hidden,false);assert.match(elements.get('fileTabs').innerHTML,/data-tab-id="existing"/);
  }
  const boot=scripts.find(script=>script[1].includes('startupTheme'))[2];
  for(const [saved,systemDark,native,expected] of [[null,true,false,'dark'],[null,false,false,'light'],['{"settings":{"theme":"dark"}}',false,false,'dark'],['{"settings":{"theme":"light"}}',true,false,'light'],['broken',true,false,'dark'],['{"settings":{"theme":"light"}}',true,true,'dark']]){
    const root={dataset:{},style:{}};
    vm.runInNewContext(boot,{document:{documentElement:root},window:native?{webkit:{messageHandlers:{vistaNotes:{}}}}:{},localStorage:{getItem:()=>saved},matchMedia:()=>({matches:systemDark})});
    assert.equal(root.dataset.theme,expected);assert.equal(root.style.backgroundColor,expected==='dark'?'#191e23':'#fcfcfc');
  }
  await launch({native:true});await launch();await launch({failHandles:true});await launch({fallback:true});
  await launch({native:true,transfer:{fileId:'existing',cursor:{start:2,end:6,top:18,left:3},history:{undo:[{content:'previous',start:0,end:0}],redo:[],last:0}}});
  await launch({native:true,theme:'dark'});await launch({native:true,theme:'system',systemDark:true});await launch({theme:'dark',fallback:true});
  {
    const {context,elements}=await launch();const api=context.appTest,editor=elements.get('editor');
    api.actions.new();const file=api.getState().notes.at(-1),baseline=file.savedSignature;
    assert.equal(api.fileLabel(file),'untitled');assert.equal(api.isFileModified(file),false);
    const edit=text=>{editor.emit('beforeinput',{inputType:'insertText'});editor.value=text;editor.emit('input');api.renderTabs();};
    edit('  Project <draft> & plans  \nSecond line');
    assert.equal(api.fileLabel(file),'Project <draft> & plans');assert.equal(file.title,'','Automatic labels never overwrite the actual filename');
    assert.match(elements.get('fileTabs').innerHTML,/Project &lt;draft&gt; &amp; plans/);assert.equal(context.document.title,'● Project <draft> & plans — Another Note');
    assert.equal(api.exportName(file),'Project -draft- & plans.txt');assert.equal(file.savedSignature,baseline);
    const recovered=api.validateWorkspace(plain(api.getState())).notes.at(-1);assert.equal(api.fileLabel(recovered),'Project <draft> & plans','Derived labels survive recovery and moving between windows');
    edit('Changed first line\nSecond line');assert.equal(context.document.title,'● Changed first line — Another Note');
    edit('');assert.equal(api.fileLabel(file),'untitled');assert.equal(api.isFileModified(file),false,'Clearing the draft restores its original saved baseline');
    edit('\nText on another line');assert.equal(api.fileLabel(file),'untitled');
    const title=elements.get('noteTitle');title.value='named.json';title.emit('input');
    edit('Different content\nnext');assert.equal(api.fileLabel(file),'named.json');assert.equal(context.document.title,'● named.json — Another Note');
  }
  {
    const {context,elements,messages,window}=await launch({native:true});const editor=elements.get('editor'),dialog=elements.get('closeDialog');
    const state=context.appTest.getState(),file=state.notes[0],original=file.content;const writes=()=>messages.filter(message=>message.command==='save_file').length;
    assert.ok(!ids.has('preview')&&!ids.has('sidebarMenu')&&!ids.has('search'));
    const edit=text=>{editor.emit('beforeinput',{inputType:'insertText'});editor.value=text;editor.emit('input');};
    edit('cancelled draft');let closing=context.appTest.actions.close();assert.equal(dialog.open,true);const before=writes();dialog.returnValue='cancel';dialog.close();await closing;assert.equal(file.content,'cancelled draft');assert.equal(writes(),before);
    closing=context.appTest.actions.close();dialog.returnValue='discard';dialog.close();await closing;assert.equal(file.content,original);assert.equal(writes(),before);assert.equal(state.settings.openIds.length,0);
    context.appTest.actions.reopen();assert.equal(editor.value,original);edit('explicit save');closing=context.appTest.actions.close();dialog.returnValue='save';dialog.close();await closing;assert.equal(writes(),before+1);assert.equal(state.settings.openIds.length,0);
    context.appTest.actions.reopen();assert.equal(editor.value,'explicit save');await window.vistaNotesPrepareClose();assert.ok(messages.some(message=>message.command==='close_ready'));assert.equal(dialog.open,false);assert.equal(writes(),before+1,'Closing an unchanged app does not write any file');
    state.notes.push({id:'old-trash',title:'old.txt',content:'archived',mode:'text',createdAt:1,updatedAt:1,trashedAt:1,removedAt:0});elements.get('findBar').hidden=false;
    elements.get('noteList').emit('click',{target:{closest:()=>({dataset:{note:'old-trash'}})}});
    assert.equal(elements.get('findBar').hidden,true,'The inline search also excludes Trash');assert.ok(!state.settings.openIds.includes('old-trash'));
  }
  {
    const {context,elements,messages,window,saved}=await launch({native:true});const api=context.appTest,editor=elements.get('editor');
    for(const text of ['first unsaved draft','second unsaved draft']){api.actions.new();editor.value=text;editor.emit('input');}
    const ids=plain(api.getState().settings.openIds),before=messages.filter(message=>message.command==='save_file').length;
    await window.vistaNotesPrepareClose();assert.equal(elements.get('closeDialog').open,false);
    assert.ok(messages.some(message=>message.command==='close_ready'));assert.equal(messages.filter(message=>message.command==='save_file').length,before);
    assert.deepEqual(plain(saved.at(-1).settings.openIds),ids);assert.deepEqual(saved.at(-1).notes.slice(-2).map(file=>file.content),['first unsaved draft','second unsaved draft']);
    assert.ok(api.getState().notes.slice(-2).every(api.isFileModified),'Last-window recovery preserves the unsaved markers');
  }
  {
    const {context,elements,messages,window}=await launch({native:true,nativeWindows:2});const api=context.appTest,editor=elements.get('editor'),dialog=elements.get('closeDialog');
    const drafts=[];for(const text of ['first to close','second to cancel']){api.actions.new();editor.value=text;editor.emit('input');drafts.push(api.getState().activeId);}
    const waitForDialog=async()=>{for(let i=0;i<40&&!dialog.open;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(dialog.open,'A close prompt opened');};
    const closing=window.vistaNotesPrepareClose();await waitForDialog();assert.equal(api.getState().activeId,drafts[0]);assert.equal(editor.value,'first to close');assert.match(elements.get('closeMessage').textContent,/first to close/);
    dialog.returnValue='discard';dialog.close();await waitForDialog();assert.equal(api.getState().activeId,drafts[1]);assert.equal(editor.value,'second to cancel');assert.match(elements.get('closeMessage').textContent,/second to cancel/);
    dialog.returnValue='cancel';dialog.close();await closing;
    assert.deepEqual(plain(api.getState().settings.openIds),[drafts[1]]);assert.ok(messages.some(message=>message.command==='close_cancelled'));assert.ok(!messages.some(message=>message.command==='close_ready'));
  }
  {
    const {context,elements,window}=await launch();const api=context.appTest,editor=elements.get('editor');editor.value='recoverable draft';editor.emit('input');
    const unload=()=>{const event={preventDefault(){this.prevented=true;}};window.emit('beforeunload',event);return event;};
    assert.equal(unload().prevented,undefined,'The final HTML window closes quietly when its drafts are recoverable');
    api.peers.set('another-window',{openIds:[]});assert.equal(unload().prevented,true);api.peers.clear();
    context.localStorage.setItem=()=>{throw Error('Journal storage unavailable');};editor.value='database-only draft';editor.emit('input');
    assert.equal(unload().prevented,true,'A pending database write is protected when the synchronous journal is unavailable');await api.flush();assert.equal(unload().prevented,undefined,'A completed database recovery save also permits quiet final-window closing');
  }
  {
    const {context,elements,window}=await launch({fallback:true});const api=context.appTest;api.actions.new();elements.get('editor').value='last browser draft';elements.get('editor').emit('input');
    const ids=plain(api.getState().settings.openIds);window.close=()=>{window.closed=true;};assert.equal(await api.actions.closeWindow(),true);
    assert.equal(window.closed,true);assert.equal(elements.get('closeDialog').open,false);assert.deepEqual(plain(api.getState().settings.openIds),ids);assert.equal(api.getState().notes.at(-1).content,'last browser draft');
  }
  {
    const {context,elements,window}=await launch();const api=context.appTest,dialog=elements.get('closeDialog');api.actions.new();elements.get('editor').value='keep this browser tab';elements.get('editor').emit('input');const id=api.getState().activeId;
    api.peers.set('other-browser-window',{openIds:[]});let closed=false;window.close=()=>{closed=true;};
    const closing=api.actions.closeWindow();for(let i=0;i<30&&!dialog.open;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(api.getState().activeId,'existing');
    dialog.returnValue='discard';dialog.close();for(let i=0;i<30&&!dialog.open;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(api.getState().activeId,id);
    dialog.returnValue='cancel';dialog.close();assert.equal(await closing,false);assert.equal(closed,false);assert.deepEqual(plain(api.getState().settings.openIds),[id]);
  }
  console.log('Passed: built app recovery, sequential visible close prompts and Cancel, quiet final-window draft retention, browser recovery protection, Save and element/action/theme wiring.');
})().catch(error=>{console.error(error);process.exitCode=1;});
