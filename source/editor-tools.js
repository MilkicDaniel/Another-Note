  let spellTimer=null,spellSequence=0,spellResult=null,spellContext=null,formatRunning=false;
  const spellcheckFiles=new Set();
  function spellcheckEnabled(file=note()){return Boolean(file&&!file.trashedAt&&spellcheckFiles.has(file.id));}
  function dictionaryWords(){return normalizeTagChanges(state.dictionaryChanges).filter(item=>!item.deleted&&/^[\p{L}][\p{L}\p{M}\p{N}'’_-]{0,63}$/u.test(item.name)).map(item=>item.name).sort((a,b)=>a.localeCompare(b));}
  function refreshSpellcheck(){
    clearTimeout(spellTimer);const sequence=++spellSequence,file=note();
    if(!ready||!spellcheckEnabled(file)){spellResult=null;syncSpellStatus();return;}
    if(spellResult?.id===file.id&&spellResult.text===file.content&&spellResult.mode===file.mode&&spellResult.dictionary===JSON.stringify(state.dictionaryChanges||[]))return;
    spellResult=null;syncSpellStatus();
    const text=file.content,id=file.id,mode=file.mode,personal=dictionaryWords(),dictionary=JSON.stringify(state.dictionaryChanges||[]);
    if(!text.trim()){spellResult={id,text,mode,dictionary,matches:[],truncated:false};syncSpellStatus();return;}
    spellTimer=setTimeout(async()=>{
      try{
        const result=await editorJob('spell',{text,mode,personal});
        if(sequence!==spellSequence||result.cancelled||note()?.id!==id||!spellcheckEnabled()||editor.value!==text)return;
        spellResult={id,text,mode,dictionary,...result};paintEditor();syncSpellStatus();if($('spellingDialog').open)renderSpellingReview();
      }catch(error){if(sequence===spellSequence){$('spellStatus').textContent='ABC !';$('spellStatus').setAttribute('aria-label',error.message);}}
    },350);
  }
  function syncSpellStatus(){
    const file=note(),enabled=spellcheckEnabled(file),shortcut=typeof shortcutText==='function'?shortcutText('toggleSpellcheck'):'F6';
    $('spellcheckMenu').innerHTML=`${enabled?'✓ ':''}Spellcheck This File<kbd data-shortcut-label="toggleSpellcheck">F6</kbd>`;
    if(typeof refreshShortcutLabels==='function')refreshShortcutLabels();
    $('spellcheckMenu').disabled=!file||Boolean(file.trashedAt);$('spellcheckMenu').setAttribute('aria-pressed',String(enabled));
    $('spellStatus').textContent=enabled?`ABC${spellResult?.matches.length?' '+spellResult.matches.length:''}`:'ABC Off';
    $('spellStatus').setAttribute('aria-label',enabled?(spellResult?`${spellResult.matches.length}${spellResult.truncated?'+':''} possible spelling errors. ${shortcut} to turn off for this file.`:`Checking spelling… ${shortcut} to turn off for this file.`):`Spellcheck is off for this file. Click or press ${shortcut} to enable.`);
    $('spellStatus').setAttribute('aria-pressed',String(enabled));$('spellStatus').disabled=!file||Boolean(file.trashedAt);
  }
  function toggleSpellcheck(){const file=note();if(!file||file.trashedAt)return;if(spellcheckEnabled(file))spellcheckFiles.delete(file.id);else spellcheckFiles.add(file.id);spellResult=null;closeMenus();refreshSpellcheck();paintEditor();}
  function decorateSpelling(html){
    if(!spellcheckEnabled()||!spellResult||spellResult.id!==note()?.id||spellResult.text!==editor.value)return html;
    let result='',offset=0,index=0;
    for(const match of html.matchAll(/<[^>]*>|[^<]+/g)){
      const piece=match[0];if(piece[0]==='<'){result+=piece;continue;}
      const text=piece.replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[key]);let cursor=0;
      while(index<spellResult.matches.length){const range=spellResult.matches[index];if(range.end<=offset){index++;continue;}if(range.start>=offset+text.length)break;
        const start=Math.max(0,range.start-offset),end=Math.min(text.length,range.end-offset);
        result+=escape(text.slice(cursor,start))+`<span class="spell-error">${escape(text.slice(start,end))}</span>`;cursor=end;if(range.end<=offset+text.length)index++;else break;
      }
      result+=escape(text.slice(cursor));offset+=text.length;
    }
    return result;
  }
  function setDictionaryWord(word,deleted=false){
    word=String(word||'').trim();if(!/^[\p{L}][\p{L}\p{M}\p{N}'’_-]{0,63}$/u.test(word))return false;
    state.dictionaryChanges=normalizeTagChanges(state.dictionaryChanges,[{name:word,updatedAt:clock(),deleted}]);
    spellResult=null;closeMenus();renderDictionary();refreshSpellcheck();paintEditor();save();return true;
  }
  function renderDictionary(){
    const words=dictionaryWords();$('dictionaryWords').innerHTML=words.length?words.map(word=>`<div class="manage-tag-row"><span class="tag-name">${escape(word)}</span><button type="button" class="tag-delete-button danger" data-remove-word="${escape(word)}" aria-label="Remove ${escape(word)}">${icon('trash')}</button></div>`).join(''):'<p>No personal words yet.</p>';
  }
  function openDictionary(){closeMenus();renderDictionary();$('dictionaryWord').value=editor.value.slice(editor.selectionStart,editor.selectionEnd).trim();$('dictionaryDialog').showModal();$('dictionaryWord').focus();}
  function renderSpellingReview(){
    const result=spellResult?.id===note()?.id&&spellResult.text===editor.value?spellResult:null;
    $('spellingReviewList').innerHTML=result?(result.matches.length?result.matches.slice(0,200).map((range,index)=>`<button type="button" class="spelling-review-word" data-spelling-index="${index}"><span>${escape(range.word)}</span><span>Line ${editorLineAt(range.start)+1}</span></button>`).join(''):'<p>No spelling errors found.</p>'):'<p>Checking spelling…</p>';
    $('spellingReviewMessage').textContent=result?.truncated?'Showing the first 2,000 possible errors.':result?.matches.length>200?'Showing the first 200 possible errors.':'';
  }
  function reviewSpelling(){if(!note()||note().trashedAt)return;if(!spellcheckEnabled())toggleSpellcheck();closeMenus();renderSpellingReview();$('spellingDialog').showModal();refreshSpellcheck();}
  async function openSpellingMenu(range,x,y){
    const file=note();if(!file||file.trashedAt)return;closeMenus();spellContext={...range,id:file.id,text:editor.value};
    const context=spellContext,menu=$('spellingMenu');
    const render=suggestions=>{const replacements=suggestions.filter(word=>word.toLocaleLowerCase('en')!==range.word.toLocaleLowerCase('en'));menu.innerHTML=`${replacements.map(word=>`<button type="button" data-spelling-replacement="${escape(word)}">${escape(word)}</button>`).join('')}${replacements.length?'<div class="menu-sep"></div>':''}<button type="button" data-add-spelling-word>Add to Dictionary</button><button type="button" data-open-dictionary>Personal Dictionary…</button>${referenceMenuOption(range.start)}`;};
    render([]);menu.hidden=false;menu.style.left=`${Math.max(8,Math.min(innerWidth-260,x))}px`;menu.style.top=`${Math.max(8,Math.min(innerHeight-220,y))}px`;
    try{const suggestions=await editorJob('suggest',{word:range.word});if(spellContext===context&&!menu.hidden&&note()?.id===context.id&&editor.value===context.text){render(suggestions);positionPopup(menu,{getBoundingClientRect:()=>({left:x,right:x,top:y,bottom:y})});}}catch(_){}
  }
  function spellingAtPoint(x,y){
    if(!spellcheckEnabled()||!spellResult||spellResult.id!==note()?.id||spellResult.text!==editor.value)return null;
    if(typeof editorOffsetAtPoint==='function'){const offset=editorOffsetAtPoint(x,y);return offset===null?null:spellResult.matches.find(range=>offset>=range.start&&offset<range.end)||null;}
    updateLineNumbers();const rect=editor.getBoundingClientRect(),styles=getComputedStyle(editor),localY=y-rect.top-(parseFloat(styles.paddingTop)||9)+editor.scrollTop;
    let line=0;while(line+1<editorLayout.offsets.length&&editorLayout.offsets[line+1]<=localY)line++;
    const start=editorLayout.starts[line],end=editorLayout.starts[line+1]??editor.value.length,ranges=spellResult.matches.filter(range=>range.start>=start&&range.start<end);if(!ranges.length)return null;
    lineMeasure.style.width=`${Math.max(1,editor.clientWidth-(parseFloat(styles.paddingLeft)||0)-(parseFloat(styles.paddingRight)||0))}px`;lineMeasure.style.whiteSpace=state.settings.wrap?'pre-wrap':'pre';
    let html='',last=start;ranges.forEach((range,index)=>{html+=escape(editor.value.slice(last,range.start))+`<span data-spell-point="${index}">${escape(editor.value.slice(range.start,range.end))}</span>`;last=range.end;});lineMeasure.innerHTML=html+escape(editor.value.slice(last,end));
    const origin=lineMeasure.getBoundingClientRect(),localX=x-rect.left-(parseFloat(styles.paddingLeft)||4)+editor.scrollLeft,top=localY-editorLayout.offsets[line];let found=null;
    for(const span of lineMeasure.querySelectorAll('[data-spell-point]'))for(const box of span.getClientRects())if(localX>=box.left-origin.left-2&&localX<=box.right-origin.left+2&&top>=box.top-origin.top&&top<=box.bottom-origin.top)found=ranges[Number(span.dataset.spellPoint)];
    lineMeasure.style.whiteSpace='';return found;
  }
  async function prettyFormat(){
    const file=note();if(!file||file.trashedAt||formatRunning||activityBlocked())return;
    if(file.mode==='text'||file.mode==='markdown')return toast('Choose a programming file type to format this file.');
    const id=file.id,text=file.content,mode=file.mode,start=editor.selectionStart,end=editor.selectionEnd;formatRunning=true;$('formatButton').disabled=true;
    try{
      const formatted=await editorJob('format',{text,mode,tabSize:editorTabSize(),filename:file.title||`untitled.${{python:'py',bash:'sh',javascript:'js'}[mode]||mode}`});
      if(note()?.id!==id||note().content!==text||note().mode!==mode)return toast('The file changed while formatting. Run Format File again.');
      if(formatted===text)return toast('File is already formatted.');
      replaceText(0,text.length,formatted,Math.min(start,formatted.length),Math.min(end,formatted.length));toast('Formatted file. Use Undo to restore the previous text.');
    }catch(error){toast(`Could not format file: ${error.message}`,6500);}finally{formatRunning=false;$('formatButton').disabled=false;}
  }
  function editorTabSize(){const size=Number(state.settings.tabSize);return [2,4,8].includes(size)?size:2;}
  function setEditorTabSize(value){
    const size=Number(value);if(!ready||startupBlocked||![2,4,8].includes(size))return;
    closeMenus();if(state.settings.tabSize===size)return;
    state.settings.tabSize=size;applySettings();save();
  }
  function indentLines(outdent=false){
    const file=note();if(!file||file.trashedAt||editor.readOnly)return false;
    const text=editor.value,start=editor.selectionStart,end=editor.selectionEnd,direction=editor.selectionDirection;
    const from=start?text.lastIndexOf('\n',start-1)+1:0,limit=end>start&&text[end-1]==='\n'?end-1:end,breakAt=text.indexOf('\n',limit),to=breakAt<0?text.length:breakAt;
    const changes=[],size=editorTabSize();let offset=from;
    const replacement=text.slice(from,to).split('\n').map(line=>{
      const width=outdent?(line[0]==='\t'?1:Math.min(size,line.match(/^ */)[0].length)):0,insert=outdent?'':' '.repeat(size);
      if(width||insert)changes.push({at:offset,width,insert});offset+=line.length+1;return insert+line.slice(width);
    }).join('\n');
    if(!changes.length)return false;
    const map=position=>position+changes.reduce((sum,change)=>sum+(position>=change.at?change.insert.length-Math.min(change.width,position-change.at):0),0);
    const nextStart=map(start),nextEnd=map(end);replaceText(from,to,replacement,nextStart,nextEnd);
    if(direction)editor.setSelectionRange(nextStart,nextEnd,direction);return true;
  }
  function toggleComment(){
    const file=note();if(!file||file.trashedAt||editor.readOnly)return;
    const markers={java:'//',javascript:'//',python:'#',bash:'#'},prefix=markers[file.mode],start=editor.selectionStart,end=editor.selectionEnd,text=editor.value;
    if(!prefix&&!['html','css'].includes(file.mode))return toast('This file type does not support comments.');
    const from=start?text.lastIndexOf('\n',start-1)+1:0,limit=end>start&&text[end-1]==='\n'?end-1:end,breakAt=text.indexOf('\n',limit),to=breakAt<0?text.length:breakAt;
    if(!prefix){
      const [open,close]=file.mode==='html'?['<!--','-->']:['/*','*/'],selected=text.slice(from,to),match=selected.match(/^(\s*)([\s\S]*?)(\s*)$/),body=match[2];let replacement;
      if(body.startsWith(open)&&body.endsWith(close))replacement=match[1]+body.slice(open.length,-close.length).replace(/^ | $/g,'')+match[3];
      else{if(body.includes(close))return toast('The selection contains a comment ending. Select a smaller range.');replacement=match[1]+open+' '+body+' '+close+match[3];}
      replaceText(from,to,replacement,from,from+replacement.length);return;
    }
    const lines=text.slice(from,to).split('\n');
    const nonempty=lines.filter(line=>line.trim()),remove=nonempty.length&&nonempty.every(line=>line.trimStart().startsWith(prefix)),indent=Math.min(...nonempty.map(line=>line.match(/^\s*/)[0].length),Infinity);
    const changes=[];let offset=from;
    for(const line of lines){if(!line.trim()&&nonempty.length){offset+=line.length+1;continue;}const at=remove?line.match(/^\s*/)[0].length:(Number.isFinite(indent)?indent:line.length),width=remove?prefix.length+(line[at+prefix.length]===' '?1:0):0;changes.push({at:offset+at,width,insert:remove?'':prefix+' '});offset+=line.length+1;}
    let replacement=text.slice(from,to);for(const change of [...changes].reverse())replacement=replacement.slice(0,change.at-from)+change.insert+replacement.slice(change.at-from+change.width);
    const map=position=>position+changes.reduce((sum,change)=>sum+(position>=change.at?change.insert.length-Math.min(change.width,Math.max(0,position-change.at)):0),0);
    replaceText(from,to,replacement,map(start),map(end));
  }
  function wireEditorTools(){
    editor.addEventListener('contextmenu',event=>{const range=spellingAtPoint(event.clientX,event.clientY);if(!range)return;event.preventDefault();openSpellingMenu(range,event.clientX,event.clientY);});
    $('spellingMenu').addEventListener('click',event=>{const context=spellContext;if(event.target.closest('[data-open-dictionary]'))return openDictionary();if(!context||note()?.id!==context.id||editor.value!==context.text)return closeMenus();const replacement=event.target.closest('[data-spelling-replacement]');if(replacement){closeMenus();replaceText(context.start,context.end,replacement.dataset.spellingReplacement);}else if(event.target.closest('[data-add-spelling-word]'))setDictionaryWord(context.word);});
    wirePopupKeys($('spellingMenu'),{focus:()=>editor.focus()});
    $('dictionaryForm').addEventListener('submit',event=>{event.preventDefault();if(setDictionaryWord($('dictionaryWord').value))$('dictionaryWord').value='';else{$('dictionaryWord').setCustomValidity('Enter a word without spaces.');$('dictionaryWord').reportValidity();}});
    $('dictionaryWord').addEventListener('input',()=>$('dictionaryWord').setCustomValidity(''));
    $('dictionaryWords').addEventListener('click',event=>{const button=event.target.closest('[data-remove-word]');if(button)setDictionaryWord(button.dataset.removeWord,true);});
    $('spellingReviewList').addEventListener('click',event=>{const button=event.target.closest('[data-spelling-index]'),range=button&&spellResult?.matches[Number(button.dataset.spellingIndex)];if(!range)return;$('spellingDialog').close();editor.setSelectionRange(range.start,range.end);scrollToEditorMatch(range.start);const rect=editor.getBoundingClientRect();openSpellingMenu(range,rect.left+120,rect.top+60);});
    $('spellStatus').addEventListener('click',toggleSpellcheck);
  }
