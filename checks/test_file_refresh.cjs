// Disk changes must never discard an editor version without its user's choice.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const main=fs.readFileSync(path.join(__dirname,'../source/app.js'),'utf8');
function extract(name){const start=main.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=main.slice(start),end=rest.slice(1).search(/^  (?:async )?function /m);return rest.slice(0,end+1);}
function fixture(native=true){
  const f={choice:'keep',prompts:[],requests:[],messages:[],versions:[],saves:0,focus:true,busy:false,permission:'granted',reads:0};
  const file={id:'a',title:'a.txt',mode:'text',content:'original',lineEnding:'lf',bom:false,fileKey:'a-key',diskPath:'/Project/a.txt',tags:['Keep'],createdAt:1,updatedAt:1};
  const state={activeId:'a',settings:{openIds:['a']},notes:[file]};
  f.latest={name:'a.txt',text:'original',lineEnding:'lf',bom:false,fileKey:'a-key',diskPath:'/Project/a.txt',diskStamp:'1'};
  const handle={name:'a.txt',queryPermission:async()=>f.permission,getFile:async()=>({...f.latest,size:f.latest.text.length,lastModified:Number(f.latest.diskStamp)})};
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,open:false});return nodes.get(id);};
  const context=vm.createContext({native,state,ready:true,startupBlocked:false,MODES:{text:'Plain Text'},$:node,
    document:{visibilityState:'visible',hasFocus:()=>f.focus,addEventListener(){}},window:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){},
    documentSaves:new Map(),browserFileHandles:new Map(native?[]:[['a',handle]]),histories:new Map([['a',{undo:['old']}]]),
    note:()=>state.notes.find(file=>file.id===state.activeId),openFiles:()=>state.notes.filter(file=>state.settings.openIds.includes(file.id)&&!file.removedAt&&!file.trashedAt),
    activityBlocked:()=>f.busy,clock:()=>100,toast:message=>f.messages.push(message),closeMenus(){},closeCompletions(){},
    renderList(){},refreshFindAllStatus(){},refreshInlineFind(){},selectNote:id=>f.selected=id,save:()=>f.saves++,checkpointVersion:(file,reason)=>f.versions.push({content:file.content,reason}),
    readBrowserImportFile:async disk=>({...disk,name:disk.name,text:disk.text}),
    request:async(command,args)=>{
      f.requests.push({command,args});
      if(command==='read_file'){f.reads++;if(f.onRead)return f.onRead();return {...f.latest};}
      if(command==='check_files')return {files:args.files.some(item=>item.diskStamp!==f.latest.diskStamp)?[{...f.latest}]:[]};
      throw new Error('Unexpected command '+command);
    },
  });
  vm.runInContext(['fileLabel','fileSignature','captureSavedState','isFileModified','modeForFilename'].map(extract).join('\n')+fs.readFileSync(path.join(__dirname,'../source/file-refresh.js'),'utf8'),context);
  file.savedState=context.captureSavedState(file);file.savedSignature=context.fileSignature(file);
  context.chooseExternalFileAction=async file=>{f.prompts.push(file.id);return f.onChoice?f.onChoice():f.choice;};
  Object.assign(f,{context,file,state,handle,review:entry=>context.reviewExternalFile(file,entry||{...f.latest}),scan:force=>context.scanExternalFiles(force)});
  return f;
}
(async()=>{
  for(const native of [true,false]){
    const f=fixture(native);f.file.content='local draft';await f.scan();assert.deepEqual(f.prompts,[]);assert.equal(f.file.content,'local draft');
    f.latest.text='outside edit';f.latest.diskStamp='2';await f.scan();assert.deepEqual(f.prompts,['a']);assert.equal(f.file.content,'local draft');assert.equal(f.file.savedState.content,'outside edit');assert.ok(f.context.isFileModified(f.file));
    await f.scan();assert.equal(f.prompts.length,1,'Keeping changes acknowledges exactly this disk version');
    f.latest.text='another outside edit';f.latest.diskStamp='3';await f.scan();assert.equal(f.prompts.length,2,'A later outside version gets a new choice');
    assert.equal(f.file.content,'local draft');assert.ok(f.requests.every(item=>!item.command.includes('save')),'Monitoring never writes to the original file');
  }
  for(const native of [true,false])for(const dirty of [false,true]){
    const f=fixture(native);if(dirty)f.file.content='unsaved local';f.latest.text='outside edit';f.latest.diskStamp='2';f.choice='refresh';
    await f.scan();assert.equal(f.file.content,'outside edit');assert.equal(f.file.savedState.content,'outside edit');assert.equal(f.context.isFileModified(f.file),false);assert.deepEqual(f.file.tags,['Keep']);assert.equal(f.file.fileKey,'a-key');assert.equal(f.file.diskPath,'/Project/a.txt');
    assert.equal(f.versions[0].content,dirty?'unsaved local':'original','Reload saves a checkpoint of the version it replaces');
  }
  {
    const f=fixture();f.latest.text='external';f.latest.diskStamp='2';await f.scan();assert.equal(f.file.content,'original');assert.equal(f.context.isFileModified(f.file),true,'Keeping a formerly clean version marks it modified against disk');
  }
  {
    const f=fixture();f.latest.lineEnding='crlf';f.latest.bom=true;f.latest.diskStamp='2';await f.scan();assert.equal(f.prompts.length,1);assert.ok(f.context.isFileModified(f.file),'Format-only disk changes still have a visible modified state when kept');
  }
  {
    const f=fixture();f.latest.text='outside edit';f.choice='refresh';f.onChoice=()=>{f.latest.text='newest on disk';f.latest.diskStamp='3';return 'refresh';};
    await f.review();assert.equal(f.file.content,'newest on disk','Refresh rereads disk after the decision');
  }
  {
    const f=fixture();f.latest.text='outside edit';f.onChoice=()=>{f.file.content='newer editor text';return 'refresh';};
    assert.equal(await f.review(),false);assert.equal(f.file.content,'newer editor text');assert.equal(f.file.savedState.content,'original');assert.ok(f.messages.some(message=>message.includes('Newer editor changes')));
  }
  {
    const f=fixture();f.latest.text='outside edit';f.onChoice=()=>{f.file.content='newer editor text';return 'keep';};
    assert.equal(await f.review(),true);assert.equal(f.file.content,'newer editor text');assert.equal(f.file.savedState.content,'outside edit');
  }
  for(const action of ['saveAs','close','trash','saveDuringRead','readFailure']){
    const f=fixture();f.latest.text='outside edit';f.file.content='draft';f.choice='refresh';
    if(action==='saveAs')f.onChoice=()=>{f.file.fileKey='different-key';f.file.diskPath='/Other/a.txt';return 'refresh';};
    if(action==='close')f.onChoice=()=>{f.state.settings.openIds=[];return 'refresh';};
    if(action==='trash')f.onChoice=()=>{f.file.trashedAt=123;return 'refresh';};
    if(action==='saveDuringRead')f.onRead=()=>{vm.runInContext("documentSaves.set('a',Promise.resolve(true))",f.context);return {...f.latest};};
    if(action==='readFailure')f.onRead=()=>{throw new Error('Disk unavailable');};
    assert.equal(await f.review(),false,action);assert.equal(f.file.content,'draft',action);assert.equal(f.file.savedState.content,'original',action);
  }
  {
    const f=fixture();f.latest.text='outside edit';let answer;f.onChoice=()=>new Promise(resolve=>answer=resolve);
    const pending=f.review();assert.equal(await f.review(),false,'One change dialog at a time');answer('keep');await pending;assert.equal(f.prompts.length,1);
  }
  {
    const f=fixture();f.file.content='just saved';f.latest.text='just saved';f.latest.diskStamp='2';
    await f.scan();assert.equal(f.prompts.length,0,'Matching disk/editor contents do not prompt after our own write');assert.equal(f.context.isFileModified(f.file),false);
  }
  {
    const f=fixture();f.latest.text='outside edit';f.state.activeId='b';f.state.notes.push({id:'b',title:'b.txt',content:'other draft',mode:'text'});f.state.settings.openIds.push('b');f.choice='refresh';
    await f.review();assert.equal(f.state.activeId,'b');assert.equal(f.selected,undefined,'Refreshing a background tab does not switch the active editor');
  }
  for(const blocked of ['focus','hidden','busy','saving','permission']){
    const f=fixture(blocked!=='permission');f.latest.text='outside edit';f.latest.diskStamp='2';
    if(blocked==='focus')f.focus=false;if(blocked==='hidden')f.context.document.visibilityState='hidden';if(blocked==='busy')f.busy=true;if(blocked==='permission')f.permission='denied';
    if(blocked==='saving')vm.runInContext("documentSaves.set('a',Promise.resolve(true))",f.context);
    await f.scan();assert.equal(f.prompts.length,0,blocked);assert.equal(f.file.content,'original',blocked);
  }
  console.log('Passed: external disk monitoring in native/browser hosts, Refresh/Keep choices, modified baselines, no repeated prompts, self-save suppression, format-only changes, checkpoints, freshest disk reads, concurrent editor/Save As/close/save guards, permissions and background tabs.');
})().catch(error=>{console.error(error);process.exitCode=1;});
