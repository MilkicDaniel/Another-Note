  const movingFiles=new Set(),windowPeers=new Map(),windowLinks=new Map(),pendingWindowMoves=new Map(),seenWindowMessages=new Set();
  const windowInstanceId=uid(),WINDOW_MESSAGE='another-note.windows.v1',WINDOW_HASH='#another-note-window=';
  let windowMessageReceiver=null,windowChannel=null,browserSeed=null,seedWaiter=null,lastPublishedTabs='',lastPublishedFiles='',windowTransferStatusTimer=null;
  function windowToken(){const hash=window.location?.hash||'';return hash.startsWith(WINDOW_HASH)?hash.slice(WINDOW_HASH.length):null;}
  function localWindowTabsKey(){return `${KEY}.window.${windowToken()||'main'}`;}
  function rememberWindowTabs(){
    if(native||!ready||!state)return;
    try{window.sessionStorage?.setItem(localWindowTabsKey(),JSON.stringify({openIds:state.settings.openIds,activeId:state.activeId,tagFilter:state.settings.tagFilter}));}catch(_){}
  }
  function restoreWindowTabs(){
    if(native||browserSeed)return;
    try{const saved=JSON.parse(window.sessionStorage?.getItem(localWindowTabsKey())||'null');if(!saved)return;
      const available=new Set(liveNotes().map(file=>file.id));state.settings.openIds=[...new Set(saved.openIds)].filter(id=>available.has(id));state.activeId=state.settings.openIds.includes(saved.activeId)?saved.activeId:state.settings.openIds.at(-1)||null;
      state.settings.tagFilter=normalizeTagFilter(saved.tagFilter);applyTagChanges(state);
    }catch(_){}
  }
  function postWindowMessage(message,except=null){
    if(native)return;
    const envelope={kind:WINDOW_MESSAGE,sender:windowInstanceId,messageId:uid(),...message};
    seenWindowMessages.add(envelope.messageId);
    try{windowChannel?.postMessage(envelope);}catch(_){}
    for(const port of windowPorts.values()){try{port.postMessage(envelope);}catch(_){}}
    for(const [peer] of windowLinks)if(peer!==except){try{if(!peer.closed)peer.postMessage(envelope,'*');}catch(_){}}
  }
  function publishWindowState(){
    if(native||!ready||!state)return;
    rememberWindowTabs();
    const ids=state.settings.openIds,tabs=JSON.stringify(ids);
    if(tabs!==lastPublishedTabs){lastPublishedTabs=tabs;postWindowMessage({type:'tabs',openIds:ids});}
    const files=JSON.stringify([state.tags,state.tagChanges,state.dictionaryChanges,state.settings.editorPreferencesUpdatedAt,state.notes.map(file=>[file.id,file.updatedAt,file.savedSignature,file.removedAt,file.tagsUpdatedAt])]);
    if(files!==lastPublishedFiles){lastPublishedFiles=files;postWindowMessage({type:'workspace',state});}
  }
  function browserStorageSnapshot(){
    const snapshot=JSON.parse(JSON.stringify(state));if(native)return snapshot;
    const available=new Set(liveNotes().map(file=>file.id)),ids=[...state.settings.openIds];
    for(const peer of windowPeers.values())ids.push(...peer.openIds);
    snapshot.settings.openIds=[...new Set(ids)].filter(id=>available.has(id));return snapshot;
  }
  function receiveWorkspaceUpdate(value){
    if(!ready||!state||startupBlocked)return;
    try{
      const remote=validateWorkspace(value),active=note(),before=active?JSON.stringify(active):'',preferencesStamp=state.settings.editorPreferencesUpdatedAt||0;
      updateNativeOpenTabs(remote.settings.openIds,false);state=mergeWorkspaces(state,remote);
      let next=note();
      if(active&&JSON.stringify(next)!==before){
        if(!movingFiles.has(active.id)&&isFileModified(active)&&(!next||next.content!==active.content)&&document.activeElement===editor){
          const copy={...active,id:uid(),title:`${fileLabel(active)} (this window)`,updatedAt:clock()};
          delete copy.fileKey;delete copy.diskPath;copy.savedState=null;copy.hasSavedFile=false;state.notes.push(copy);selectNote(copy.id);toast('The file changed in another window. Your edits were kept in a separate file.');
        }else if(next&&!movingFiles.has(active.id))selectNote(next.id);
        else if(!next){state.activeId=state.settings.openIds.find(id=>liveNotes().some(file=>file.id===id))||null;renderAll();}
      }
      if((state.settings.editorPreferencesUpdatedAt||0)!==preferencesStamp&&typeof applySettings==='function')applySettings();
      renderList();refreshSpellcheck();if($('dictionaryDialog').open)renderDictionary();if($('manageTagsDialog').open)renderManageTags();
    }catch(_){}
  }
  window.vistaNotesWorkspaceChanged=receiveWorkspaceUpdate;
  function restoreWindowTransfer(transfer){
    if(!transfer||typeof transfer.fileId!=='string'||!liveNotes().some(file=>file.id===transfer.fileId))return;
    const cursor=transfer.cursor;
    if(cursor&&Number.isFinite(cursor.start)&&Number.isFinite(cursor.end))cursors.set(transfer.fileId,{start:cursor.start,end:cursor.end,direction:['forward','backward'].includes(cursor.direction)?cursor.direction:'none',top:Number(cursor.top)||0,left:Number(cursor.left)||0});
    if(transfer.history&&Array.isArray(transfer.history.undo)&&Array.isArray(transfer.history.redo))histories.set(transfer.fileId,transfer.history);
  }
  function finishWindowTransfer(transfer){
    restoreWindowTransfer(transfer);if(!transfer||state.activeId!==transfer.fileId)return;
    const cursor=cursors.get(transfer.fileId);if(!cursor)return;
    editor.setSelectionRange(cursor.start,cursor.end,cursor.direction);editor.scrollTop=cursor.top;editor.scrollLeft=cursor.left;syncScroll();updatePosition();
  }
  function transferSnapshot(id){
    storeCursor();const history=histories.get(id),transfer={fileId:id,cursor:cursors.get(id)||null,history:history?{undo:[],redo:[],last:Number(history.last)||0}:null};
    if(history){
      // Bound the payload before cloning. Find-session object identities do not
      // survive a window move, so only transferable undo data belongs here.
      let remaining=4*1024*1024-256;
      for(const name of ['undo','redo'])for(let i=history[name].length-1;i>=0;i--){
        const entry=history[name][i];if(typeof entry.content!=='string'||entry.content.length>remaining)break;
        const copy={content:entry.content,start:entry.start,end:entry.end,direction:['forward','backward'].includes(entry.direction)?entry.direction:'none'},size=JSON.stringify(copy).length+1;
        if(size>remaining)break;remaining-=size;transfer.history[name].unshift(copy);
      }
    }
    return transfer;
  }
  function seedForFile(id,transfer){
    const workspace=JSON.parse(JSON.stringify(state));workspace.settings.openIds=[id];workspace.settings.tagFilter={kind:'all'};workspace.activeId=id;
    return {workspace,transfer,handle:browserFileHandles.get(id)||null,peers:[...windowPeers].map(([identity,peer])=>({identity,openIds:peer.openIds})),source:{identity:windowInstanceId,openIds:state.settings.openIds.filter(value=>value!==id)}};
  }
  function sendBrowserSeed(pending){
    if(!pending.requested||!pending.seed||pending.child.closed)return;
    try{pending.child.postMessage({kind:WINDOW_MESSAGE,type:'seed',token:pending.token,seed:pending.seed},'*');}
    catch(error){try{pending.child.postMessage({kind:WINDOW_MESSAGE,type:'seed',token:pending.token,seed:{...pending.seed,handle:null}},'*');}catch(_){pending.reject(error);}}
  }
  async function receiveBrowserWindowSeed(){
    const token=windowToken();if(native||!token||!window.opener||window.opener.closed)return null;
    windowLinks.set(window.opener,{token});
    try{if(window.sessionStorage?.getItem(localWindowTabsKey()+'.ready')){window.opener.postMessage({kind:WINDOW_MESSAGE,type:'reconnect',token,sender:windowInstanceId},'*');return null;}}catch(_){}
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{seedWaiter=null;reject(new Error('The original window did not finish transferring this file. Its original tab has been kept.'));},40000);
      seedWaiter={token,resolve:seed=>{clearTimeout(timer);seedWaiter=null;browserSeed=seed;resolve(seed);},reject};
      window.opener.postMessage({kind:WINDOW_MESSAGE,type:'seed-request',token},'*');
    });
  }
  function completeBrowserWindowSeed(failed=false){
    if(!browserSeed)return;
    const token=windowToken();
    if(!failed){try{window.sessionStorage?.setItem(localWindowTabsKey()+'.ready','1');}catch(_){}rememberWindowTabs();}
    try{window.opener?.postMessage({kind:WINDOW_MESSAGE,type:'seed-ready',token,failed,sender:windowInstanceId,openIds:state.settings.openIds},'*');}catch(_){}
  }
  function releaseMovedFile(id){
    cancelPendingVersion(id);histories.delete(id);cursors.delete(id);versionCache.delete(id);
    state.settings.openIds=state.settings.openIds.filter(value=>value!==id);
    if(state.activeId===id){state.activeId=state.settings.openIds.at(-1)||null;renderAll();}else renderList();
    save();
  }
  function setWindowTransferBusy(busy){
    busy=busy||collectingTabs||Boolean(sendingTabCollection);
    const app=document.querySelector('.app-window');app.inert=busy;clearTimeout(windowTransferStatusTimer);windowTransferStatusTimer=null;
    $('windowTransferStatus').hidden=true;
    if(busy)windowTransferStatusTimer=setTimeout(()=>{windowTransferStatusTimer=null;$('windowTransferStatus').hidden=false;},180);
    editor.readOnly=busy||startupBlocked||Boolean(note()?.trashedAt);
  }
  async function moveFileToWindow(id=state.activeId,point={},targetId=null,index=null){
    if(!ready||startupBlocked||movingFiles.size||closingFiles.size||applicationCloseRunning||collectingTabs||sendingTabCollection&&point.collectionToken!==sendingTabCollection.token)return false;
    if(!openFiles().some(file=>file.id===id))return false;
    let pending=null;movingFiles.add(id);
    try{
      const transfer=transferSnapshot(id);
      if(!native&&targetId){
        const result=new Promise((resolve,reject)=>{pending={token:uid(),targetId,resolve,reject};});result.catch(()=>{});pending.result=result;
        pendingWindowMoves.set(pending.token,pending);pending.timer=setTimeout(()=>pending.reject(new Error('The destination did not confirm the move. The original tab was kept.')),45000);
      }else if(!native){
        const token=uid(),href=String(window.location.href).split('#')[0]+WINDOW_HASH+token;
        const x=Math.round(point.screenX??window.screenX??60),y=Math.round(point.screenY??window.screenY??60);
        const child=window.open(href,`another-note-${token}`,`popup=yes,width=1120,height=790,left=${point.tabAnchor?x-51-point.tabAnchor.x:x},top=${point.tabAnchor?y-62-point.tabAnchor.y:y}`);
        if(!child)throw new Error('Allow pop-ups for this file, then drag the tab again or use File → Move File to New Window.');
        if(point.tabAnchor){
          try{const border=(child.outerWidth-child.innerWidth)/2,top=child.outerHeight-child.innerHeight-border;
            if(Number.isFinite(border)&&Number.isFinite(top)&&border>=0&&top>=0)child.moveTo(Math.round(x-border-51-point.tabAnchor.x),Math.round(y-top-33-point.tabAnchor.y));
          }catch(_){}
        }
        const result=new Promise((resolve,reject)=>{pending={token,child,resolve,reject,requested:false,seed:null};});
        // Attach the rejection handler immediately while recovery is being flushed.
        result.catch(()=>{});pending.result=result;pendingWindowMoves.set(token,pending);windowLinks.set(child,{token,initialId:id});
        pending.timer=setTimeout(()=>pending.reject(new Error('The new window did not become ready. The original tab was kept.')),45000);
      }
      setWindowTransferBusy(true);await flush();
      if(native){const result=await request(targetId?'move_file':point.liveDragToken?'commit_tab_drag':'detach_file',{fileId:id,transfer,targetId,index,token:point.liveDragToken,dragToken:point.dragToken});if(!result.moved)throw new Error('The file could not be moved.');}
      else{pending.seed=seedForFile(id,transfer);if(targetId)postWindowMessage({type:'move-offer',recipient:targetId,token:pending.token,seed:pending.seed,index});else sendBrowserSeed(pending);await pending.result;}
      releaseMovedFile(id);if(!point.deferEmptyClose)await closeWindowIfEmpty();return true;
    }catch(error){
      if(pending?.targetId)postWindowMessage({type:'move-cancel',recipient:pending.targetId,token:pending.token});
      if(pending?.child){const link=windowLinks.get(pending.child);if(link?.identity)windowPeers.delete(link.identity);if(pending.peerId)windowPeers.delete(pending.peerId);windowLinks.delete(pending.child);try{pending.child.close();}catch(_){}}
      toast(`The file stayed in this window. ${error.message}`);return false;
    }finally{if(pending){clearTimeout(pending.timer);pendingWindowMoves.delete(pending.token);}movingFiles.delete(id);setWindowTransferBusy(false);}
  }
  function wireWindowFeatures(){
    document.addEventListener('keydown',event=>{if(movingFiles.size||emptyWindowClosing||collectingTabs||sendingTabCollection){event.preventDefault();event.stopImmediatePropagation();}},true);
    if(native)return;
    windowMessageReceiver=receive;
    try{if(window.BroadcastChannel){windowChannel=new window.BroadcastChannel(WINDOW_MESSAGE);windowChannel.onmessage=event=>receive(event.data,null);}}catch(_){}
    function receive(message,source,ports=[],fromPort=null){
      if(!message||message.kind!==WINDOW_MESSAGE)return;
      if(message.type==='reconnect'){
        const link=windowLinks.get(source);if(link?.token===message.token){if(link.identity)windowPeers.delete(link.identity);link.identity=message.sender;connectWindowPeers(message.sender,source).catch(()=>{});postWindowMessage({type:'tabs',openIds:state?.settings.openIds||[]});}return;
      }
      if(message.type==='seed-request'){
        const pending=pendingWindowMoves.get(message.token);
        if(pending&&source===pending.child){pending.requested=true;sendBrowserSeed(pending);}
        else{const link=windowLinks.get(source);if(link?.token===message.token&&ready){const ids=windowPeers.get(link.identity)?.openIds||[link.initialId].filter(Boolean),id=ids[0];if(id){const seed=seedForFile(id,{fileId:id});seed.workspace.settings.openIds=ids;source.postMessage({kind:WINDOW_MESSAGE,type:'seed',token:message.token,seed},'*');}}}
        return;
      }
      if(message.type==='seed'){
        if(seedWaiter&&message.token===seedWaiter.token&&source===window.opener){const seed=message.seed;validateWorkspace(seed.workspace);for(const peer of [...(seed.peers||[]),seed.source])if(peer?.identity)windowPeers.set(peer.identity,{openIds:peer.openIds||[]});windowLinks.set(source,{token:message.token,identity:seed.source?.identity});seedWaiter.resolve(seed);}
        return;
      }
      if(message.type==='seed-ready'){
        const pending=pendingWindowMoves.get(message.token);if(!pending||source!==pending.child)return;
        pending.peerId=message.sender;
        if(message.failed){pending.reject(new Error('The new window could not load the file.'));return;}
        windowPeers.set(message.sender,{openIds:message.openIds||[]});windowLinks.set(source,{token:message.token,identity:message.sender});connectWindowPeers(message.sender,source).then(pending.resolve,pending.reject);return;
      }
      if(source&&!windowLinks.has(source))return;
      if(source&&!windowLinks.get(source).identity)windowLinks.get(source).identity=message.sender;
      if(message.sender===windowInstanceId||!message.messageId||seenWindowMessages.has(message.messageId))return;
      seenWindowMessages.add(message.messageId);if(seenWindowMessages.size>300)seenWindowMessages.delete(seenWindowMessages.values().next().value);
      const handled=handleTabTransferMessage(message,source,ports,fromPort);
      if(handled){}
      else if(message.type==='tabs'&&Array.isArray(message.openIds)){windowPeers.set(message.sender,{openIds:message.openIds});if(ready)renderRecentFiles();}
      else if(message.type==='workspace')receiveWorkspaceUpdate(message.state);
      else if(message.type==='hello'){windowPeers.set(message.sender,{openIds:Array.isArray(message.openIds)?message.openIds:[]});postWindowMessage({type:'tabs',openIds:state?.settings.openIds||[]});}
      else if(message.type==='gone'){windowPeers.delete(message.sender);windowPorts.get(message.sender)?.close();windowPorts.delete(message.sender);dropLayouts.delete(message.sender);if(source&&source.closed&&windowLinks.get(source)?.identity===message.sender)windowLinks.delete(source);if(ready)save();}
      try{if(source)windowChannel?.postMessage(message);}catch(_){}
      for(const [id,port] of windowPorts)if(id!==fromPort){try{port.postMessage(message);}catch(_){}}
      for(const [peer] of windowLinks)if(peer!==source){try{if(!peer.closed)peer.postMessage(message,'*');}catch(_){}}
    }
    window.addEventListener('message',event=>{try{receive(event.data,event.source,event.ports);}catch(_){}});
    window.addEventListener('pagehide',()=>{rememberWindowTabs();postWindowMessage({type:'gone'});windowChannel?.close();for(const port of windowPorts.values())port.close();windowPorts.clear();});
    window.addEventListener('pageshow',event=>{if(event.persisted){try{if(window.BroadcastChannel){windowChannel=new window.BroadcastChannel(WINDOW_MESSAGE);windowChannel.onmessage=e=>receive(e.data,null);}if(window.opener&&!window.opener.closed&&windowToken())window.opener.postMessage({kind:WINDOW_MESSAGE,type:'reconnect',token:windowToken(),sender:windowInstanceId},'*');}catch(_){}postWindowMessage({type:'hello'});lastPublishedTabs='';lastPublishedFiles='';publishWindowState();}});
    postWindowMessage({type:'hello',openIds:state?.settings.openIds||[]});
  }
