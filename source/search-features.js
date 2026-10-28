  const searchJobs=new Map();
  let inlineSearchSequence=0,inlineSearchTimer=null,findAllSequence=0,findAllSearchTimer=null,findAllPendingKey=null,findAllCancelledKey=null,inlineHighlights=null,searchHighlightOwner='inline';
  function resizeSearchField(field){
    if(!field.clientWidth)return;
    const styles=getComputedStyle(field),border=(parseFloat(styles.borderTopWidth)||0)+(parseFloat(styles.borderBottomWidth)||0),scroll=field.scrollTop,overflow=field.style.overflowY;
    field.style.overflowY='hidden';
    field.style.height='auto';
    field.style.height=`${Math.ceil(field.scrollHeight+border)}px`;
    field.style.overflowY=overflow;
    field.scrollTop=scroll;
  }
  function resizeSearchFields(){for(const id of ['findInput','replaceInput','findAllInput'])resizeSearchField($(id));}
  function wireSearchFields(){
    const widths=new WeakMap(),observer=new ResizeObserver(entries=>{
      let changed=false;
      for(const {target} of entries){const width=target.getBoundingClientRect().width;if(widths.get(target)!==width){widths.set(target,width);changed=true;}}
      if(changed)resizeSearchFields();
    });
    for(const id of ['findInput','replaceInput','findAllInput']){const field=$(id);field.addEventListener('input',()=>resizeSearchField(field));observer.observe(field);}
    window.addEventListener('resize',resizeSearchFields);
  }
  function searchAborted(message='Search cancelled.'){const error=new Error(message);error.name='AbortError';return error;}
  function setInlineSearchStatus(message){
    $('findCount').textContent=message;$('findError').textContent='';$('findError').hidden=true;
  }
  function setSearchBusy(channel,busy){
    if(channel==='occurrences'||channel==='navigation')return;
    if(channel==='all'){$('cancelFindAllButton').hidden=!busy;$('cancelReferenceSearch').hidden=!busy;}
    else $('cancelFindButton').hidden=![...searchJobs.keys()].some(key=>key==='inline'||key==='replace');
    if(busy&&channel!=='all'){$('replaceOneButton').disabled=true;$('replaceAllButton').disabled=true;}
  }
  function cancelSearchJob(channel,message='Search cancelled.'){
    const job=searchJobs.get(channel);if(job)job.finish(searchAborted(message));
  }
  function runSearchJob(channel,payload,onProgress){
    cancelSearchJob(channel,'Search superseded.');
    return new Promise((resolve,reject)=>{
      let worker,url,timer,finished=false;
      const finish=(error,result)=>{
        if(finished)return;finished=true;clearTimeout(timer);worker?.terminate();if(url)URL.revokeObjectURL(url);
        if(searchJobs.get(channel)?.finish===finish)searchJobs.delete(channel);setSearchBusy(channel,false);
        error?reject(error):resolve(result);
      };
      searchJobs.set(channel,{finish});setSearchBusy(channel,true);
      try{
        if(typeof Worker!=='function')throw new Error('Background search is unavailable in this browser.');
        url=URL.createObjectURL(new Blob([$('searchWorkerSource').textContent],{type:'text/javascript'}));worker=new Worker(url);
        worker.onmessage=event=>{if(event.data.progress){onProgress?.(event.data.progress);return;}finish(event.data.error?new Error(`${payload.op==='references'?'Could not find usages: ':'Invalid regex or search error: '}${event.data.error}`):null,event.data.result);};
        worker.onerror=event=>finish(new Error(event.message||'Background search failed.'));
        timer=setTimeout(()=>finish(new Error('Search took too long and was stopped. Narrow the scope or simplify the regex.')),10000);
        worker.postMessage(payload);
      }catch(error){finish(error);}
    });
  }
  function cancelInlineSearch(){
    clearTimeout(inlineSearchTimer);inlineSearchSequence++;cancelSearchJob('inline');cancelSearchJob('replace');
    setInlineSearchStatus('Search cancelled.');$('cancelFindButton').hidden=true;
  }
  function cancelFindAll(){clearTimeout(findAllSearchTimer);findAllSearchTimer=null;findAllPendingKey=null;findAllCancelledKey=findAllSearchKey();findAllSequence++;cancelSearchJob('all');$('findAllStatus').textContent='Search cancelled.';$('findAllStatus').hidden=false;}
  function refreshInlineFind(){
    clearTimeout(inlineSearchTimer);inlineSearchSequence++;cancelSearchJob('inline','Search superseded.');cancelSearchJob('replace','File changed.');
    clearInlineHighlights();if($('findBar').hidden)return;
    setInlineSearchStatus($('findInput').value?'Searching…':'');
    inlineSearchTimer=setTimeout(()=>findMatches(false,false,null,false),180);
  }
  function inlineFindSnapshot(){
    const result={matches:[],pattern:null,start:0,end:editor.value.length,body:editor.value,error:'',regexError:false,total:0};
    if(!syncFindSession())return result;
    result.fileId=note().id;result.documentText=editor.value;result.query=$('findInput').value;result.regex=$('findRegex').checked;result.matchCase=$('findCase').checked;
    if($('findSelection').checked){
      if(!findSession.scope){result.error='Select text in the editor to use Selection only.';return result;}
      result.start=findSession.scope.start;result.end=findSession.scope.end;
      if(result.end<=result.start){result.error='The selected range is empty. Select a new range, then toggle Selection only off and on.';return result;}
      result.body=editor.value.slice(result.start,result.end);
    }
    return result;
  }
  function inlineSnapshotCurrent(result){
    const scope=$('findSelection').checked?findSession?.scope:null;
    return !activityBlocked()&&!$('findBar').hidden&&note()?.id===result.fileId&&editor.value===result.documentText&&$('findInput').value===result.query&&$('findRegex').checked===result.regex&&$('findCase').checked===result.matchCase&&(!scope?result.start===0&&result.end===editor.value.length:scope.start===result.start&&scope.end===result.end);
  }
  function activityBlocked(){return $('confirmDialog').open||$('historyDialog').open||$('helpDialog').open||$('shortcutsDialog').open||$('renameDialog').open||$('closeDialog').open||$('fileChangedDialog').open||$('filesDialog').open||$('tagDialog').open||$('manageTagsDialog').open||$('dictionaryDialog').open||$('spellingDialog').open||$('licensesDialog').open||$('colorDialog').open;}
  async function collectFindMatches(){
    const result=inlineFindSnapshot();if(result.error||!result.query)return result;
    const found=await runSearchJob('inline',{op:'matches',query:result.query,regex:result.regex,matchCase:result.matchCase,text:result.body,offset:result.start});
    Object.assign(result,found);return result;
  }
  async function findMatches(advance=false,backwards=false,from=null,navigate=true){
    if(navigate)searchHighlightOwner='inline';
    clearTimeout(inlineSearchTimer);const sequence=++inlineSearchSequence;
    const anchor={start:editor.selectionStart,end:editor.selectionEnd};
    clearInlineHighlights();setInlineSearchStatus($('findInput').value?'Searching…':'');
    try{
      const result=await collectFindMatches();if(sequence!==inlineSearchSequence||!inlineSnapshotCurrent(result))return;
      inlineHighlights=result;paintEditor();updateFindStatus(result);if(!navigate||!result.matches.length||anchor.start!==editor.selectionStart||anchor.end!==editor.selectionEnd)return;
      const cursor=from===null?editor.selectionStart:from,current=findSession.current;
      const onCurrent=from===null&&current&&current.start===editor.selectionStart&&current.end===editor.selectionEnd;
      const match=backwards?(result.matches.filter(item=>advance&&onCurrent?item.start<cursor:item.start<=cursor).at(-1)||result.matches.at(-1)):(result.matches.find(item=>advance&&onCurrent?item.start>cursor:item.start>=cursor)||result.matches[0]);
      selectFindMatch(result,match);
    }catch(error){if(sequence!==inlineSearchSequence||error.name==='AbortError')return;$('findError').textContent=error.message;$('findError').hidden=false;$('findInput').setAttribute('aria-invalid','true');$('findCount').textContent='';$('replaceOneButton').disabled=true;$('replaceAllButton').disabled=true;}
  }
  async function replaceFindMatch(all=false){
    searchHighlightOwner='inline';
    const file=note();if(!file||file.trashedAt||editor.readOnly||startupBlocked)return;
    const result=inlineFindSnapshot();if(result.error||!result.query){updateFindStatus(result);return;}
    const sequence=++inlineSearchSequence,focused=document.activeElement;
    cancelSearchJob('inline','Replacement started.');setInlineSearchStatus('Replacing…');
    try{
      const changed=await runSearchJob('replace',{op:all?'replaceAll':'replaceOne',query:result.query,regex:result.regex,matchCase:result.matchCase,text:result.body,offset:result.start,cursor:Math.max(0,editor.selectionStart-result.start),replacement:findReplacementText()});
      if(sequence!==inlineSearchSequence||!inlineSnapshotCurrent(result)){toast('File or search changed. No replacement was applied.');return;}
      if(!changed.count){await findMatches(false,false,null,false);return;}
      setView('edit');
      if(all){
        const scoped=$('findSelection').checked,start=scoped?result.start:Math.min(editor.selectionStart,result.start+changed.body.length),end=scoped?result.start+changed.body.length:start;
        findSession.programSelection={start,end};if(changed.body!==result.body)replaceText(result.start,result.end,changed.body,start,end);
        await findMatches(false,false,null,false);toast(`Replaced ${changed.count} ${changed.count===1?'match':'matches'}${scoped?' in selection':' in this file'}.`);
      }else{
        const end=changed.target.start+changed.inserted.length;findSession.programSelection={start:end,end};
        if(changed.inserted!==editor.value.slice(changed.target.start,changed.target.end))replaceText(changed.target.start,changed.target.end,changed.inserted);
        await findMatches(false,false,changed.resume);
      }
      if($('findBar').contains(focused)&&(document.activeElement===editor||document.activeElement===focused))focused.focus();
    }catch(error){if(error.name!=='AbortError'){$('findError').textContent=error.message;$('findError').hidden=false;$('findCount').textContent='';}}
  }
  async function runFindAll(prefetched=null){
    if($('findAllPanel').hidden)return;
    resizeSearchField($('findAllInput'));
    clearTimeout(findAllSearchTimer);findAllSearchTimer=null;findAllCancelledKey=null;const key=findAllSearchKey();findAllPendingKey=key;
    const sequence=++findAllSequence;
    const query=$('findAllInput').value,regex=$('findAllRegex').checked,matchCase=$('findAllCase').checked,scope=$('findAllScope').value;
    const previous=findAllState,old=previous?.results[previous.selected];
    const reference=findAllReference?{...findAllReference}:null;
    const result={key,query,regex,matchCase,scope,reference,context:{...findAllContext},sources:[],groups:[],results:[],total:0,selected:-1,visibleCount:200,collapsed:new Set(previous?.collapsed||[]),error:'',regexError:false,stale:false};
    cancelSearchJob('all','Search superseded.');
    try{
      result.sources=findAllSources(scope,findAllContext).map(file=>({id:file.id,title:file.title,content:file.content,mode:file.mode}));
      if(query){
        $('findAllStatus').textContent='Searching…';$('findAllStatus').hidden=false;
        const cached=reference&&prefetched?.symbol&&prefetched.sources?.length===result.sources.length&&prefetched.sources.every((file,index)=>file.id===result.sources[index].id&&file.content===result.sources[index].content&&file.mode===result.sources[index].mode);
        const found=cached?prefetched:await runSearchJob('all',{op:reference?'references':'all',reference,query,regex,matchCase,sources:result.sources,range:scope==='selection'?findAllContext.selection:null},progress=>{if(sequence===findAllSequence)$('findAllStatus').textContent=`Searching ${progress.files} of ${progress.totalFiles} files · ${progress.matches} ${reference?'usages':'matches'}`;});
        if(sequence!==findAllSequence)return;Object.assign(result,found);
      }
    }catch(error){if(error.name==='AbortError'||sequence!==findAllSequence)return;result.error=error.message;result.regexError=/regex/i.test(error.message);}
    if(sequence!==findAllSequence||$('findAllPanel').hidden)return;
    if(key!==findAllSearchKey()){scheduleFindAll();return;}findAllPendingKey=null;
    if(result.symbol&&reference?.kind==='auto'){findAllReference={...result.symbol};result.reference={...result.symbol};result.key=findAllSearchKey();syncReferencePanel();}
    result.selected=result.results.length?Math.max(0,result.results.findIndex(item=>old&&item.source.id===old.source.id&&item.start===old.start)):-1;
    result.visibleCount=Math.max(200,Math.ceil((result.selected+1)/200)*200);findAllState=result;renderFindAllResults();paintEditor();
  }

  function clearInlineHighlights(){inlineHighlights=null;if(note())paintEditor();}
  function findAllSearchKey(){
    const range=findAllContext.selection;
    return JSON.stringify([$('findAllInput').value,$('findAllRegex').checked,$('findAllCase').checked,$('findAllScope').value,findAllReference,findAllContext.id,range?.id,range?.start,range?.end,openFiles().map(file=>[file.id,file.updatedAt,file.title,file.mode])]);
  }
  function scheduleFindAll(){
    if($('findAllPanel').hidden)return;
    clearTimeout(findAllSearchTimer);findAllSequence++;cancelSearchJob('all','Search superseded.');findAllCancelledKey=null;findAllPendingKey=findAllSearchKey();
    if(findAllState)findAllState.stale=true;
    $('findAllStatus').textContent=$('findAllInput').value?'Searching open tabs…':'';$('findAllStatus').hidden=!$('findAllInput').value;
    if(note())paintEditor();
    findAllSearchTimer=setTimeout(()=>{findAllSearchTimer=null;runFindAll();},180);
  }
  function editorSearchMatches(){
    const file=note();if(!file||file.trashedAt)return null;
    if(searchHighlightOwner!=='all'&&inlineHighlights&&!$('findBar').hidden&&inlineSnapshotCurrent(inlineHighlights))return {matches:inlineHighlights.matches,selected:findSession?.current};
    const found=findAllState;
    if(!$('findAllPanel').hidden&&found&&!found.stale&&found.key===findAllSearchKey()){
      const group=found.groups.find(group=>group.source.id===file.id&&group.source.content===editor.value);
      if(group)return {matches:group.matches,selected:found.results[found.selected]?.source.id===file.id?found.results[found.selected]:null};
    }
    return null;
  }
  function decorateSearchRanges(html,matches,selected=null,className='search-hit',decorateText=null){
    if(!matches?.length)return html;
    let offset=0,index=0,result='';
    const mark=(text,range)=>`<mark class="${className}${selected&&selected.start===range.start&&selected.end===range.end?' current':''}${range.start===range.end?' zero-width':''}">${decorateText?decorateText(text):text}</mark>`;
    for(const token of html.matchAll(/<[^>]*>|[^<]+/g)){
      const piece=token[0];if(piece[0]==='<'){result+=piece;continue;}
      const text=piece.replace(/&(amp|lt|gt|quot|#39);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[entity]);
      const end=offset+text.length;let cursor=0;
      while(index<matches.length){
        const range=matches[index];
        if(range.end<offset||(range.end===offset&&range.start!==range.end)){index++;continue;}
        if(range.start>=end)break;
        const start=Math.max(0,range.start-offset),stop=Math.min(text.length,range.end-offset);
        result+=escape(text.slice(cursor,start))+mark(escape(text.slice(start,stop)),range);cursor=stop;
        if(range.end<=end)index++;else break;
      }
      result+=escape(text.slice(cursor));offset=end;
    }
    while(index<matches.length&&matches[index].start===offset&&matches[index].end===offset){result+=mark('',matches[index]);index++;}
    return result;
  }
  function decorateEditorMatches(html){const found=editorSearchMatches();return found?decorateSearchRanges(html,found.matches,found.selected):html;}
