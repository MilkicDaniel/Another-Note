  let occurrenceHighlights=null,occurrenceSequence=0,occurrenceTimer=null,occurrenceSelection=null;
  function clearOccurrenceHighlights(repaint=true){
    clearTimeout(occurrenceTimer);occurrenceTimer=null;
    const had=Boolean(occurrenceHighlights);occurrenceHighlights=null;occurrenceSequence++;cancelSearchJob('occurrences');
    if(had&&repaint&&note())paintEditor();
  }
  function currentOccurrenceHighlights(){
    const found=occurrenceHighlights;
    if(found&&(found.id!==note()?.id||found.text!==editor.value)){clearOccurrenceHighlights(false);return null;}
    return found;
  }
  async function highlightSelectedOccurrences(){
    clearOccurrenceHighlights(false);const file=note(),start=editor.selectionStart,end=editor.selectionEnd,query=editor.value.slice(start,end);
    occurrenceSelection={id:file?.id,text:editor.value,start,end};
    if(!ready||startupBlocked||!file||!query.trim()||query.length>512||/[\r\n]/.test(query)){if(file)paintEditor();return;}
    const record=occurrenceHighlights={id:file.id,text:editor.value,start,end,query,matches:[],version:occurrenceSequence},sequence=occurrenceSequence;
    try{
      const found=await runSearchJob('occurrences',{op:'occurrences',query,regex:false,matchCase:true,text:record.text});
      if(sequence!==occurrenceSequence||occurrenceHighlights!==record||note()?.id!==record.id||editor.value!==record.text||editor.selectionStart!==start||editor.selectionEnd!==end)return;
      Object.assign(record,found);paintEditor();
    }catch(error){if(sequence===occurrenceSequence&&error.name!=='AbortError'){clearOccurrenceHighlights();toast('Could not highlight matching text. '+error.message);}}
  }
  function decorateOccurrenceMatches(html){
    const found=currentOccurrenceHighlights();return found?.matches.length?decorateSearchRanges(html,found.matches,null,'occurrence-hit'):html;
  }
  function occurrenceMatchIndex(matches,offset){
    let low=0,high=matches.length;while(low<high){const mid=(low+high)>>1;if(matches[mid].end<=offset)low=mid+1;else high=mid;}return low;
  }
  function scheduleOccurrenceHighlights(){
    const selected={id:note()?.id,text:editor.value,start:editor.selectionStart,end:editor.selectionEnd};
    if(occurrenceSelection&&Object.keys(selected).every(key=>selected[key]===occurrenceSelection[key]))return;
    occurrenceSelection=selected;clearOccurrenceHighlights();
    const query=selected.text.slice(selected.start,selected.end);
    if(!ready||startupBlocked||!selected.id||!query.trim()||query.length>512||/[\r\n]/.test(query))return;
    // Wait for mouse/keyboard selection to settle instead of scanning every
    // intermediate range while the user drags across text.
    const ticket=occurrenceSequence;
    occurrenceTimer=setTimeout(()=>{occurrenceTimer=null;if(ticket===occurrenceSequence)highlightSelectedOccurrences();},100);
  }
  function wireOccurrenceHighlights(){
    editor.addEventListener('dblclick',event=>{
      if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
      const id=note()?.id,text=editor.value;
      requestAnimationFrame(()=>{if(id===note()?.id&&text===editor.value)scheduleOccurrenceHighlights();});
    });
    editor.addEventListener('pointerdown',event=>{if(event.button===0){occurrenceSelection=null;clearOccurrenceHighlights();}});
    editor.addEventListener('beforeinput',()=>clearOccurrenceHighlights());
    for(const name of ['select','selectionchange','pointerup'])editor.addEventListener(name,scheduleOccurrenceHighlights);
    editor.addEventListener('keyup',event=>{if(event.key!=='Escape'&&!event.isComposing)scheduleOccurrenceHighlights();});
    editor.addEventListener('keydown',event=>{if(event.key==='Escape'&&(occurrenceHighlights||occurrenceTimer)){event.preventDefault();clearOccurrenceHighlights();}});
  }
