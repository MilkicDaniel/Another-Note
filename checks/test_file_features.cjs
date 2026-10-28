// Use the real save/history code with browser handles and durable storage models.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const main=fs.readFileSync(path.join(__dirname,'../source/app.js'),'utf8');
const features=fs.readFileSync(path.join(__dirname,'../source/file-features.js'),'utf8');
let fixtureSequence=0;
const plain=value=>JSON.parse(JSON.stringify(value));
function extract(name){const start=main.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m')),rest=main.slice(start),end=rest.slice(1).search(/^  (?:async )?function /m);assert.ok(start>=0);return rest.slice(0,end+1);}
function memoryDatabase(){
  const stores=new Map(['workspace','fileHandles','fileVersions'].map(name=>[name,new Map()]));
  return {stores,transaction(name){
    const store=stores.get(name),tx={};
    const request=fn=>{const result={};queueMicrotask(()=>{try{result.result=fn();result.onsuccess?.();}catch(error){result.error=error;result.onerror?.();tx.error=error;tx.onerror?.();}});return result;};
    tx.objectStore=()=>({get:key=>request(()=>store.get(key)),put:(value,key)=>request(()=>store.set(key,value)),delete:key=>request(()=>store.delete(key)),openCursor(){
      const entries=[...store],result={};let index=0;
      const next=()=>queueMicrotask(()=>{const entry=entries[index++];result.result=entry?{key:entry[0],value:entry[1],continue:next}:null;result.onsuccess?.();});next();return result;
    }});
    setImmediate(()=>tx.oncomplete?.());return tx;
  }};
}
function fixture(options={}){
  const persistent=options.persistent||{versions:new Map(),local:new Map(),database:memoryDatabase()};
  const f={persistent,elements:{},messages:[],requests:[],downloads:[],saves:[],disk:'',closed:0},instance=++fixtureSequence;let serial=0,time=100;
  const element=id=>f.elements[id]||={open:false,hidden:false,disabled:false,innerHTML:'',textContent:'',value:'',
    showModal(){this.open=true;},close(){this.open=false;},querySelectorAll:()=>[],focus(){}};
  const state={format:'vista-notes',version:1,updatedAt:1,activeId:'a',settings:{openIds:['a']},notes:[{id:'a',title:'a.txt',mode:'text',content:'before',createdAt:1,updatedAt:1,pinned:false,trashedAt:0,removedAt:0}]};
  const context=vm.createContext({
    $:element,native:options.native??true,window:{},database:options.noDatabase?null:persistent.database,document:{activeElement:null},
    KEY:'workspace',MODES:{text:'Plain Text',json:'JSON',bash:'Bash',markdown:'Markdown'},DEFAULTS:{},state,logicalTime:0,
    startupBlocked:false,lastBackup:'',trashView:false,searchTerm:'',currentView:'edit',editor:{value:'before'},histories:new Map(),cursors:new Map(),
    uid:()=>`version-${instance}-${++serial}-${++time}`,clock:()=>++time,
    note:()=>context.state.notes.find(file=>file.id===context.state.activeId),liveNotes:()=>context.state.notes.filter(file=>!file.trashedAt&&!file.removedAt),
    localStorage:{getItem:key=>persistent.local.get(key)||null,setItem:(key,value)=>persistent.local.set(key,value),removeItem:key=>persistent.local.delete(key)},
    toast:message=>f.messages.push(message),setTimeout:()=>1,clearTimeout(){},
    save:()=>f.saves.push(plain(state)),renderTabs(){},renderList(){},refreshFindAllStatus(){},refreshInlineFind(){},activityBlocked:()=>false,paintEditor(){f.syntaxPaints=(f.syntaxPaints||0)+1;},renderPreview(){},updateStats(){},rememberHistory(){f.undoRecorded=true;},
    selectNote(id){context.state.activeId=id;context.editor.value=context.note().content;},closeFind(){},
    colorCode:text=>String(text).replace(/</g,'&lt;'),escape:text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    request:async(command,args)=>{
      f.requests.push({command,args});
      if(command==='save_file')return f.onSave?f.onSave(args):{saved:true,name:args.name,fileKey:'native-key',diskPath:`/files/${args.name}`};
      if(command==='versions_load'){if(f.failHistoryRead)throw new Error('history read unavailable');return {versions:plain(persistent.versions.get(args.fileId)||[])};}
      if(command==='versions_store'){if(f.failHistory)throw new Error('history disk full');if(f.onHistoryStore)await f.onHistoryStore(args);persistent.versions.set(args.fileId,plain(args.versions));return {saved:true};}
      if(command==='versions_delete'){persistent.versions.delete(args.fileId);return {};}
      throw new Error(`Unexpected command ${command}`);
    },
    download:async(...args)=>{f.downloads.push(args);return true;},TextDecoder,Uint8Array,Promise,
  });
  vm.runInContext(['fileLabel','fileSignature','captureSavedState','normalizeSavedState','isFileModified','modeForFilename','refreshFileSyntax','exportName','mergeRecentSettings','validateWorkspace','importEntries','openImport'].map(extract).join('\n')+fs.readFileSync(path.join(__dirname,'../source/tag-features.js'),'utf8')+features+fs.readFileSync(path.join(__dirname,'../source/file-folders.js'),'utf8')+fs.readFileSync(path.join(__dirname,'../source/file-refresh.js'),'utf8'),context);
  state.notes[0].savedSignature=context.fileSignature(state.notes[0]);f.context=context;f.file=state.notes[0];
  f.call=(name,...args)=>context[name](...args);f.dirty=()=>context.isFileModified(f.file);
  f.handle=name=>({name,queryPermission:async()=>f.permission||'granted',requestPermission:async()=>f.permission||'granted',
    async createWritable(){let text;return {async write(value){text=value;},async close(){if(f.failClose)throw new Error('write failed');f.disk=text;f.closed++;},async abort(){f.aborted=true;}};},
    async getFile(){const bytes=new TextEncoder().encode(f.disk);return {name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};},
    isSameEntry:async other=>other.name===name,
  });
  return f;
}

(async()=>{
  // Reopening a changed file asks before replacing either clean text or a draft.
  for(const native of [true,false]){
    const f=fixture({native}),entry={name:'reopen.json',text:'{"old":true}',lineEnding:'lf',bom:false};
    if(native)entry.fileKey='reopen-key';else entry.handle=f.handle(entry.name);
    f.context.chooseExternalFileAction=async()=>f.refreshChoice||'refresh';f.context.readExternalFile=async()=>({...entry});
    await f.call('importEntries',[entry],true);const file=f.context.state.notes.at(-1),id=file.id;file.tags=['Keep'];
    f.context.state.settings.openIds=['a'];entry.text='{"new":true}';entry.lineEnding='crlf';entry.bom=true;
    await f.call('importEntries',[entry],true);
    assert.equal(f.context.state.notes.length,2);assert.equal(file.id,id);assert.equal(file.content,'{"new":true}');
    assert.equal(file.lineEnding,'crlf');assert.equal(file.bom,true);assert.deepEqual(plain(file.tags),['Keep']);assert.equal(f.call('isFileModified',file),false);
    file.content='unsaved draft';f.context.state.settings.openIds=['a'];entry.text='external change';f.refreshChoice='keep';
    await f.call('importEntries',[entry],true);assert.equal(file.content,'unsaved draft','Reopening never replaces an unsaved recovery draft');
    assert.ok(!f.messages.some(message=>message.startsWith('Could not refresh')),'Reopening completes its decision without a UI error');
  }
  // A stale history cache cannot overwrite checkpoints made by another window.
  for(const noDatabase of [false,true]){
    const first=fixture({native:false,noDatabase});await first.call('checkpointVersion',first.file,'Base',true);
    const second=fixture({native:false,noDatabase,persistent:first.persistent});await second.call('readVersionHistory','a');
    first.file.content='first window';await first.call('checkpointVersion',first.file,'First window',true);
    second.file.content='second window';await second.call('checkpointVersion',second.file,'Second window',true);
    const restarted=fixture({native:false,noDatabase,persistent:first.persistent});
    assert.deepEqual(new Set(plain((await restarted.call('readVersionHistory','a')).map(v=>v.content))),new Set(['before','first window','second window']));
    await first.call('backup');assert.ok(JSON.parse(first.downloads.at(-1)[1]).notes[0].versions.some(v=>v.content==='second window'),'Backups include other windows’ checkpoints too');
    await first.call('showVersionHistory');assert.ok((await first.call('readVersionHistory','a')).some(v=>v.content==='second window'),'Opening history refreshes checkpoints from other windows');
  }
  {
    const f=fixture();await f.call('checkpointVersion',f.file,'Base',true);f.file.content='current';await f.call('showVersionHistory');
    f.call('selectVersion',0);f.file.content='before restore';
    f.onHistoryStore=()=>{f.context.state.notes=f.context.state.notes.map(file=>({...file,content:'remote edit during restore'}));};
    await f.call('restoreVersion');assert.equal(f.context.state.notes[0].content,'remote edit during restore');assert.equal(f.elements.historyDialog.open,true);assert.match(f.messages.at(-1),/file changed.*No version was restored/);
  }
  // One unreadable selection does not hide successful imports or its error.
  {
    const f=fixture();
    await f.call('importEntries',[{name:'one.txt',text:'one'},{name:'bad.bin',error:'Not UTF-8 text'},{name:'two.json',text:'{}'}],true);
    assert.deepEqual(plain(f.context.state.notes.slice(1).map(file=>file.title)),['one.txt','two.json']);
    assert.match(f.messages.at(-1),/Opened 2 files.*bad\.bin.*Not UTF-8/);
  }
  {
    const f=fixture({native:false}),valid=f.handle('valid.txt'),bad=f.handle('bad.bin');f.disk='valid text';
    bad.getFile=async()=>({name:'bad.bin',size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer});
    f.context.window.showOpenFilePicker=async()=>[valid,bad];await f.call('openImport');
    assert.equal(f.context.state.notes.at(-1).title,'valid.txt');assert.match(f.messages.at(-1),/Opened 1 file.*bad\.bin/);
  }
  // Open and Save As infer the type from the real filename, including uppercase extensions.
  {
    const f=fixture();
    await f.call('importEntries',[{name:'settings.JSON',text:'{}'},{name:'run.zsh',text:'echo hi'},{name:'readme.MD',text:'# Heading'},{name:'plain.txt',text:'text'},{name:'json',text:'{}'}]);
    assert.deepEqual(plain(f.context.state.notes.slice(1).map(file=>file.mode)),['json','bash','markdown','text','text']);
    assert.deepEqual(plain(f.context.state.settings.openIds),plain(f.context.state.notes.map(file=>file.id)),'Every selected file opens in a tab');
    assert.equal(f.context.state.activeId,f.context.state.notes.at(-1).id);
    assert.equal(f.call('modeForFilename','draft','bash'),'bash');assert.equal(f.call('modeForFilename','draft.unknown','markdown'),'markdown');assert.equal(f.call('modeForFilename','draft.constructor','text'),'text');
  }
  // Reopening a multi-selection reuses existing tabs and opens the other selections too.
  for(const native of [true,false]){
    const f=fixture({native});const first={name:'first.json',text:'{}'},second={name:'second.sh',text:'echo hi'};
    if(native){first.fileKey='first-key';second.fileKey='second-key';}
    else{first.handle=f.handle(first.name);second.handle=f.handle(second.name);}
    await f.call('importEntries',[first,second],true);
    const imported=f.context.state.notes.slice(1);assert.equal(imported.length,2);
    f.context.state.settings.openIds=['a'];
    await f.call('importEntries',[first,second],true);
    assert.equal(f.context.state.notes.length,3,'Already imported selections do not duplicate files');
    assert.deepEqual(plain(f.context.state.settings.openIds),['a',...imported.map(file=>file.id)]);
    assert.equal(f.context.state.activeId,imported[1].id);
  }
  for(const native of [true,false]){
    const f=fixture({native});f.file.content='{"ok":true}';
    if(native)f.onSave=async()=>({saved:true,name:'settings.JSON',fileKey:'json-key',diskPath:'/files/settings.JSON'});
    else f.context.window.showSaveFilePicker=async()=>f.handle('settings.JSON');
    assert.equal(await f.call('exportNote',true),true);assert.equal(f.file.mode,'json');assert.equal(f.elements.language.value,'json');
    assert.equal(f.dirty(),false);assert.ok(f.syntaxPaints>0);await f.call('flushVersionHistory');assert.equal((await f.call('readVersionHistory','a')).at(-1).mode,'json');
  }
  // A manual type choice or rename made while saving is not overwritten by the reply.
  {
    const f=fixture();let complete;
    f.onSave=()=>new Promise(resolve=>complete=()=>resolve({saved:true,name:'chosen.json',fileKey:'json-key'}));
    const saving=f.call('exportNote',true);f.file.mode='bash';complete();await saving;
    assert.equal(f.file.mode,'bash');assert.equal(f.elements.language.value,'bash');assert.equal(f.dirty(),true);
  }
  // Native saving uses the bound key, Save As is explicit, and cancellation keeps modifications.
  {
    const f=fixture();f.file.fileKey='existing';f.file.content='edited';
    assert.equal(await f.call('exportNote'),true);assert.equal(f.requests.find(r=>r.command==='save_file').args.fileKey,'existing');assert.equal(f.dirty(),false);
    f.file.content='again';f.onSave=async args=>{assert.equal(args.saveAs,true);throw new Error('Cancelled');};
    assert.equal(await f.call('exportNote',true),false);assert.equal(f.dirty(),true);
  }
  // A save uses its captured snapshot and never clears edits made while the dialog is open.
  {
    const f=fixture();f.file.content='snapshot';let complete;
    f.onSave=args=>new Promise(resolve=>{complete=()=>resolve({saved:true,name:args.name,fileKey:'key',diskPath:'/a.txt'});});
    const saving=f.call('exportNote');const same=f.call('exportNote');f.file.content='newer';complete();await saving;await same;
    assert.equal(f.requests.filter(r=>r.command==='save_file').length,1);assert.equal(f.dirty(),true);
    f.file.content='snapshot';assert.equal(f.dirty(),false);
  }
  // Browser handles persist through IndexedDB and repeated Save does not reopen the picker.
  {
    const f=fixture({native:false});let picked=0;const handle=f.handle('chosen.txt');
    f.context.window.showSaveFilePicker=async()=>{picked++;return handle;};f.file.content='saved';
    assert.equal(await f.call('exportNote'),true);assert.equal(f.disk,'saved');assert.equal(f.file.title,'chosen.txt');assert.equal(f.dirty(),false);
    f.file.content='updated';await f.call('exportNote');assert.equal(picked,1);assert.equal(f.disk,'updated');
    const restarted=fixture({native:false,persistent:f.persistent});await restarted.call('loadBrowserFileHandles');restarted.file.content='after restart';
    await restarted.call('exportNote');assert.equal(f.disk,'after restart');
    restarted.context.window.showSaveFilePicker=async()=>{picked++;return restarted.handle('copy.txt');};
    await restarted.call('exportNote',true);assert.equal(picked,2);assert.equal(restarted.file.title,'copy.txt');
  }
  // Backups carry tags and unused reusable tags; import retains the existing file.
  {
    const f=fixture();f.file.tags=['Work'];f.file.tagsUpdatedAt=100;f.context.state.tags=['Work','Unused'];
    await f.call('backup');const backup=JSON.parse(f.downloads[0][1]);assert.deepEqual(backup.tags,['Work','Unused']);assert.deepEqual(backup.notes[0].tags,['Work']);
    backup.notes[0].tags=['Ideas'];backup.tags.push('Ideas');await f.call('importEntries',[{name:'backup.json',text:JSON.stringify(backup)}]);
    assert.equal(f.context.state.notes.length,1);assert.deepEqual(plain(f.file.tags),['Work','Ideas']);assert.ok(f.context.state.tags.includes('Unused'));assert.equal(f.dirty(),false);
  }
  for(const native of [true,false]){
    const f=fixture({native});await f.call('checkpointVersion',f.file,'Current',true);await f.call('backup');
    const incoming=JSON.parse(f.downloads.at(-1)[1]);incoming.notes[0].versions.push({id:'backup-extra',title:'a.txt',content:'Only in backup',mode:'text',createdAt:1000,reason:'Imported checkpoint'});
    await f.call('importEntries',[{name:'backup.json',text:JSON.stringify(incoming)}]);await f.call('flushVersionHistory');
    assert.equal(f.context.state.notes.length,1);assert.ok((await f.call('readVersionHistory','a')).some(v=>v.id==='backup-extra'),'An identical file still imports its additional history');
  }
  // A failed browser write, denied permission, or cancelled picker never marks a file saved.
  for(const failure of ['close','permission','cancel']){
    const f=fixture({native:false}),handle=f.handle('a.txt');f.file.content='changes';
    if(failure==='close')f.failClose=true;if(failure==='permission')f.permission='denied';
    f.context.window.showSaveFilePicker=async()=>{if(failure==='cancel'){const error=new Error('cancel');error.name='AbortError';throw error;}return handle;};
    assert.equal(await f.call('exportNote'),false);assert.equal(f.dirty(),true);if(failure==='close')assert.equal(f.aborted,true);
  }
  {
    const f=fixture({native:false});f.file.content='copy';assert.equal(await f.call('exportNote'),false);
    assert.equal(f.downloads.length,1);assert.equal(f.dirty(),true,'A download without confirmation cannot clear the modified marker');
  }
  // UTF-8 BOM and Windows line endings survive browser direct saving.
  {
    const f=fixture({native:false});f.file.lineEnding='crlf';f.file.bom=true;f.file.content='one\ntwo\n';
    f.context.window.showSaveFilePicker=async()=>f.handle('a.txt');await f.call('exportNote');assert.equal(f.disk,'\ufeffone\r\ntwo\r\n');
  }
  // Versions remain after restart; restoring keeps current contents and never writes the disk file.
  {
    const f=fixture();await f.call('checkpointVersion',f.file,'Before edit',true);f.file.content='after';await f.call('checkpointVersion',f.file,'After edit',true);
    const restarted=fixture({persistent:f.persistent});restarted.file.content='current';restarted.file.fileKey='original-key';
    await restarted.call('showVersionHistory');const versions=await restarted.call('readVersionHistory','a');assert.ok(versions.some(v=>v.content==='before'));
    const chosen=versions.findIndex(v=>v.content==='before');restarted.call('selectVersion',chosen);await restarted.call('restoreVersion');
    assert.equal(restarted.file.content,'before');assert.equal(restarted.file.fileKey,'original-key');
    assert.equal(restarted.requests.filter(r=>r.command==='save_file').length,0);
    assert.ok((await restarted.call('readVersionHistory','a')).some(v=>v.content==='current'));
  }
  // Failed history writes stay available to backup and can be retried without losing snapshots.
  {
    const f=fixture();f.failHistory=true;assert.equal(await f.call('checkpointVersion',f.file,'Protected',true),false);
    await assert.rejects(f.call('flushVersionHistory'),/history/);
    f.failHistory=false;assert.equal(await f.call('checkpointVersion',f.file,'Retry',true),true);await f.call('flushVersionHistory');
    assert.equal(f.persistent.versions.get('a').length,1);
  }
  {
    const f=fixture();await f.call('checkpointVersion',f.file,'Base',true);f.file.content='pending draft';f.failHistory=true;
    await f.call('checkpointVersion',f.file,'Pending',true);
    f.persistent.versions.get('a').push({id:'other-window',title:'a.txt',content:'Other window',mode:'text',createdAt:1000,reason:'Remote'});
    await f.call('backup');let contents=JSON.parse(f.downloads.at(-1)[1]).notes[0].versions.map(v=>v.content);
    assert.ok(contents.includes('pending draft')&&contents.includes('Other window'),'A backup merges unsaved history with other windows’ stored checkpoints');
    f.failHistoryRead=true;await f.call('backup');contents=JSON.parse(f.downloads.at(-1)[1]).notes[0].versions.map(v=>v.content);
    assert.ok(contents.includes('pending draft')&&contents.includes('Other window'),'A failed refresh cannot erase cached backup history');
  }
  // Backups include history while removing capabilities and native filesystem locations.
  {
    const f=fixture();f.file.fileKey='secret-binding';f.file.diskPath='/private/file.txt';await f.call('checkpointVersion',f.file,'Protected',true);
    await f.call('backup');const backup=JSON.parse(f.downloads[0][1]);assert.equal(backup.notes[0].fileKey,undefined);assert.equal(backup.notes[0].diskPath,undefined);assert.equal(backup.notes[0].versions.length,1);
    const incoming={...backup,notes:[{...backup.notes[0],id:'incoming',title:'restored.txt',fileKey:'untrusted',diskPath:'/must/not/write'}]};
    await f.call('importEntries',[{name:'backup.json',text:JSON.stringify(incoming)}],true);
    const imported=f.context.state.notes.at(-1);assert.equal(imported.fileKey,undefined);assert.equal(imported.diskPath,undefined);
    await f.call('flushVersionHistory');assert.ok((await f.call('readVersionHistory',imported.id)).length);
  }
  {
    const f=fixture({native:false});await f.call('checkpointVersion',f.file,'Browser version',true);
    const restarted=fixture({native:false,persistent:f.persistent});assert.equal((await restarted.call('readVersionHistory','a'))[0].content,'before');
  }
  console.log('Passed: direct Save/Save As, browser handle persistence, save cancellation and races, line endings, restart-safe versions, restore protection and portable backups.');
})().catch(error=>{console.error(error);process.exitCode=1;});
