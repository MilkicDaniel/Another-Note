  let findAllReference=null,referenceContext=null;
  function syncReferencePanel(){
    const reference=Boolean(findAllReference);$('findAllSearch').hidden=reference;$('findAllReferenceBar').hidden=!reference;
    $('findAllTitle').textContent=reference?'Usages':'Find';
    if(reference)$('findAllReferenceName').textContent=`“${findAllReference.name}” in open tabs`;
  }
  function referenceCandidateAt(text,offset){
    const word=/[\p{L}\p{N}_$-]/u;let start=offset,end=offset;
    if(!word.test(text[offset]||'')&&offset&&word.test(text[offset-1]))start=--offset;
    while(start>0&&word.test(text[start-1]))start--;while(end<text.length&&word.test(text[end]))end++;
    const name=text.slice(start,end);return /^[\p{L}_$-][\p{L}\p{N}_$-]*$/u.test(name)?{name,start,end}:null;
  }
  function editorOffsetAtPoint(x,y){
    const rect=editor.getBoundingClientRect();if(x<rect.left||x>=rect.left+editor.clientWidth||y<rect.top||y>=rect.top+editor.clientHeight)return null;
    updateLineNumbers();const styles=getComputedStyle(editor),starts=editorLineStarts(),localY=y-rect.top-(parseFloat(styles.paddingTop)||0)+editor.scrollTop;
    let low=0,high=starts.length;while(low+1<high){const mid=(low+high)>>1;if(editorLayout.offsets[mid]<=localY)low=mid;else high=mid;}
    const line=low,start=starts[line],end=(starts[line+1]??editor.value.length+1)-1,text=typeof codeDisplayText==='function'?codeDisplayText(start,end):editor.value.slice(start,end);if(!text||text.length>200000)return null;
    lineMeasure.style.width=`${Math.max(1,editor.clientWidth-(parseFloat(styles.paddingLeft)||0)-(parseFloat(styles.paddingRight)||0))}px`;lineMeasure.style.whiteSpace=state.settings.wrap?'pre-wrap':'pre';lineMeasure.textContent=text;
    try{
      const node=lineMeasure.firstChild,origin=lineMeasure.getBoundingClientRect(),localX=x-rect.left-(parseFloat(styles.paddingLeft)||0)+editor.scrollLeft,top=localY-editorLayout.offsets[line],range=document.createRange();low=0;high=text.length;
      while(low<high){const mid=(low+high)>>1;range.setStart(node,mid);range.setEnd(node,mid+1);const box=range.getBoundingClientRect(),left=box.left-origin.left,right=box.right-origin.left,t=box.top-origin.top,bottom=box.bottom-origin.top;
        if(top<t||top<bottom&&localX<left)high=mid;
        else if(top>=bottom||localX>right)low=mid+1;
        else return typeof codeProjectionForCurrent==='function'?foldSourceOffset(codeProjectionForCurrent(),foldDisplayOffset(codeProjectionForCurrent(),start,'left')+mid):start+mid;
      }
      return null;
    }finally{lineMeasure.style.whiteSpace='';}
  }
  function captureReference(offset){
    const file=note();if(!file||!['html','css','javascript','java','python','bash'].includes(file.mode)||activityBlocked())return null;
    const word=referenceCandidateAt(editor.value,offset);if(!word)return null;
    return {id:file.id,text:editor.value,name:word.name,offset:Math.max(word.start,Math.min(word.end-1,offset))};
  }
  function referenceMenuOption(offset){
    referenceContext=captureReference(offset);
    return referenceContext?`<button type="button" data-find-usages>Find Usages of “${escape(referenceContext.name)}”</button>`:'';
  }
  function findSymbolUsages(context=null,prefetched=null){
    context ||= captureReference(editor.selectionStart);
    if(!context)return toast('Place the cursor on a class, ID or function name.');
    if(note()?.id!==context.id||editor.value!==context.text)return toast('The file changed. Select the name again.');
    closeMenus();closeCompletions();searchHighlightOwner='all';
    findAllReference={name:context.name,kind:'auto',sourceId:context.id,offset:context.offset};findAllContext={id:null,selection:null};
    $('findAllInput').value=context.name;$('findAllScope').value='all';$('findAllRegex').checked=false;$('findAllCase').checked=true;
    $('findAllPanel').hidden=false;document.querySelector('.app-window').classList.add('find-all-open');syncReferencePanel();syncSelectControls();
    return runFindAll(prefetched);
  }
  async function navigateSymbolReference(context){
    if(!context)return;closeMenus();closeCompletions();
    const sources=openFiles().map(file=>({id:file.id,title:file.title,content:file.content,mode:file.mode}));
    try{
      const result=await runSearchJob('navigation',{op:'references',reference:{name:context.name,kind:'auto',sourceId:context.id,offset:context.offset},sources});
      if(note()?.id!==context.id||editor.value!==context.text)return;
      const current=openFiles();if(current.length!==sources.length||sources.some(source=>!current.some(file=>file.id===source.id&&file.content===source.content&&file.mode===source.mode))){toast('The files changed. Click the name again.');return;}
      const others=result.results.filter(item=>!(item.source.id===context.id&&item.start<=context.offset&&item.end>context.offset));
      if(!result.truncated&&others.length===1){
        const target=others[0];trashView=false;selectNote(target.source.id,true);editor.setSelectionRange(target.start,target.end);scrollToEditorMatch(target.start);storeCursor();return;
      }
      if(!others.length&&!result.truncated)return toast('No other usages found in open tabs.');
      return findSymbolUsages(context,result);
    }catch(error){if(error.name!=='AbortError')toast(error.message);}
  }
  function wireSymbolReferences(){
    actions.findUsages=findSymbolUsages;
    const menu=$('symbolMenu');
    editor.addEventListener('contextmenu',event=>{
      if(event.defaultPrevented||spellingAtPoint(event.clientX,event.clientY))return;
      const offset=editorOffsetAtPoint(event.clientX,event.clientY);if(offset===null)return;
      const option=referenceMenuOption(offset);if(!option)return;
      event.preventDefault();closeMenus();closeCompletions();menu.innerHTML=option;menu.hidden=false;positionPopup(menu,{getBoundingClientRect:()=>({left:event.clientX,right:event.clientX,top:event.clientY,bottom:event.clientY})});popupItems(menu)[0]?.focus({preventScroll:true});
    });
    editor.addEventListener('pointerdown',event=>{
      if(event.defaultPrevented||event.button!==0||!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey)return;
      const offset=editorOffsetAtPoint(event.clientX,event.clientY);if(offset===null)return;
      const link=editorLinkAt(editor.value,offset,note()?.mode);
      if(link&&!activityBlocked()){event.preventDefault();openEditorLink(link,note());return;}
      const context=captureReference(offset);if(!context)return;
      event.preventDefault();navigateSymbolReference(context);
    });
    document.addEventListener('click',event=>{if(event.target.closest('[data-find-usages]'))findSymbolUsages(referenceContext);});
    wirePopupKeys(menu,editor);
  }
