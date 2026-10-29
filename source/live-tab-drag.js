  let nativeLiveDragEnabled=false,liveNativeDrag=null,incomingTabPreview=null;
  const liveHoverVersions=new Map();
  function animateTabChange(change,held=null){
    const tabs=[...$('fileTabs').children].filter(tab=>tab!==held),positions=new Map(tabs.map(tab=>[tab,tab.getBoundingClientRect().left]));
    for(const tab of tabs)tab.getAnimations?.().forEach(animation=>animation.cancel());
    change();if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    for(const tab of tabs){if(!tab.isConnected)continue;const offset=positions.get(tab)-tab.getBoundingClientRect().left;if(Math.abs(offset)>.5)tab.animate?.([{transform:`translateX(${offset}px)`},{transform:'translateX(0)'}],{duration:120,easing:'cubic-bezier(.2,.7,.3,1)'});}
  }
  function clearLiveTabPreview(){
    if(!incomingTabPreview)return;const preview=incomingTabPreview;incomingTabPreview=null;
    clearTimeout(preview.endTimer);stopIncomingTabScroll(preview);
    if(preview.element?.isConnected)animateTabChange(()=>preview.element.remove());
  }
  function stopIncomingTabScroll(preview){
    if(preview.scrollFrame!=null)cancelAnimationFrame(preview.scrollFrame);
    preview.scrollFrame=null;preview.scrollTime=null;
  }
  function freezeIncomingTabPreview(token){
    if(incomingTabPreview?.token!==token)return;
    incomingTabPreview.ended=true;stopIncomingTabScroll(incomingTabPreview);positionIncomingTab(incomingTabPreview);
  }
  function incomingTabOverBar(layout,x,y){return pointInRect({...layout,top:layout.top-24,bottom:layout.bottom+24},x,y);}
  function positionIncomingTab(preview){
    const element=preview.element;element.classList.toggle('incoming-tab-floating',!preview.ended&&preview.overBar);
    if(preview.ended||!preview.overBar){if(preview.floatOffset||element.style.transform){element.style.transform='';preview.floatOffset=0;}return;}
    const viewport=$('fileTabs').getBoundingClientRect(),rect=element.getBoundingClientRect(),width=rect.width??rect.right-rect.left;
    const ratio=Number.isFinite(preview.meta.grabRatio)?Math.max(0,Math.min(1,preview.meta.grabRatio)):.5;
    const left=Math.max(viewport.left,Math.min(Math.max(viewport.left,viewport.right-width),preview.x-width*ratio));
    const offset=left-(rect.left-(preview.floatOffset||0));
    if(preview.floatOffset!==offset){element.style.transform=`translate3d(${offset}px,0,0)`;preview.floatOffset=offset;}
  }
  function updateIncomingTabScroll(preview){
    if(preview.ended||typeof requestAnimationFrame!=='function'||!preview.overBar){stopIncomingTabScroll(preview);return;}
    const tabs=$('fileTabs'),rect=tabs.getBoundingClientRect(),edge=Math.min(38,(rect.right-rect.left)/3);
    preview.scrollVelocity=preview.x<rect.left+edge?-Math.min(16,(rect.left+edge-preview.x)/3):preview.x>rect.right-edge?Math.min(16,(preview.x-rect.right+edge)/3):0;
    if(!preview.scrollVelocity){stopIncomingTabScroll(preview);return;}
    if(preview.scrollFrame!=null)return;
    preview.scrollFrame=requestAnimationFrame(time=>{
      preview.scrollFrame=null;if(incomingTabPreview!==preview||preview.ended)return;
      const elapsed=preview.scrollTime==null?16.667:Math.max(0,Math.min(32,time-preview.scrollTime));preview.scrollTime=time;
      const before=tabs.scrollLeft;tabs.scrollLeft+=preview.scrollVelocity*elapsed/16.667;
      if(tabs.scrollLeft!==before)showLiveTabPreview(preview.meta,preview.x,preview.y);
      else preview.scrollTime=null;
    });
  }
  function incomingTabLayout(){
    const tabs=$('fileTabs'),layout=tabLayout(),gap=typeof getComputedStyle==='function'?parseFloat(getComputedStyle(tabs).columnGap)||0:0;
    let left=tabs.getBoundingClientRect().left-(tabs.scrollLeft||0);
    const slots=[...tabs.children].filter(tab=>tab.dataset.tabId&&!tab.classList?.contains('live-tab-drag-source')).map(tab=>{
      const rect=tab.getBoundingClientRect(),width=rect.width??rect.right-rect.left,slot={id:tab.dataset.tabId,left,right:left+width,top:rect.top,bottom:rect.bottom};left+=width+gap;return slot;
    });
    return {...layout,slots};
  }
  function showLiveTabPreview(meta,x,y){
    const ownDrag=Boolean(liveNativeDrag&&liveNativeDrag.token===meta?.token&&movingFiles.size===1&&movingFiles.has(liveNativeDrag.id));
    if(ownDrag){clearLiveTabPreview();return {detach:true};}
    if(!ready||startupBlocked||movingFiles.size&&!ownDrag||closingFiles.size||applicationCloseRunning||activityBlocked())return {blocked:true};
    if(!meta||typeof meta.token!=='string')return window.vistaNotesTabDropInfo(x,y,true);
    if(incomingTabPreview?.token!==meta.token)clearLiveTabPreview();
    if(incomingTabPreview?.ended)return {index:incomingTabPreview.index};
    let layout=incomingTabPreview?incomingTabLayout():tabLayout();
    const overBar=incomingTabOverBar(layout,x,y),created=!incomingTabPreview,index=overBar?dropIndex(layout,x):Math.min(layout.slots.length,incomingTabPreview?.index??layout.slots.length);
    if(!document.createElement)return {index};
    if(!incomingTabPreview){
      const element=document.createElement('div');element.className='file-tab active incoming-tab-preview';element.setAttribute('aria-hidden','true');
      element.innerHTML=`<span class="file-tab-select">${escape(String(meta.title||'untitled').slice(0,250))}</span>${meta.modified?'<span class="file-unsaved">●</span>':''}<span class="file-tab-close" aria-hidden="true">×</span>`;
      incomingTabPreview={token:meta.token,element,layout,index:-1,meta,x,y};
    }
    const preview=incomingTabPreview;preview.x=x;preview.y=y;preview.layout=layout;preview.overBar=overBar;
    const place=at=>{
      if(preview.index===at&&preview.element.isConnected)return;
      preview.index=at;const before=[...$('fileTabs').children].filter(tab=>tab.dataset.tabId&&!tab.classList?.contains('live-tab-drag-source'))[at]||null;
      animateTabChange(()=>$('fileTabs').insertBefore(preview.element,before),preview.element);
    };
    place(index);
    if(created){layout=preview.layout=incomingTabLayout();place(overBar?dropIndex(layout,x):layout.slots.length);}
    if(!overBar)preview.element.scrollIntoView?.({block:'nearest',inline:'nearest'});
    positionIncomingTab(preview);
    updateIncomingTabScroll(preview);
    document.querySelector('.tabbar').classList.add('tab-drop-preview');return {index:preview.index};
  }
  function restoreLiveTabPreview(){
    const preview=incomingTabPreview;if(!preview||preview.element.isConnected)return;
    const before=[...$('fileTabs').children].filter(tab=>tab.dataset.tabId&&!tab.classList?.contains('live-tab-drag-source'))[preview.index]||null;
    $('fileTabs').insertBefore(preview.element,before);preview.layout=incomingTabLayout();positionIncomingTab(preview);
    if(!preview.ended)showLiveTabPreview(preview.meta,preview.x,preview.y);
  }
  function acceptLiveHoverVersion(token,version){
    if(!token||!Number.isFinite(version))return true;
    if(version<(liveHoverVersions.get(token)??-1))return false;
    liveHoverVersions.set(token,version);if(liveHoverVersions.size>32)liveHoverVersions.delete(liveHoverVersions.keys().next().value);return true;
  }
  window.vistaNotesLiveTabHover=(meta,x,y,version,finished=false)=>{
    if(!acceptLiveHoverVersion(meta?.token,version))return {blocked:true,stale:true};
    const result=showLiveTabPreview(meta,x,y);if(finished)freezeIncomingTabPreview(meta?.token);return result;
  };
  window.vistaNotesClearLiveTabHover=(token,version)=>{
    if(!acceptLiveHoverVersion(token,version)||token&&incomingTabPreview&&incomingTabPreview.token!==token)return;
    clearLiveTabPreview();document.querySelector('.tabbar').classList.remove('tab-drop-preview');
  };
  function liveDragMetadata(drag){const file=liveNotes().find(file=>file.id===drag.id);return {token:drag.token??=uid(),title:file?fileLabel(file):'untitled',modified:file?isFileModified(file):false,grabRatio:Math.max(0,Math.min(1,(drag.grabOffset||0)/Math.max(1,drag.width||190)))};}
  function tryStartLiveTabDrag(drag,event){
    drag.lastPoint={screenX:event.screenX,screenY:event.screenY};
    if(!tabDragIsOutside(drag))return;
    drag.detached=true;
    if(native){if(nativeLiveDragEnabled&&!liveNativeDrag&&!drag.liveRequested&&Date.now()>=(drag.liveRetryAfter||0)){drag.liveRequested=true;startLiveNativeDrag(drag);}}
    else updateBrowserDragPreview(drag,event);
  }
  async function startLiveNativeDrag(drag){
    let record=null;
    try{
      await flush();if(tabDrag!==drag||!tabDragIsOutside(drag)){drag.liveRequested=false;return;}
      if(liveNativeDrag){drag.liveRequested=false;return;}
      const meta=liveDragMetadata(drag);record={...meta,id:drag.id,priorActive:state.activeId,drag,started:false,finishing:false};
      liveNativeDrag=record;drag.nativeHandoff=true;
      const bar=document.querySelector('.tabbar').getBoundingClientRect();
      const result=await request('begin_tab_drag',{fileId:drag.id,token:meta.token,title:meta.title,modified:meta.modified,grabRatio:meta.grabRatio,theme:document.body.dataset.theme,bar:{left:bar.left,right:bar.right,top:bar.top,bottom:bar.bottom},tabX:$('fileTabs').getBoundingClientRect().left,tabY:drag.top,width:drag.width,height:drag.height,offsetX:drag.grabOffset,offsetY:drag.grabOffsetY,transfer:transferSnapshot(drag.id)});
      if(!result.started){liveNativeDrag=null;drag.nativeHandoff=false;drag.liveRequested=false;drag.liveRetryAfter=Date.now()+100;if(drag.released&&tabDrag===drag){finishTabDrag(true);moveDroppedFile(drag.id,drag.lastPoint);}return;}
      record.started=true;drag.nativeHandoff=false;
      if(tabDrag!==drag){await window.vistaNotesFinishLiveTabDrag(record.token,{cancelled:true});return;}
      movingFiles.add(drag.id);finishTabDrag(true);
      const other=openFiles().find(file=>file.id!==drag.id);if(state.activeId===drag.id&&other)selectNote(other.id);
      renderTabs();document.querySelector('.app-window').inert=true;editor.readOnly=true;
      if(record.outcome)window.vistaNotesFinishLiveTabDrag(record.token,record.outcome);
    }catch(error){
      if(liveNativeDrag===record)liveNativeDrag=null;
      movingFiles.delete(drag.id);drag.nativeHandoff=false;drag.liveRequested=false;drag.liveRetryAfter=Date.now()+100;
      setWindowTransferBusy(false);
      if(record){
        await request('finish_tab_drag',{token:record.token,ok:false}).catch(()=>{});
        try{if(tabDrag===drag)finishTabDrag(true);renderTabs();}catch(_){}
        toast('The file stayed in this window. Drag it again to retry.');
      }else if(drag.released&&tabDrag===drag){finishTabDrag(true);moveDroppedFile(drag.id,drag.lastPoint);}
    }
  }
  window.vistaNotesFinishLiveTabDrag=async(token,outcome)=>{
    const record=liveNativeDrag;if(!record||record.token!==token||record.finishing)return;
    if(!record.started){record.outcome=outcome;return;}
    record.finishing=true;movingFiles.delete(record.id);let moved=false;
    try{
      if(!outcome.cancelled)moved=await moveFileToWindow(record.id,{liveDragToken:token,deferEmptyClose:true},outcome.targetId,outcome.index);
      else if(Number.isInteger(outcome.index)){
        insertFileTab(record.id,outcome.index);save();
      }
    }catch(error){
      toast(`The file stayed in this window. ${error.message}`);
    }finally{
      await request('finish_tab_drag',{token,ok:moved}).catch(()=>{});
      liveNativeDrag=null;movingFiles.delete(record.id);document.querySelector('.app-window').inert=false;editor.readOnly=startupBlocked||Boolean(note()?.trashedAt);
      if(!moved&&state.settings.openIds.includes(record.priorActive))selectNote(record.priorActive);
      renderTabs();if(moved)await closeWindowIfEmpty();
    }
  };
  function updateBrowserDragPreview(drag,event){
    drag.lastPoint={screenX:event.screenX,screenY:event.screenY};
    if(drag.browserTabCursor)return;
    const meta=liveDragMetadata(drag),width=Math.min(128,Math.max(105,Math.round(drag.width||190))),height=36;
    const light=document.body.dataset.theme==='light',style=typeof getComputedStyle==='function'?getComputedStyle(document.body):null,background=style?.getPropertyValue('--active-tab').trim()||(light?'#fcfcfc':'#343d46'),foreground=style?.getPropertyValue('--text').trim()||(light?'#101820':'#e1e8ef');
    const label=escape(meta.title.slice(0,250)),labelEnd=width-(meta.modified?42:29);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="label"><rect x="13" y="0" width="${labelEnd-13}" height="36"/></clipPath></defs><rect width="${width}" height="36" rx="5" fill="${background}"/><text x="13" y="23" font-family="Arial,sans-serif" font-size="12" fill="${foreground}" clip-path="url(#label)">${label}</text>${meta.modified?`<circle cx="${width-35}" cy="18" r="2.5" fill="#e5b178"/>`:''}<text x="${width-17}" y="24" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" fill="${foreground}">×</text></svg>`;
    const x=Math.max(0,Math.min(width-1,Math.round((drag.grabOffset||0)*width/(drag.width||190)))),y=Math.max(0,Math.min(height-1,Math.round(drag.grabOffsetY||0)));
    drag.browserTabCursor=true;drag.tabCursor=`url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, grabbing`;
    document.body.style?.setProperty('--drag-tab-cursor',drag.tabCursor);document.body.classList?.add('browser-tab-drag');
  }
  function freezeBrowserDragPreview(drag){
    drag.browserTabCursor=false;document.body.classList?.remove('browser-tab-drag');document.body.style?.removeProperty('--drag-tab-cursor');
  }
  function discardBrowserDragPreview(drag){freezeBrowserDragPreview(drag);}
