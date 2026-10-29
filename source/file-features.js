  const browserFileHandles=new Map(),documentSaves=new Map(),versionCache=new Map(),versionLoads=new Map(),versionQueues=new Map(),versionErrors=new Map(),versionTimers=new Map(),versionCheckpoints=new Map();
  let historyFileId=null,historySelection=-1,nativeHistoryAppend=false;
  function versionHistoryMemory(versions){return versions.reduce((bytes,item)=>bytes+item.content.length*2+512,0);}
  function trimVersionMemoryCache(){
    let bytes=[...versionCache.values()].reduce((sum,versions)=>sum+versionHistoryMemory(versions),0);
    for(const [id,versions] of versionCache){
      if(bytes<=16*1024*1024&&versionCache.size<=4)break;
      if(versionErrors.has(id)||versionQueues.has(id)||versionLoads.has(id)||historyFileId===id&&$('historyDialog').open)continue;
      versionCache.delete(id);bytes-=versionHistoryMemory(versions);
    }
  }
  function databaseItem(store,key,value,remove=false){
    return new Promise((resolve,reject)=>{
      if(!database)return reject(new Error('Browser database unavailable.'));
      const writing=arguments.length>2,tx=database.transaction(store,writing?'readwrite':'readonly');
      const request=writing?(remove?tx.objectStore(store).delete(key):tx.objectStore(store).put(value,key)):tx.objectStore(store).get(key);
      let result;request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error);
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage operation was interrupted.'));
    });
  }
  async function loadBrowserFileHandles(){
    if(!database)return;
    await new Promise((resolve,reject)=>{
      const tx=database.transaction('fileHandles','readonly'),request=tx.objectStore('fileHandles').openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(cursor){(String(cursor.key).startsWith('folder:')?browserFolderHandles:browserFileHandles).set(cursor.key,cursor.value);cursor.continue();}};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }
  async function rememberBrowserHandle(id,handle){
    browserFileHandles.set(id,handle);
    try{await databaseItem('fileHandles',id,handle);}catch(_){toast('File saved. Its location can only be remembered for this session because browser storage is unavailable.');}
  }
  function fileTextFormat(text){return {lineEnding:text.includes('\r\n')&&!text.replace(/\r\n/g,'').includes('\n')?'crlf':text.includes('\r')&&!text.includes('\n')?'cr':'lf',bom:text.startsWith('\ufeff')};}
  async function readBrowserImportFile(file,handle=null){
    const limit=/\.(?:vnotes|json)$/i.test(file.name)?128:20;
    if(file.size>limit*1024*1024)throw new Error(`${file.name} exceeds the ${limit} MB import limit.`);
    const bytes=new Uint8Array(await file.arrayBuffer()),bom=bytes[0]===239&&bytes[1]===187&&bytes[2]===191;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return {name:file.name,text,handle,...fileTextFormat(text),bom,...(relativeFileFolder(file)||await browserFolderForHandle(handle)||{})};
  }
  async function readBrowserFile(handle){return readBrowserImportFile(await handle.getFile(),handle);}
  function fileBytes(snapshot){
    const newline={crlf:'\r\n',cr:'\r'}[snapshot.lineEnding]||'\n';
    return (snapshot.bom?'\ufeff':'')+snapshot.content.replace(/\r\n?/g,'\n').replace(/\n/g,newline);
  }
  async function writeDocument(snapshot,saveAs){
    if(native)return request('save_file',{fileKey:snapshot.fileKey||null,name:exportName(snapshot),text:snapshot.content,saveAs,lineEnding:snapshot.lineEnding||'lf',bom:Boolean(snapshot.bom)});
    let handle=!saveAs?browserFileHandles.get(snapshot.id):null;
    if(!handle){
      if(typeof window.showSaveFilePicker!=='function'){
        await download(exportName(snapshot),fileBytes(snapshot),snapshot.mode==='json'?'application/json':'text/plain;charset=utf-8');
        toast('A copy was downloaded. This browser cannot confirm the file was saved, so its modified marker stays visible.');return null;
      }
      handle=await window.showSaveFilePicker({suggestedName:exportName(snapshot)});
    }
    if(handle.queryPermission&&await handle.queryPermission({mode:'readwrite'})!=='granted'){
      if(!handle.requestPermission||await handle.requestPermission({mode:'readwrite'})!=='granted')throw new Error('Write access was not granted. Your changes remain in the editor.');
    }
    const stream=await handle.createWritable();
    try{await stream.write(fileBytes(snapshot));await stream.close();}catch(error){await stream.abort?.().catch(()=>{});throw error;}
    await rememberBrowserHandle(snapshot.id,handle);
    const folder=await browserFolderForHandle(handle);
    return {saved:true,name:handle.name,handle,...(folder||saveAs?folder||{folderKey:null,folderPath:null}:{})};
  }
  async function exportNote(saveAs=false,id=state.activeId){
    const file=state.notes.find(file=>file.id===id&&!file.removedAt);if(!file||file.trashedAt||startupBlocked)return false;
    if(documentSaves.has(file.id))return documentSaves.get(file.id);
    const snapshot={...file};
    const task=(async()=>{
      try{
        const result=await writeDocument(snapshot,saveAs);if(!result?.saved)return false;
        const current=state.notes.find(file=>file.id===snapshot.id&&!file.removedAt);
        if(current){
          const saved={...snapshot,title:(result.name||snapshot.title).slice(0,250)};
          saved.mode=modeForFilename(result.name||snapshot.title,snapshot.mode);
          if(current.title===snapshot.title){current.title=saved.title;if(current.mode===snapshot.mode)current.mode=saved.mode;}
          if(result.fileKey){current.fileKey=result.fileKey;current.diskPath=result.diskPath;}
          if(Object.hasOwn(result,'folderKey')){if(result.folderKey){current.folderKey=result.folderKey;current.folderPath=result.folderPath;}else{delete current.folderKey;delete current.folderPath;}}
          current.hasSavedFile=true;current.savedState=captureSavedState(saved);current.savedSignature=fileSignature(saved);current.updatedAt=clock();
          checkpointVersion(saved,'Saved',true);renderList();refreshFileSyntax(current);save();
          toast(`Saved ${saved.title||'file'}.`);
        }
        return true;
      }catch(error){if(error.name!=='AbortError'&&error.message!=='Cancelled')toast(`Could not save file. ${error.message}`);return false;}
    })();documentSaves.set(file.id,task);task.finally(()=>documentSaves.delete(file.id));return task;
  }
  async function refreshOpenedFile(existing,incoming){
    return reviewExternalFile(existing,{name:incoming.title,text:incoming.content,lineEnding:incoming.lineEnding,bom:incoming.bom});
  }
  function normalizeVersions(value){
    if(!Array.isArray(value))return [];
    const seen=new Set();
    return value.filter(item=>item&&typeof item.id==='string'&&!seen.has(item.id)&&seen.add(item.id)&&typeof item.title==='string'&&typeof item.content==='string'&&Object.hasOwn(MODES,item.mode)&&Number.isFinite(item.createdAt))
      .map(item=>({id:item.id,title:item.title.slice(0,250),content:item.content.replace(/\r\n?/g,'\n'),mode:item.mode,createdAt:item.createdAt,reason:String(item.reason||'Checkpoint').slice(0,100)})).sort((a,b)=>a.createdAt-b.createdAt||(a.id<b.id?-1:a.id>b.id?1:0));
  }
  function trimVersions(versions){
    const result=normalizeVersions(versions).slice(-30);let size=result.reduce((sum,item)=>sum+item.content.length*2,0);
    while(result.length>2&&size>32*1024*1024)size-=result.shift().content.length*2;
    return result;
  }
  async function readVersionHistory(id,refresh=false){
    const source=state.notes.find(file=>file.id===id),epoch=source?.historyEpoch||0;if(source?.fileLink)return [];
    const cached=refresh?versionCache.get(id):null;
    if(refresh)versionCache.delete(id);
    if(versionCache.has(id)){const versions=versionCache.get(id);versionCache.delete(id);versionCache.set(id,versions);return versions;}
    if(versionLoads.has(id))return versionLoads.get(id);
    const load=(async()=>{
      try{
        let versions;
        if(native)versions=(await request('versions_load',{fileId:id,historyEpoch:epoch})).versions;
        else{
          let local=[];try{local=JSON.parse(localStorage.getItem(`${KEY}.versions.${encodeURIComponent(id)}`)||'[]');}catch(_){}
          if(database)versions=[...(await databaseItem('fileVersions',id)||[]),...local];else versions=local;
        }
        if(state.notes.find(file=>file.id===id)?.fileLink||(state.notes.find(file=>file.id===id)?.historyEpoch||0)!==epoch)return [];
        const result=trimVersions([...(versions||[]),...(versionErrors.has(id)?cached||[]:[])]);versionCache.set(id,result);return result;
      }catch(error){
        if(cached){versionCache.set(id,cached);toast('Could not refresh version history. Previously loaded checkpoints were kept.');return cached;}
        throw error;
      }
    })();versionLoads.set(id,load);
    try{return await load;}finally{versionLoads.delete(id);trimVersionMemoryCache();}
  }
  async function writeVersionHistory(id,versions,epoch=state.notes.find(file=>file.id===id)?.historyEpoch||0){
    if(native){const stored=await request('versions_store',{fileId:id,versions,historyEpoch:epoch});return trimVersions(stored.versions||versions);}
    const key=`${KEY}.versions.${encodeURIComponent(id)}`;let merged=versions,localText=null,local=[];
    try{localText=localStorage.getItem(key);local=normalizeVersions(JSON.parse(localText||'[]'));}catch(_){}
    const writeLocal=()=>{
      const current=normalizeVersions(JSON.parse(localStorage.getItem(key)||'[]'));
      merged=trimVersions([...current,...merged]);localStorage.setItem(key,JSON.stringify(merged));return merged;
    };
    if(database){
      try{
        await new Promise((resolve,reject)=>{
          const tx=database.transaction('fileVersions','readwrite'),store=tx.objectStore('fileVersions'),read=store.get(id);
          read.onsuccess=()=>{try{merged=trimVersions([...(read.result||[]),...local,...versions]);store.put(merged,id);}catch(error){reject(error);tx.abort();}};
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Version history saving was interrupted.'));
        });
        try{if(localStorage.getItem(key)===localText)localStorage.removeItem(key);}catch(_){}return merged;
      }catch(error){try{return writeLocal();}catch(_){throw error;}}
    }
    return writeLocal();
  }
  function enqueueVersions(id,transform,checkpoint=null){
    const epoch=state.notes.find(file=>file.id===id)?.historyEpoch||0;
    const task=(versionQueues.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      if(native&&nativeHistoryAppend&&checkpoint&&!$('historyDialog').open&&!versionErrors.has(id)){
        try{await request('versions_append',{fileId:id,version:checkpoint,historyEpoch:epoch});versionCache.delete(id);return true;}
        catch(error){versionCache.set(id,trimVersions([...(versionCache.get(id)||[]),checkpoint]));throw error;}
      }
      const before=await readVersionHistory(id),next=trimVersions(transform(before.slice()));
      if(!versionErrors.has(id)&&next.length===before.length&&next.every((item,i)=>item.id===before[i].id))return true;
      versionCache.set(id,next);const stored=await writeVersionHistory(id,next,epoch);versionCache.set(id,stored);versionErrors.delete(id);return true;
    }).catch(error=>{if(!versionErrors.has(id))toast(`Version history could not be saved. ${error.message}`);versionErrors.set(id,error.message);return false;});
    versionQueues.set(id,task);task.then(()=>{if(versionQueues.get(id)===task)versionQueues.delete(id);trimVersionMemoryCache();});return task;
  }
  function checkpointVersion(file,reason='Checkpoint',force=false){
    if(!file||file.fileLink||file.removedAt||startupBlocked)return Promise.resolve(false);
    const now=Date.now(),previous=versionCheckpoints.get(file.id)||0;
    if(!force&&now-previous<30000)return Promise.resolve(true);
    versionCheckpoints.set(file.id,now);
    const snapshot={id:uid(),title:file.title,content:file.content,mode:file.mode,createdAt:clock(),reason};
    return enqueueVersions(file.id,versions=>{const last=versions.at(-1);if(!last||last.title!==snapshot.title||last.mode!==snapshot.mode||last.content!==snapshot.content)versions.push(snapshot);return versions;},snapshot);
  }
  function scheduleVersion(file){
    if(!file||file.removedAt)return;
    const old=versionTimers.get(file.id);if(old)clearTimeout(old.timer);
    const snapshot={...file};const timer=setTimeout(()=>{versionTimers.delete(file.id);checkpointVersion(snapshot,'Automatic checkpoint',true);},3000);
    versionTimers.set(file.id,{timer,file:snapshot});
  }
  async function flushVersionHistory(){
    for(const [id,pending] of versionTimers){clearTimeout(pending.timer);versionTimers.delete(id);checkpointVersion(pending.file,'Automatic checkpoint',true);}
    await Promise.all([...versionQueues.values()]);
    if(versionErrors.size)throw new Error('Some version history could not be saved. Use Back Up All Files to keep a copy before closing.');
  }
  async function deleteVersionHistory(id){
    const pending=versionTimers.get(id);if(pending){clearTimeout(pending.timer);versionTimers.delete(id);}
    await versionQueues.get(id);versionCache.delete(id);versionErrors.delete(id);
    if(native)await request('versions_delete',{fileId:id});
    else{browserFileHandles.delete(id);if(database){await databaseItem('fileVersions',id,null,true);await databaseItem('fileHandles',id,null,true);}localStorage.removeItem(`${KEY}.versions.${encodeURIComponent(id)}`);}
  }
  function importVersionHistory(id,versions){return enqueueVersions(id,existing=>[...existing,...normalizeVersions(versions)]);}
  async function backup(){
    try{await flushVersionHistory();}catch(_){}
    const now=new Date(),notes=[];
    for(const file of state.notes){const copy={...(file.fileLink?await readFileLink(file):file)};delete copy.fileKey;delete copy.diskPath;delete copy.folderKey;delete copy.folderPath;try{copy.versions=await readVersionHistory(file.id,true);}catch(_){copy.versions=[];}notes.push(copy);}
    const ok=await download(`Another-Note-Backup-${now.toISOString().slice(0,10)}.json`,JSON.stringify({...state,notes,exportedAt:now.toISOString()},null,2),'application/json');
    if(ok){lastBackup=now.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});$('backupTime').textContent=`Backup exported ${lastBackup}`;toast('All files and available version history exported.');}
  }
  async function showVersionHistory(){
    const file=note();if(!file)return;
    historyFileId=file.id;historySelection=-1;closeFind(false);
    $('historyTitle').textContent=`Version History — ${fileLabel(file)}`;$('historyVersions').innerHTML='<p class="recent-empty">Loading versions…</p>';
    $('historyPreview').textContent='';$('restoreVersionButton').disabled=true;$('historyDialog').showModal();
    try{await versionQueues.get(file.id);await readVersionHistory(file.id,true);await checkpointVersion(file,'Current contents',true);if(historyFileId===file.id)renderVersionHistory();}catch(error){$('historyVersions').textContent=error.message;}
  }
  function renderVersionHistory(){
    const versions=versionCache.get(historyFileId)||[];
    if(historySelection<0&&versions.length)historySelection=versions.length-1;
    $('historyVersions').innerHTML=versions.length?versions.map((version,index)=>({version,index})).reverse().map(({version,index})=>`<button type="button" data-version-index="${index}" class="history-version ${index===historySelection?'selected':''}"><span>${escape(new Date(version.createdAt).toLocaleString())}</span><small>${escape(version.reason)} · ${version.content.length.toLocaleString()} characters</small></button>`).join(''):'<p class="recent-empty">No versions yet.</p>';
    selectVersion(historySelection,false);
  }
  function selectVersion(index,render=true){
    const version=versionCache.get(historyFileId)?.[index];if(!version)return;
    historySelection=index;const file=state.notes.find(file=>file.id===historyFileId);
    $('historyPreview').innerHTML=colorCode(version.content.slice(0,100000),version.mode)+(version.content.length>100000?'\n\n[Preview shortened; restoring uses the complete version.]':'');
    $('historyVersionInfo').textContent=`${fileLabel(version)} · ${MODES[version.mode]} · ${new Date(version.createdAt).toLocaleString()}`;
    $('restoreVersionButton').disabled=!file||file.removedAt||(file.content===version.content&&file.title===version.title&&file.mode===version.mode);
    if(render)$('historyVersions').querySelectorAll('[data-version-index]').forEach(button=>button.classList.toggle('selected',Number(button.dataset.versionIndex)===index));
  }
  async function restoreVersion(){
    const file=state.notes.find(file=>file.id===historyFileId&&!file.removedAt),version=versionCache.get(historyFileId)?.[historySelection];if(!file||!version)return;
    const expected=fileSignature(file);
    if(!await checkpointVersion(file,'Before restoring a version',true)){toast('Could not protect the current contents. The version was not restored.');return;}
    const current=state.notes.find(item=>item.id===file.id&&!item.removedAt);
    if(!current||fileSignature(current)!==expected){toast('The file changed while preparing the restore. No version was restored. Choose a version again.');return;}
    if(note()?.id===current.id)rememberHistory(current,true);
    current.content=version.content;current.title=version.title;current.mode=version.mode;current.updatedAt=clock();
    checkpointVersion(current,'Restored version',true);$('historyDialog').close();selectNote(current.id,true);toast('Version restored in the editor. Use Save to write it to disk.');
  }
  async function manualVersion(){const file=state.notes.find(file=>file.id===historyFileId&&!file.removedAt);if(file&&await checkpointVersion(file,'Manual checkpoint',true)){historySelection=-1;renderVersionHistory();}}
