  const externalFileVersions=new Map();
  let externalScanRunning=false,externalReviewRunning=false,externalScanTimer=0;
  function externalFileBinding(file){return native?(file.fileKey?file.fileKey+'\n'+(file.diskPath||''):null):browserFileHandles.get(file.id)||null;}
  function externalBaselineKey(file){const saved=file.savedState;return saved?fileSignature(saved)+':'+(saved.lineEnding||'lf')+':'+Boolean(saved.bom):file.savedSignature||'';}
  function externalDiskState(file,entry){
    return captureSavedState({title:String(entry.name||file.title).slice(0,250),content:entry.text.replace(/\r\n?/g,'\n').replace(/^\ufeff/,''),mode:modeForFilename(entry.name||file.title,file.mode),lineEnding:entry.lineEnding||'lf',bom:Boolean(entry.bom)});
  }
  function sameDiskContents(a,b){return Boolean(a&&b&&a.content===b.content&&(a.lineEnding||'lf')===(b.lineEnding||'lf')&&Boolean(a.bom)===Boolean(b.bom));}
  async function readExternalFile(file){
    if(native)return request('read_file',{fileKey:file.fileKey});
    const handle=browserFileHandles.get(file.id);if(!handle)throw new Error('This file no longer has a remembered location.');
    const disk=await handle.getFile(),entry=await readBrowserImportFile(disk,handle);
    return {...entry,diskStamp:String(disk.lastModified)+':'+disk.size};
  }
  function chooseExternalFileAction(file){
    const dialog=$('fileChangedDialog');if(dialog.open)return Promise.resolve('keep');
    $('fileChangedMessage').textContent=`“${fileLabel(file)}” was updated outside Another Note. Refresh File loads the version on disk. Keep Current Changes leaves your current version open until you save it.`;
    dialog.returnValue='keep';closeMenus();closeCompletions();
    return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue==='refresh'?'refresh':'keep'),{once:true});dialog.showModal();dialog.querySelector('[value="keep"]').focus();});
  }
  async function reviewExternalFile(file,entry){
    if(typeof entry?.text!=='string'||startupBlocked||documentSaves.has(file.id))return false;
    const binding=externalFileBinding(file),baseline=externalBaselineKey(file),disk=externalDiskState(file,entry),wasOpen=state.settings.openIds.includes(file.id);
    const acknowledge=latest=>externalFileVersions.set(file.id,{binding,stamp:latest.diskStamp});
    if(sameDiskContents(file.savedState||(!isFileModified(file)?file:null),disk)){acknowledge(entry);return true;}
    if(externalReviewRunning||activityBlocked())return false;
    externalReviewRunning=true;
    try{
      const signature=fileSignature(file);
      // Matching editor text can happen after our own save, or after an undo.
      const alreadyMatches=sameDiskContents(file,disk),choice=alreadyMatches?'keep':await chooseExternalFileAction(file);
      let current=state.notes.find(item=>item.id===file.id&&!item.removedAt&&!item.trashedAt);
      if(!current||(wasOpen&&!state.settings.openIds.includes(file.id))||externalFileBinding(current)!==binding||externalBaselineKey(current)!==baseline||documentSaves.has(file.id))return false;
      // Read again after a decision: the file may have changed while the dialog was open.
      const latest=binding&&!alreadyMatches?await readExternalFile(current):entry;
      current=state.notes.find(item=>item.id===file.id&&!item.removedAt&&!item.trashedAt);
      if(!current||(wasOpen&&!state.settings.openIds.includes(file.id))||externalFileBinding(current)!==binding||externalBaselineKey(current)!==baseline||documentSaves.has(file.id))return false;
      if(choice==='refresh'&&fileSignature(current)!==signature){toast('Newer editor changes were kept. Review the updated file again.');return false;}
      const saved=externalDiskState(current,latest);
      if(choice==='refresh'){
        checkpointVersion({...current},'Before refreshing from disk',true);
        Object.assign(current,saved);histories.delete(current.id);
      }
      current.savedState={...saved};current.savedSignature=fileSignature(saved);current.hasSavedFile=true;current.updatedAt=clock();
      acknowledge(latest);renderList();
      if(choice==='refresh'){
        checkpointVersion({...current},'Refreshed from disk',true);
        if(note()?.id===current.id){selectNote(current.id);if(!$('findBar').hidden)refreshInlineFind();}
        refreshFindAllStatus();
      }
      save();return true;
    }catch(error){toast(`Could not refresh ${fileLabel(file)}. Your current contents were kept. ${error.message}`);return false;}
    finally{externalReviewRunning=false;}
  }
  async function scanExternalFiles(force=false){
    if(externalScanRunning||externalReviewRunning||!ready||startupBlocked||document.visibilityState==='hidden'||(document.hasFocus&&!document.hasFocus())||activityBlocked())return;
    externalScanRunning=true;
    try{
      const files=openFiles().filter(file=>!file.trashedAt&&!documentSaves.has(file.id)&&externalFileBinding(file));
      const ids=new Set(files.map(file=>file.id));for(const id of externalFileVersions.keys())if(!ids.has(id))externalFileVersions.delete(id);
      const observed=new Map(files.map(file=>[file.id,{binding:externalFileBinding(file),baseline:externalBaselineKey(file)}]));
      if(native){
        for(let at=0;at<files.length;at+=200){
          const batch=files.slice(at,at+200),result=await request('check_files',{files:batch.map(file=>{const known=externalFileVersions.get(file.id);return {fileKey:file.fileKey,diskStamp:known?.binding===externalFileBinding(file)?known.stamp:null};})});
          for(const entry of result.files||[]){
            const original=batch.find(file=>file.fileKey===entry.fileKey),current=original&&state.notes.find(file=>file.id===original.id&&!file.removedAt&&!file.trashedAt),expected=original&&observed.get(original.id);
            if(current&&state.settings.openIds.includes(current.id)&&externalFileBinding(current)===expected.binding&&externalBaselineKey(current)===expected.baseline&&!entry.error)await reviewExternalFile(current,entry);
          }
        }
      }else for(const file of files){
        try{
          const expected=observed.get(file.id),handle=expected.binding;
          if(handle.queryPermission&&await handle.queryPermission({mode:'read'})!=='granted')continue;
          const disk=await handle.getFile(),stamp=String(disk.lastModified)+':'+disk.size,known=externalFileVersions.get(file.id);
          if(!force&&known?.binding===handle&&known.stamp===stamp)continue;
          const entry=await readBrowserImportFile(disk,handle),current=state.notes.find(item=>item.id===file.id&&!item.removedAt&&!item.trashedAt);
          if(current&&state.settings.openIds.includes(current.id)&&externalFileBinding(current)===handle&&externalBaselineKey(current)===expected.baseline)await reviewExternalFile(current,{...entry,diskStamp:stamp});
        }catch(_){} // A missing file or expired permission never replaces editor text.
      }
    }catch(_){} // Retry temporary disk/host errors on the next check.
    finally{externalScanRunning=false;}
  }
  function scheduleExternalFileCheck(delay=2000,force=false){
    clearTimeout(externalScanTimer);externalScanTimer=setTimeout(async()=>{externalScanTimer=0;try{await scanExternalFiles(force);}finally{scheduleExternalFileCheck();}},delay);
  }
  function wireExternalFileChanges(){
    window.addEventListener('focus',()=>scheduleExternalFileCheck(100,true));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')scheduleExternalFileCheck(100,true);});
    scheduleExternalFileCheck(300);
  }
