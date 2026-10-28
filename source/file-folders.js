  // Browsers only reveal parent folders after the user chooses a directory.
  const browserFolderHandles=new Map();
  async function rememberBrowserFolder(handle){
    for(const [key,known] of browserFolderHandles){try{if(await known.isSameEntry(handle))return key;}catch(_){}}
    const key=`folder:${uid()}`;browserFolderHandles.set(key,handle);
    if(database)try{await databaseItem('fileHandles',key,handle);}catch(_){}
    return key;
  }
  async function browserFolderForHandle(handle){
    if(!handle)return null;
    for(const [key,folder] of browserFolderHandles){
      try{
        const relative=await folder.resolve(handle);if(!relative?.length)continue;
        const parent=relative.slice(0,-1).join('/');
        return {folderKey:key+(parent?'/'+parent:''),folderPath:folder.name+(parent?'/'+parent:'')};
      }catch(_){}
    }
    return null;
  }
  function relativeFileFolder(file){
    const path=String(file.webkitRelativePath||'').replace(/\\/g,'/'),at=path.lastIndexOf('/');
    return at>0?{folderKey:'picked-folder:'+path.slice(0,at),folderPath:path.slice(0,at)}:null;
  }
  async function openFolderFiles(){
    if(native||startupBlocked||activityBlocked())return;
    if(typeof window.showDirectoryPicker!=='function')return $('importFolder').click();
    try{
      const folder=await window.showDirectoryPicker({mode:'read'}),key=await rememberBrowserFolder(folder),entries=[];
      // Open direct children only. A source folder can contain a huge dependency tree.
      for await(const handle of folder.values()){
        if(handle.kind!=='file')continue;
        try{entries.push({...await readBrowserFile(handle),folderKey:key,folderPath:folder.name});}
        catch(error){entries.push({name:handle.name,error:error.message});}
      }
      if(!entries.length)return toast('No files were found directly in this folder.');
      const opened=await importEntries(entries,true);revealOpenedFiles(opened);
    }catch(error){if(error.name!=='AbortError')toast(`Could not open folder. ${error.message}`);}
  }
  function revealOpenedFiles(ids){
    if(openFiles().some(file=>ids.includes(file.id)&&!fileMatchesTag(file)))setTabTagFilter({kind:'all'});
  }
  function wireFolderImport(){
    if(native)$('openFolderButton').hidden=true;
    $('importFolder').addEventListener('change',async()=>{
      try{
        const files=[...$('importFolder').files],direct=files.filter(file=>file.webkitRelativePath.split('/').length===2),entries=[];
        for(const file of direct){try{entries.push(await readBrowserImportFile(file));}catch(error){entries.push({name:file.name,error:error.message});}}
        if(!direct.length)return toast('No files were found directly in this folder.');
        revealOpenedFiles(await importEntries(entries));
      }finally{$('importFolder').value='';}
    });
  }
