  const tableSourceFiles=new Set();
  let noteTableView={fileId:null,text:null,mode:null,blocks:[],slots:[],active:false,selection:null,cell:null,cursor:null,editing:null,writing:false,focus:null},noteTableTimer=0;
  function resetNoteTableView(){
    clearTimeout(noteTableTimer);noteTableTimer=0;
    noteTableView={fileId:null,text:null,mode:null,blocks:[],slots:[],active:false,selection:null,cell:null,cursor:null,editing:null,writing:false,focus:null};
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
  function noteTableCellContents(data,r,c){
    const value=data.rows[r][c],original=data.originals[r]?.[c];
    return data.header&&r===0?`<button type="button" data-note-column="${c}" aria-label="Select column ${tableColumnName(c)}" aria-pressed="false">${escape(renderTableValue(value,original,true))}</button>`:noteTableCellHTML(value,original);
  }
  // Text around tables: one editable slot before each table and one after the last. Blank lines that
  // separate text from a table stay in the source and are added when text is typed into an empty slot.
  function noteTableSlots(text,blocks){
    const count=blocks.length+1;
    return Array.from({length:count},(_,index)=>{
      const from=index?blocks[index-1].to:0,to=index<blocks.length?blocks[index].from:text.length,raw=text.slice(from,to);
      const prefix=index?/^\n{0,2}/.exec(raw)[0]:'',rest=raw.slice(prefix.length),suffix=(index<count-1?/\n{0,2}$/:/\n?$/).exec(rest)[0];
      return {index,count,from,to,raw,prefix,suffix,value:rest.slice(0,rest.length-suffix.length),original:{raw,prefix,suffix,value:rest.slice(0,rest.length-suffix.length)}};
    });
  }
  function noteSlotSource(slot,value){
    const first=slot.index===0,last=slot.index===slot.count-1,base=slot.original,end=last&&base.raw.endsWith('\n')?'\n':'';
    if(value===base.value)return {raw:base.raw,prefix:base.prefix};
    if(!value)return first?{raw:'',prefix:''}:last?{raw:end,prefix:''}:{raw:base.prefix+base.suffix,prefix:base.prefix};
    if(!base.value){const prefix=first?'':'\n\n';return {raw:prefix+value+(last?end:'\n\n'),prefix};}
    return {raw:base.prefix+value+base.suffix,prefix:base.prefix};
  }
  function noteTableBlocks(file){
    const blocks=TableData.documentTables(file.content,file.mode);
    return blocks.reduce((count,block)=>count+block.data.rows.length*block.data.rows[0].length,0)>TableData.limits.cells?[]:blocks;
  }
  function noteTableFocus(){
    const element=document.activeElement;if(!element||!$('noteTables').contains(element))return null;
    const slot=element.closest('[data-note-text]'),cell=element.closest('[data-note-row]'),table=element.closest('[data-note-table]');
    return {slot:slot?Number(slot.dataset.noteText):null,table:table?Number(table.dataset.noteTable):null,row:cell?.dataset.noteRow,column:cell?.dataset.noteCellColumn,start:element.selectionStart,end:element.selectionEnd};
  }
  function restoreNoteTableFocus(focus){
    if(!focus)return;const view=$('noteTables');
    if(focus.slot!==null){const area=view.querySelector(`[data-note-text="${focus.slot}"]`);if(area){area.focus({preventScroll:true});const at=Math.min(focus.start??area.value.length,area.value.length);area.setSelectionRange(at,Math.min(Math.max(at,focus.end??at),area.value.length));return;}}
    if(focus.table!==null&&focus.row!==undefined){const cell=noteTableCell(focus.table,Number(focus.row),Number(focus.column));if(cell){(cell.querySelector('[data-note-column]')||cell).focus({preventScroll:true});return;}}
    view.focus({preventScroll:true});
  }
  function noteTableCell(index,row,column){return $('noteTables').querySelector(`[data-note-table="${index}"] [data-note-row="${row}"][data-note-cell-column="${column}"]`);}
  function fitNoteText(area){area.style.height='auto';area.style.height=area.scrollHeight+'px';}
  function fitNoteTexts(){for(const area of $('noteTables').querySelectorAll('[data-note-text],.note-cell-input'))fitNoteText(area);}
  function renderNoteTables(){
    const view=noteTableView,focus=noteTableFocus();let html='';noteTableView.editing=null;
    view.slots=noteTableSlots(view.text,view.blocks);
    view.slots.forEach((slot,index)=>{
      const count=view.slots.length,label=index===0?'Text above the table':index===count-1?'Text below the table':'Text between tables';
      html+=`<textarea class="note-text-block" data-note-text="${index}" rows="1" spellcheck="false" aria-label="${label}" placeholder="${index===0?'Add text above the table…':index===count-1?'Add text below the table…':'Add text between the tables…'}"></textarea>`;
      const block=view.blocks[index];if(!block)return;const data=block.data;
      html+=`<section class="note-table-block" data-note-table="${index}" title="Click a cell to edit it. Click a heading to select its column."><table class="note-table-grid" aria-label="Table ${index+1}">`;
      if(!data.header)html+='<thead class="note-table-selectors"><tr>'+data.rows[0].map((_,column)=>`<th><button type="button" data-note-column="${column}" aria-label="Select column ${tableColumnName(column)}" aria-pressed="false">${tableColumnName(column)}</button></th>`).join('')+'</tr></thead>';
      html+='<tbody>'+data.rows.map((row,r)=>'<tr>'+row.map((value,c)=>{
        const header=data.header&&r===0,tag=header?'th':'td',align=header?'center':['left','center','right'].includes(data.align[c])?data.align[c]:'left';
        return `<${tag} data-note-row="${r}" data-note-cell-column="${c}"${header?' scope="col"':' tabindex="0"'} style="text-align:${align}">${noteTableCellContents(data,r,c)}</${tag}>`;
      }).join('')+'</tr>').join('')+'</tbody></table></section>';
    });
    $('noteTables').innerHTML=html;
    for(const area of $('noteTables').querySelectorAll('[data-note-text]'))area.value=view.slots[Number(area.dataset.noteText)].value;
    syncNoteTableSelection();restoreNoteTableFocus(focus);fitNoteTexts();requestAnimationFrame(fitNoteTexts);
  }
  // Writes keep the table view in place: each part's offsets move with the edit instead of re-rendering.
  function writeNoteTablePart(part,value,typing){
    const file=note(),view=noteTableView;
    if(!file||file.id!==view.fileId||file.content!==view.text||!tableFileReady()||activityBlocked())return false;
    const from=part.from,to=part.to,delta=value.length-(to-from);if(file.content.slice(from,to)===value)return true;
    view.writing=true;try{replaceText(from,to,value,from+value.length,from+value.length,{focus:false,typing});}finally{view.writing=false;}
    if(file.content===view.text)return false;view.text=file.content;
    for(const other of [...view.blocks,...view.slots])if(other!==part&&other.from>=to){other.from+=delta;other.to+=delta;}
    part.to=from+value.length;view.cursor=null;return true;
  }
  function noteTableSource(block,data){
    let value=TableData.serialize(data,block.format);
    if(block.indent)value=value.replace(/\n/g,'\n'+block.indent).replace(/^/,block.format==='markdown'?block.indent:'');
    return value;
  }
  function writeNoteTableData(index,change,typing=false){
    const block=noteTableView.blocks[index];if(!block)return false;
    try{const draft=JSON.parse(JSON.stringify(block.data));change(draft);const data=TableData.model(draft.rows,draft);if(!writeNoteTablePart(block,noteTableSource(block,data),typing))return false;block.data=data;return true;}
    catch(error){toast(error.message);return false;}
  }
  function reconcileNoteTables(){
    const file=note(),view=noteTableView;if(!view.active||!file||file.id!==view.fileId||file.content!==view.text)return;
    const blocks=noteTableBlocks(file);
    if(blocks.length!==view.blocks.length||blocks.some((block,index)=>block.from!==view.blocks[index].from||block.to!==view.blocks[index].to)){view.blocks=blocks;if(!blocks.length){refreshNoteTableView();return;}renderNoteTables();}
  }
  function startNoteCellEdit(cell,{select=false}={}){
    const context=noteTableContext(cell);if(!context||!tableFileReady()||activityBlocked())return false;
    if(note()?.content!==noteTableView.text){refreshNoteTableView();return false;}
    if(noteTableView.editing)finishNoteCellEdit();
    const {index,row,column}=context,value=context.table.data.rows[row][column],input=document.createElement('textarea');
    input.className='note-cell-input';input.rows=1;input.spellcheck=false;input.value=value;input.setAttribute('aria-label',`Row ${row+1}, column ${tableColumnName(column)}`);
    // Each cell edit is one undo step; Escape restores the table's exact original text.
    const block=context.table;
    cell.classList.add('note-cell-editing');cell.replaceChildren(input);noteTableView.editing={index,row,column,original:value,input,wrote:false,source:noteTableView.text.slice(block.from,block.to),data:block.data,history:histories.get(noteTableView.fileId)?.undo.length??0};
    noteTableView.selection=null;noteTableView.cell={index,row,column};syncNoteTableSelection();
    fitNoteText(input);input.focus({preventScroll:true});if(select)input.select();else input.setSelectionRange(value.length,value.length);
    cell.scrollIntoView({block:'nearest',inline:'nearest'});return true;
  }
  function finishNoteCellEdit(){
    const edit=noteTableView.editing;if(!edit)return;noteTableView.editing=null;
    const cell=noteTableCell(edit.index,edit.row,edit.column),block=noteTableView.blocks[edit.index];
    if(cell&&block){cell.classList.remove('note-cell-editing');cell.innerHTML=noteTableCellContents(block.data,edit.row,edit.column);syncNoteTableSelection();}
  }
  function cancelNoteCellEdit(edit){
    const block=noteTableView.blocks[edit.index];
    if(edit.wrote&&block&&writeNoteTablePart(block,edit.source,true)){
      block.data=edit.data;const history=histories.get(noteTableView.fileId);
      if(history){history.undo.length=Math.min(history.undo.length,edit.history);history.redo=[];}
    }
    finishNoteCellEdit();noteTableCell(edit.index,edit.row,edit.column)?.focus({preventScroll:true});
  }
  function moveNoteCellEdit(edit,row,column){
    const block=noteTableView.blocks[edit.index];if(!block)return;const rows=block.data.rows.length,columns=block.data.rows[0].length;
    if(column>=columns){column=0;row++;}else if(column<0){column=columns-1;row--;}
    if(row<0){finishNoteCellEdit();noteTableCell(edit.index,edit.row,edit.column)?.focus({preventScroll:true});return;}
    if(row>=rows){
      // Tab past the last cell adds a row, as in the table dialog.
      finishNoteCellEdit();if(!writeNoteTableData(edit.index,data=>{data.rows.push(Array(columns).fill(''));data.originals.push([]);data.rowMeta.push({});}))return;
      renderNoteTables();
    }else finishNoteCellEdit();
    const target=noteTableCell(edit.index,row,column);if(target)startNoteCellEdit(target);
  }
  function changeNoteTableShape(context,kind){
    if(!context||note()?.content!==noteTableView.text)return toast('The table changed. Select it again before editing.');
    const {index,row,column}=context;let next={row,column};
    const changed=writeNoteTableData(index,data=>{
      const columns=data.rows[0].length;
      if(kind==='rowAbove'||kind==='rowBelow'){const at=row+(kind==='rowBelow'?1:0);TableData.size(data.rows.length+1,columns);data.rows.splice(at,0,Array(columns).fill(''));data.originals.splice(at,0,[]);data.rowMeta.splice(at,0,{});next={row:at,column};}
      if(kind==='columnLeft'||kind==='columnRight'){const at=column+(kind==='columnRight'?1:0);TableData.size(data.rows.length,columns+1);data.rows.forEach((values,r)=>{values.splice(at,0,'');data.originals[r]??=[];data.originals[r].splice(at,0,null);});data.align.splice(at,0,'none');data.originalAlign.splice(at,0,'none');next={row,column:at};}
      if(kind==='deleteRow'){if(data.rows.length<2)throw new Error('A table needs at least one row.');data.rows.splice(row,1);data.originals.splice(row,1);data.rowMeta.splice(row,1);next={row:Math.min(row,data.rows.length-1),column};}
      if(kind==='deleteColumn'){if(columns<2)throw new Error('A table needs at least one column.');data.rows.forEach((values,r)=>{values.splice(column,1);data.originals[r]?.splice(column,1);});data.align.splice(column,1);data.originalAlign.splice(column,1);next={row,column:Math.min(column,columns-2)};}
    });
    if(!changed)return;renderNoteTables();const cell=noteTableCell(index,next.row,next.column);
    if(cell&&kind!=='deleteRow'&&kind!=='deleteColumn')startNoteCellEdit(cell);else (cell?.querySelector('[data-note-column]')||cell)?.focus({preventScroll:true});
  }
  function refreshNoteTableView({select=false,focus=false}={}){
    const file=state&&note();if(!file){resetNoteTableView();return;}
    if(noteTableView.writing)return;
    const previous=noteTableView,changed=previous.fileId!==file.id||previous.text!==file.content||previous.mode!==file.mode;
    if(changed){
      const same=previous.fileId===file.id;
      const blocks=noteTableBlocks(file),focus=same&&noteTableFocus();
      noteTableView={fileId:file.id,text:file.content,mode:file.mode,blocks,slots:[],active:same&&previous.active,selection:null,cell:null,cursor:same?previous.cursor:null,editing:null,writing:false,focus};
      $('noteTables').innerHTML='';
    }
    $('noteTableViewToggle').hidden=!noteTableView.blocks.length;
    if(!noteTableView.blocks.length){if(previous.active)showSourceEditor({remember:false,focus,repaint:true,restore:false});return;}
    if((select&&!tableSourceFiles.has(file.id))||noteTableView.active){
      if(!noteTableView.active)noteTableView.cursor={text:editor.value,start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection,top:editor.scrollTop,left:editor.scrollLeft};
      noteTableView.active=true;
      if(changed||!$('noteTables').innerHTML){renderNoteTables();if(noteTableView.focus){restoreNoteTableFocus(noteTableView.focus);noteTableView.focus=null;}}
      $('editorArea').hidden=true;$('noteTables').hidden=false;$('noteTableViewToggle').textContent='Edit Source';$('noteTableViewToggle').setAttribute('aria-pressed','true');
      if(focus)$('noteTables').focus({preventScroll:true});
      requestAnimationFrame(fitNoteTexts);
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
      if(event.button!==0||event.target.closest('[data-note-column],textarea'))return;
      const context=noteTableContext(event.target);
      if(context&&event.shiftKey){event.preventDefault();extendNoteTableSelection(noteTableView.cell?.index===context.index?noteTableView.cell:context,context.row);}
      else{noteTableView.selection=null;noteTableView.cell=context&&{index:context.index,row:context.row,column:context.column};syncNoteTableSelection();}
    });
    view.addEventListener('focusin',event=>{const context=noteTableContext(event.target);if(context)noteTableView.cell={index:context.index,row:context.row,column:context.column};});
    view.addEventListener('click',event=>{
      const button=event.target.closest('[data-note-column]');if(button){if(button.getAttribute('aria-pressed')==='true'){noteTableView.selection=null;syncNoteTableSelection();}else{const context=noteTableContext(button);selectNoteTableColumn(context.index,Number(button.dataset.noteColumn));}return;}
      const link=event.target.closest('a[href]');if(link){if(event.shiftKey){event.preventDefault();return;}if(native){event.preventDefault();request('open_link',{reference:link.href}).catch(error=>toast(error.message));}return;}
      // A plain click on a cell edits it in place; Shift-click keeps extending a column range.
      const cell=event.target.closest('td[data-note-row]');
      if(cell&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.target.closest('textarea')&&!getSelection()?.toString())startNoteCellEdit(cell);
    });
    view.addEventListener('dblclick',event=>{const header=event.target.closest('th[data-note-row]');if(header&&!event.target.closest('textarea')){event.preventDefault();startNoteCellEdit(header,{select:true});}});
    view.addEventListener('input',event=>{
      const area=event.target;
      if(area.matches('[data-note-text]')){
        const slot=noteTableView.slots[Number(area.dataset.noteText)];if(!slot)return;const value=area.value.replace(/\r\n?/g,'\n'),next=noteSlotSource(slot,value);
        if(writeNoteTablePart(slot,next.raw,true)){slot.value=value;slot.prefix=next.prefix;}else refreshNoteTableView();
        fitNoteText(area);return;
      }
      const edit=noteTableView.editing;if(!edit||area!==edit.input)return;
      const value=area.value.replace(/\r\n?/g,'\n');
      if(!writeNoteTableData(edit.index,data=>{data.rows[edit.row][edit.column]=value;},edit.wrote)){finishNoteCellEdit();refreshNoteTableView();return;}
      edit.wrote=true;fitNoteText(area);
    });
    view.addEventListener('focusout',event=>{
      const edit=noteTableView.editing;if(edit&&event.target===edit.input&&!$('editorContextMenu').contains(event.relatedTarget))finishNoteCellEdit();
      // A table typed into the surrounding text becomes a grid once focus leaves the note.
      if(!view.contains(event.relatedTarget))setTimeout(()=>{if(!view.contains(document.activeElement))reconcileNoteTables();});
    });
    view.addEventListener('copy',event=>{if(event.target.closest?.('textarea'))return;const data=noteTableView.selection&&noteTableCopyData();if(data&&event.clipboardData){event.preventDefault();event.clipboardData.setData('text/plain',TableData.serialize(data,'tsv'));event.clipboardData.setData('text/html',TableData.serialize(data,'html'));}});
    view.addEventListener('keydown',event=>{
      const context=noteTableView.cell,modified=event.ctrlKey||event.metaKey,edit=noteTableView.editing;
      if(modified&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);return;}
      if(modified&&event.key.toLowerCase()==='y'){event.preventDefault();undo(true);return;}
      if(edit&&event.target===edit.input){
        if(event.key==='Tab'){event.preventDefault();moveNoteCellEdit(edit,edit.row,edit.column+(event.shiftKey?-1:1));}
        else if(event.key==='Enter'&&!event.shiftKey&&!modified){event.preventDefault();if(edit.row+1<noteTableView.blocks[edit.index].data.rows.length)moveNoteCellEdit(edit,edit.row+1,edit.column);else{finishNoteCellEdit();noteTableCell(edit.index,edit.row,edit.column)?.focus({preventScroll:true});}}
        else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelNoteCellEdit(edit);}
        return;
      }
      if(event.target.closest('textarea'))return;
      const focused=event.target.closest('[data-note-row]');
      if(focused&&!modified&&(event.key==='Enter'||event.key==='F2')){event.preventDefault();startNoteCellEdit(focused);return;}
      if(modified&&event.key.toLowerCase()==='c'&&noteTableView.selection){event.preventDefault();copyNoteTable().catch(error=>toast(error.message));return;}
      if(context&&modified&&(event.key===' '||event.code==='Space')){event.preventDefault();selectNoteTableColumn(context.index,context.column);return;}
      if(context&&event.shiftKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();extendNoteTableSelection(context,(noteTableView.selection?.focus??context.row)+(event.key==='ArrowDown'?1:-1));return;}
      if(event.key==='Escape'&&noteTableView.selection){event.preventDefault();noteTableView.selection=null;syncNoteTableSelection();}
    });
    $('tableDialog').addEventListener('close',()=>{if($('tableDialog').open)return;refreshNoteTableView();if(noteTableView.active)view.focus({preventScroll:true});});
  }
