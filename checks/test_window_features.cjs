// Real transfer/controller code: a tab is released only after its destination acknowledges readiness.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),main=fs.readFileSync(path.join(root,'source/app.js'),'utf8'),moduleCode=fs.readFileSync(path.join(root,'source/window-features.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'source/tab-transfer.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'source/window-collection.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'source/live-tab-drag.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function extract(name){const start=main.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=main.slice(start),end=rest.slice(1).search(/^  (?:async )?function /m);return rest.slice(0,end+1);}
function target(){const handlers=new Map();return {addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},emit(type,event){for(const handler of handlers.get(type)||[])handler(event);}};}
let fixtureId=0;
function fixture(native=true){
  const identity=++fixtureId,f={messages:[],requests:[],snapshots:[],cancelled:[],sent:[],elements:new Map(),timers:new Map()};let serial=0,time=100;
  const element=id=>{if(!f.elements.has(id))f.elements.set(id,{hidden:true});return f.elements.get(id);};
  const app={inert:false,classList:{add(){},remove(){}},style:{setProperty(){}}},bar={classList:{add(){},remove(){}},style:{setProperty(){}},getBoundingClientRect:()=>({left:0,right:1000,top:29,bottom:69})},editor={readOnly:false,selectionStart:2,selectionEnd:5,scrollTop:16,scrollLeft:3,setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},focus(){document.activeElement=this;}};
  f.bodyClasses=new Set();f.bodyStyle=new Map();
  const document=Object.assign(target(),{body:{dataset:{theme:'dark'},classList:{add:name=>f.bodyClasses.add(name),remove:name=>f.bodyClasses.delete(name)},style:{setProperty:(name,value)=>f.bodyStyle.set(name,value),removeProperty:name=>f.bodyStyle.delete(name)}},querySelectorAll:()=>[],activeElement:editor,querySelector:selector=>selector==='.tabbar'?bar:app});
  const session=new Map(),window=Object.assign(target(),{closed:false,location:{href:'file:///app/Another-Note.html',hash:''},sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value)},screenX:10,screenY:20,close(){f.closed=true;this.closed=true;this.emit('pagehide',{});}});
  const child=Object.assign(target(),{location:{href:''},document:{open(){},write(html){f.previewHTML=html;},close(){}},moveTo:(...point)=>f.previewPoint=point,closed:false,postMessage:message=>f.sent.push(plain(message)),close(){this.closed=true;}});
  window.open=(url,name,features)=>{f.opened={url,name,features};return f.blockPopup?null:child;};
  const context=vm.createContext({native,document,window,editor,innerWidth:1000,innerHeight:800,$:element,KEY:'workspace',MODES:{text:'Plain Text',json:'JSON'},DEFAULTS:{theme:'dark',openIds:[]},logicalTime:100,
    state:{format:'vista-notes',version:1,updatedAt:100,activeId:'a',settings:{openIds:['a','b']},notes:[{id:'a',title:'a.json',mode:'json',content:'{}',createdAt:1,updatedAt:100,trashedAt:0,removedAt:0,fileKey:'disk-key',diskPath:'/files/a.json'},{id:'b',title:'b.txt',mode:'text',content:'before',createdAt:1,updatedAt:100,trashedAt:0,removedAt:0}]},
    ready:true,startupBlocked:false,trashView:false,activityBlocked:()=>false,closingFiles:new Set(),applicationCloseRunning:false,
    browserFileHandles:new Map(),cursors:new Map(),histories:new Map(),versionCache:new Map(),
    finishTabDrag(){f.finished=true;vm.runInContext('tabDrag=null',context);},tabDragIsOutside:()=>true,colorCode:value=>String(value).replaceAll('<','&lt;'),escape:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;'),uid:()=>`fixture-${identity}-${++serial}`,clock:()=>++time,
    note:()=>context.state.notes.find(file=>file.id===context.state.activeId&&!file.removedAt),liveNotes:()=>context.state.notes.filter(file=>!file.removedAt&&!file.trashedAt),
    openFiles:()=>context.state.settings.openIds.map(id=>context.state.notes.find(file=>file.id===id)).filter(Boolean),
    storeCursor(){context.cursors.set(context.state.activeId,{start:editor.selectionStart,end:editor.selectionEnd,top:editor.scrollTop,left:editor.scrollLeft});},
    cancelPendingVersion:id=>f.cancelled.push(id),renderAll(){},renderList(){},
    updateNativeOpenTabs(){},renderRecentFiles(){},renderTabs(){},syncScroll(){},updatePosition(){},selectNote(id){context.state.activeId=id;if(!context.state.settings.openIds.includes(id))context.state.settings.openIds.push(id);},
    save(){f.snapshots.push(plain(context.browserStorageSnapshot()));},flush:async()=>{if(f.onFlush)await f.onFlush();},
    toast:message=>f.messages.push(message),request:async(command,args={})=>{f.requests.push({command,args:plain(args)});return f.onRequest?f.onRequest(command,args):{moved:true};},
    setTimeout:(callback,delay)=>{f.timers.set(++serial,{callback,delay});return serial;},clearTimeout:id=>f.timers.delete(id),
  });
  vm.runInContext('let tabDrag=null;\n'+['fileLabel','fileSignature','captureSavedState','normalizeSavedState','isFileModified','mergeRecentSettings','validateWorkspace','mergeWorkspaces'].map(extract).join('\n')+'\n'+fs.readFileSync(path.join(root,'source/tag-features.js'),'utf8')+'\n'+moduleCode,context);
  Object.defineProperty(element('fileTabs'),'children',{get:()=>context.state.settings.openIds.map((id,index)=>({dataset:{tabId:id},querySelector:()=>null,getBoundingClientRect:()=>({left:50+index*160,right:210+index*160,top:33,bottom:69})}))});element('fileTabs').getBoundingClientRect=()=>({left:50,right:950});
  for(const file of context.state.notes){file.savedSignature=context.fileSignature(file);file.savedState=context.captureSavedState(file);}
  context.state.notes[0].content='unsaved JSON draft';context.state.notes[0].updatedAt=101;
  context.histories.set('a',{undo:[{content:'{}',start:0,end:0}],redo:[],last:10});
  f.context=context;f.window=window;f.document=document;f.editor=editor;f.app=app;f.child=child;f.session=session;
  f.state=()=>context.state;f.call=(name,...args)=>context[name](...args);f.tick=()=>new Promise(resolve=>setImmediate(resolve));
  f.identity=()=>vm.runInContext('windowInstanceId',context);
  return f;
}
(async()=>{
  // Consolidation drives the real source/target transfer functions through
  // the native relay, preserving drafts and collecting sources sequentially.
  function collectionNetwork(windows){
    for(const [id,f] of windows){
      f.onRequest=async(command,args)=>{
        if(command==='window_list')return {windows:[...windows].filter(([other,item])=>other!==id&&!item.window.closed).map(([other])=>({id:other}))};
        if(command==='window_message'){
          const target=windows.get(args.recipient);if(!target||target.window.closed)return {delivered:false};
          queueMicrotask(()=>target.window.vistaNotesWindowMessage({...args,sender:id}));return {delivered:true};
        }
        if(command==='move_file'){
          const target=windows.get(args.targetId);if(f.rejectMove)throw Error('Destination did not acknowledge the tab');
          const seed=f.call('seedForFile',args.fileId,args.transfer),token=`move-${id}-${args.fileId}`;
          await target.call('acceptTabTransfer',seed,args.index,token);target.call('commitIncomingTransfer',token);return {moved:true};
        }
        if(command==='close_empty_window'){f.window.close();return {closed:true};}
        return {moved:true};
      };
    }
  }
  {
    const destination=fixture(),first=fixture(),second=fixture();
    const extra=['c','d'].map(id=>({id,title:id+'.txt',mode:'text',content:'draft '+id,createdAt:1,updatedAt:110,removedAt:0,trashedAt:0,savedState:null,savedSignature:'unsaved'}));
    for(const f of [destination,first,second])f.state().notes.push(...plain(extra));
    destination.state().settings.openIds=['d'];destination.state().activeId='d';destination.state().settings.tagFilter={kind:'tag',tag:'Work'};
    second.state().settings.openIds=['c'];second.state().activeId='c';
    collectionNetwork(new Map([['destination',destination],['first',first],['second',second]]));
    assert.equal(await destination.call('collectAllTabs'),true);
    await first.tick();
    assert.deepEqual(plain(destination.state().settings.openIds),['d','a','b','c']);assert.equal(destination.state().activeId,'d');
    assert.equal(first.window.closed,true);assert.equal(second.window.closed,true);assert.equal(destination.window.closed,false);
    assert.equal(destination.state().notes.find(file=>file.id==='a').content,'unsaved JSON draft');
    assert.equal(destination.state().notes.find(file=>file.id==='a').fileKey,'disk-key');
    assert.equal(destination.context.histories.get('a').undo[0].content,'{}');assert.equal(destination.context.cursors.get('a').start,2);
    assert.equal(destination.state().settings.tagFilter.kind,'all');assert.equal(destination.app.inert,false);
    assert.match(destination.messages.at(-1),/Moved 3 tabs/);
    assert.ok([destination,first,second].every(f=>!f.requests.some(item=>item.command==='save_file')),'Collecting never writes unsaved drafts to their disk files');
  }
  {
    const destination=fixture(),source=fixture();destination.state().settings.openIds=['b','a'];destination.state().activeId='b';
    const prior=destination.context.histories.get('a');collectionNetwork(new Map([['destination',destination],['source',source]]));
    assert.equal(await destination.call('collectAllTabs'),true);assert.deepEqual(plain(destination.state().settings.openIds),['b','a']);
    await source.tick();
    assert.equal(destination.context.histories.get('a'),prior,'An identical existing tab keeps its undo stack and position');assert.equal(source.window.closed,true);
  }
  for(const failure of ['busy','unacknowledged','conflicting']){
    const destination=fixture(),source=fixture();destination.state().settings.openIds=['b'];destination.state().activeId='b';
    if(failure==='busy')source.context.activityBlocked=()=>true;
    if(failure==='unacknowledged')source.rejectMove=true;
    if(failure==='conflicting'){destination.state().settings.openIds.push('a');destination.state().notes[0].content='different local draft';}
    collectionNetwork(new Map([['destination',destination],['source',source]]));
    assert.equal(await destination.call('collectAllTabs'),false);
    assert.deepEqual(plain(source.state().settings.openIds),['a','b']);assert.equal(source.window.closed,false);
    assert.equal(source.state().notes[0].content,'unsaved JSON draft');assert.equal(destination.app.inert,false);assert.equal(source.app.inert,false);
    if(failure==='conflicting')assert.equal(destination.state().notes[0].content,'different local draft');
  }
  {
    const destination=fixture();destination.onRequest=command=>command==='window_list'?{windows:[{id:'unresponsive'}]}:{delivered:true};
    const collecting=destination.call('collectAllTabs');await destination.tick();
    const watchdog=[...destination.timers.values()].find(timer=>timer.delay===45000);assert.ok(watchdog);watchdog.callback();
    assert.equal(await collecting,false);assert.equal(destination.app.inert,false);
    assert.equal(vm.runInContext('pendingTabCollections.size',destination.context),0);
    assert.ok(destination.requests.some(item=>item.args.type==='collect-cancel'));
  }
  // Transfer history is bounded before cloning and excludes live Find sessions.
  {
    const f=fixture(),old={content:'x'.repeat(5*1024*1024),start:0,end:0};
    const current={content:'recent text',start:1,end:3,find:{toJSON(){throw new Error('Live Find sessions must not be serialized');}}};
    const history={undo:[old,current],redo:[],last:20};f.context.histories.set('a',history);
    const transfer=f.call('transferSnapshot','a');
    assert.equal(transfer.history.undo.length,1);assert.equal(transfer.history.undo[0].content,'recent text');
    assert.equal(transfer.history.undo[0].find,undefined);assert.ok(JSON.stringify(transfer.history).length<4*1024*1024);
    assert.equal(history.undo.length,2,'Preparing a window move never mutates the source undo stack');
  }
  // A quick out/in/out movement can cross back into the bar while recovery
  // is flushing. The cancelled attempt must not disable the next tear-off.
  {
    const f=fixture();let flush, outside=true;
    f.onFlush=()=>new Promise(resolve=>flush=resolve);f.context.tabDragIsOutside=()=>outside;
    const drag={id:'a',token:'retry',grabOffset:80,grabOffsetY:18,top:33};f.context.testDrag=drag;
    vm.runInContext('nativeLiveDragEnabled=true;tabDrag=testDrag',f.context);
    f.call('tryStartLiveTabDrag',drag,{screenX:1200,screenY:300});await f.tick();
    outside=false;flush();await f.tick();
    assert.equal(drag.liveRequested,false);assert.equal(f.requests.length,0);
    outside=true;f.onFlush=null;f.onRequest=command=>command==='begin_tab_drag'?{started:true}:{finished:true};
    f.call('tryStartLiveTabDrag',drag,{screenX:1300,screenY:350});await f.tick();
    assert.ok(f.requests.some(request=>request.command==='begin_tab_drag'));
    await f.window.vistaNotesFinishLiveTabDrag('retry',{cancelled:true});
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
  }
  // The HTML drag uses a compact cursor and never opens a held window.
  {
    const f=fixture(false),drag={id:'a',width:190,grabOffset:180,grabOffsetY:18};
    f.state().notes[0].title='First <draft> & plans';
    f.call('updateBrowserDragPreview',drag,{screenX:1500,screenY:500});
    assert.equal(f.opened,undefined);assert.equal(drag.previewWindow,undefined);assert.equal(drag.browserTabCursor,true);
    const cursor=f.bodyStyle.get('--drag-tab-cursor');assert.ok(f.bodyClasses.has('browser-tab-drag'));
    const svg=decodeURIComponent(cursor.match(/data:image\/svg\+xml,([^\"]+)/)[1]);
    assert.match(svg,/width="128" height="36"/);assert.match(svg,/First &lt;draft&gt; &amp; plans/);assert.match(svg,/<circle/);
    assert.doesNotMatch(svg,/unsaved JSON draft/,'File contents do not appear in the tab-only preview');
    assert.match(cursor,/121 18, grabbing$/,'The grab point stays inside the compact cursor');
    f.window.open=()=>{throw Error('Dragging must not open any window');};
    f.call('updateBrowserDragPreview',drag,{screenX:1600,screenY:600});
    assert.equal(f.bodyStyle.get('--drag-tab-cursor'),cursor);
    f.call('freezeBrowserDragPreview',drag);assert.equal(drag.browserTabCursor,false);
    assert.equal(f.bodyClasses.has('browser-tab-drag'),false);assert.equal(f.bodyStyle.has('--drag-tab-cursor'),false);
  }
  // A held native drag keeps ownership until the prepared editor acknowledges.
  {
    const f=fixture();let start,commit;
    f.onRequest=command=>command==='begin_tab_drag'?new Promise(resolve=>start=resolve):command==='commit_tab_drag'?new Promise(resolve=>commit=resolve):{finished:true};
    f.context.testDrag={id:'a',token:'live',grabOffset:80,grabOffsetY:18};vm.runInContext('tabDrag=testDrag',f.context);
    const starting=f.call('startLiveNativeDrag',f.context.testDrag);await f.tick();
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);assert.equal(f.finished,undefined);
    start({started:true});await starting;
    assert.equal(f.finished,true);assert.equal(f.app.inert,true);assert.equal(f.state().activeId,'b');
    const finishing=f.window.vistaNotesFinishLiveTabDrag('live',{});await f.tick();
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
    commit({moved:true});await finishing;
    assert.deepEqual(plain(f.state().settings.openIds),['b']);assert.equal(f.app.inert,false);assert.equal(f.editor.readOnly,false);
    assert.deepEqual(f.requests.map(request=>request.command),['begin_tab_drag','commit_tab_drag','finish_tab_drag']);
    assert.equal(f.requests.at(-1).args.ok,true);assert.equal(f.state().notes[0].content,'unsaved JSON draft');
    assert.ok(!f.requests.some(request=>request.command==='save_file'));
  }
  // Escape, failed commits, and a cancellation before the start reply preserve
  // the original draft and selection; duplicate native outcomes are ignored.
  for(const outcome of ['cancel','failure','early']){
    const f=fixture();let start;
    f.onRequest=command=>{
      if(command==='begin_tab_drag'&&outcome==='early')return new Promise(resolve=>start=resolve);
      if(command==='commit_tab_drag')throw Error('Renderer unavailable');
      return command==='begin_tab_drag'?{started:true}:{finished:true};
    };
    f.context.testDrag={id:'a',token:'live',grabOffset:80,grabOffsetY:18};vm.runInContext('tabDrag=testDrag',f.context);
    const starting=f.call('startLiveNativeDrag',f.context.testDrag);await f.tick();
    if(outcome==='early'){await f.window.vistaNotesFinishLiveTabDrag('live',{cancelled:true});start({started:true});}
    await starting;await f.tick();
    if(outcome!=='early')await f.window.vistaNotesFinishLiveTabDrag('live',outcome==='failure'?{}:{cancelled:true});
    await f.tick();
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);assert.equal(f.state().activeId,'a');assert.equal(f.app.inert,false);
    const finished=f.requests.filter(request=>request.command==='finish_tab_drag');assert.equal(finished.length,1);assert.equal(finished[0].args.ok,false);
    await f.window.vistaNotesFinishLiveTabDrag('live',{});assert.equal(f.requests.filter(request=>request.command==='finish_tab_drag').length,1);
    assert.equal(f.state().notes[0].fileKey,'disk-key');assert.equal(f.state().notes[0].content,'unsaved JSON draft');
  }
  // A local cancellation while the bridge reply is pending cancels the native
  // session too, rather than leaving an invisible window and grabbed pointer.
  {
    const f=fixture();let start;
    f.onRequest=command=>command==='begin_tab_drag'?new Promise(resolve=>start=resolve):{finished:true};
    f.context.testDrag={id:'a',token:'late-start',grabOffset:80,grabOffsetY:18};vm.runInContext('tabDrag=testDrag',f.context);
    const pending=f.call('startLiveNativeDrag',f.context.testDrag);await f.tick();
    f.context.finishTabDrag();start({started:true});await pending;
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);assert.equal(f.app.inert,false);assert.equal(f.editor.readOnly,false);
    assert.deepEqual(f.requests.map(request=>request.command),['begin_tab_drag','finish_tab_drag']);assert.equal(f.requests.at(-1).args.ok,false);
  }
  {
    const f=fixture();let start;
    f.onRequest=command=>command==='begin_tab_drag'?new Promise(resolve=>start=resolve):{finished:true};
    f.context.first={id:'a',token:'first',grabOffset:80,grabOffsetY:18};f.context.second={id:'b',token:'second',grabOffset:80,grabOffsetY:18};
    vm.runInContext('tabDrag=first',f.context);const pending=f.call('startLiveNativeDrag',f.context.first);await f.tick();
    vm.runInContext('tabDrag=second',f.context);await f.call('startLiveNativeDrag',f.context.second);
    assert.equal(f.requests.length,1,'A second gesture cannot overwrite a native handoff still waiting for its reply');
    start({started:true});await pending;
    assert.equal(vm.runInContext('liveNativeDrag',f.context),null);assert.equal(vm.runInContext('tabDrag',f.context),f.context.second);
    assert.equal(f.requests.at(-1).command,'finish_tab_drag');assert.equal(f.requests.at(-1).args.token,'first');assert.equal(f.app.inert,false);
  }
  // Unexpected layout failures must unwind native state and keep all editing
  // controls usable, including failures after GDK has accepted the handoff.
  for(const phase of ['handoff','return']){
    const f=fixture();f.onRequest=command=>command==='begin_tab_drag'?{started:true}:{finished:true};
    f.context.testDrag={id:'a',token:'layout-failure',grabOffset:80,grabOffsetY:18};vm.runInContext('tabDrag=testDrag',f.context);
    if(phase==='handoff')f.context.finishTabDrag=()=>{throw Error('Pointer capture changed');};
    await f.call('startLiveNativeDrag',f.context.testDrag);
    if(phase==='return'){
      f.context.insertFileTab=()=>{throw Error('Tab layout changed');};
      await f.window.vistaNotesFinishLiveTabDrag('layout-failure',{cancelled:true,index:0});
    }
    assert.equal(f.app.inert,false);assert.equal(f.editor.readOnly,false);assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
    assert.equal(vm.runInContext('movingFiles.size',f.context),0);assert.equal(vm.runInContext('liveNativeDrag',f.context),null);
    assert.ok(f.requests.some(request=>request.command==='finish_tab_drag'&&!request.args.ok));assert.equal(f.state().notes[0].content,'unsaved JSON draft');
  }
  // HTML creates the editor window only after release and keeps the original
  // file until that window acknowledges its seed.
  {
    const f=fixture(false);f.call('wireWindowFeatures');
    const drag={id:'a',grabOffset:80,grabOffsetY:18};
    f.call('updateBrowserDragPreview',drag,{screenX:1500,screenY:500});
    assert.equal(f.opened,undefined);assert.equal(f.previewHTML,undefined);
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
    f.call('updateBrowserDragPreview',drag,{screenX:1600,screenY:600});assert.equal(f.opened,undefined);
    f.call('freezeBrowserDragPreview',drag);
    f.child.outerWidth=1122;f.child.innerWidth=1120;f.child.outerHeight=830;f.child.innerHeight=790;
    const moving=f.call('moveFileToWindow','a',{screenX:1500,screenY:500,tabAnchor:{x:80,y:18}});await f.tick();
    const token=f.opened.url.split('#another-note-window=')[1];assert.ok(token);
    assert.deepEqual(f.previewPoint,[1368,410],'The new window places its tab at the release point before loading');
    f.window.emit('message',{source:f.child,data:{kind:'another-note.windows.v1',type:'seed-request',token}});
    await f.tick();assert.ok(f.sent.some(message=>message.type==='seed'));
    f.window.emit('message',{source:f.child,data:{kind:'another-note.windows.v1',type:'seed-ready',token,sender:'preview-child',openIds:['a']}});
    assert.equal(await moving,true);assert.deepEqual(plain(f.state().settings.openIds),['b']);assert.equal(f.child.closed,false);
  }
  {
    const f=fixture(false),drag={id:'a',grabOffset:0,grabOffsetY:0};f.blockPopup=true;
    f.call('updateBrowserDragPreview',drag,{screenX:1000,screenY:500});assert.equal(f.opened,undefined);
    f.call('updateBrowserDragPreview',drag,{screenX:1100,screenY:500});assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
    assert.equal(f.opened,undefined);f.call('freezeBrowserDragPreview',drag);
    assert.equal(await f.call('moveFileToWindow','a',{screenX:1100,screenY:500}),false);
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);assert.match(f.messages.at(-1),/Allow pop-ups/);
  }
  // Post-release native lookup reuses the working pointer gesture and the
  // acknowledged transfer broker, including a safe fallback for older hosts.
  for(const allowDetach of [true,false]){
    const f=fixture();f.onRequest=(command)=>command==='tab_drop_target'?{targetId:'existing-native',index:1}:{moved:true};
    assert.equal(await f.call('moveDroppedFile','a',{screenX:900,screenY:100},null,allowDetach),true);
    assert.equal(f.requests[0].command,'tab_drop_target');
    const move=f.requests.find(item=>item.command==='move_file');
    assert.equal(move.args.targetId,'existing-native');assert.equal(move.args.index,1);
    assert.equal(move.args.transfer.history.undo[0].content,'{}');
    assert.deepEqual(plain(f.state().settings.openIds),['b']);
    assert.ok(!f.requests.some(item=>item.command==='detach_file'||item.command==='save_file'));
  }
  for(const unavailable of [false,true]){
    const f=fixture();f.onRequest=command=>{if(command==='tab_drop_target'){if(unavailable)throw Error('Unsupported command');return {targetId:null};}return {moved:true};};
    assert.equal(await f.call('moveDroppedFile','a',{}),true);
    assert.ok(f.requests.some(item=>item.command==='detach_file'),'Ordinary pop-out still works when there is no destination');
  }
  {
    const f=fixture();f.onRequest=()=>({targetId:null});
    assert.equal(await f.call('moveDroppedFile','a',{},null,false),false);
    assert.equal(f.requests.length,1,'Finishing an ordinary reorder may look for an overlapping window but never creates a new one');
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
  }
  {
    const f=fixture();f.onRequest=()=>({blocked:true});
    assert.equal(await f.call('moveDroppedFile','a',{}),false);
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
    assert.equal(f.requests.length,1);assert.match(f.messages[0],/busy/);
    assert.equal(f.window.vistaNotesTabDropInfo(80,50).index,0);
    assert.equal(f.window.vistaNotesTabDropInfo(950,50).index,2);
    for(const [x,y] of [[100,300],[5,5],[999,799]])assert.equal(f.window.vistaNotesTabDropInfo(x,y).index,2,'Editor, menus and status bar append the incoming file');
    assert.equal(f.window.vistaNotesTabDropInfo(-5,-20,true).index,2,'Native window header also accepts the file');
    assert.equal(f.window.vistaNotesTabDropInfo(1001,300),null,'The desktop outside a window is not a target');
    f.context.activityBlocked=()=>true;
    assert.equal(f.window.vistaNotesTabDropInfo(80,50).blocked,true);
    assert.equal(f.window.vistaNotesTabDropInfo(400,400).blocked,true);
  }
  // Dirty contents, original Save binding, selection and undo go with the tab, without a disk-file save.
  {
    const f=fixture();let acknowledge;f.onRequest=()=>new Promise(resolve=>acknowledge=resolve);
    const moving=f.call('moveFileToWindow','a');await f.tick();
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);assert.equal(f.app.inert,true);assert.equal(f.editor.readOnly,true);
    const request=f.requests[0];assert.equal(request.command,'detach_file');assert.equal(request.args.fileId,'a');
    assert.deepEqual(request.args.transfer.cursor,{start:2,end:5,top:16,left:3});assert.equal(request.args.transfer.history.undo[0].content,'{}');
    acknowledge({moved:true});assert.equal(await moving,true);
    assert.deepEqual(plain(f.state().settings.openIds),['b']);assert.equal(f.state().activeId,'b');
    const file=f.state().notes[0];assert.equal(file.content,'unsaved JSON draft');assert.equal(file.fileKey,'disk-key');assert.equal(f.call('isFileModified',file),true);
    assert.equal(file.savedState.content,'{}');assert.equal(f.app.inert,false);assert.equal(f.editor.readOnly,false);assert.deepEqual(f.cancelled,['a']);
    assert.ok(!f.requests.some(request=>request.command==='save_file'));
  }
  for(const fail of ['flush','destination']){
    const f=fixture();if(fail==='flush')f.onFlush=async()=>{throw new Error('disk full');};else f.onRequest=async()=>{throw new Error('new window failed');};
    assert.equal(await f.call('moveFileToWindow','a'),false);assert.deepEqual(plain(f.state().settings.openIds),['a','b']);assert.equal(f.state().notes[0].content,'unsaved JSON draft');assert.equal(f.app.inert,false);assert.equal(f.cancelled.length,0);
  }
  {
    const f=fixture(false);f.blockPopup=true;
    assert.equal(await f.call('moveFileToWindow','a'),false);assert.deepEqual(plain(f.state().settings.openIds),['a','b']);assert.match(f.messages[0],/Allow pop-ups/);assert.equal(f.timers.size,0);
  }
  // The browser handshake can arrive before recovery finishes; only the eventual ready message releases the source.
  {
    const f=fixture(false);f.call('wireWindowFeatures');let flushed;f.onFlush=()=>new Promise(resolve=>flushed=resolve);
    const moving=f.call('moveFileToWindow','a',{screenX:1500,screenY:400});const token=f.opened.url.split('#another-note-window=')[1];
    assert.match(f.opened.features,/left=1500,top=400/);
    f.window.emit('message',{source:f.child,data:{kind:'another-note.windows.v1',type:'seed-request',token}});
    assert.equal(f.sent.filter(message=>message.type==='seed').length,0);
    flushed();await f.tick();const seed=f.sent.find(message=>message.type==='seed').seed;
    assert.deepEqual(seed.workspace.settings.openIds,['a']);assert.equal(seed.workspace.notes[0].content,'unsaved JSON draft');assert.equal(seed.workspace.notes[0].savedState.content,'{}');
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
    // A forged acknowledgement from another window cannot complete this handoff.
    f.window.emit('message',{source:{},data:{kind:'another-note.windows.v1',type:'seed-ready',token,sender:'child',openIds:['a']}});
    assert.deepEqual(plain(f.state().settings.openIds),['a','b']);
    f.window.emit('message',{source:f.child,data:{kind:'another-note.windows.v1',type:'seed-ready',token,sender:'child',openIds:['a']}});
    assert.equal(await moving,true);assert.deepEqual(plain(f.state().settings.openIds),['b']);assert.equal(f.child.closed,false);
    assert.deepEqual(plain(f.call('browserStorageSnapshot').settings.openIds),['b','a'],'The recovery journal includes both windows');
    assert.equal(f.timers.size,0);
    f.state().notes[1].content='source edit';f.state().notes[1].updatedAt=400;
    const remote=plain(f.state());remote.notes[0].content='detached edit';remote.notes[0].updatedAt=500;remote.notes[1].content='old source';remote.notes[1].updatedAt=100;
    f.call('receiveWorkspaceUpdate',remote);assert.equal(f.state().notes[0].content,'detached edit');assert.equal(f.state().notes[1].content,'source edit');
  }
  // A timeout closes the failed destination and restores the original tab and input.
  {
    const f=fixture(false);const moving=f.call('moveFileToWindow','a');await f.tick();
    [...f.timers.values()].find(timer=>timer.delay===45000).callback();assert.equal(await moving,false);
    assert.equal(f.child.closed,true);assert.deepEqual(plain(f.state().settings.openIds),['a','b']);assert.equal(f.app.inert,false);assert.equal(f.timers.size,0);
  }
  // A child may publish its tabs before startup fails; it must not leave a ghost tab owner.
  {
    const f=fixture(false);f.call('wireWindowFeatures');const moving=f.call('moveFileToWindow','a');await f.tick();
    const token=f.opened.url.split('#another-note-window=')[1];
    f.window.emit('message',{source:f.child,data:{kind:'another-note.windows.v1',type:'tabs',sender:'failed-child',messageId:'first-tabs',openIds:['a']}});
    f.window.emit('message',{source:f.child,data:{kind:'another-note.windows.v1',type:'seed-ready',sender:'failed-child',token,failed:true}});
    assert.equal(await moving,false);f.state().settings.openIds=['b'];assert.deepEqual(plain(f.call('browserStorageSnapshot').settings.openIds),['b']);
  }
  // Reattach between two frontend instances over either the tab bar or editor.
  {
    const channels=new Set();class Channel{constructor(){channels.add(this);}postMessage(message){for(const peer of channels)if(peer!==this)queueMicrotask(()=>{if(channels.has(peer))peer.onmessage?.({data:plain(message)});});}close(){channels.delete(this);}}
    const destination=fixture(false),source=fixture(false);destination.window.BroadcastChannel=source.window.BroadcastChannel=Channel;
    destination.state().settings.openIds=['b'];destination.state().activeId='b';source.state().settings.openIds=['a'];
    destination.call('wireWindowFeatures');source.call('wireWindowFeatures');await source.tick();
    assert.equal(await destination.call('collectAllTabs'),true);await source.tick();
    assert.deepEqual(plain(destination.state().settings.openIds),['b','a']);assert.equal(destination.state().activeId,'b');
    assert.equal(source.window.closed,true);assert.equal(destination.context.histories.get('a').undo[0].content,'{}');
    assert.equal(destination.app.inert,false);assert.equal(destination.timers.size,0);destination.window.close();
  }
  {
    const f=fixture(false),layout={left:1000,right:2000,top:0,bottom:800,bar:{left:1000,right:2000,top:30,bottom:70},barMargin:24,index:1,token:'held',focusedAt:100,slots:[{left:1050,right:1210},{left:1211,right:1371},{left:1372,right:1532}]};
    f.context.receivingLayout=layout;vm.runInContext('dropLayouts.set("receiver",receivingLayout)',f.context);
    const drag={token:'held'};
    assert.equal(f.call('tabDropDestination',drag,{screenX:1100,screenY:450}).index,1,'The HTML transfer retains the receiving window’s chosen slot over its body');
    assert.equal(f.call('tabDropDestination',drag,{screenX:1140,screenY:82}).index,1,'The browser placement band tolerates a small vertical slip');
    assert.equal(f.call('tabDropDestination',drag,{screenX:1400,screenY:50}).index,2,'The final bar position follows the release point');
    delete layout.index;assert.equal(f.call('tabDropDestination',drag,{screenX:1100,screenY:450}).index,3,'Without a chosen position, entering the body still appends');
  }
  for(const point of [{screenX:90,screenY:60,index:0},{screenX:450,screenY:420,index:1}]){
    const channels=new Set();class Channel{constructor(){channels.add(this);}postMessage(message){for(const peer of channels)if(peer!==this)queueMicrotask(()=>{if(channels.has(peer))peer.onmessage?.({data:plain(message)});});}close(){channels.delete(this);}}
    const destination=fixture(false),source=fixture(false);
    destination.window.BroadcastChannel=source.window.BroadcastChannel=Channel;
    destination.state().settings.openIds=['b'];destination.state().activeId='b';source.state().settings.openIds=['a'];
    destination.call('wireWindowFeatures');source.call('wireWindowFeatures');await source.tick();
    const drag={id:'a'};source.call('publishTabDragPoint',drag,point);await source.tick();
    const drop=source.call('tabDropDestination',drag,point);assert.equal(drop.id,destination.identity());assert.equal(drop.index,point.index);
    assert.equal(await source.call('moveFileToWindow','a',{},drop.id,drop.index),true);await source.tick();
    assert.deepEqual(plain(destination.state().settings.openIds),point.index===0?['a','b']:['b','a']);assert.equal(destination.state().activeId,'a');assert.equal(destination.call('isFileModified',destination.state().notes[0]),true);
    assert.equal(destination.context.histories.get('a').undo[0].content,'{}');assert.equal(destination.editor.selectionStart,2);assert.equal(destination.editor.selectionEnd,5);
    assert.deepEqual(plain(source.state().settings.openIds),[]);assert.equal(source.closed,true);assert.equal(destination.closed,undefined);assert.equal(source.opened,undefined,'Reattaching never opens a third window');
    assert.equal(destination.timers.size,0,'The prepared transfer is committed and its rollback timer cleared');
    destination.window.close();
  }
  // A destination write failure rolls back its tab insertion and never releases the source.
  {
    const destination=fixture(),source=fixture();
    destination.state().notes[1].tags=['Work'];destination.state().notes[1].tagsUpdatedAt=200;
    destination.state().notes.push({id:'hidden',title:'hidden.txt',content:'keep me',mode:'text',createdAt:1,updatedAt:100,tags:['Personal'],tagsUpdatedAt:200});
    destination.state().settings.openIds=['hidden','b'];destination.state().settings.tagFilter={kind:'tag',tag:'Work'};
    source.state().notes[0].tags=['Work','Ideas'];source.state().notes[0].tagsUpdatedAt=300;
    const seed=source.call('seedForFile','a',{fileId:'a'});
    assert.equal(seed.workspace.settings.tagFilter.kind,'all','A new detached window starts with its file visible');
    await destination.call('acceptTabTransfer',seed,0);
    assert.deepEqual(plain(destination.state().settings.openIds),['hidden','a','b'],'Drop positions are based on displayed tabs without releasing hidden files');
    assert.deepEqual(plain(destination.call('displayedFiles').map(file=>file.id)),['a','b']);
    assert.deepEqual(plain(destination.state().notes[0].tags),['Work','Ideas']);
    assert.equal(destination.state().notes[0].content,'unsaved JSON draft');assert.equal(destination.state().notes[0].fileKey,'disk-key');
  }
  {
    const f=fixture();f.state().settings.openIds=['b'];f.state().activeId='b';const incoming=plain(f.state());incoming.settings.openIds=['a'];incoming.activeId='a';
    f.onFlush=async()=>{throw new Error('disk full');};
    await assert.rejects(f.call('acceptTabTransfer',{workspace:incoming,transfer:{fileId:'a'}},0,'failed-transfer'),/disk full/);
    assert.deepEqual(plain(f.state().settings.openIds),['b']);assert.equal(f.state().activeId,'b');assert.equal(f.app.inert,false);assert.equal(f.timers.size,0);
  }
  // Sibling pop-outs still communicate after their original opener loses its last tab and closes.
  {
    const {MessageChannel}=require('node:worker_threads');const root=fixture(false),first=fixture(false),second=fixture(false);
    for(const f of [root,first,second]){f.window.MessageChannel=MessageChannel;f.call('wireWindowFeatures');}
    async function popup(parent,child,id){
      const childProxy={get closed(){return child.window.closed;},close(){child.window.close();},postMessage(data,_origin,ports=[]){queueMicrotask(()=>{if(!child.window.closed)child.window.emit('message',{data,source:parentProxy,ports});});}};
      const parentProxy={get closed(){return parent.window.closed;},postMessage(data,_origin,ports=[]){queueMicrotask(()=>{if(!parent.window.closed)parent.window.emit('message',{data,source:childProxy,ports});});}};
      parent.window.open=(url,name,features)=>{parent.opened={url,name,features};return childProxy;};
      const moving=parent.call('moveFileToWindow',id);child.window.opener=parentProxy;child.window.location.hash=parent.opened.url.slice(parent.opened.url.indexOf('#'));
      const seed=await child.call('receiveBrowserWindowSeed');child.context.state=child.call('validateWorkspace',seed.workspace);child.call('finishWindowTransfer',seed.transfer);child.call('completeBrowserWindowSeed');
      let timer;try{return await Promise.race([moving,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Window connection handshake stalled')),2000);})]);}finally{clearTimeout(timer);}
    }
    try{
      assert.equal(await popup(root,first,'a'),true);assert.equal(root.closed,undefined);
      first.window.emit('pagehide',{persisted:true});await first.tick();first.window.emit('pageshow',{persisted:true});
      for(let i=0;i<20;i++){await first.tick();if(vm.runInContext('pendingPeerConnections.size',root.context)===0)break;}
      assert.equal(vm.runInContext('pendingPeerConnections.size',root.context),0,'A restored editor reconnects before its opener closes');
      assert.equal(await popup(root,second,'b'),true);assert.equal(root.closed,true);assert.deepEqual(plain(root.state().settings.openIds),[]);
      await first.tick();assert.equal(await first.call('moveFileToWindow','a',{},second.identity(),0),true);await first.tick();
      assert.equal(first.closed,true);assert.deepEqual(plain(second.state().settings.openIds),['a','b']);assert.equal(second.state().activeId,'a');
    }finally{for(const f of [root,first,second])if(!f.window.closed)f.window.close();}
  }
  // Empty windows close after their final recovery flush; nonempty windows stay open.
  {
    const last=fixture(false);last.state().settings.openIds=[];last.state().activeId=null;
    assert.equal(await last.call('closeWindowIfEmpty'),false);assert.equal(last.window.closed,false);assert.equal(last.app.inert,false,'The final browser window stays usable');
    const f=fixture();f.state().settings.openIds=[];f.state().activeId=null;let flushed;
    f.onFlush=()=>new Promise(resolve=>flushed=resolve);f.onRequest=async(command)=>{assert.equal(command,'close_empty_window');return {closed:true};};
    const closing=f.call('closeWindowIfEmpty');assert.equal(f.requests.length,0);assert.equal(f.app.inert,true);flushed();assert.equal(await closing,true);assert.equal(f.requests.length,1);
    const nonempty=fixture();assert.equal(await nonempty.call('closeWindowIfEmpty'),false);assert.equal(nonempty.requests.length,0);
  }
  console.log('Passed: native/browser reattachment, insertion order, empty-window closing, sibling windows after opener closes, dirty file/save binding/cursor/undo preservation, rollback, blocked-popup recovery and shared edits.');
})().catch(error=>{console.error(error);process.exitCode=1;});
