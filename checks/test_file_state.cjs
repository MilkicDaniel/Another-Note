// Exercise real close/save/discard state transitions and persistent saved baselines.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const main=fs.readFileSync(path.join(__dirname,'../source/app.js'),'utf8');
const feature=fs.readFileSync(path.join(__dirname,'../source/file-features.js'),'utf8');
const closing=fs.readFileSync(path.join(__dirname,'../source/file-closing.js'),'utf8');
const source=main.replace('/* FILE_FEATURES */',feature);
function extract(name){const start=source.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=source.slice(start),next=rest.slice(1).search(/^  (?:async )?function /m);return rest.slice(0,next+1);}
const functions=['fileLabel','fileSignature','captureSavedState','normalizeSavedState','isFileModified','mergeRecentSettings','validateWorkspace','modeForFilename','exportName','exportNote','openFiles','wasFileSaved','allOpenFileIds','eligibleRecentFiles','rememberClosedFiles','renderRecentFiles','showRecentFiles','clearRecentHistory','openRecentFile','reopenFile'].map(extract).join('\n');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const f={prompts:[],writes:[],messages:[],deleted:[],saves:[],versions:[],elements:{},choice:'cancel',time:100,emptyCloses:0};
  const element=id=>f.elements[id]||={hidden:false,disabled:false,open:false,innerHTML:'',textContent:'',showModal(){this.open=true;},close(){this.open=false;}};
  const state={format:'vista-notes',version:1,updatedAt:1,activeId:null,settings:{openIds:[],closedIds:[],recentFiles:[]},notes:[]};
  const context=vm.createContext({state,$:element,logicalTime:0,MODES:{text:'Plain Text',json:'JSON',markdown:'Markdown',bash:'Bash'},DEFAULTS:{},startupBlocked:false,native:false,trashView:false,storageFailure:'',browserRecoveryPending:false,windowPeers:new Map(),movingFiles:new Set(),
    histories:new Map(),cursors:new Map(),versionTimers:new Map(),browserFileHandles:new Map(),documentSaves:new Map(),
    note:()=>state.notes.find(file=>file.id===state.activeId&&!file.removedAt),liveNotes:()=>state.notes.filter(file=>!file.removedAt&&!file.trashedAt),clock:()=>++f.time,
    readVersionHistory:async()=>f.onVersions?f.onVersions():f.versions,deleteVersionHistory:async id=>{f.deleted.push(id);},checkpointVersion:()=>Promise.resolve(true),
    readBrowserFile:async()=>f.disk,request:async()=>f.disk,toast:message=>f.messages.push(message),clearTimeout(){},
    closeWindowIfEmpty(){f.emptyCloses++;},renderList(){},renderAll(){},renderTabs(){},refreshFileSyntax(){},storeCursor(){},save:()=>f.saves.push(plain(state)),
    selectNote(id){state.activeId=id;if(!state.settings.openIds.includes(id))state.settings.openIds.push(id);},
    writeDocument:async snapshot=>{f.writes.push(plain(snapshot));return f.onWrite?f.onWrite(snapshot):{saved:true,name:snapshot.title||'untitled.txt'};},
    escape:text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  });
  vm.runInContext(functions+'\n'+fs.readFileSync(path.join(__dirname,'../source/tag-features.js'),'utf8')+'\n'+closing,context);
  context.chooseCloseAction=async(files,app)=>{f.prompts.push({ids:files.map(file=>file.id),app,activeId:state.activeId,visibleIds:plain(context.displayedFiles().map(file=>file.id))});return f.onChoice?f.onChoice():f.choice;};
  f.context=context;f.state=state;f.call=(name,...args)=>context[name](...args);
  f.add=(id,content='original',{fresh=false,changed=false}={})=>{const file={id,title:`${id}.txt`,content,mode:'text',createdAt:1,updatedAt:1,trashedAt:0,removedAt:0};file.savedSignature=context.fileSignature(file);file.savedState=fresh?null:context.captureSavedState(file);if(changed)file.content+=' edited';state.notes.push(file);state.settings.openIds.push(id);state.activeId??=id;return file;};
  return f;
}
(async()=>{
  {
    const f=fixture();f.add('saved');f.add('open');f.add('draft','',{fresh:true});f.call('finishClosingFiles',['saved','draft']);
    assert.deepEqual(plain(f.call('eligibleRecentFiles').map(item=>item.id)),['saved']);
    f.context.windowPeers.set('another-window',{openIds:['saved']});assert.equal(f.call('eligibleRecentFiles').length,0,'An open tab in another window is excluded');
    f.context.windowPeers.clear();assert.equal(f.call('eligibleRecentFiles')[0].id,'saved');
    const merged=f.call('mergeRecentSettings',{recentFiles:[{id:'a',closedAt:10}]},{recentFiles:[{id:'b',closedAt:40}],recentClearedAt:20});
    assert.deepEqual(plain(merged.recentFiles),[{id:'b',closedAt:40}]);
    const cleared=f.call('mergeRecentSettings',{recentFiles:[],recentClearedAt:50},merged);assert.equal(cleared.recentFiles.length,0);
    assert.equal(f.call('mergeRecentSettings',cleared,{recentFiles:[{id:'a',closedAt:10}]}).recentFiles.length,0,'A stale window cannot restore cleared history');
  }
  for(const choice of ['save','discard']){
    const f=fixture();f.add('a','original',{changed:true});
    f.onChoice=()=>{f.state.notes=f.state.notes.map(file=>({...file,tags:['New metadata'],tagsUpdatedAt:500}));return choice;};
    assert.equal(await f.call('closeFile'),true,`${choice} follows the current file after a metadata-only update`);
    const current=f.state.notes[0];assert.equal(current.content,choice==='save'?'original edited':'original');
    assert.equal(f.context.isFileModified(current),false);assert.deepEqual(plain(current.tags),['New metadata']);
  }
  {
    const f=fixture();f.add('a','original',{changed:true});
    f.onChoice=()=>{f.state.notes=f.state.notes.map(file=>({...file,content:'new remote edits',updatedAt:500}));return 'discard';};
    assert.equal(await f.call('closeFile'),false,'A changed draft stays open for a fresh close decision');
    assert.equal(f.state.notes[0].content,'new remote edits');assert.deepEqual(plain(f.state.settings.openIds),['a']);assert.equal(f.writes.length,0);
  }
  {
    const f=fixture(),file=f.add('a','original',{changed:true});delete file.savedState;f.choice='discard';
    const baseline={...file,content:'original'};
    f.onVersions=async()=>{f.state.notes=f.state.notes.map(item=>({...item,tags:['Preserved']}));return [baseline];};
    assert.equal(await f.call('closeFile'),true);assert.equal(f.state.notes[0].content,'original');assert.deepEqual(plain(f.state.notes[0].tags),['Preserved']);
  }
  {const f=fixture(),file=f.add('a','nonempty');assert.equal(await f.call('closeFile'),true);assert.equal(f.prompts.length,0);assert.equal(f.writes.length,0);assert.deepEqual(plain(f.state.settings.openIds),[]);assert.equal(file.content,'nonempty');assert.equal(f.state.settings.recentFiles[0].id,'a');f.call('reopenFile');assert.equal(f.state.activeId,'a');}
  {const f=fixture(),file=f.add('legacy','saved');delete file.savedState;file.content='draft';let finish;f.onVersions=()=>new Promise(resolve=>finish=()=>resolve([]));f.choice='discard';const closing=f.call('closeFile');while(!finish)await Promise.resolve();file.content='new edits during close';finish();assert.equal(await closing,false);assert.equal(file.content,'new edits during close');assert.deepEqual(plain(f.state.settings.openIds),['legacy']);}
  for(const choice of ['cancel','discard','save']){
    const f=fixture(),file=f.add('a','original',{changed:true});f.choice=choice;const closed=await f.call('closeFile');
    assert.equal(f.prompts.length,1);assert.equal(closed,choice!=='cancel');
    assert.equal(file.content,choice==='discard'?'original':'original edited');assert.equal(f.writes.length,choice==='save'?1:0);
    if(closed)assert.equal(f.context.isFileModified(file),false);else assert.deepEqual(plain(f.state.settings.openIds),['a']);
  }
  {const f=fixture(),file=f.add('a');file.content='';f.choice='discard';await f.call('closeFile');assert.equal(f.prompts.length,1,'Deleting all content is still a change');assert.equal(file.content,'original');}
  {const f=fixture(),file=f.add('new','',{fresh:true});file.content='unsaved draft';f.choice='discard';await f.call('closeFile');assert.ok(file.removedAt);assert.equal(file.content,'');assert.equal(f.writes.length,0);assert.deepEqual(f.deleted,['new']);assert.deepEqual(plain(f.state.settings.recentFiles),[]);}
  for(const failure of ['cancel','error','race']){
    const f=fixture(),file=f.add('a','original',{changed:true});f.choice='save';f.onWrite=async()=>{if(failure==='cancel')return null;if(failure==='error')throw new Error('write failed');file.content='newer edits';return {saved:true,name:'a.txt'};};
    assert.equal(await f.call('closeFile'),false);assert.deepEqual(plain(f.state.settings.openIds),['a']);assert.ok(f.context.isFileModified(file));
  }
  {const f=fixture();f.add('a');f.add('b');f.add('c','draft',{changed:true});await f.call('closeSavedFiles');assert.deepEqual(plain(f.state.settings.openIds),['c']);assert.equal(f.prompts.length,0);assert.equal(f.writes.length,0);assert.deepEqual(plain(f.state.settings.recentFiles.map(item=>item.id)),['a','b']);f.call('clearRecentHistory');assert.deepEqual(plain(f.state.settings.recentFiles),[]);assert.equal(f.state.notes.length,3);}
  {const f=fixture(),file=f.add('legacy','saved');delete file.savedState;f.versions=[{...file}];file.content='edits';f.choice='discard';await f.call('closeFile');assert.equal(file.content,'saved');assert.equal(f.writes.length,0);}
  {const f=fixture(),file=f.add('legacy','saved');delete file.savedState;file.fileKey='authorized';file.content='edits';f.context.native=true;f.disk={name:'legacy.txt',text:'disk baseline',lineEnding:'lf',bom:false};f.choice='discard';await f.call('closeFile');assert.equal(file.content,'disk baseline');assert.equal(f.writes.length,0);}
  for(const choice of ['cancel','discard','save']){
    const f=fixture(),a=f.add('a','one',{changed:true}),b=f.add('b','two',{changed:true});f.choice=choice;
    assert.equal(await f.call('prepareApplicationClose'),choice!=='cancel');assert.equal(f.prompts.length,choice==='cancel'?1:2);assert.ok(f.prompts.every(prompt=>prompt.app&&prompt.ids.length===1&&prompt.activeId===prompt.ids[0]));assert.equal(f.writes.length,choice==='save'?2:0);assert.equal(a.content,choice==='discard'?'one':'one edited');assert.equal(b.content,choice==='discard'?'two':'two edited');assert.deepEqual(plain(f.state.settings.openIds),choice==='cancel'?['a','b']:[]);assert.equal(f.emptyCloses,0,'The host closes the window only after the entire sequence and recovery flush finish');
  }
  {const f=fixture();f.add('a');f.add('b','two',{changed:true});f.add('c','three',{changed:true});assert.equal(await f.call('closeFile','b'),false);assert.equal(f.state.activeId,'b','Closing an inactive dirty tab shows that tab before its prompt');assert.equal(f.prompts[0].activeId,'b');assert.deepEqual(plain(f.state.settings.openIds),['a','b','c']);}
  {const f=fixture(),a=f.add('a','one',{changed:true}),b=f.add('b','two',{changed:true}),c=f.add('c','three',{changed:true});f.state.activeId='c';const choices=['discard','save','cancel'];f.onChoice=()=>choices.shift();assert.equal(await f.call('prepareApplicationClose'),false);assert.deepEqual(f.prompts.map(prompt=>prompt.activeId),['a','b','c']);assert.deepEqual(plain(f.state.settings.openIds),['c']);assert.equal(f.state.activeId,'c');assert.equal(a.content,'one');assert.equal(b.content,'two edited');assert.equal(c.content,'three edited');assert.deepEqual(f.writes.map(file=>file.id),['b']);assert.ok(f.context.isFileModified(c));}
  for(const failure of ['cancel','error','race']){
    const f=fixture();f.add('a','one',{changed:true});const b=f.add('b','two',{changed:true});f.add('c','three',{changed:true});const choices=['discard','save'];f.onChoice=()=>choices.shift();f.onWrite=async()=>{if(failure==='cancel')return null;if(failure==='error')throw Error('disk full');b.content='new edits while saving';return {saved:true,name:'b.txt'};};assert.equal(await f.call('prepareApplicationClose'),false);assert.deepEqual(plain(f.state.settings.openIds),['b','c']);assert.equal(f.state.activeId,'b');assert.equal(f.prompts.length,2);assert.ok(f.context.isFileModified(b));
  }
  {const f=fixture();const a=f.add('a','one',{changed:true}),b=f.add('b','',{fresh:true});b.content='unsaved new draft';a.fileKey='original-save-link';f.state.activeId='b';const before=plain(f.state);assert.equal(await f.call('prepareApplicationClose',{preserveDrafts:true}),true);assert.deepEqual(plain(f.state),before,'Closing the last window preserves tab order, active file, drafts, names, dirty baselines and Save links');assert.equal(f.prompts.length,0);assert.equal(f.writes.length,0);assert.ok(f.context.isFileModified(a)&&f.context.isFileModified(b));}
  {const f=fixture();f.add('a');assert.equal(await f.call('prepareApplicationClose'),true);assert.equal(f.prompts.length,0);assert.equal(f.writes.length,0);}
  {const f=fixture();const a=f.add('shown','one',{changed:true}),b=f.add('hidden','two',{changed:true});a.tags=['Work'];b.tags=['Personal'];f.state.settings.tagFilter={kind:'tag',tag:'Work'};f.choice='discard';assert.equal(await f.call('prepareApplicationClose'),true);assert.deepEqual(f.prompts.map(prompt=>prompt.activeId),['shown','hidden'],'Window closing processes filtered-out drafts as usual');assert.equal(f.writes.length,0);assert.deepEqual(plain(a.tags),['Work']);assert.deepEqual(plain(b.tags),['Personal'],'Discard restores text without removing tags');}
  for(const choice of ['cancel','discard','save']){
    const f=fixture();f.add('visible');const hidden=f.add('hidden','saved',{changed:true});hidden.tags=['Personal'];f.state.settings.tagFilter={kind:'tag',tag:'Work'};f.choice=choice;
    assert.equal(f.context.displayedFiles().length,0);await f.call('closeFile','hidden');
    assert.deepEqual(f.prompts[0].visibleIds,['hidden'],'Closing reveals a filtered-out file before asking');assert.equal(f.prompts[0].activeId,'hidden');
    assert.deepEqual(plain(f.state.settings.tagFilter),{kind:'tag',tag:'Work'});assert.equal(f.context.displayedFiles().length,0,'The temporary reveal ends after Save, Discard, or Cancel');
  }
  {const f=fixture();f.add('shown');const hidden=f.add('hidden');hidden.tags=['Personal'];f.state.settings.tagFilter={kind:'tag',tag:'Work'};assert.equal(await f.call('prepareApplicationClose',{preserveDrafts:true}),true);assert.deepEqual(plain(f.state.settings.openIds),['shown','hidden'],'Final-window recovery includes all filtered-out files');assert.equal(f.prompts.length,0);}
  {const f=fixture();f.add('a','draft',{changed:true});let answer;f.onChoice=()=>new Promise(resolve=>answer=resolve);const pending=f.call('closeFile');assert.equal(await f.call('closeFile'),false);answer('cancel');assert.equal(await pending,false);assert.equal(f.prompts.length,1);}
  {const f=fixture(),a=f.add('a');const copy=f.call('validateWorkspace',plain(f.state));assert.equal(copy.notes[0].savedState.content,'original');a.savedState=null;const fresh=f.call('validateWorkspace',plain(f.state));assert.equal(fresh.notes[0].savedState,null);}
  console.log('Passed: silent unchanged closes, colored-dialog choice outcomes, Save/Discard/Cancel, deleted-content changes, unsaved-file removal, failed/cancelled saves, concurrent edits, legacy baselines, app closing and recent history.');
})().catch(error=>{console.error(error);process.exitCode=1;});
