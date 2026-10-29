  const codeRecords=new Map();
  let codeView=null,codeAdapter=null,codeBeforeInput=null,codeDecorationFrame=0;
  let foldHoverPoint=null,foldHoverFrame=0;
  function releaseClosedCodeRecords(ids){for(const id of ids)codeRecords.delete(id);}
  function clearEmptyCodeView(){
    codeRecords.clear();codeView=null;codeBeforeInput=null;foldHoverPoint=null;
    $('foldGutter').classList.remove('controls-visible');
    if(codeAdapter)codeAdapter.value.set.call(editor,'');
    const controls=$('foldControls');controls.foldKey=null;controls.foldMarkup=null;
  }
  function changedCodeRange(before,after,selection=null){
    let from=0,suffix=0,limit=selection?selection.start:Math.min(before.length,after.length);
    while(from<limit&&from<before.length&&from<after.length&&before[from]===after[from])from++;
    const maximum=selection?before.length-selection.end:before.length-from;
    while(suffix<maximum&&suffix<before.length-from&&suffix<after.length-from&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
    return {from,to:before.length-suffix,insert:after.slice(from,after.length-suffix)};
  }
  function updateCodeRecord(record,text,mode=record.mode){
    if(record.text===text&&record.mode===mode)return record;
    const change=changedCodeRange(record.text,text),delta=change.insert.length-(change.to-change.from),retained=new Set(),previous=new Map(record.structure.regions.map(region=>[region.key,region]));
    if(record.mode===mode)for(const key of record.collapsed){const old=previous.get(key);if(!old)continue;
      if(change.to<=old.start)retained.add(`${old.type}:${old.start+delta}:${old.end+delta}`);
      else if(change.from>old.end)retained.add(old.key);
    }
    record.text=text;record.mode=mode;record.structure=sourceStructure(text,mode);record.collapsed=new Set(record.structure.regions.filter(region=>retained.has(region.key)).map(region=>region.key));record.revision++;
    return record;
  }
  function codeRecord(text=editor.value){
    const file=state&&note();if(!file)return null;
    let record=codeRecords.get(file.id);
    if(!record){record={id:file.id,text,mode:file.mode,structure:sourceStructure(text,file.mode),collapsed:new Set(),revision:0};codeRecords.set(file.id,record);}
    else updateCodeRecord(record,text,file.mode);
    return record;
  }
  function codeProjection(record){
    if(record.projectionRevision===record.revision&&record.projection)return record.projection;
    if(record.spacingText!==record.text||record.spacingMode!==record.mode){record.spacingText=record.text;record.spacingMode=record.mode;record.colorGaps=typeof planColorSpacing==='function'?planColorSpacing(record.text,record.mode):[];}
    const projection=foldProjection(record.text,record.structure.regions.filter(region=>record.collapsed.has(region.key)));
    record.projectionRevision=record.revision;return record.projection=typeof addColorSpacing==='function'?addColorSpacing(projection,record.colorGaps):projection;
  }
  function nativeCodeSelection(){
    const projection=codeView?.projection;return {start:projection?foldSourceOffset(projection,codeAdapter.start.get.call(editor)):codeAdapter.start.get.call(editor),end:projection?foldSourceOffset(projection,codeAdapter.end.get.call(editor)):codeAdapter.end.get.call(editor),direction:editor.selectionDirection};
  }
  function refreshCodeProjection(record,selection=null){
    if(!codeAdapter)return;
    selection=selection||nativeCodeSelection();const projection=codeProjection(record);codeView={record,projection};
    if(codeAdapter.value.get.call(editor)!==projection.text)codeAdapter.value.set.call(editor,projection.text);
    codeAdapter.select.call(editor,foldDisplayOffset(projection,selection.start),foldDisplayOffset(projection,selection.end),selection.direction||'none');
  }
  function syncCodeView(){
    if(!codeAdapter||!state||!note())return;
    if(codeView?.record.id===note().id&&codeView.record.mode===note().mode)return;
    if(codeView?.record.id!==note().id&&codeView){delete codeView.record.projection;delete codeView.record.projectionRevision;delete codeView.record.spacingText;delete codeView.record.colorGaps;}
    const selection=codeView?nativeCodeSelection():{start:0,end:0},record=codeRecord(codeView?.record.id===note().id?codeView.record.text:note().content);refreshCodeProjection(record,selection);
  }
  function codeFoldKey(){const record=codeRecord();return record?`${record.id}:${record.revision}`:'';}
  function codeLineHidden(line){const record=codeRecord();if(!record)return false;const ranges=codeProjectionForCurrent().ranges,at=record.structure.starts[line];let low=0,high=ranges.length;while(low<high){const mid=(low+high)>>1;if(ranges[mid].to<=at)low=mid+1;else high=mid;}return Boolean(ranges[low]&&at>=ranges[low].from&&at<ranges[low].to);}
  function codeProjectionForCurrent(){const record=codeRecord();return codeView?.record===record?codeView.projection:record?codeProjection(record):{text:editor.value,ranges:[]};}
  function revealCodeRange(start,end=start){
    const record=codeRecord();if(!record||!record.collapsed.size)return false;
    let changed=false;for(const region of record.structure.regions)if(record.collapsed.has(region.key)&&(start===end?start>=region.from&&start<region.to:start<region.to&&end>region.from)){record.collapsed.delete(region.key);changed=true;}
    if(changed){record.revision++;refreshCodeProjection(record);editorLayout.key=null;}
    return changed;
  }
  function updateFoldHover(){
    let visible=false;const gutter=$('foldGutter'),point=foldHoverPoint;
    if(point&&!gutter.hidden&&!$('notePane').hidden){
      const target=document.elementFromPoint(point.x,point.y),rect=editor.getBoundingClientRect();
      if(target?.closest('#editorArea')&&!target.closest('#editorMinimap,.editor-scrollbar,.editor-scrollbar-corner')&&point.x<rect.right&&point.y>=rect.top&&point.y<rect.top+editor.clientHeight){
        visible=Boolean(target.closest('#foldGutter'));
      }
    }
    // Fade the persistent bar, so moving between controls or rebuilding its
    // buttons after a fold does not start separate, partially visible fades.
    gutter.classList.toggle('controls-visible',visible);
  }
  function scheduleFoldHover(){
    if(!foldHoverFrame)foldHoverFrame=requestAnimationFrame(()=>{foldHoverFrame=0;updateFoldHover();});
  }
  function renderFoldControls(){
    const record=codeRecord(),gutter=$('foldGutter');if(!gutter)return;
    gutter.hidden=!record||record.mode==='text';scheduleFoldHover();const controls=$('foldControls');if(!record||gutter.hidden)return;
    controls.style.transform=`translateY(${-editor.scrollTop}px)`;
    const height=editorLayout.lineHeight,overscan=height*3,top=Math.max(0,Math.floor(editor.scrollTop/height)*height-overscan),bottom=Math.ceil((editor.scrollTop+Math.max(editor.clientHeight||0,height))/height)*height+overscan;
    const focused=document.activeElement?.closest?.('[data-fold-key]')?.dataset.foldKey;
    const key=`${record.id}:${record.revision}:${editorLayout.key}:${top}:${bottom}:${focused||''}`;if(controls.foldKey===key)return;controls.foldKey=key;
    for(const id of codeRecords.keys())if(id!==record.id&&!state.settings.openIds?.includes(id))codeRecords.delete(id);
    const byLine=new Map();for(const region of record.structure.regions){const offset=editorLayout.offsets[region.first]||0;if((offset>=top&&offset<=bottom||region.key===focused)&&!codeLineHidden(region.first)&&(!byLine.has(region.first)||record.collapsed.has(region.key)&&!record.collapsed.has(byLine.get(region.first).key)))byLine.set(region.first,region);}
    const markup=[...byLine.values()].map(region=>{const folded=record.collapsed.has(region.key);return `<button type="button" class="fold-toggle${folded?' folded':''}" data-fold-key="${region.key}" data-fold-line="${region.first}" style="top:${editorLayout.offsets[region.first]||0}px;height:${editorLayout.lineHeight}px" aria-expanded="${!folded}" aria-label="${folded?'Expand':'Collapse'} ${escape(region.label)}, lines ${region.first+1} to ${region.last+1}"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="${folded?'M4 2 13 8 4 14Z':'M2 4 14 4 8 13Z'}"/></svg></button>`;}).join('');
    if(controls.foldMarkup!==markup){controls.innerHTML=markup;controls.foldMarkup=markup;if(focused)[...controls.querySelectorAll('[data-fold-key]')].find(button=>button.dataset.foldKey===focused)?.focus({preventScroll:true});}
  }
  function toggleCodeFold(key,expand=null){
    const record=codeRecord(),region=record?.structure.regions.find(region=>region.key===key);if(!region)return;
    const selection=codeAdapter?nativeCodeSelection():{start:editor.selectionStart,end:editor.selectionEnd};
    const open=expand??record.collapsed.has(key);
    if(open){for(const child of record.structure.regions)if(child.start>=region.start&&child.end<=region.end)record.collapsed.delete(child.key);}else{
      record.collapsed.add(key);
      if(selection.start>=region.from&&selection.start<region.to)selection.start=region.from-1;
      if(selection.end>=region.from&&selection.end<region.to)selection.end=selection.start;
    }
    record.revision++;closeCompletions();refreshCodeProjection(record,selection);editorLayout.key=null;paintEditor();editor.focus({preventScroll:true});
  }
  function foldCurrentSection(expand=false){
    const record=codeRecord();if(!record)return;
    const at=editor.selectionStart,line=editorLineAt(at),candidates=record.structure.regions.filter(region=>(region.first===line||region.start<=at&&region.end>=at)&&(!expand||record.collapsed.has(region.key))).sort((a,b)=>(a.end-a.start)-(b.end-b.start));
    let region=candidates.find(region=>expand||!record.collapsed.has(region.key));
    if(!region&&expand)region=record.structure.regions.find(region=>record.collapsed.has(region.key)&&region.first>=line);
    if(region)toggleCodeFold(region.key,expand);
  }
  function foldAllSections(expand=false){
    const record=codeRecord();if(!record)return;
    const selection=codeAdapter?nativeCodeSelection():{start:editor.selectionStart,end:editor.selectionEnd};
    record.collapsed=expand?new Set():new Set(record.structure.regions.map(region=>region.key));record.revision++;
    if(!expand){const outer=codeProjection(record).ranges.find(region=>selection.start>=region.from&&selection.start<region.to);if(outer)selection.start=selection.end=outer.from-1;}
    refreshCodeProjection(record,selection);editorLayout.key=null;paintEditor();editor.focus({preventScroll:true});
  }
  function codeDisplaySelection(){
    const direction=editor.selectionDirection||'none';
    if(codeAdapter&&codeView?.record.id===state?.activeId)return {start:codeAdapter.start.get.call(editor),end:codeAdapter.end.get.call(editor),direction};
    const projection=codeProjectionForCurrent();return {start:foldDisplayOffset(projection,editor.selectionStart),end:foldDisplayOffset(projection,editor.selectionEnd),direction};
  }
  function codeDisplayCaretColumn(lineStart){
    const selection=codeDisplaySelection(),focus=selection.direction==='backward'?selection.start:selection.end;
    return focus-foldDisplayOffset(codeProjectionForCurrent(),lineStart,'left');
  }
  function decorateCodeStructure(html){
    const record=codeRecord();if(!record)return html;
    const tags=matchingHtmlTagRanges(record.structure,editor.selectionStart);
    if(tags.length)html=decorateSearchRanges(html,tags,null,'tag-pair');
    html=projectFoldedHTML(html,codeProjectionForCurrent());
    const selection=codeDisplaySelection();
    if(selection.end>selection.start){
      // Decorate the visible projection so hidden newlines never leave marks.
      html=decorateSearchRanges(html,[selection],null,'editor-selection',text=>text.replace(/\n/g,'<span class="editor-selection-newline" aria-hidden="true"></span>\n'));
      if(document.activeElement===editor){const focus=selection.direction==='backward'?selection.start:selection.end;html=decorateSearchRanges(html,[{start:focus,end:focus}],null,'editor-selection-caret');}
    }
    return html;
  }
  function scheduleCodeDecorations(){
    if(codeDecorationFrame)return;codeDecorationFrame=requestAnimationFrame(()=>{codeDecorationFrame=0;if(ready&&note()&&!$('notePane').hidden)paintEditor();});
  }
  function wireCodeStructure(){
    // The native editing surface displays a projection. Its public value and
    // selection APIs keep source offsets, so saves, search and edits retain the
    // complete file, including text hidden inside a collapsed section.
    if(typeof HTMLTextAreaElement==='function'){
      const proto=HTMLTextAreaElement.prototype;codeAdapter={value:Object.getOwnPropertyDescriptor(proto,'value'),start:Object.getOwnPropertyDescriptor(proto,'selectionStart'),end:Object.getOwnPropertyDescriptor(proto,'selectionEnd'),select:proto.setSelectionRange};
      const ownSelection=(start,end,direction)=>{
        if(codeView){const changed=revealCodeRange(start,end);codeAdapter.select.call(editor,foldDisplayOffset(codeView.projection,start),foldDisplayOffset(codeView.projection,end),direction);if(changed){editorLayout.key=null;paintEditor();}}
        else codeAdapter.select.call(editor,start,end,direction);
      };
      Object.defineProperty(editor,'value',{configurable:true,get(){return codeView?.record.id===state?.activeId?codeView.record.text:codeAdapter.value.get.call(this);},set(value){
        const text=String(value),record=state&&note()?codeRecord(text):null;
        if(!record){codeView=null;codeAdapter.value.set.call(this,text);return;}
        const projection=codeProjection(record);codeView={record,projection};codeAdapter.value.set.call(this,projection.text);
      }});
      for(const name of ['selectionStart','selectionEnd'])Object.defineProperty(editor,name,{configurable:true,get(){const raw=codeAdapter[name==='selectionStart'?'start':'end'].get.call(this);return codeView?foldSourceOffset(codeView.projection,raw):raw;},set(value){const selection=nativeCodeSelection();ownSelection(name==='selectionStart'?Number(value):selection.start,name==='selectionEnd'?Number(value):selection.end,selection.direction);}});
      editor.setSelectionRange=ownSelection;
      editor.setRangeText=function(insert,start=this.selectionStart,end=this.selectionEnd,mode='preserve'){
        const before=this.value,selection={start:this.selectionStart,end:this.selectionEnd,direction:this.selectionDirection};insert=String(insert);start=Math.max(0,Math.min(before.length,start));end=Math.max(start,Math.min(before.length,end));
        this.value=before.slice(0,start)+insert+before.slice(end);const delta=insert.length-(end-start);
        if(mode==='select')ownSelection(start,start+insert.length,selection.direction);else if(mode==='start')ownSelection(start,start,selection.direction);else if(mode==='end')ownSelection(start+insert.length,start+insert.length,selection.direction);
        else{const map=at=>at<=start?at:at>=end?at+delta:start+insert.length;ownSelection(map(selection.start),map(selection.end),selection.direction);}
      };
      editor.addEventListener('beforeinput',event=>{
        if(!codeView||event.defaultPrevented)return;
        const record=codeView.record,selection=nativeCodeSelection();let changed=false;
        const rawStart=codeAdapter.start.get.call(editor),rawEnd=codeAdapter.end.get.call(editor),inputType=event.inputType||'';
        const paddingEdit=/^delete/.test(inputType)&&(codeView.projection.pads||[]).some(pad=>rawStart<rawEnd?rawStart<pad.displayAt+pad.length&&rawEnd>pad.displayAt:inputType.includes('Backward')?rawStart>pad.displayAt&&rawStart<=pad.displayAt+pad.length:rawStart>=pad.displayAt&&rawStart<pad.displayAt+pad.length);
        for(const region of record.structure.regions)if(record.collapsed.has(region.key)){
          const crossing=selection.start<region.to&&selection.end>region.from;
          const touching=/^delete/.test(event.inputType||'')&&selection.start<=region.to&&selection.end>=region.from-1;
          if(crossing||touching){record.collapsed.delete(region.key);changed=true;}
        }
        if(changed||paddingEdit){
          if(changed)record.revision++;refreshCodeProjection(record,selection);editorLayout.key=null;paintEditor();
          // WebKit cancels its pending edit after the display value changes.
          // Apply boundary edits once, with the original source selection.
          const type=event.inputType||'';let start=selection.start,end=selection.end,insert=null;
          if(/^delete/.test(type)){
            insert='';if(start===end){
              if(type==='deleteContentBackward'){start=Math.max(0,start-1);if(start>0&&/[\uDC00-\uDFFF]/.test(record.text[start])&&/[\uD800-\uDBFF]/.test(record.text[start-1]))start--;}
              else if(type==='deleteContentForward'){end=Math.min(record.text.length,end+1);if(end<record.text.length&&/[\uD800-\uDBFF]/.test(record.text[end-1])&&/[\uDC00-\uDFFF]/.test(record.text[end]))end++;}
              else if(type==='deleteWordBackward')start-=record.text.slice(0,start).match(/\S+\s*$|\s+$/u)?.[0].length||0;
              else if(type==='deleteWordForward')end+=record.text.slice(end).match(/^\s*\S+|^\s+/u)?.[0].length||0;
              else if(type==='deleteSoftLineBackward'||type==='deleteHardLineBackward')start=record.text.lastIndexOf('\n',Math.max(0,start-1))+1;
              else if(type==='deleteSoftLineForward'||type==='deleteHardLineForward'){const next=record.text.indexOf('\n',end);end=next<0?record.text.length:next;}
            }
          }else if(type==='insertLineBreak'||type==='insertParagraph')insert='\n';
          else if(typeof event.data==='string')insert=event.data;
          event.preventDefault();event.stopImmediatePropagation();
          if(insert!==null&&(!/^delete/.test(type)||end>start))replaceText(start,end,insert);
          return;
        }
        codeBeforeInput={text:codeView.projection.text,start:codeAdapter.start.get.call(editor),end:codeAdapter.end.get.call(editor)};
      },true);
      editor.addEventListener('input',()=>{
        if(!codeView)return;const raw=codeAdapter.value.get.call(editor),before=codeBeforeInput?.text===codeView.projection.text?codeBeforeInput:null,change=changedCodeRange(codeView.projection.text,raw,before);codeBeforeInput=null;
        const previousProjection=codeView.projection,from=foldSourceOffset(previousProjection,change.from),to=change.from===change.to?from:foldSourceOffset(previousProjection,change.to,'left');
        const record=codeView.record,text=record.text.slice(0,from)+change.insert+record.text.slice(to),start=codeAdapter.start.get.call(editor),end=codeAdapter.end.get.call(editor);
        updateCodeRecord(record,text);const projection=codeProjection(record);codeView={record,projection};
        if(projection.text!==raw){
          const sourceAt=at=>at<=change.from?foldSourceOffset(previousProjection,at):at<=change.from+change.insert.length?from+at-change.from:foldSourceOffset(previousProjection,at-change.insert.length+change.to-change.from)+change.insert.length-(to-from);
          refreshCodeProjection(record,{start:sourceAt(start),end:sourceAt(end)});
        }
      },true);
    }
    editor.addEventListener('keydown',event=>{
      if(!codeAdapter||!codeView?.projection.pads?.length||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      const start=codeAdapter.start.get.call(editor),end=codeAdapter.end.get.call(editor);if(start!==end)return;
      const pad=codeView.projection.pads.find(pad=>event.key==='ArrowLeft'?start>pad.displayAt&&start<=pad.displayAt+pad.length:start>=pad.displayAt&&start<pad.displayAt+pad.length);
      if(pad){event.preventDefault();const at=event.key==='ArrowLeft'?pad.displayAt:pad.displayAt+pad.length;codeAdapter.select.call(editor,at,at);scheduleCodeDecorations();}
    },true);
    $('foldControls').addEventListener('click',event=>{const button=event.target.closest('[data-fold-key]');if(button)toggleCodeFold(button.dataset.foldKey);});
    $('editorArea').addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;foldHoverPoint={x:event.clientX,y:event.clientY};scheduleFoldHover();});
    const clearFoldHover=()=>{foldHoverPoint=null;updateFoldHover();};
    $('editorArea').addEventListener('pointerleave',clearFoldHover);
    for(const type of ['copy','cut'])editor.addEventListener(type,event=>{
      if(!codeView||!event.clipboardData)return;
      const start=editor.selectionStart,end=editor.selectionEnd;if(end<=start||!codeView.projection.ranges.some(range=>start<range.to&&end>range.from)&&!codeView.projection.pads?.some(pad=>pad.at>=start&&pad.at<=end))return;
      event.clipboardData.setData('text/plain',editor.value.slice(start,end));event.preventDefault();
      if(type==='cut'&&!editor.readOnly)replaceText(start,end,'');
    });
    editor.addEventListener('paste',event=>{
      if(event.defaultPrevented||editor.readOnly||!event.clipboardData||!codeView)return;
      const start=editor.selectionStart,end=editor.selectionEnd;if(!codeView.projection.ranges.some(range=>start<range.to&&end>range.from)&&!codeView.projection.pads?.some(pad=>pad.at>=start&&pad.at<=end))return;
      event.preventDefault();replaceText(start,end,event.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n'));
    });
    for(const name of ['click','keyup','select','pointerup','focus','blur'])editor.addEventListener(name,scheduleCodeDecorations);
    document.addEventListener('selectionchange',()=>{if(document.activeElement===editor)scheduleCodeDecorations();});
    actions.fold=()=>foldCurrentSection(false);actions.unfold=()=>foldCurrentSection(true);actions.foldAll=()=>foldAllSections(false);actions.unfoldAll=()=>foldAllSections(true);
  }
