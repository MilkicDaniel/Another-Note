  let completionSession=null,completionTimer=null,completionWordCache=null,completionMeasure=null,completionApplying=false;
  function closeCompletions(){
    clearTimeout(completionTimer);completionTimer=null;completionSession=null;
    $('codeCompletion').hidden=true;editor.setAttribute('aria-expanded','false');editor.removeAttribute('aria-activedescendant');
  }
  function completionCaretBox(){
    updateLineNumbers();
    const line=editorLineAt(editor.selectionStart),styles=getComputedStyle(editor),rect=editor.getBoundingClientRect();
    if(!completionMeasure){completionMeasure=document.createElement('div');completionMeasure.className='line-measure';completionMeasure.setAttribute('aria-hidden','true');document.body.append(completionMeasure);}
    completionMeasure.style.width=`${Math.max(1,editor.clientWidth-(parseFloat(styles.paddingLeft)||0)-(parseFloat(styles.paddingRight)||0))}px`;
    completionMeasure.style.whiteSpace=state.settings.wrap?'pre-wrap':'pre';
    completionMeasure.innerHTML=escape((typeof codeDisplayText==='function'?codeDisplayText(editorLayout.starts[line],editor.selectionStart)+(typeof codeDisplayColumn==='function'?' '.repeat(Math.max(0,codeDisplayColumn(editorLayout.starts[line],editor.selectionStart)-codeDisplayColumn(editorLayout.starts[line],editor.selectionStart,'left'))):''):editor.value.slice(editorLayout.starts[line],editor.selectionStart)))+'<span data-completion-caret>\u200b</span>';
    const marker=completionMeasure.querySelector('[data-completion-caret]'),point=marker.getBoundingClientRect(),origin=completionMeasure.getBoundingClientRect();
    return {left:rect.left+(parseFloat(styles.paddingLeft)||0)+point.left-origin.left-editor.scrollLeft,top:rect.top+(parseFloat(styles.paddingTop)||0)+(editorLayout.offsets[line]||0)+point.top-origin.top-editor.scrollTop,height:editorLayout.lineHeight,editor:rect};
  }
  function positionCompletions(){
    if(!completionSession||$('codeCompletion').hidden)return;
    const popup=$('codeCompletion'),caret=completionCaretBox(),bottom=Math.min(innerHeight-30,caret.editor.bottom);
    if(caret.top+caret.height<caret.editor.top||caret.top>bottom){closeCompletions();return;}
    popup.style.maxHeight=`${Math.max(100,Math.min(350,caret.editor.height-12))}px`;
    const width=popup.getBoundingClientRect().width,height=popup.getBoundingClientRect().height;
    const top=caret.top+caret.height+3+height<=bottom?caret.top+caret.height+3:Math.max(caret.editor.top+3,caret.top-height-3);
    popup.style.left=`${Math.max(8,Math.min(innerWidth-width-8,caret.left))}px`;popup.style.top=`${Math.max(8,top)}px`;
  }
  function selectCompletion(index){
    const session=completionSession;if(!session)return;
    const count=session.result.items.length;session.index=((index%count)+count)%count;
    for(const row of $('codeCompletionList').children)row.setAttribute('aria-selected',String(Number(row.dataset.completionIndex)===session.index));
    const row=$('codeCompletionList').children[session.index],item=session.result.items[session.index];
    editor.setAttribute('aria-activedescendant',row.id);row.scrollIntoView({block:'nearest'});
    $('codeCompletionDetail').textContent=item.detail;
    positionCompletions();
  }
  function showCompletions(explicit=false){
    clearTimeout(completionTimer);completionTimer=null;
    const file=note();
    if(!ready||!file||file.trashedAt||editor.readOnly||composing||document.activeElement!==editor||editor.selectionStart!==editor.selectionEnd||$('notePane').hidden){closeCompletions();return;}
    const text=editor.value,mode=file.mode,offset=editor.selectionStart;
    let words=null;
    if(Object.hasOwn(completionKeywords,mode)){
      if(completionWordCache?.text!==text||completionWordCache.mode!==mode)completionWordCache={text,mode,words:completionWords(text,mode)};
      words=completionWordCache.words;
    }
    const result=completeCode(text,offset,mode,explicit,words);
    if(!result){closeCompletions();return;}
    completionSession={id:file.id,text,offset,mode,result,index:0};
    const symbols={tag:'<>',attribute:'a',property:'p',function:'ƒ',method:'ƒ',variable:'v',keyword:'k',value:'=',word:'w',local:'•'};
    $('codeCompletionList').innerHTML=result.items.map((item,index)=>`<div class="completion-option" id="code-option-${index}" role="option" aria-selected="${index===0}" data-completion-index="${index}"><span class="completion-kind completion-${item.kind}" aria-hidden="true">${escape(symbols[item.kind]||'•')}</span><span class="completion-label">${escape(item.label)}</span><span class="completion-type">${escape(item.kind==='local'?'file':item.kind)}</span></div>`).join('');
    $('codeCompletion').hidden=false;editor.setAttribute('aria-expanded','true');selectCompletion(0);
  }
  function scheduleCompletions(explicit=false){
    closeCompletions();completionTimer=setTimeout(()=>showCompletions(explicit),explicit?0:75);
  }
  function requestCodeCompletions(){editor.focus();showCompletions(true);}
  function completionIsCurrent(session){const file=note();return Boolean(session&&file&&!file.trashedAt&&file.id===session.id&&file.mode===session.mode&&editor.value===session.text&&editor.selectionStart===session.offset&&editor.selectionEnd===session.offset&&!editor.readOnly);}
  function acceptCompletion(){
    const session=completionSession;
    if(!completionIsCurrent(session)){closeCompletions();return false;}
    const item=session.result.items[session.index],edit=completionEdit(session.text,session.result,item);
    closeCompletions();completionApplying=true;
    try{replaceText(edit.from,edit.to,edit.insert,edit.caret,edit.caret);}finally{completionApplying=false;}
    if(session.result.kind==='attribute'&&edit.insert.endsWith('""')||session.result.kind==='css-property')scheduleCompletions(true);
    return true;
  }
  function handleCompletionKey(event){
    if(event.defaultPrevented||event.isComposing||composing||editor.readOnly)return;
    if(typeof shortcutMatchesEvent==='function'?shortcutMatchesEvent('complete',event):(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&(event.code==='Space'||event.key===' ')){event.preventDefault();event.stopImmediatePropagation();showCompletions(true);return;}
    if((event.key==='Tab'||event.code==='Tab')&&!event.ctrlKey&&!event.metaKey&&!event.altKey){closeCompletions();return;}
    if(!completionSession)return;
    if(!completionIsCurrent(completionSession)){closeCompletions();return;}
    if(!event.ctrlKey&&!event.metaKey&&!event.altKey){
      if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();selectCompletion(completionSession.index+({ArrowDown:1,ArrowUp:-1,PageDown:8,PageUp:-8}[event.key]));return;}
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.stopImmediatePropagation();acceptCompletion();return;}
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeCompletions();return;}
    }
    if(['ArrowLeft','ArrowRight','Home','End','Tab','Enter'].includes(event.key)||event.ctrlKey||event.metaKey)closeCompletions();
  }
  function autoCloseHTMLInput(event){
    if(event.defaultPrevented||event.isComposing||composing||editor.readOnly||event.inputType!=='insertText'||event.data!=='>'||note()?.mode!=='html')return false;
    const start=editor.selectionStart,end=editor.selectionEnd;
    if(start!==end)return false;
    const text=editor.value.slice(0,start)+'>'+editor.value.slice(end),edit=htmlClosingEdit(text,start+1,'html');
    if(!edit)return false;
    event.preventDefault();closeCompletions();replaceText(start,end,'>'+edit.insert,start+1,start+1);return true;
  }
  function wireEditorCompletions(){
    editor.setAttribute('aria-autocomplete','list');editor.setAttribute('aria-controls','codeCompletionList');editor.setAttribute('aria-expanded','false');
    editor.addEventListener('keydown',handleCompletionKey,true);
    editor.addEventListener('beforeinput',event=>{if(autoCloseHTMLInput(event))event.stopImmediatePropagation();},true);
    editor.addEventListener('input',event=>{if(composing||event.isComposing||event.inputType&&!['insertText','insertCompositionText'].includes(event.inputType)){closeCompletions();return;}scheduleCompletions();});
    editor.addEventListener('compositionstart',closeCompletions);
    editor.addEventListener('compositionend',()=>scheduleCompletions());
    editor.addEventListener('pointerdown',closeCompletions);
    editor.addEventListener('blur',closeCompletions);
    editor.addEventListener('scroll',positionCompletions);
    editor.addEventListener('select',()=>{if(!completionApplying&&completionSession&&(editor.value!==completionSession.text||editor.selectionStart!==completionSession.offset||editor.selectionEnd!==completionSession.offset))closeCompletions();});
    const popup=$('codeCompletion');
    popup.addEventListener('pointerdown',event=>event.preventDefault());
    popup.addEventListener('pointermove',event=>{const row=event.target.closest('[data-completion-index]');if(row&&completionSession)selectCompletion(Number(row.dataset.completionIndex));});
    popup.addEventListener('click',event=>{const row=event.target.closest('[data-completion-index]');if(row){selectCompletion(Number(row.dataset.completionIndex));acceptCompletion();}});
    document.addEventListener('pointerdown',event=>{if(event.target!==editor&&!popup.contains(event.target))closeCompletions();},true);
    window.addEventListener('resize',positionCompletions);
  }
