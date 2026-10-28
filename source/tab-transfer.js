  const windowPorts=new Map(),dropLayouts=new Map(),incomingTabTransfers=new Map(),pendingPeerConnections=new Map();
  let emptyWindowClose=null,emptyWindowClosing=false,browserGeometry=null,previousScreenPoint=null,windowFocusedAt=Date.now();
  function tabLayout(){
    const bar=document.querySelector('.tabbar').getBoundingClientRect();
    return {left:bar.left,top:bar.top,right:bar.right,bottom:bar.bottom,blocked:startupBlocked||Boolean(movingFiles.size||closingFiles.size||applicationCloseRunning)||activityBlocked(),slots:[...$('fileTabs').children].filter(tab=>tab.dataset.tabId&&!tab.classList?.contains('live-tab-drag-source')).map(tab=>{const rect=tab.getBoundingClientRect(),close=tab.querySelector('[data-close-file]')?.getBoundingClientRect();return {id:tab.dataset.tabId,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,close:close?{left:close.left,right:close.right,top:close.top,bottom:close.bottom}:null};})};
  }
  function trackBrowserScreenPoint(event){
    if(native||!Number.isFinite(event.screenX)||!Number.isFinite(event.screenY))return;
    let scale=browserGeometry?.scale||(window.outerWidth&&window.innerWidth?(window.outerWidth-2)/window.innerWidth:1);
    if(previousScreenPoint&&Math.abs(event.clientX-previousScreenPoint.clientX)>4){const ratio=(event.screenX-previousScreenPoint.screenX)/(event.clientX-previousScreenPoint.clientX);if(ratio>.4&&ratio<4)scale=ratio;}
    browserGeometry={scale,x:event.screenX-event.clientX*scale,y:event.screenY-event.clientY*scale,windowX:window.screenX||0,windowY:window.screenY||0};
    previousScreenPoint={clientX:event.clientX,screenX:event.screenX};
  }
  function screenTabLayout(){
    const layout=typeof incomingTabPreview!=='undefined'&&incomingTabPreview?incomingTabPreview.layout:tabLayout();let geometry=browserGeometry;
    if(!geometry){const scale=window.outerWidth&&window.innerWidth?(window.outerWidth-2)/window.innerWidth:1;geometry={scale,x:(window.screenX||0)+1,y:(window.screenY||0)+Math.max(0,(window.outerHeight||window.innerHeight||0)-(window.innerHeight||0)*scale),windowX:window.screenX||0,windowY:window.screenY||0};}
    const x=geometry.x+(window.screenX||0)-geometry.windowX,y=geometry.y+(window.screenY||0)-geometry.windowY,scale=geometry.scale;
    return {left:x,right:x+innerWidth*scale,top:y,bottom:y+innerHeight*scale,bar:{left:x+layout.left*scale,right:x+layout.right*scale,top:y+layout.top*scale,bottom:y+layout.bottom*scale},barMargin:24*scale,index:typeof incomingTabPreview!=='undefined'?incomingTabPreview?.index:null,slots:layout.slots.map(slot=>({id:slot.id,left:x+slot.left*scale,right:x+slot.right*scale})),blocked:layout.blocked,focusedAt:windowFocusedAt};
  }
  function pointInRect(rect,x,y){return x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;}
  function dropIndex(layout,x){const index=layout.slots.findIndex(slot=>x<(slot.left+slot.right)/2);return index<0?layout.slots.length:index;}
  function showTabDrop(layout,x){
    const bar=document.querySelector('.tabbar'),index=dropIndex(layout,x),slot=layout.slots[index],last=layout.slots.at(-1);
    bar.classList.add('tab-drop-target');bar.style.setProperty('--tab-drop-left',`${slot?slot.left:last?last.right:$('fileTabs').getBoundingClientRect().left}px`);return index;
  }
  function clearTabDrop(){document.querySelector('.tabbar').classList.remove('tab-drop-target','tab-drop-preview');if(typeof clearLiveTabPreview==='function')clearLiveTabPreview();}
  function publishTabDragPoint(drag,event){
    if(native||!Number.isFinite(event.screenX)||!Number.isFinite(event.screenY))return;
    drag.token??=uid();drag.screenX=event.screenX;drag.screenY=event.screenY;
    postWindowMessage({type:'drag-point',token:drag.token,x:event.screenX,y:event.screenY,...(typeof liveDragMetadata==='function'?{preview:liveDragMetadata(drag)}:{})});
  }
  function tabDropDestination(drag,point){
    if(native)return null;
    const choices=[...dropLayouts].filter(([id,layout])=>id!==windowInstanceId&&layout.token===drag.token&&pointInRect(layout,point.screenX,point.screenY));
    choices.sort((a,b)=>b[1].focusedAt-a[1].focusedAt);const chosen=choices[0];if(!chosen)return null;
    const layout=chosen[1],bar=layout.bar||layout,margin=layout.barMargin||0,overBar=pointInRect({...bar,top:bar.top-margin,bottom:bar.bottom+margin},point.screenX,point.screenY);
    return {id:chosen[0],index:overBar?dropIndex(layout,point.screenX):Number.isInteger(layout.index)?Math.max(0,Math.min(layout.slots.length,layout.index)):layout.slots.length,blocked:layout.blocked};
  }
  async function moveDroppedFile(id,point,target=null,allowDetach=true){
    if(native){
      let destination;
      try{destination=await request('tab_drop_target');}catch(_){}
      if(destination?.blocked){toast('That window is busy. Finish its dialog or file operation, then drag the file again.');return false;}
      target=destination?.targetId?{id:destination.targetId,index:destination.index}:null;
    }
    if(target?.blocked){toast('That window is busy. Finish its dialog or file operation, then drag the file again.');return false;}
    if(!target&&!allowDetach)return false;
    return moveFileToWindow(id,point,target?.id,target?.index);
  }
  let tabDropMarkerTimer=null;
  window.vistaNotesTabDropInfo=(x,y,nativeSurface=false)=>{
    if(!ready||startupBlocked||document.visibilityState==='hidden')return null;
    const layout=tabLayout();
    if(!nativeSurface&&!pointInRect({left:0,top:0,right:innerWidth,bottom:innerHeight},x,y))return null;
    if(layout.blocked)return {blocked:true};
    clearTimeout(tabDropMarkerTimer);const index=showTabDrop(layout,pointInRect(layout,x,y)?x:Infinity);
    tabDropMarkerTimer=setTimeout(clearTabDrop,1500);return {index};
  };
  function commitIncomingTransfer(token){const record=incomingTabTransfers.get(token);if(record)clearTimeout(record.timer);incomingTabTransfers.delete(token);}
  function rollbackIncomingTransfer(record){
    const prior=record.prior,id=record.fileId,file=liveNotes().find(item=>item.id===id);
    if(record.preparedSignature&&file&&fileSignature(file)!==record.preparedSignature){commitIncomingTransfer(record.token);toast('The original tab stayed open. This window kept newer edits to the file.');return;}
    state.settings.openIds=prior.ids;state.activeId=prior.active;trashView=prior.trashView;
    if(prior.history)histories.set(id,prior.history);else histories.delete(id);if(prior.cursor)cursors.set(id,prior.cursor);else cursors.delete(id);
    renderAll();if(prior.activeCursor)finishWindowTransfer({fileId:prior.active,cursor:prior.activeCursor});save();commitIncomingTransfer(record.token);
  }
  function cancelIncomingTransfer(token){const record=incomingTabTransfers.get(token);if(!record)return;record.cancelled=true;if(!record.pending)rollbackIncomingTransfer(record);}
  window.vistaNotesCancelTabTransfer=cancelIncomingTransfer;
  async function acceptTabTransfer(seed,index,token=null){
    if(!ready||startupBlocked||movingFiles.size||closingFiles.size||applicationCloseRunning||activityBlocked()||sendingTabCollection)throw new Error('The destination window is busy.');
    const incoming=validateWorkspace(seed.workspace),id=seed.transfer?.fileId,file=incoming.notes.find(item=>item.id===id&&!item.removedAt&&!item.trashedAt);
    if(!file)throw new Error('The transferred file is unavailable.');
    const existing=openFiles().find(item=>item.id===id);
    if(existing&&isFileModified(existing)&&fileSignature(existing)!==fileSignature(file))throw new Error('That file has different unsaved changes in the destination.');
    storeCursor();const prior={ids:[...state.settings.openIds],active:state.activeId,trashView,history:histories.get(id),cursor:cursors.get(id),activeCursor:cursors.get(state.activeId)};
    const reservation={token,fileId:id,prior,pending:true,cancelled:false};if(token){incomingTabTransfers.set(token,reservation);reservation.timer=setTimeout(()=>cancelIncomingTransfer(token),60000);}
    clearTabDrop();movingFiles.add(id);setWindowTransferBusy(true);
    try{
      state=mergeWorkspaces(state,incoming);if(seed.handle)await rememberBrowserHandle(id,seed.handle);
      if(!existing||!collectingTabs){insertFileTab(id,index);trashView=false;selectNote(id);finishWindowTransfer(seed.transfer);}
      save();await flush();
      if(reservation.cancelled)throw new Error('The file move was cancelled.');reservation.pending=false;reservation.preparedSignature=fileSignature(liveNotes().find(item=>item.id===id));window.focus?.();editor.focus();
      return {openIds:[...state.settings.openIds]};
    }catch(error){
      reservation.pending=false;rollbackIncomingTransfer(reservation);throw error;
    }finally{movingFiles.delete(id);setWindowTransferBusy(false);clearTabDrop();}
  }
  window.vistaNotesAcceptTabTransfer=async(token,seed,index)=>{
    try{const result=await acceptTabTransfer(seed,index,token);let ack;try{ack=await request('transfer_result',{token,ok:true,...result});}catch(_){ack=await request('transfer_result',{token,ok:true,...result});}if(!ack.accepted)throw new Error('The file move was cancelled.');commitIncomingTransfer(token);}
    catch(error){cancelIncomingTransfer(token);await request('transfer_result',{token,ok:false,error:error.message}).catch(()=>{});}
  };
  function peerPair(a,b){return [a,b].sort().join('|');}
  function acknowledgePeerPair(join,a,b){const pending=pendingPeerConnections.get(join);if(!pending)return;pending.remaining.delete(peerPair(a,b));if(!pending.remaining.size){clearTimeout(pending.timer);pendingPeerConnections.delete(join);pending.resolve();}}
  function installWindowPort(identity,port,join=null,coordinator=null){
    if(!port||identity===windowInstanceId)return;windowPorts.get(identity)?.close();windowPorts.set(identity,port);
    port.onmessage=event=>{
      const message=event.data;
      if(message?.kind===WINDOW_MESSAGE&&message.type==='port-ping'&&message.sender===identity&&message.join===join){if(coordinator===windowInstanceId)acknowledgePeerPair(join,windowInstanceId,identity);else postWindowMessage({type:'peer-ready',recipient:coordinator,join,a:windowInstanceId,b:identity});return;}
      windowMessageReceiver?.(message,null,event.ports,identity);
    };port.start?.();port.postMessage(peerEnvelope({type:'port-ping',join}));postWindowMessage({type:'tabs',openIds:state?.settings.openIds||[]});
  }
  function peerEnvelope(message){return {kind:WINDOW_MESSAGE,sender:windowInstanceId,messageId:uid(),...message};}
  function connectWindowPeers(identity,child){
    if(!window.MessageChannel)return Promise.resolve();
    const known=[...windowPorts].filter(([peer])=>peer!==identity&&windowPeers.has(peer)),join=uid();let pending;
    const promise=new Promise((resolve,reject)=>{pending={resolve,reject,remaining:new Set([peerPair(windowInstanceId,identity),...known.map(([other])=>peerPair(other,identity))])};});
    pending.timer=setTimeout(()=>{pendingPeerConnections.delete(join);pending.reject(new Error('The new window could not connect to the other editor windows. The original tab was kept.'));},5000);pendingPeerConnections.set(join,pending);
    try{const channel=new window.MessageChannel();installWindowPort(identity,channel.port1,join,windowInstanceId);child.postMessage(peerEnvelope({type:'port-connect',identity:windowInstanceId,join,coordinator:windowInstanceId}),'*',[channel.port2]);}catch(error){clearTimeout(pending.timer);pendingPeerConnections.delete(join);pending.reject(error);}
    for(const [other,port] of known){
      if(other===identity)continue;
      try{const channel=new window.MessageChannel();port.postMessage(peerEnvelope({type:'port-connect',identity,join,coordinator:windowInstanceId}),[channel.port1]);child.postMessage(peerEnvelope({type:'port-connect',identity:other,join,coordinator:windowInstanceId}),'*',[channel.port2]);}catch(error){clearTimeout(pending.timer);pendingPeerConnections.delete(join);pending.reject(error);}
    }
    return promise;
  }
  function handleTabTransferMessage(message,source,ports,fromPort){
    if(handleTabCollectionMessage(message))return true;
    if(message.type==='port-connect'){
      if((fromPort||source&&windowLinks.has(source))&&ports?.[0])installWindowPort(message.identity,ports[0],message.join,message.coordinator);return true;
    }
    if(message.type==='peer-ready'){if(message.recipient===windowInstanceId)acknowledgePeerPair(message.join,message.a,message.b);return true;}
    if(message.type==='drag-point'){
      if(!ready||document.visibilityState==='hidden'||message.sender===windowInstanceId)return true;
      const screen=screenTabLayout();
      if(!screen.blocked&&pointInRect(screen,message.x,message.y)){
        const local=tabLayout(),x=local.left+(message.x-screen.bar.left)*(local.right-local.left)/(screen.bar.right-screen.bar.left),y=local.top+(message.y-screen.bar.top)*(local.bottom-local.top)/(screen.bar.bottom-screen.bar.top);
        if(message.preview&&typeof showLiveTabPreview==='function')showLiveTabPreview(message.preview,x,y);else showTabDrop(local,pointInRect(screen.bar,message.x,message.y)?x:Infinity);
      }else clearTabDrop();
      postWindowMessage({type:'drag-layout',recipient:message.sender,token:message.token,layout:screenTabLayout()});return true;
    }
    if(message.type==='drag-layout'){if(message.recipient===windowInstanceId)dropLayouts.set(message.sender,{...message.layout,token:message.token});return true;}
    if(message.type==='drag-end'){
      if(message.recipient===windowInstanceId&&typeof incomingTabPreview!=='undefined'&&incomingTabPreview?.token===message.token){
        const token=message.token;freezeIncomingTabPreview(token);clearTimeout(incomingTabPreview.endTimer);incomingTabPreview.endTimer=setTimeout(()=>{if(incomingTabPreview?.token===token)clearTabDrop();},1500);
      }else clearTabDrop();return true;
    }
    if(message.type==='move-offer'){
      if(message.recipient===windowInstanceId)acceptTabTransfer(message.seed,message.index,message.token).then(result=>postWindowMessage({type:'move-result',recipient:message.sender,token:message.token,ok:true,...result})).catch(error=>postWindowMessage({type:'move-result',recipient:message.sender,token:message.token,ok:false,error:error.message}));return true;
    }
    if(message.type==='move-result'){
      const pending=pendingWindowMoves.get(message.token);if(message.recipient===windowInstanceId&&pending?.targetId===message.sender){if(message.ok){windowPeers.set(message.sender,{openIds:message.openIds||[]});postWindowMessage({type:'move-commit',recipient:message.sender,token:message.token});pending.resolve();}else pending.reject(new Error(message.error||'The destination could not receive the file.'));}return true;
    }
    if(message.type==='move-commit'){if(message.recipient===windowInstanceId)commitIncomingTransfer(message.token);return true;}
    if(message.type==='move-cancel'){if(message.recipient===windowInstanceId)cancelIncomingTransfer(message.token);return true;}
    return false;
  }
  async function closeWindowIfEmpty(){
    if(!ready||startupBlocked||state.settings.openIds.length||!native&&!windowPeers.size)return false;
    if(emptyWindowClose)return emptyWindowClose;
    emptyWindowClosing=true;document.querySelector('.app-window').inert=true;
    emptyWindowClose=(async()=>{try{
      await flush();if(state.settings.openIds.length||startupBlocked)return false;
      if(native){const result=await request('close_empty_window');return Boolean(result.closed);}
      if(!windowPeers.size)return false;
      rememberWindowTabs();window.close();if(!window.closed)setTimeout(()=>{if(!window.closed){$('emptyDescription').textContent='All files have moved or closed. Your browser requires you to close this window manually.';}},200);return true;
    }catch(error){toast(`The empty window stayed open. ${error.message}`);return false;}finally{emptyWindowClose=null;emptyWindowClosing=false;if(!movingFiles.size)setWindowTransferBusy(false);}})();
    return emptyWindowClose;
  }
  function wireTabTransfers(){
    document.addEventListener('pointermove',trackBrowserScreenPoint,{passive:true});document.addEventListener('pointerdown',trackBrowserScreenPoint,{passive:true});
    window.addEventListener('focus',()=>{windowFocusedAt=Date.now();previousScreenPoint=null;});
    window.addEventListener('resize',()=>{browserGeometry=null;previousScreenPoint=null;});
  }
