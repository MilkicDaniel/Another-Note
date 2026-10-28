  let fileDropDepth=0,fileDropQueue=Promise.resolve();
  function canOpenFileDrop(){return ready&&!startupBlocked&&!movingFiles.size&&!closingFiles.size&&!applicationCloseRunning&&!draggedTabId&&!activityBlocked();}
  function showFileDrop(active){
    const show=Boolean(active&&canOpenFileDrop());document.body.classList.toggle('file-drop-active',show);
    if(!show)fileDropDepth=0;
    return show;
  }
  function fileDrag(data){return Boolean(data&&([...data.types||[]].includes('Files')||[...data.items||[]].some(item=>item.kind==='file')||data.files?.length));}
  function queueFileDrop(read){
    const blocked=()=>{toast('Finish the current dialog or file operation, then drop the files again.');return false;};
    if(!canOpenFileDrop())return Promise.resolve(blocked());
    const opening=fileDropQueue.then(async()=>{
      if(!canOpenFileDrop())return blocked();
      const entries=await read();if(!canOpenFileDrop())return blocked();
      const opened=new Set(await importEntries(entries,true));
      if(openFiles().some(file=>opened.has(file.id)&&!fileMatchesTag(file)))setTabTagFilter({kind:'all'});
      return true;
    });
    fileDropQueue=opening.catch(error=>{toast(`Could not open dropped files. ${error.message}`);return false;});
    return fileDropQueue;
  }
  function captureFileDrop(data){
    const items=[...data.items||[]].filter(item=>item.kind==='file');
    if(!items.length)return [...data.files||[]].map(file=>({file,handle:Promise.resolve(null)}));
    return items.map(item=>{
      // Handles must be requested during the drop event, before any await.
      let handle=null,entry=null,file=null;
      try{file=item.getAsFile();}catch(_){}
      try{entry=item.webkitGetAsEntry?.();}catch(_){}
      try{handle=item.getAsFileSystemHandle?.();}catch(_){}
      return {file,directory:Boolean(entry?.isDirectory),name:entry?.name,handle:Promise.resolve(handle).catch(()=>null)};
    });
  }
  async function readFileDrop(items){
    const entries=[];
    for(const item of items){
      let name=item.file?.name||item.name||'File';
      try{
        const handle=await item.handle;name=handle?.name||name;
        if(item.directory||handle?.kind==='directory')throw new Error('Drop individual files instead of a folder.');
        if(handle?.kind==='file')entries.push(await readBrowserFile(handle));
        else if(item.file)entries.push(await readBrowserImportFile(item.file));
        else throw new Error('This file could not be read.');
      }catch(error){entries.push({name,error:error.message});}
    }
    return entries;
  }
  window.vistaNotesFileDropHover=showFileDrop;
  window.vistaNotesOpenDroppedFiles=entries=>queueFileDrop(()=>entries);
  function wireFileDrops(){
    document.addEventListener('dragenter',event=>{
      if(!fileDrag(event.dataTransfer))return;event.preventDefault();
      if(!native&&canOpenFileDrop()){fileDropDepth++;showFileDrop(true);}
    },true);
    document.addEventListener('dragover',event=>{
      if(!fileDrag(event.dataTransfer))return;event.preventDefault();
      event.dataTransfer.dropEffect=canOpenFileDrop()?'copy':'none';if(!native)showFileDrop(true);
    },true);
    document.addEventListener('dragleave',event=>{if(!native&&fileDropDepth&&!--fileDropDepth)showFileDrop(false);},true);
    document.addEventListener('drop',event=>{
      showFileDrop(false);if(!fileDrag(event.dataTransfer))return;
      event.preventDefault();event.stopPropagation();
      // GTK handles native file paths, retaining their direct Save bindings.
      if(!native){const items=captureFileDrop(event.dataTransfer);queueFileDrop(()=>readFileDrop(items));}
    },true);
    document.addEventListener('dragend',()=>showFileDrop(false),true);
    window.addEventListener('blur',()=>showFileDrop(false));
  }
