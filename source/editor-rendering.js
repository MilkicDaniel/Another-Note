  const lineMeasure=document.createElement('div');lineMeasure.className='line-measure';lineMeasure.setAttribute('aria-hidden','true');document.body.append(lineMeasure);
  const editorLayout={text:null,starts:[0],key:null,offsets:[],rows:[],activeRow:null,lineHeight:24};
  const editorSyntax={text:null,mode:null,html:'',rendered:null,windowIndex:null,windowKey:null,windowMarkup:null};
  function releaseEmptyEditorView(){
    if(typeof clearEmptyCodeView==='function')clearEmptyCodeView();
    Object.assign(editorSyntax,{text:null,mode:null,html:'',rendered:null,windowIndex:null,windowKey:null,windowMarkup:null});
    Object.assign(editorLayout,{text:null,key:null,starts:[0],offsets:[],hidden:[],visibleLines:[],rows:[],activeRow:null,caretRow:null,totalHeight:0,textWidth:0});
    for(const id of ['highlightCode','lineNumbers','foldControls','editorColorSwatches'])$(id).innerHTML='';
    $('highlightCode').classList.remove('highlight-window');$('highlightCode').style.paddingTop='';$('highlightCode').style.paddingBottom='';
    lineMeasure.innerHTML='';
    if(typeof clearEditorColorState==='function')clearEditorColorState();
  }
  function editorLineStarts(){
    const text=editor.value;
    if(editorLayout.text!==text){
      editorLayout.text=text;editorLayout.starts=[0];editorLayout.key=null;
      for(let at=text.indexOf('\n');at!==-1;at=text.indexOf('\n',at+1))editorLayout.starts.push(at+1);
    }
    return editorLayout.starts;
  }
  function editorLineAt(offset){
    const starts=editorLineStarts();let low=0,high=starts.length;
    while(low+1<high){const middle=(low+high)>>1;if(starts[middle]<=offset)low=middle;else high=middle;}
    return low;
  }
  function updateLineNumbers(){
    if(!state||!note()||$('editorArea').hidden)return;
    const starts=editorLineStarts(),styles=getComputedStyle(editor),lineHeight=parseFloat(styles.lineHeight)||24;
    const availableWidth=editor.clientWidth-(parseFloat(styles.paddingLeft)||0)-(parseFloat(styles.paddingRight)||0),width=Math.max(1,availableWidth);
    const showNumbers=note().lineNumbers!==false;
    const foldKey=typeof codeFoldKey==='function'?codeFoldKey():'';
    const key=JSON.stringify([showNumbers,foldKey,state.settings.wrap,state.settings.wrap?width:0,styles.fontFamily,styles.fontWeight,styles.fontStyle,styles.fontSize,styles.lineHeight,styles.tabSize,styles.letterSpacing,styles.wordSpacing]);
    if(editorLayout.key===key)return;
    const hidden=starts.map((_,line)=>typeof codeLineHidden==='function'&&codeLineHidden(line));
    const offsets=[],heights=[],visibleLines=[];let offset=0,visible=0;
    // An unmapped native view has no usable width. Its first allocation
    // invalidates this key; measuring it as a one-pixel editor is wasted work.
    if(state.settings.wrap&&availableWidth>0){
      const cellKey=JSON.stringify([styles.fontFamily,styles.fontWeight,styles.fontStyle,styles.fontSize,styles.lineHeight,styles.letterSpacing,styles.wordSpacing]);
      if(editorLayout.cellKey!==cellKey){
        lineMeasure.style.width='max-content';lineMeasure.style.whiteSpace='pre';
        lineMeasure.innerHTML='<span data-editor-cell>'+('0'.repeat(64))+'</span><span data-editor-wide>'+('W'.repeat(64))+'</span><span data-editor-narrow>'+('i'.repeat(64))+'</span>';
        editorLayout.cellWidth=lineMeasure.querySelector('[data-editor-cell]')?.getBoundingClientRect().width/64||0;
        const wide=lineMeasure.querySelector('[data-editor-wide]')?.getBoundingClientRect().width/64,narrow=lineMeasure.querySelector('[data-editor-narrow]')?.getBoundingClientRect().width/64;editorLayout.fixedWidth=Number.isFinite(wide)&&Number.isFinite(narrow)&&Math.abs(wide-editorLayout.cellWidth)<.05&&Math.abs(narrow-editorLayout.cellWidth)<.05;
        editorLayout.cellKey=cellKey;lineMeasure.style.whiteSpace='';
      }
      lineMeasure.style.width=`${width}px`;
      const measured=[];
      for(let index=0;index<starts.length;index++){
        if(hidden[index]){heights[index]=0;continue;}
        const end=index+1<starts.length?starts[index+1]-1:editor.value.length,text=typeof codeDisplayText==='function'?codeDisplayText(starts[index],end):editor.value.slice(starts[index],end);
        // Short ASCII lines in the fixed-width editor cannot wrap. Tabs,
        // Unicode and longer lines retain exact browser measurement.
        if(editorLayout.fixedWidth&&editorLayout.cellWidth&&text.length*editorLayout.cellWidth<=width-editorLayout.cellWidth&&/^[\x20-\x7e]*$/.test(text))heights[index]=lineHeight;
        else measured.push({index,text});
      }
      lineMeasure.innerHTML=measured.map(line=>`<div>${escape(line.text)||'\u200b'}</div>`).join('');
      [...lineMeasure.children].forEach((child,index)=>heights[measured[index].index]=Math.max(lineHeight,child.getBoundingClientRect().height));
    }
    for(let i=0;i<starts.length;i++){offsets.push(offset);visibleLines.push(visible);if(!hidden[i])visible++;offset+=hidden[i]?0:heights[i]||lineHeight;}
    $('lineNumbers').innerHTML=showNumbers?offsets.map((_,i)=>`<div${hidden[i]?' hidden':''}${state.settings.wrap?` style="height:${hidden[i]?0:heights[i]||lineHeight}px"`:''}>${i+1}</div>`).join(''):'';
    Object.assign(editorLayout,{key,offsets,hidden,visibleLines,rows:[...$('lineNumbers').children],activeRow:null,lineHeight,totalHeight:offset,textWidth:width,caretRow:null});
  }
  function indexHighlightLines(html){
    // Index generated markup once. Reopening its inline tags keeps clipped
    // multiline tokens, selections and spelling marks balanced on screen.
    const lines=[{at:0,open:[]}],open=[];
    for(const match of html.matchAll(/<[^>]*>|[^<]+/g)){
      const token=match[0];
      if(token[0]==='<'){
        if(/^<\//.test(token))open.pop();
        else if(!/\/>$/.test(token)){const name=/^<([a-z]+)/i.exec(token)?.[1];if(name&&!['br','hr','img','input'].includes(name))open.push({name,html:token});}
      }else for(let at=token.indexOf('\n');at!==-1;at=token.indexOf('\n',at+1))lines.push({at:match.index+at+1,open:[...open]});
    }
    return lines;
  }
  function renderHighlightViewport(){
    // The textarea retains the complete projected text and native editing.
    // Only the display layer is windowed; spacers retain its scroll geometry.
    const html=editorSyntax.rendered;if(html===null)return;
    const code=$('highlightCode'),offsets=editorLayout.offsets,viewport=editor.clientHeight||600;
    let markup=html,top=0,bottom=0,windowed=false,key=html;
    if(editorLayout.starts.length>200&&typeof editor.clientHeight==='number'&&editorLayout.totalHeight>viewport*2){
      const overscan=editorLayout.lineHeight*6;
      const atY=y=>{let low=0,high=offsets.length;while(low+1<high){const mid=(low+high)>>1;if(offsets[mid]<=y)low=mid;else high=mid;}return low;};
      const first=atY(Math.max(0,editor.scrollTop-overscan)),last=atY(editor.scrollTop+viewport+overscan),from=editorLayout.visibleLines[first],to=editorLayout.visibleLines[last]+(editorLayout.hidden[last]?0:1);
      key=[html,editorLayout.key,first,last];if(editorSyntax.windowKey&&Array.isArray(editorSyntax.windowKey)&&key.every((value,i)=>value===editorSyntax.windowKey[i]))return;
      const lines=editorSyntax.windowIndex||(editorSyntax.windowIndex=indexHighlightLines(html)),start=lines[from],end=lines[to];
      if(start){
        markup=start.open.map(tag=>tag.html).join('')+html.slice(start.at,end?.at??html.length)+(end?[...end.open].reverse().map(tag=>`</${tag.name}>`).join(''):'');
        top=offsets[first];bottom=Math.max(0,editorLayout.totalHeight-(offsets[last+1]??editorLayout.totalHeight));windowed=true;
      }
    }else if(editorSyntax.windowKey===key)return;
    editorSyntax.windowKey=key;code.classList.toggle('highlight-window',windowed);code.style.paddingTop=windowed?top+'px':'';code.style.paddingBottom=windowed?bottom+'px':'';
    if(editorSyntax.windowMarkup!==markup){code.innerHTML=markup;editorSyntax.windowMarkup=markup;}
  }
  function paintEditor(){
    const n=note();if(!n)return;
    if(typeof syncCodeView==='function')syncCodeView();
    if(editorSyntax.text!==editor.value||editorSyntax.mode!==n.mode){editorSyntax.text=editor.value;editorSyntax.mode=n.mode;editorSyntax.html=colorCode(editor.value,n.mode);}
    const occurrences=typeof decorateOccurrenceMatches==='function'?decorateOccurrenceMatches(editorSyntax.html):editorSyntax.html;
    const decorated=decorateEditorMatches(decorateSpelling(occurrences));
    const html=(typeof decorateCodeStructure==='function'?decorateCodeStructure(decorated):decorated)+(editor.value.endsWith('\n')?'\n':'');
    // Query changes only alter marks; unchanged syntax and gutter geometry are reused.
    if(editorSyntax.rendered!==html){editorSyntax.rendered=html;editorSyntax.windowIndex=null;editorSyntax.windowKey=null;}
    updateLineNumbers();syncScroll();updatePosition();refreshSpellcheck();
  }
  function syncScroll(){
    renderHighlightViewport();
    $('highlight').scrollTop=editor.scrollTop;$('highlight').scrollLeft=editor.scrollLeft;
    $('lineNumbers').style.transform=`translateY(${-editor.scrollTop}px)`;if(typeof renderFoldControls==='function')renderFoldControls();if(typeof syncEditorScrollbars==='function')syncEditorScrollbars();updateActiveLine();scheduleColorSwatches();if(typeof scheduleMinimap==='function')scheduleMinimap();
  }
  function editorFocusOffset(){return editor.selectionDirection==='backward'?editor.selectionStart:editor.selectionEnd;}
  function editorCaretRowOffset(line,focus){
    const offset=editorLayout.offsets[line]??line*editorLayout.lineHeight,height=(editorLayout.offsets[line+1]??editorLayout.totalHeight)-offset;
    if(!state?.settings.wrap||height<=editorLayout.lineHeight||!editor.clientWidth)return offset;
    const column=typeof codeDisplayCaretColumn==='function'?codeDisplayCaretColumn(editorLayout.starts[line]):focus-editorLayout.starts[line],cache=editorLayout.caretRow;
    if(cache?.key===editorLayout.key&&cache.line===line&&cache.column===column)return cache.offset;
    const start=editorLayout.starts[line],end=editorLayout.starts[line+1]!==undefined?editorLayout.starts[line+1]-1:editor.value.length,text=typeof codeDisplayText==='function'?codeDisplayText(start,end):editor.value.slice(start,end);
    lineMeasure.style.width=`${editorLayout.textWidth}px`;lineMeasure.style.whiteSpace='pre-wrap';
    lineMeasure.innerHTML=escape(text.slice(0,column))+'<span data-active-caret></span>'+escape(text.slice(column));
    const marker=lineMeasure.querySelector('[data-active-caret]'),point=marker?.getBoundingClientRect(),origin=lineMeasure.getBoundingClientRect();
    const measured=point?offset+Math.min(Math.max(0,height-editorLayout.lineHeight),Math.max(0,Math.floor((point.top-origin.top)/editorLayout.lineHeight))*editorLayout.lineHeight):offset;
    editorLayout.caretRow={key:editorLayout.key,line,column,offset:measured};return measured;
  }
  function updateActiveLine(){
    const focus=editorFocusOffset(),line=editorLineAt(focus),row=editorLayout.rows[line];
    if(editorLayout.activeRow!==row){editorLayout.activeRow?.classList.remove('current-line-number');row?.classList.add('current-line-number');editorLayout.activeRow=row;}
    const offset=editorCaretRowOffset(line,focus);
    $('activeLine').style.top=`${9+offset-editor.scrollTop}px`;
  }
  function updatePosition(){
    const focus=editorFocusOffset(),line=editorLineAt(focus);
    $('position').textContent=`Line ${line+1}, Column ${focus-editorLayout.starts[line]+1}`;updateActiveLine();
  }
  function scrollToEditorMatch(start){
    if(typeof revealCodeRange==='function'&&revealCodeRange(start))paintEditor();
    updateLineNumbers();const line=editorLineAt(start),styles=getComputedStyle(editor),lineHeight=editorLayout.lineHeight;
    let top=editorLayout.offsets[line]??line*lineHeight;
    lineMeasure.style.width=`${Math.max(1,editor.clientWidth-(parseFloat(styles.paddingLeft)||0)-(parseFloat(styles.paddingRight)||0))}px`;
    lineMeasure.style.whiteSpace=state.settings.wrap?'pre-wrap':'pre';
    lineMeasure.innerHTML=escape((typeof codeDisplayText==='function'?codeDisplayText(editorLayout.starts[line],start)+(typeof codeDisplayColumn==='function'?' '.repeat(Math.max(0,codeDisplayColumn(editorLayout.starts[line],start)-codeDisplayColumn(editorLayout.starts[line],start,'left'))):''):editor.value.slice(editorLayout.starts[line],start)))+'<span data-find-caret>\u200b</span>';
    const caret=lineMeasure.querySelector('[data-find-caret]');
    if(caret){const point=caret.getBoundingClientRect(),origin=lineMeasure.getBoundingClientRect();top+=point.top-origin.top;if(!state.settings.wrap)editor.scrollLeft=Math.max(0,point.left-origin.left-editor.clientWidth/3);}
    lineMeasure.style.whiteSpace='';editor.scrollTop=Math.max(0,top-lineHeight*3);syncScroll();updatePosition();
  }
