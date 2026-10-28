  let minimapFrame=0,minimapState=null,minimapPaintKey=null,minimapDrag=null,minimapOccurrenceRail=null;
  function minimapMatchRows(matches,view,columns){
    const key=[matches,editorLayout.key,view.width,view.height,view.scale,view.overflow,editor.scrollHeight];
    if(minimapOccurrenceRail&&key.every((value,i)=>value===minimapOccurrenceRail.key[i]))return minimapOccurrenceRail.rows;
    const starts=editorLineStarts(),rows=new Set();
    for(const match of matches){
      const line=editorLineAt(match.start),column=match.start-starts[line],row=state.settings.wrap?Math.floor(column/columns):0,position=editorLayout.offsets[line]+row*editorLayout.lineHeight;
      const y=8+(view.overflow?position/Math.max(1,editor.scrollHeight)*view.usable:position*view.scale);
      rows.add(Math.round(Math.max(8,Math.min(view.height-10,y))));
    }
    minimapOccurrenceRail={key,rows:[...rows]};return minimapOccurrenceRail.rows;
  }
  function minimapGeometry(height,scale,scrollHeight,clientHeight,scrollTop){
    const usable=Math.max(1,height-16),maxScroll=Math.max(0,scrollHeight-clientHeight),total=scrollHeight*scale,overflow=Math.max(0,total-usable),progress=maxScroll?scrollTop/maxScroll:0;
    const top=8+scrollTop*scale-overflow*progress,thumb=Math.min(usable,Math.max(12,clientHeight*scale));
    return {scale,maxScroll,offset:overflow*progress,top:Math.max(8,Math.min(8+usable-thumb,top)),thumb,usable,overflow};
  }
  function syncMinimapControls(){
    const shown=state?.settings.minimap!==false;
    $('editorMinimap').hidden=!shown;$('minimapToggle').setAttribute('aria-pressed',String(shown));$('minimapToggle').setAttribute('aria-label',shown?'Hide file minimap':'Show file minimap');
    $('minimapMenu').textContent=`${shown?'✓ ':''}File Minimap`;
  }
  function toggleMinimap(){
    state.settings.minimap=state.settings.minimap===false;syncMinimapControls();minimapPaintKey=null;paintEditor();save();
  }
  function scheduleMinimap(){
    if(minimapFrame)return;minimapFrame=requestAnimationFrame(()=>{minimapFrame=0;renderMinimap();});
  }
  function minimapScrollTo(y){
    const view=minimapState;if(!view)return;const local=y-$('editorMinimap').getBoundingClientRect().top;
    editor.scrollTop=Math.max(0,Math.min(view.maxScroll,(local-8+view.offset)/view.scale-editor.clientHeight/2));syncScroll();
  }
  function renderMinimap(){
    const panel=$('editorMinimap'),file=note(),canvas=$('minimapCanvas');
    if(!ready||!file||panel.hidden||$('notePane').hidden||!canvas.getContext)return;
    const rect=panel.getBoundingClientRect(),width=Math.round(rect.width),height=Math.round(rect.height);if(width<1||height<1)return;
    const styles=getComputedStyle(editor),fontSize=parseFloat(styles.fontSize)||state.settings.fontSize,cell=editorLayout.cellWidth||fontSize*.6,scale=Math.min(.18,Math.max(.04,(width-16)/Math.max(1,editor.clientWidth))),lineHeight=editorLayout.lineHeight;
    const view=minimapState={...minimapGeometry(height,scale,editor.scrollHeight,editor.clientHeight,editor.scrollTop),height,width};
    const thumb=$('minimapViewport');thumb.style.top=`${view.top}px`;thumb.style.height=`${view.thumb}px`;
    panel.setAttribute('aria-valuemax',String(Math.round(view.maxScroll)));panel.setAttribute('aria-valuenow',String(Math.min(Math.round(view.maxScroll),Math.round(editor.scrollTop))));
    const occurrences=typeof currentOccurrenceHighlights==='function'?currentOccurrenceHighlights():null,matches=occurrences?.matches;
    const ratio=Math.min(2,window.devicePixelRatio||1),key=[file.id,file.content,file.mode,document.body.dataset.theme,state.settings.editorPreferencesUpdatedAt,state.settings.fontSize,editorLayout.key,width,height,view.offset,ratio,matches];
    if(minimapPaintKey&&key.every((value,i)=>value===minimapPaintKey[i]))return;minimapPaintKey=key;
    const context=canvas.getContext('2d');if(!context)return;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);context.font=`${styles.fontStyle||'normal'} ${styles.fontWeight||'400'} ${fontSize*scale}px ${styles.fontFamily}`;context.textBaseline='top';
    const colors=getComputedStyle(document.body),palette={};for(const name of ['text','comment','string','property','command','number','keyword','variable','operator','heading','fence','code','emphasis'])palette[name]=colors.getPropertyValue('--syntax-'+name)||colors.getPropertyValue('--'+({property:'key',command:'key',operator:'muted',heading:'keyword',fence:'comment',code:'string',emphasis:'key'}[name]||name));
    const kindColor={comment:'comment',string:'string',property:'property',number:'number',keyword:'keyword',variable:'variable',command:'command',operator:'operator',heading:'heading',fence:'fence',code:'code',emphasis:'emphasis'};
    const starts=editorLineStarts(),offsets=editorLayout.offsets,fromY=Math.max(0,(view.offset-8)/scale),toY=(height+view.offset)/scale;
    let first=0,high=starts.length;while(first+1<high){const mid=(first+high)>>1;if(offsets[mid]<=fromY)first=mid;else high=mid;}
    let last=first;while(last+1<starts.length&&offsets[last+1]<=toY)last++;
    const from=starts[first],to=starts[last+1]??editor.value.length;
    // Bound a single minified line instead of copying it into another large DOM.
    const runs=to-from<=200000?previewRuns(file,from,to):[];let runIndex=0;
    const columns=Math.max(1,Math.floor((editor.clientWidth-(parseFloat(styles.paddingLeft)||0)-(parseFloat(styles.paddingRight)||0))/cell)),tabSize=typeof editorTabSize==='function'?editorTabSize():2;
    let occurrenceIndex=matches?.length?occurrenceMatchIndex(matches,from):0;
    for(let line=first;line<=last;line++){
      if(editorLayout.hidden?.[line])continue;
      const start=starts[line],end=(starts[line+1]??editor.value.length+1)-1,text=editor.value.slice(start,end),bottom=offsets[line+1]??Math.max(offsets[line]+lineHeight,editor.scrollHeight-(parseFloat(styles.paddingTop)||0)-(parseFloat(styles.paddingBottom)||0)),rows=Math.max(1,Math.round((bottom-offsets[line])/lineHeight));
      const firstRow=Math.max(0,Math.floor((fromY-offsets[line])/lineHeight)),lastRow=Math.min(rows-1,Math.ceil((toY-offsets[line])/lineHeight));
      const begin=text.length>200000&&state.settings.wrap?Math.max(0,(firstRow-1)*columns):0;
      const maxChars=Math.min(text.length,begin+Math.min(200000,state.settings.wrap?Math.max(2000,(lastRow+1)*columns+columns-begin):Math.max(300,columns)));
      const lineRuns=runs.length?runs:previewRuns(file,start+begin,start+maxChars);
      let column=begin,at=start+begin;while(runIndex<lineRuns.length&&lineRuns[runIndex].end<=at)runIndex++;let tokenIndex=runIndex;
      let chunk=null;
      const flush=()=>{if(chunk?.text.trim()){
        const x=8+chunk.col*cell*scale,y=8+(offsets[line]+chunk.row*lineHeight)*scale-view.offset;
        if(chunk.matched){context.fillStyle=palette.number;context.globalAlpha=.45;context.fillRect(x,y,Math.max(3,chunk.text.length*cell*scale),Math.max(3,lineHeight*scale));context.globalAlpha=1;}
        context.fillStyle=palette[kindColor[chunk.kind]||'text'];context.fillText(chunk.text,x,y);
      }chunk=null;};
      for(let i=begin;i<maxChars;i++,at++){
        const char=text[i],row=state.settings.wrap?Math.min(rows-1,Math.floor(column/columns)):0,col=state.settings.wrap?column%columns:column;
        if(row>=firstRow&&row<=lastRow&&col*cell*scale<width-16&&char!=='\t'){
          while(tokenIndex<lineRuns.length&&lineRuns[tokenIndex].end<=at)tokenIndex++;const token=lineRuns[tokenIndex],kind=token&&token.start<=at?token.kind.replace('tok-',''):'';
          while(matches&&occurrenceIndex<matches.length&&matches[occurrenceIndex].end<=at)occurrenceIndex++;
          const matched=Boolean(matches?.[occurrenceIndex]&&matches[occurrenceIndex].start<=at&&matches[occurrenceIndex].end>at);
          if(chunk&&(chunk.kind!==kind||chunk.row!==row||chunk.matched!==matched))flush();if(!chunk)chunk={kind,row,col,matched,text:''};chunk.text+=char;
        }else flush();
        column+=char==='\t'?tabSize-column%tabSize:1;
      }
      flush();
    }
    if(matches?.length){context.fillStyle=palette.number;for(const y of minimapMatchRows(matches,view,columns))context.fillRect(width-4,y,3,2);}
  }
  function wireMinimap(){
    actions.minimap=toggleMinimap;
    const panel=$('editorMinimap');
    panel.addEventListener('pointerdown',event=>{
      if(event.button!==0||!minimapState)return;event.preventDefault();panel.focus({preventScroll:true});
      const local=event.clientY-panel.getBoundingClientRect().top,view=minimapState;
      if(local<view.top||local>view.top+view.thumb)minimapScrollTo(event.clientY);
      minimapDrag={id:event.pointerId,y:event.clientY,top:editor.scrollTop,ratio:view.overflow?view.maxScroll/Math.max(1,view.usable-view.thumb):1/view.scale};panel.setPointerCapture(event.pointerId);
    });
    panel.addEventListener('pointermove',event=>{if(minimapDrag?.id!==event.pointerId)return;event.preventDefault();editor.scrollTop=Math.max(0,Math.min(minimapState.maxScroll,minimapDrag.top+(event.clientY-minimapDrag.y)*minimapDrag.ratio));syncScroll();});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])panel.addEventListener(name,event=>{if(minimapDrag?.id!==event.pointerId)return;minimapDrag=null;if(panel.hasPointerCapture(event.pointerId))panel.releasePointerCapture(event.pointerId);});
    panel.addEventListener('keydown',event=>{
      const delta={ArrowUp:-editorLayout.lineHeight*3,ArrowDown:editorLayout.lineHeight*3,PageUp:-editor.clientHeight*.9,PageDown:editor.clientHeight*.9,Home:-editor.scrollHeight,End:editor.scrollHeight}[event.key];
      if(delta===undefined)return;event.preventDefault();event.stopPropagation();editor.scrollTop+=delta;syncScroll();
    });
    panel.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey)return;event.preventDefault();editor.scrollTop+=event.deltaY*(event.deltaMode===1?editorLayout.lineHeight:event.deltaMode===2?editor.clientHeight:1);syncScroll();},{passive:false});
    if(typeof ResizeObserver==='function')new ResizeObserver(scheduleMinimap).observe(panel);
    window.addEventListener?.('resize',scheduleMinimap);
  }
