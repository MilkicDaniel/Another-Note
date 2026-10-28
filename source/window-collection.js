  // Each source uses the existing acknowledged, journaled tab move. Windows
  // are processed in order so only one incoming tab is prepared at a time.
  const pendingTabCollections=new Map();
  let collectingTabs=false,sendingTabCollection=null;
  async function sendTabCollectionMessage(recipient,type,token,result=null){
    if(native){const reply=await request('window_message',{recipient,type,token,result});if(!reply.delivered)throw new Error('The other window is unavailable.');}
    else postWindowMessage({recipient,type,token,result});
  }
  function watchTabCollection(pending){
    clearTimeout(pending.timer);
    pending.timer=setTimeout(()=>pending.reject(new Error('A window did not respond. Its remaining tabs were kept.')),45000);
  }
  async function sendTabsToWindow(targetId,token){
    if(!ready||startupBlocked||movingFiles.size||closingFiles.size||applicationCloseRunning||activityBlocked()||collectingTabs||sendingTabCollection){
      await sendTabCollectionMessage(targetId,'collect-result',token,{moved:0,left:state?.settings.openIds.length||0,error:'A window is busy. Finish its dialog or file operation, then try again.'});return;
    }
    const collection={token,targetId,cancelled:false};sendingTabCollection=collection;setWindowTransferBusy(true);
    let moved=0,error='';
    try{
      for(const id of [...state.settings.openIds]){
        if(collection.cancelled)break;
        if(!await moveFileToWindow(id,{deferEmptyClose:true,collectionToken:token},targetId)){error='Some tabs could not be moved safely and stayed in their original window.';break;}
        moved++;await sendTabCollectionMessage(targetId,'collect-progress',token);
      }
    }catch(failure){error=failure.message;}
    finally{
      sendingTabCollection=null;setWindowTransferBusy(Boolean(movingFiles.size));
      await sendTabCollectionMessage(targetId,'collect-result',token,{moved,left:state.settings.openIds.length,error}).catch(()=>{});
      if(!state.settings.openIds.length)await closeWindowIfEmpty();
    }
  }
  function handleTabCollectionMessage(message){
    if(!['collect-offer','collect-progress','collect-result','collect-cancel'].includes(message.type))return false;
    if(!native&&message.recipient!==windowInstanceId)return true;
    if(typeof message.token!=='string'||!message.token||message.token.length>100||typeof message.sender!=='string')return true;
    if(message.type==='collect-offer')sendTabsToWindow(message.sender,message.token).catch(()=>{});
    else if(message.type==='collect-cancel'){
      if(sendingTabCollection?.token===message.token&&sendingTabCollection.targetId===message.sender)sendingTabCollection.cancelled=true;
    }else{
      const pending=pendingTabCollections.get(message.token);if(pending?.sourceId!==message.sender)return true;
      if(message.type==='collect-progress')watchTabCollection(pending);
      else if(message.result&&Number.isInteger(message.result.moved)&&message.result.moved>=0)pending.resolve(message.result);
    }
    return true;
  }
  window.vistaNotesWindowMessage=message=>{if(native)handleTabCollectionMessage(message);};
  async function collectAllTabs(){
    if(!ready||startupBlocked||collectingTabs||sendingTabCollection||movingFiles.size||closingFiles.size||applicationCloseRunning||activityBlocked())return false;
    storeCursor();const active=state.activeId;collectingTabs=true;setWindowTransferBusy(true);
    let moved=0,remaining=false,problem='';
    try{
      await flush();
      const sources=native?(await request('window_list')).windows.map(item=>item.id):[...windowPeers.keys()];
      if(!sources.length){toast('All open tabs are already in this window.');return true;}
      for(const sourceId of sources){
        const token=uid();let pending;
        const result=new Promise((resolve,reject)=>{pending={sourceId,resolve,reject};});result.catch(()=>{});
        pendingTabCollections.set(token,pending);watchTabCollection(pending);
        try{
          await sendTabCollectionMessage(sourceId,'collect-offer',token);
          const reply=await result;moved+=reply.moved;remaining||=Boolean(reply.left);problem||=reply.error||'';
        }catch(error){remaining=true;problem||=error.message;await sendTabCollectionMessage(sourceId,'collect-cancel',token).catch(()=>{});}
        finally{clearTimeout(pending.timer);pendingTabCollections.delete(token);}
      }
      if(moved){state.settings.tagFilter={kind:'all'};if(state.settings.openIds.includes(active))selectNote(active);else renderTabs();save();await flush();}
      toast(moved?`Moved ${moved} tab${moved===1?'':'s'} to this window.${remaining?' Some tabs stayed in their original windows.':''}`:problem||'All open tabs are already in this window.');
      return !remaining;
    }catch(error){toast(`The remaining tabs stayed in their windows. ${error.message}`);return false;}
    finally{collectingTabs=false;setWindowTransferBusy(Boolean(movingFiles.size));editor.focus();}
  }
