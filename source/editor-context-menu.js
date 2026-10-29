  let editorContext=null,editorRightSelection=null;
  function dismissEditorContextMenu(){editorContext=null;}
  async function writeEditorClipboard(text){
    if(native){await request('clipboard',{text});return;}
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return;}catch(_){}}
    const focused=document.activeElement,selection=getSelection(),ranges=[];
    if(selection)for(let i=0;i<selection.rangeCount;i++)ranges.push(selection.getRangeAt(i).cloneRange());
    const buffer=document.createElement('textarea');buffer.className='table-copy-buffer';buffer.value=text;document.body.append(buffer);buffer.select();
    let copied=false;try{copied=document.execCommand('copy');}finally{buffer.remove();focused?.focus({preventScroll:true});if(selection&&ranges.length){selection.removeAllRanges();ranges.forEach(range=>selection.addRange(range));}}
    if(!copied)throw new Error('Could not copy. Select the text and press Ctrl+C.');
  }
  async function readEditorClipboard(){
    if(native)return String((await request('read_clipboard')).text||'');
    if(navigator.clipboard?.readText){try{return await navigator.clipboard.readText();}catch(_){}}
    throw new Error('Clipboard access is unavailable here. Use Ctrl+V to paste.');
  }
  function editorContextCurrent(context){const file=note();return Boolean(file&&file.id===context.fileId&&file.updatedAt===context.stamp);}
  function sourceContextSelection(context){
    showSourceEditor({remember:true,focus:true,restore:false});
    editor.setSelectionRange(context.start,context.end,context.direction);
  }
  function editorContextCopyText(context){
    if(context.field)return context.field.value.slice(context.fieldStart,context.fieldEnd);
    if(!context.rendered)return editor.value.slice(context.start,context.end);
    const selected=noteTableView.selection&&noteTableCopyData();
    if(selected)return TableData.serialize(selected,'tsv');
    if(context.selectedText)return context.selectedText;
    const cell=context.tableContext;
    return cell?renderTableValue(cell.table.data.rows[cell.row][cell.column],cell.table.data.originals[cell.row]?.[cell.column],true):'';
  }
  async function runEditorContextCommand(command,context){
    if(!context||!editorContextCurrent(context))return;
    const editable=tableFileReady()&&!activityBlocked(),table=context.tableContext;
    if(command==='undo'||command==='redo'){if(editable)undo(command==='redo');return;}
    if(command==='copy'){await writeEditorClipboard(editorContextCopyText(context));return;}
    // Text fields in the table view (surrounding text and a cell being edited) take clipboard commands directly.
    const field=context.field?.isConnected?context.field:null;
    if(field&&['cut','paste','selectAll'].includes(command)){
      if(command==='selectAll'){field.focus({preventScroll:true});field.select();return;}
      if(!editable)return;let text='';
      if(command==='cut'){if(context.fieldStart===context.fieldEnd)return;await writeEditorClipboard(editorContextCopyText(context));}
      else text=(await readEditorClipboard()).replace(/\r\n?/g,'\n');
      if(!field.isConnected||!editorContextCurrent(context))return;
      field.focus({preventScroll:true});field.setRangeText(text,context.fieldStart,context.fieldEnd,'end');field.dispatchEvent(new Event('input',{bubbles:true}));return;
    }
    if(command==='cut'){
      if(!editable||context.rendered||context.start===context.end)return;
      await writeEditorClipboard(editorContextCopyText(context));if(!editorContextCurrent(context)||!tableFileReady())return;
      sourceContextSelection(context);replaceText(context.start,context.end,'');return;
    }
    if(command==='paste'){
      if(!editable)return;const text=(await readEditorClipboard()).replace(/\r\n?/g,'\n');
      if(!text||!editorContextCurrent(context)||!tableFileReady()||activityBlocked())return;
      sourceContextSelection(context);replaceText(context.start,context.end,text);return;
    }
    if(command==='selectAll'){
      if(context.rendered){const range=document.createRange();range.selectNodeContents($('noteTables'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);$('noteTables').focus({preventScroll:true});}
      else{sourceContextSelection(context);editor.setSelectionRange(0,editor.value.length);}
      return;
    }
    if(command==='source'){toggleNoteTableView();return;}
    if(command==='spelling'&&context.spellingRange){if(editable)return openSpellingMenu(context.spellingRange,context.x,context.y);return;}
    if(command==='references'&&context.reference)return findSymbolUsages(context.reference);
    if(command==='addTable'){if(editable)showTableEditor({insert:true,at:context.end});return;}
    if(command==='editTable'){if(editable){if(context.rendered)editNoteTable(table);else showTableEditor({range:context.sourceTable});}return;}
    if(command==='selectColumn'&&table){selectNoteTableColumn(table.index,table.column);$('noteTables').focus({preventScroll:true});return;}
    if(command==='copyColumn'&&table){await copyNoteTable(table,{column:true});return;}
    if(command==='copyTable'&&table)await copyNoteTable(table,{all:true});
    if(['rowAbove','rowBelow','columnLeft','columnRight','deleteRow','deleteColumn'].includes(command)&&table&&editable)changeNoteTableShape(table,command);
  }
  function openEditorContextMenu(event,keyboard=false){
    if(!ready||!note()||startupBlocked||activityBlocked())return;
    const rendered=noteTableView.active&&$('noteTables').contains(event.target),source=event.target===editor;
    if(!rendered&&!source)return;
    event.preventDefault();event.stopPropagation();
    const field=rendered?event.target.closest('textarea'):null,selectedText=rendered&&!field?getSelection()?.toString()||'':'';
    let start=editor.selectionStart,end=editor.selectionEnd,direction=editor.selectionDirection||'none',tableContext=rendered?noteTableContext(event.target):null,sourceTable=null;
    if(rendered){
      if(!tableContext&&keyboard&&noteTableView.cell){const cell=noteTableView.cell;tableContext={...cell,table:noteTableView.blocks[cell.index]};}
      const slot=field?.matches('[data-note-text]')?noteTableView.slots[Number(field.dataset.noteText)]:null;
      start=end=tableContext?.table.to??(slot?slot.from+slot.prefix.length+Math.min(field.selectionEnd,slot.value.length):editor.value.length);direction='none';
    }else{
      const prior=editorRightSelection;
      if(!keyboard){const offset=editorOffsetAtPoint(event.clientX,event.clientY);if(prior&&prior.start!==prior.end&&(offset===null||offset>=prior.start&&offset<=prior.end)){({start,end,direction}=prior);}else if(offset!==null){start=end=offset;direction='none';}}
      editor.setSelectionRange(start,end,direction);
      try{sourceTable=tableAtSelection();}catch(_){}
    }
    const spellingRange=source?(keyboard?spellResult?.id===note().id?spellResult.matches.find(range=>range.start<=start&&range.end>=start):null:spellingAtPoint(event.clientX,event.clientY)):null,reference=source?captureReference(start):null;
    editorRightSelection=null;closeMenus();const file=note();editorContext={fileId:file.id,stamp:file.updatedAt,start,end,direction,rendered,tableContext,sourceTable,selectedText,spellingRange,reference,field,fieldStart:field?.selectionStart??0,fieldEnd:field?.selectionEnd??0,x:event.clientX,y:event.clientY};
    const popup=$('editorContextMenu'),editable=tableFileReady(),history=histories.get(file.id);
    for(const button of popup.querySelectorAll('[data-editor-command]')){
      const command=button.dataset.editorCommand;
      button.hidden=['selectColumn','copyColumn','copyTable','rowAbove','rowBelow','columnLeft','columnRight','deleteRow','deleteColumn'].includes(command)?!tableContext:command==='editTable'?!(tableContext||sourceTable):command==='source'?!noteTableView.blocks.length:false;
      button.disabled=['paste','addTable','editTable','rowAbove','rowBelow','columnLeft','columnRight'].includes(command)?!editable:command==='deleteRow'?!editable||tableContext?.table.data.rows.length<2:command==='deleteColumn'?!editable||tableContext?.table.data.rows[0].length<2:command==='cut'?!editable||(field?field.selectionStart===field.selectionEnd:rendered||start===end):command==='copy'?!editorContextCopyText(editorContext):command==='undo'?!editable||!history?.undo.length:command==='redo'?!editable||!history?.redo.length:false;
      if(command==='source')button.textContent=rendered?'Edit Source':'Table View';
      if(command==='spelling'){button.hidden=!spellingRange;button.disabled=!editable;}
      if(command==='references'){button.hidden=!reference;button.textContent=reference?`Find Usages of “${reference.name}”`:'Find Usages';}
    }
    popup.hidden=false;popup.style.left='0px';popup.style.top='0px';
    let x=event.clientX,y=event.clientY;
    if(keyboard){const rect=(rendered?event.target:editor).getBoundingClientRect();x=rect.left+20;y=rect.top+20;}
    const rect=popup.getBoundingClientRect(),position=popupPosition({left:x,right:x,top:y,bottom:y},rect.width,rect.height,innerWidth,innerHeight);
    popup.style.left=`${position.left}px`;popup.style.top=`${position.top}px`;popupItems(popup)[0]?.focus({preventScroll:true});
  }
  function wireEditorContextMenu(){
    const popup=$('editorContextMenu');
    editor.addEventListener('pointerdown',event=>{editorRightSelection=event.button===2?{start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection||'none'}:null;});
    for(const area of [editor,$('noteTables')]){
      area.addEventListener('contextmenu',event=>openEditorContextMenu(event));
      area.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)openEditorContextMenu(event,true);});
    }
    popup.addEventListener('click',event=>{const button=event.target.closest('[data-editor-command]');if(!button||button.disabled)return;const context=editorContext;closeMenus();runEditorContextCommand(button.dataset.editorCommand,context).catch(error=>toast(error.message));});
    popup.addEventListener('keydown',event=>{
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();event.stopPropagation();const items=popupItems(popup),index=items.indexOf(document.activeElement);if(items.length)items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
      }else if(event.key==='Escape'||event.key==='Tab'){
        const context=editorContext;event.preventDefault();event.stopPropagation();closeMenus();(context?.field?.isConnected?context.field:context?.rendered?$('noteTables'):editor).focus({preventScroll:true});
      }
    });
  }
