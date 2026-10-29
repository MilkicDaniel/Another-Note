  const tableSourceFiles=new Set();
  let noteTableView={fileId:null,text:null,mode:null,blocks:[],active:false,selection:null,cell:null,cursor:null},noteTableTimer=0;
  function resetNoteTableView(){
    clearTimeout(noteTableTimer);noteTableTimer=0;
    noteTableView={fileId:null,text:null,mode:null,blocks:[],active:false,selection:null,cell:null,cursor:null};
    $('noteTables').innerHTML='';$('noteTables').hidden=true;$('noteTableViewToggle').hidden=true;$('editorArea').hidden=false;
  }
  function showSourceEditor({remember=true,focus=true,restore=true,repaint=true}={}){
    const wasActive=noteTableView.active,cursor=noteTableView.cursor;
    noteTableView.active=false;$('noteTables').hidden=true;$('editorArea').hidden=false;
    if(remember&&state&&note())tableSourceFiles.add(note().id);
    $('noteTableViewToggle').textContent='Table View';$('noteTableViewToggle').setAttribute('aria-pressed','false');
    if(wasActive&&restore&&cursor&&noteTableView.fileId===note()?.id&&cursor.text===editor.value){editor.setSelectionRange(cursor.start,cursor.end,cursor.direction);editor.scrollTop=cursor.top;editor.scrollLeft=cursor.left;}
    if(wasActive&&repaint){editorLayout.key=null;paintEditor();syncScroll();}
    if(focus)editor.focus({preventScroll:true});
  }
  function noteTableCellHTML(value,original){return renderTableValue(value,original);}
  function renderNoteTables(){
    const view=noteTableView;let at=0,html='';
    view.blocks.forEach((block,index)=>{
      if(view.text.slice(at,block.from).trim())html+=`<pre class="note-text-block" data-note-source-from="${at}">${escape(view.text.slice(at,block.from))}</pre>`;
      const data=block.data;
      html+=`<section class="note-table-block" data-note-table="${index}" title="Double-click a cell to edit. Click a heading to select its column."><table class="note-table-grid" aria-label="Table ${index+1}">`;
      if(!data.header)html+='<thead class="note-table-selectors"><tr>'+data.rows[0].map((_,column)=>`<th><button type="button" data-note-column="${column}" aria-label="Select column ${tableColumnName(column)}" aria-pressed="false">${tableColumnName(column)}</button></th>`).join('')+'</tr></thead>';
      html+='<tbody>'+data.rows.map((row,r)=>'<tr>'+row.map((value,c)=>{
        const header=data.header&&r===0,tag=header?'th':'td',align=header?'center':['left','center','right'].includes(data.align[c])?data.align[c]:'left';
        const contents=header?`<button type="button" data-note-column="${c}" aria-label="Select column ${tableColumnName(c)}" aria-pressed="false">${escape(renderTableValue(value,data.originals[r]?.[c],true))}</button>`:noteTableCellHTML(value,data.originals[r]?.[c]);
        return `<${tag} data-note-row="${r}" data-note-cell-column="${c}"${header?' scope="col"':' tabindex="0"'} style="text-align:${align}">${contents}</${tag}>`;
      }).join('')+'</tr>').join('')+'</tbody></table></section>';
      at=block.to;
    });
    if(view.text.slice(at).trim())html+=`<pre class="note-text-block" data-note-source-from="${at}">${escape(view.text.slice(at))}</pre>`;
    $('noteTables').innerHTML=html;syncNoteTableSelection();
  }
  function refreshNoteTableView({select=false,focus=false}={}){
    const file=state&&note();if(!file){resetNoteTableView();return;}
    const previous=noteTableView,changed=previous.fileId!==file.id||previous.text!==file.content||previous.mode!==file.mode;
    if(changed){
      const same=previous.fileId===file.id;
      let blocks=TableData.documentTables(file.content,file.mode);
      if(blocks.reduce((count,block)=>count+block.data.rows.length*block.data.rows[0].length,0)>TableData.limits.cells)blocks=[];
      noteTableView={fileId:file.id,text:file.content,mode:file.mode,blocks,active:same&&previous.active,selection:null,cell:null,cursor:same?previous.cursor:null};
      $('noteTables').innerHTML='';
    }
    $('noteTableViewToggle').hidden=!noteTableView.blocks.length;
    if(!noteTableView.blocks.length){if(previous.active)showSourceEditor({remember:false,focus,repaint:true,restore:false});return;}
    if((select&&!tableSourceFiles.has(file.id))||noteTableView.active){
      if(!noteTableView.active)noteTableView.cursor={text:editor.value,start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection,top:editor.scrollTop,left:editor.scrollLeft};
      noteTableView.active=true;
      if(changed||!$('noteTables').innerHTML)renderNoteTables();
      $('editorArea').hidden=true;$('noteTables').hidden=false;$('noteTableViewToggle').textContent='Edit Source';$('noteTableViewToggle').setAttribute('aria-pressed','true');
      if(focus)$('noteTables').focus({preventScroll:true});
    }
  }
  function scheduleNoteTableView(){
    if(noteTableView.active){refreshNoteTableView();return;}
    clearTimeout(noteTableTimer);noteTableTimer=setTimeout(()=>{noteTableTimer=0;refreshNoteTableView();},180);
  }
  function toggleNoteTableView(){
    if(noteTableView.active)showSourceEditor();
    else{tableSourceFiles.delete(note()?.id);refreshNoteTableView({select:true,focus:true});}
  }
  function noteTableContext(target){
    const block=target.closest('[data-note-table]'),cell=target.closest('[data-note-row]'),column=target.closest('[data-note-column]');
    if(!block)return null;const index=Number(block.dataset.noteTable),table=noteTableView.blocks[index];if(!table)return null;
    return {index,table,row:cell?Number(cell.dataset.noteRow):0,column:cell?Number(cell.dataset.noteCellColumn):column?Number(column.dataset.noteColumn):0};
  }
  function selectNoteTableColumn(index,column){
    const table=noteTableView.blocks[index];if(!table)return;
    noteTableView.selection={index,column,anchor:0,focus:table.data.rows.length-1};noteTableView.cell={index,column,row:0};syncNoteTableSelection();
  }
  function extendNoteTableSelection(context,row){
    const selected=noteTableView.selection?.index===context.index?noteTableView.selection:null;
    const column=selected?.column??context.column,anchor=selected?.anchor??context.row;
    row=Math.max(0,Math.min(noteTableView.blocks[context.index].data.rows.length-1,row));
    noteTableView.selection={index:context.index,column,anchor,focus:row};noteTableView.cell={index:context.index,column,row};syncNoteTableSelection();
    const cell=$('noteTables').querySelector(`[data-note-table="${context.index}"] [data-note-row="${row}"][data-note-cell-column="${column}"]`);
    (cell?.querySelector('[data-note-column]')||cell)?.focus({preventScroll:true});cell?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function syncNoteTableSelection(){
    const selection=noteTableView.selection;
    for(const cell of $('noteTables').querySelectorAll('[data-note-row]')){
      const index=Number(cell.closest('[data-note-table]').dataset.noteTable),row=Number(cell.dataset.noteRow);
      cell.classList.toggle('note-table-selected',Boolean(selection&&index===selection.index&&Number(cell.dataset.noteCellColumn)===selection.column&&row>=Math.min(selection.anchor,selection.focus)&&row<=Math.max(selection.anchor,selection.focus)));
    }
    for(const button of $('noteTables').querySelectorAll('[data-note-column]'))button.setAttribute('aria-pressed',String(Boolean(selection&&Number(button.closest('[data-note-table]').dataset.noteTable)===selection.index&&Number(button.dataset.noteColumn)===selection.column)));
  }
  function noteTableCopyData(context=null,{column=false,all=false}={}){
    const selection=!all&&noteTableView.selection,index=context?.index??selection?.index;
    const block=noteTableView.blocks[index];if(!block)return null;
    let data=TableData.model(block.data.rows.map((row,r)=>row.map((value,c)=>renderTableValue(value,block.data.originals[r]?.[c],true))),{header:block.data.header,align:block.data.align});
    if(column||selection&&selection.index===index){const c=context?.column??selection.column,from=selection&&selection.index===index&&selection.column===c?selection.anchor:0,to=selection&&selection.index===index&&selection.column===c?selection.focus:data.rows.length-1;data=TableData.column(data,c,from,to);}
    return data;
  }
  async function copyNoteTable(context=null,options={}){const data=noteTableCopyData(context,options);if(data)await writeEditorClipboard(TableData.serialize(data,'tsv'));}
  function editNoteTable(context){
    if(!context||note()?.content!==noteTableView.text)return toast('The table changed. Select it again before editing.');
    if(showTableEditor({range:context.table}))focusTableCell(context.row,context.column);
  }
  function wireNoteTables(){
    const view=$('noteTables');$('noteTableViewToggle').addEventListener('click',toggleNoteTableView);
    view.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.target.closest('[data-note-column]'))return;
      const context=noteTableContext(event.target);
      if(context&&event.shiftKey){event.preventDefault();extendNoteTableSelection(noteTableView.cell?.index===context.index?noteTableView.cell:context,context.row);}
      else{noteTableView.selection=null;noteTableView.cell=context&&{index:context.index,row:context.row,column:context.column};syncNoteTableSelection();}
    });
    view.addEventListener('focusin',event=>{const context=noteTableContext(event.target);if(context)noteTableView.cell={index:context.index,row:context.row,column:context.column};});
    view.addEventListener('click',event=>{
      const button=event.target.closest('[data-note-column]');if(button){if(button.getAttribute('aria-pressed')==='true'){noteTableView.selection=null;syncNoteTableSelection();}else{const context=noteTableContext(button);selectNoteTableColumn(context.index,Number(button.dataset.noteColumn));}return;}
      const link=event.target.closest('a[href]');if(link){if(event.shiftKey){event.preventDefault();return;}if(native){event.preventDefault();request('open_link',{reference:link.href}).catch(error=>toast(error.message));}}
    });
    view.addEventListener('dblclick',event=>{const context=noteTableContext(event.target);if(context&&!event.target.closest('a,button')){event.preventDefault();editNoteTable(context);}});
    view.addEventListener('copy',event=>{const data=noteTableView.selection&&noteTableCopyData();if(data&&event.clipboardData){event.preventDefault();event.clipboardData.setData('text/plain',TableData.serialize(data,'tsv'));event.clipboardData.setData('text/html',TableData.serialize(data,'html'));}});
    view.addEventListener('keydown',event=>{
      const context=noteTableView.cell,modified=event.ctrlKey||event.metaKey;
      if(modified&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);return;}
      if(modified&&event.key.toLowerCase()==='y'){event.preventDefault();undo(true);return;}
      if(modified&&event.key.toLowerCase()==='c'&&noteTableView.selection){event.preventDefault();copyNoteTable().catch(error=>toast(error.message));return;}
      if(context&&modified&&(event.key===' '||event.code==='Space')){event.preventDefault();selectNoteTableColumn(context.index,context.column);return;}
      if(context&&event.shiftKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();extendNoteTableSelection(context,(noteTableView.selection?.focus??context.row)+(event.key==='ArrowDown'?1:-1));return;}
      if(event.key==='Escape'&&noteTableView.selection){event.preventDefault();noteTableView.selection=null;syncNoteTableSelection();}
    });
    $('tableDialog').addEventListener('close',()=>{if($('tableDialog').open)return;refreshNoteTableView();if(noteTableView.active)view.focus({preventScroll:true});});
  }
