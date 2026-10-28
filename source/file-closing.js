  const closingFiles=new Set();
  let applicationCloseRunning=false;
  function chooseCloseAction(files,application=false){
    const dialog=$('closeDialog');if(dialog.open)return Promise.resolve('cancel');
    $('closeTitle').textContent=application?'Save changes before closing this window?':'Save changes before closing?';
    $('closeMessage').textContent=files.length===1?`“${fileLabel(files[0])}” has unsaved changes. Closing without saving discards those changes.`:`${files.length} open files have unsaved changes: ${files.map(file=>fileLabel(file)).join(', ')}. Closing without saving discards those changes.`;
    dialog.returnValue='cancel';
    return new Promise(resolve=>{dialog.addEventListener('close',()=>{if(!$('findBar').hidden)refreshInlineFind();resolve(dialog.returnValue||'cancel');},{once:true});dialog.showModal();});
  }
  function cancelPendingVersion(id){const pending=versionTimers.get(id);if(pending){clearTimeout(pending.timer);versionTimers.delete(id);}}
  async function savedStateFor(file){
    if(Object.hasOwn(file,'savedState'))return file.savedState;
    if(!isFileModified(file))return captureSavedState(file);
    const versions=await readVersionHistory(file.id);
    const previous=versions.slice().reverse().find(version=>fileSignature(version)===file.savedSignature);
    if(previous)return captureSavedState({...file,...previous});
    if(native&&file.fileKey){const disk=await request('read_file',{fileKey:file.fileKey});return captureSavedState({title:disk.name,content:disk.text.replace(/\r\n?/g,'\n').replace(/^\ufeff/,''),mode:modeForFilename(disk.name,file.mode),lineEnding:disk.lineEnding,bom:disk.bom});}
    const handle=browserFileHandles.get(file.id);
    if(handle){const disk=await readBrowserFile(handle);return captureSavedState({title:disk.name,content:disk.text.replace(/\r\n?/g,'\n').replace(/^\ufeff/,''),mode:modeForFilename(disk.name,file.mode),lineEnding:disk.lineEnding,bom:disk.bom});}
    return null;
  }
  async function discardFileChanges(file){
    const expected=fileSignature(file),savedSignature=file.savedSignature,id=file.id;
    const unchanged=()=>{const current=state.notes.find(item=>item.id===id&&!item.removedAt);return current&&fileSignature(current)===expected&&current.savedSignature===savedSignature?current:null;};
    const baseline=await savedStateFor(file);
    let current=unchanged();if(!current)throw new Error('The file changed while closing. Close it again to choose what to keep.');
    cancelPendingVersion(id);
    if(baseline){Object.assign(current,baseline);current.savedState={...baseline};current.savedSignature=fileSignature(baseline);current.updatedAt=clock();}
    else{await deleteVersionHistory(id);current=unchanged();if(!current)throw new Error('The file changed while closing. Its new contents were kept.');current.removedAt=clock();current.updatedAt=current.removedAt;current.content='';current.title='';current.savedState=null;}
    histories.delete(id);cursors.delete(id);
  }
  function finishClosingFiles(ids,{closeWindow=true}={}){
    const closed=new Set(ids),available=new Set(liveNotes().map(file=>file.id));storeCursor();
    rememberClosedFiles(ids.filter(id=>available.has(id)));
    state.settings.openIds=state.settings.openIds.filter(id=>!closed.has(id)&&available.has(id));
    for(const id of closed){histories.delete(id);cursors.delete(id);if(typeof versionErrors!=='undefined'&&!versionErrors.has(id)&&!versionQueues.has(id))versionCache.delete(id);}
    if(typeof releaseClosedCodeRecords==='function')releaseClosedCodeRecords(closed);
    state.settings.closedIds=(state.settings.closedIds||[]).filter(id=>available.has(id));state.settings.recentFiles=(state.settings.recentFiles||[]).filter(item=>available.has(item.id));
    if(closed.has(state.activeId)){const next=state.settings.openIds.at(-1);if(next)selectNote(next,true);else{state.activeId=null;renderAll();save();}}
    else{renderList();save();}
    if(closeWindow)closeWindowIfEmpty();
  }
  async function closeFile(id=state.activeId,{application=false}={}){
    if(closingFiles.size||applicationCloseRunning&&!application)return false;
    closingFiles.add(id);
    try{
      if(documentSaves.has(id))await documentSaves.get(id);
      let file=openFiles().find(file=>file.id===id);if(!file)return false;
      if(isFileModified(file)){
        const expected=fileSignature(file),savedSignature=file.savedSignature;
        closeReviewFileId=id;
        trashView=false;selectNote(id,true);
        const choice=await chooseCloseAction([file],application);
        if(choice!=='save'&&choice!=='discard')return false;
        file=openFiles().find(item=>item.id===id);if(!file)return false;
        if(fileSignature(file)!==expected||file.savedSignature!==savedSignature&&isFileModified(file)){toast('The file changed while closing. Close it again to choose what to keep.');return false;}
        if(isFileModified(file)){
          if(choice==='save'){if(!await exportNote(false,id))return false;const current=openFiles().find(item=>item.id===id);if(!current||isFileModified(current))return false;}
          else await discardFileChanges(file);
        }
      }
      cancelPendingVersion(id);finishClosingFiles([id],{closeWindow:!application});return true;
    }catch(error){toast(`The file stayed open. ${error.message}`);return false;}
    finally{closingFiles.delete(id);if(closeReviewFileId===id){closeReviewFileId=null;renderTabs();}}
  }
  async function closeSavedFiles(){
    const ids=openFiles().filter(file=>!isFileModified(file)&&!documentSaves.has(file.id)).map(file=>file.id);
    if(!ids.length)return toast('No saved files to close. Modified files stay open.');
    ids.forEach(cancelPendingVersion);finishClosingFiles(ids);toast(`Closed ${ids.length} saved ${ids.length===1?'file':'files'}.`);
  }
  async function prepareApplicationClose({preserveDrafts=false}={}){
    if(applicationCloseRunning||closingFiles.size)return false;
    applicationCloseRunning=true;
    try{
      await Promise.all([...documentSaves.values()]);
      if(preserveDrafts)return true;
      const ids=openFiles().map(file=>file.id);
      for(const id of ids){
        if(!openFiles().some(file=>file.id===id))continue;
        if(!await closeFile(id,{application:true}))return false;
      }
      return true;
    }finally{applicationCloseRunning=false;}
  }
  async function closeEditorWindow(){
    if(applicationCloseRunning||closingFiles.size||movingFiles.size)return false;
    if(native){await request('close_window');return true;}
    try{
      if(!await prepareApplicationClose({preserveDrafts:windowPeers.size===0}))return false;
      await flush();window.close();
      if(!window.closed)toast('Your files are kept. Your browser requires you to close this window manually.');
      return true;
    }catch(error){toast(`The window stayed open. ${error.message}`);return false;}
  }
  function shouldConfirmWindowClose(){return Boolean(storageFailure||browserRecoveryPending||movingFiles.size||documentSaves.size||(!native&&windowPeers.size&&openFiles().some(isFileModified)));}
