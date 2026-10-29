  let tableSession=null,tablePreviewTimer=null,tablePlainPasteUntil=0;
  const tableColumnName=index=>{let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
  const tableFingerprint=data=>JSON.stringify([data.rows,data.header,data.align]);
  const tableImportMessage=data=>[data.tableCount>1?'Showing the first of '+data.tableCount+' tables.':'',data.merged?'Merged cells were expanded to individual cells. Values are kept in their upper-left cell.':''].filter(Boolean).join(' ');
  function tableFileReady(){return ready&&!startupBlocked&&note()&&!note().trashedAt&&!editor.readOnly&&!movingFiles.size&&!closingFiles.size&&!applicationCloseRunning&&!collectingTabs&&!sendingTabCollection;}
  function tableAtSelection(){
    const file=note(),from=editor.selectionStart,to=editor.selectionEnd,text=editor.value;
    if(['text','markdown'].includes(file.mode)){const found=TableData.markdownAt(text,from,to);if(found)return found;}
    if(['text','markdown','html'].includes(file.mode)){const found=TableData.htmlAt(text,from,to);if(found)return found;}
    if(/\.(csv|tsv)$/i.test(file.title)&&text.length<=TableData.limits.characters){const format=/\.tsv$/i.test(file.title)?'tsv':'csv',data=TableData.delimited(text,format==='tsv'?'\t':',');if(data)return {from:0,to:text.length,format,data,indent:''};}
    return null;
  }
  function showTableEditor({paste=false,data=null,plain='',source='',range=null,insert=false,at=null}={}){
    if(!tableFileReady()||activityBlocked())return false;
    closeMenus();let existing=null;
    try{if(!paste&&!data&&!insert)existing=range||tableAtSelection();}catch(error){toast(error.message);return false;}
    const file=note(),format=existing?.format||(file.mode==='html'?'html':/\.csv$/i.test(file.title)?'csv':/\.tsv$/i.test(file.title)?'tsv':'markdown');
    tableSession={fileId:file.id,mode:file.mode,text:editor.value,from:existing?.from??at??editor.selectionStart,to:existing?.to??at??editor.selectionEnd,direction:editor.selectionDirection||'none',indent:existing?.indent||'',existing:Boolean(existing),initialFormat:format,data:data||existing?.data||TableData.blank(),active:{row:0,column:0},tab:'cells',plain,source};
    tableSession.initialFingerprint=tableFingerprint(tableSession.data);tableSession.plain=plain.replace(/\r\n?/g,'\n');
    $('tableDialogTitle').textContent=existing?'Edit Table':'Insert Table';$('tableApply').textContent=existing?'Update Table':'Insert Table';$('tableFormat').value=format;$('tableHeader').checked=tableSession.data.header;
    $('tableMessage').textContent=tableImportMessage(tableSession.data);$('tablePasteInput').value='';$('tableSeparator').value='auto';$('tablePasteDetails').open=paste&&!data;$('tablePasteAsText').hidden=!plain;
    renderTableGrid();setTableTab('cells');$('tableDialog').showModal();
    if(paste&&!data)$('tablePasteInput').focus();else focusTableCell(0,0);
    return true;
  }
  function tableCellAt(row,column){return $('tableGrid').querySelector(`[data-table-row="${row}"][data-table-column="${column}"]`);}
  function focusTableCell(row,column,keepSelection=false){
    if(!tableSession)return;const data=tableSession.data;row=Math.max(0,Math.min(data.rows.length-1,row));column=Math.max(0,Math.min(data.rows[0].length-1,column));if(!keepSelection)tableSession.selection=null;tableSession.active={row,column};tableCellAt(row,column)?.focus();syncTableControls();
  }
  function clearTableSelection(){if(tableSession){tableSession.selection=null;syncTableControls();}}
  function selectTableColumn(column=tableSession?.active.column){
    if(!tableSession)return;tableSession.selection={column,anchor:0,focus:tableSession.data.rows.length-1};tableSession.active.column=column;syncTableControls();
  }
  function extendTableColumn(row){
    const current=tableSession.selection,{column}=current||tableSession.active,anchor=current?.anchor??tableSession.active.row;
    row=Math.max(0,Math.min(tableSession.data.rows.length-1,row));tableSession.selection={column,anchor,focus:row};tableSession.active={row,column};
    if(tableSession.tab==='cells')focusTableCell(row,column,true);
    else{const cell=$('tablePreview').querySelector(`[data-table-preview-row="${row}"][data-table-column="${column}"]`);(cell?.querySelector('[data-table-select-column]')||cell)?.focus({preventScroll:true});}
    syncTableControls();
  }
  function tableCopyData(){const selected=tableSession.selection;return selected?TableData.column(tableSession.data,selected.column,selected.anchor,selected.focus):tableSession.data;}
  function syncTableSelection(){
    const selected=tableSession.selection,first=selected?Math.min(selected.anchor,selected.focus):-1,last=selected?Math.max(selected.anchor,selected.focus):-1;
    for(const cell of $('tableDialog').querySelectorAll('[data-table-cell-row]'))cell.classList.toggle('table-cell-selected',Boolean(selected&&Number(cell.dataset.tableColumn)===selected.column&&Number(cell.dataset.tableCellRow)>=first&&Number(cell.dataset.tableCellRow)<=last));
    for(const button of $('tableDialog').querySelectorAll('[data-table-select-column]'))button.setAttribute('aria-pressed',String(Boolean(selected&&Number(button.dataset.tableSelectColumn)===selected.column)));
    $('tableClearSelection').hidden=!selected;$('tableSelectColumn').disabled=tableSession.tab==='source';
    $('tableCopy').textContent=selected?(first===0&&last===tableSession.data.rows.length-1?'Copy Column':'Copy Selection'):'Copy Table';
    if(selected)$('tableSelection').textContent=`${tableColumnName(selected.column)}${first+1}:${tableColumnName(selected.column)}${last+1} · ${last-first+1} selected ${first===last?'cell':'cells'}`;
  }
  function tableColumnButton(column,label=tableColumnName(column)){return `<button type="button" class="table-column-select" data-table-select-column="${column}" aria-label="Select column ${tableColumnName(column)}" aria-pressed="false" title="Select column ${tableColumnName(column)}">${label}</button>`;}
  function renderTableGrid(){
    const data=tableSession.data,columns=data.rows[0].length;
    const widths=Array.from({length:columns},(_,column)=>{let width=14;for(const row of data.rows){let line=0;for(const char of row[column]){line=char==='\n'?0:line+1;width=Math.max(width,line);if(width>=64)break;}if(width>=64)break;}return Math.min(64,width)*8+24;});
    $('tableGrid').innerHTML='<table class="table-edit-grid"><colgroup><col style="width:39px">'+widths.map(width=>`<col style="width:${width}px">`).join('')+'</colgroup><thead><tr><th class="table-row-number" aria-label="Row"></th>'+Array.from({length:columns},(_,c)=>'<th scope="col">'+tableColumnButton(c)+'</th>').join('')+'</tr></thead><tbody>'+data.rows.map((row,r)=>'<tr'+(data.header&&r===0?' class="table-header-row"':'')+'><th scope="row" class="table-row-number">'+(r+1)+'</th>'+row.map((value,c)=>`<td data-table-cell-row="${r}" data-table-column="${c}"><textarea rows="1" data-table-row="${r}" data-table-column="${c}" aria-label="Row ${r+1}, column ${tableColumnName(c)}" spellcheck="false">${escape(value)}</textarea></td>`).join('')+'</tr>').join('')+'</tbody></table>';
    const inputs=[...$('tableGrid').querySelectorAll('textarea')],heights=inputs.map(input=>Math.min(140,Math.max(46,input.scrollHeight)));inputs.forEach((input,index)=>input.style.height=heights[index]+'px');
    syncTableControls();scheduleTablePreview();
  }
  function fitTableCell(input){input.style.height='auto';input.style.height=Math.min(140,Math.max(46,input.scrollHeight))+'px';}
  function syncTableControls(){
    if(!tableSession)return;const data=tableSession.data,{row,column}=tableSession.active,format=$('tableFormat').value;
    $('tableRows').value=String(data.rows.length);$('tableColumns').value=String(data.rows[0].length);$('tableHeader').checked=data.header;
    $('tableSelection').textContent=`Row ${row+1} · column ${tableColumnName(column)}`;$('tableSummary').textContent=`${data.rows.length} row${data.rows.length===1?'':'s'} × ${data.rows[0].length} column${data.rows[0].length===1?'':'s'}`;
    $('tableDeleteRow').disabled=data.rows.length<=1;$('tableDeleteColumn').disabled=data.rows[0].length<=1;$('tableAlignment').value=data.align[column]||'none';$('tableAlignment').disabled=!['markdown','html'].includes(format);
    syncTableSelection();
  }
  function setTableTab(tab){
    tableSession.tab=tab;
    if(tab==='source')tableSession.selection=null;
    for(const button of document.querySelectorAll('[data-table-tab]')){const selected=button.dataset.tableTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    $('tableGrid').hidden=tab!=='cells';$('tablePreview').hidden=tab!=='preview';$('tableSource').hidden=tab!=='source';renderTablePreview();syncTableControls();
  }
  function scheduleTablePreview(){clearTimeout(tablePreviewTimer);tablePreviewTimer=setTimeout(()=>{tablePreviewTimer=null;if(tableSession&&tableSession.tab!=='cells')renderTablePreview();},100);}
  function renderTablePreview(){
    if(!tableSession||tableSession.tab==='cells')return;const data=tableSession.data;
    if(tableSession.tab==='source'){$('tableSource').textContent=TableData.serialize(data,$('tableFormat').value);return;}
    const selectors=data.header?'':'<thead class="table-preview-selectors"><tr>'+data.rows[0].map((_,c)=>'<th>'+tableColumnButton(c)+'</th>').join('')+'</tr></thead>';
    $('tablePreview').innerHTML='<table class="table-result">'+selectors+'<tbody>'+data.rows.map((row,r)=>'<tr>'+row.map((value,c)=>{const header=data.header&&r===0,tag=header?'th':'td',contents=renderTableValue(value,data.originals[r]?.[c]);return '<'+tag+' data-table-cell-row="'+r+'" data-table-preview-row="'+r+'" data-table-column="'+c+'"'+(header?' scope="col"':' tabindex="0" aria-label="Row '+(r+1)+', column '+tableColumnName(c)+'"')+' style="text-align:'+(['left','center','right'].includes(data.align[c])?data.align[c]:'left')+'">'+(header?tableColumnButton(c,escape(value).replace(/\n/g,'<br>')):contents)+'</'+tag+'>';}).join('')+'</tr>').join('')+'</tbody></table>';
    syncTableSelection();
  }
  function tableSafeLink(href){try{const url=new URL(href);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;}catch(_){return null;}}
  function renderTableValue(value,original,plain=false){
    if(plain){if(original?.value===value&&original.links?.length)return value;return value.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)|`([^`\n]+)`/g,(all,label,href,code)=>code!==undefined?code:tableSafeLink(href)?label:all);}
    let result='',at=0;
    if(original?.value===value&&original.links?.length){
      for(const link of original.links){const href=tableSafeLink(link.href),index=link.text?value.indexOf(link.text,at):-1;if(!href||index<0)continue;result+=escape(value.slice(at,index))+`<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(link.text)}</a>`;at=index+link.text.length;}
    }else{
      for(const match of value.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)|`([^`\n]+)`/g)){const href=match[2]&&tableSafeLink(match[2]);result+=escape(value.slice(at,match.index))+(match[3]!==undefined?'<code>'+escape(match[3])+'</code>':href?`<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(match[1])}</a>`:escape(match[0]));at=match.index+match[0].length;}
    }
    return (result+escape(value.slice(at))).replace(/\n/g,'<br>');
  }
  function loadTableData(data){
    if(!data)throw new Error('No table was found. Paste cells, Markdown, CSV or tab-separated text.');
    tableSession.data=data;tableSession.selection=null;tableSession.active={row:0,column:0};$('tableMessage').textContent=tableImportMessage(data)||'Table loaded. Review the cells, then insert it.';$('tablePasteDetails').open=false;$('tablePasteInput').value='';renderTableGrid();setTableTab('cells');focusTableCell(0,0);
  }
  function pasteTableCells(data,row,column){
    const target=tableSession.data,rows=Math.max(target.rows.length,row+data.rows.length),columns=Math.max(target.rows[0].length,column+data.rows[0].length);TableData.size(rows,columns);
    const values=Array.from({length:rows},(_,r)=>Array.from({length:columns},(_,c)=>target.rows[r]?.[c]||''));
    data.rows.forEach((cells,r)=>cells.forEach((value,c)=>values[row+r][column+c]=value));
    tableSession.data=TableData.model(values,{...target,align:Array.from({length:columns},(_,c)=>target.align[c]||'none')});renderTableGrid();focusTableCell(row,column);$('tableMessage').textContent='Pasted cells. Other cells were kept.';
  }
  function changeTableStructure(kind){
    const data=tableSession.data,{row,column}=tableSession.active;let nextRow=row,nextColumn=column;
    try{
      if(kind==='add-row'){TableData.size(data.rows.length+1,data.rows[0].length);data.rows.splice(row+1,0,Array(data.rows[0].length).fill(''));data.originals.splice(row+1,0,[]);data.rowMeta.splice(row+1,0,{});nextRow++;}
      if(kind==='add-column'){TableData.size(data.rows.length,data.rows[0].length+1);data.rows.forEach((values,r)=>{values.splice(column+1,0,'');data.originals[r]??=[];data.originals[r].splice(column+1,0,null);});data.align.splice(column+1,0,'none');data.originalAlign.splice(column+1,0,'none');nextColumn++;}
      if(kind==='delete-row'&&data.rows.length>1){data.rows.splice(row,1);data.originals.splice(row,1);data.rowMeta.splice(row,1);nextRow=Math.min(row,data.rows.length-1);}
      if(kind==='delete-column'&&data.rows[0].length>1){data.rows.forEach((values,r)=>{values.splice(column,1);data.originals[r]?.splice(column,1);});data.align.splice(column,1);data.originalAlign.splice(column,1);nextColumn=Math.min(column,data.rows[0].length-1);}
      renderTableGrid();focusTableCell(nextRow,nextColumn);$('tableMessage').textContent='';
    }catch(error){$('tableMessage').textContent=error.message;}
  }
  function resizeTable(){
    try{
      const rows=Number($('tableRows').value),columns=Number($('tableColumns').value);TableData.size(rows,columns);const data=tableSession.data;
      tableSession.data=TableData.model(Array.from({length:rows},(_,r)=>Array.from({length:columns},(_,c)=>data.rows[r]?.[c]||'')),{...data,originals:Array.from({length:rows},(_,r)=>Array.from({length:columns},(_,c)=>data.originals[r]?.[c]||null)),rowMeta:data.rowMeta.slice(0,rows),align:Array.from({length:columns},(_,c)=>data.align[c]||'none')});renderTableGrid();focusTableCell(Math.min(tableSession.active.row,rows-1),Math.min(tableSession.active.column,columns-1));$('tableMessage').textContent='';
    }catch(error){$('tableMessage').textContent=error.message;}
  }
  function tableInsertion(text,from,to,value,format){
    const before=text.slice(0,from),after=text.slice(to),gap=['markdown','html'].includes(format)?'\n\n':'\n';
    const prefix=before&&!before.endsWith(gap)?gap.slice(before.endsWith('\n')?1:0):'',suffix=after&&!after.startsWith(gap)?gap.slice(after.startsWith('\n')?1:0):'';
    return {text:prefix+value+suffix,start:from+prefix.length,end:from+prefix.length+value.length};
  }
  function applyTable(asText=false){
    if(!tableSession)return false;const session=tableSession,file=note();
    if(!asText&&$('tableForm').reportValidity&&!$('tableForm').reportValidity())return false;
    if(!file||file.id!==session.fileId||file.content!==session.text||file.mode!==session.mode||file.trashedAt||startupBlocked||editor.readOnly){$('tableMessage').textContent='The file changed while this table was open. Copy the cells, then reopen the table to keep both sets of changes.';return false;}
    try{
      const format=$('tableFormat').value,data=asText?session.data:TableData.model(session.data.rows,session.data);let value=asText?session.plain:TableData.serialize(data,format);
      if(!asText&&session.existing&&format===session.initialFormat&&tableFingerprint(data)===session.initialFingerprint){$('tableDialog').close();return true;}
      if(!asText&&session.existing&&session.indent)value=value.replace(/\n/g,'\n'+session.indent).replace(/^/,session.initialFormat==='markdown'?session.indent:'');
      const insertion=session.existing||asText?{text:value,start:session.from,end:session.from+value.length}:tableInsertion(session.text,session.from,session.to,value,format);
      if(insertion.text!==session.text.slice(session.from,session.to))replaceText(session.from,session.to,insertion.text,insertion.start,insertion.end);
      $('tableDialog').close();if(typeof refreshNoteTableView==='function')refreshNoteTableView({select:!asText,focus:true});toast(asText?'Pasted the original clipboard text.':session.existing?'Updated table. Undo restores the previous table.':'Inserted table. Use Tools → Insert/Edit Table to edit its cells.');return true;
    }catch(error){$('tableMessage').textContent=error.message;return false;}
  }
  async function copyTableCells(){
    if(!tableSession)return;const text=TableData.serialize(tableCopyData(),'tsv'),focused=document.activeElement;
    try{
      if(native)await request('clipboard',{text});
      else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else{const input=document.createElement('textarea');input.value=text;input.className='table-copy-buffer';$('tableDialog').append(input);input.select();try{if(!document.execCommand('copy'))throw new Error('Clipboard unavailable.');}finally{input.remove();focused?.focus();}}
      $('tableMessage').textContent=tableSession.selection?'Copied the selected column cells.':'Copied the table as tab-separated text.';
    }catch(error){$('tableMessage').textContent='Could not copy cells: '+error.message;}
  }
  function wireEditorTables(){
    const dialog=$('tableDialog');
    for(const region of [$('tableGrid'),$('tablePreview')]){
      region.addEventListener('focusin',event=>{const button=event.target.closest('[data-table-select-column]');if(button){tableSession.active.column=Number(button.dataset.tableSelectColumn);syncTableControls();}});
      region.addEventListener('pointerdown',event=>{
        if(event.button!==0||!tableSession)return;
        if(event.target.closest('[data-table-select-column]'))return;
        const cell=event.target.closest('[data-table-cell-row]');if(!cell)return;
        if(event.shiftKey){event.preventDefault();extendTableColumn(Number(cell.dataset.tableCellRow));}
        else{tableSession.active={row:Number(cell.dataset.tableCellRow),column:Number(cell.dataset.tableColumn)};clearTableSelection();}
      });
      region.addEventListener('click',event=>{
        const button=event.target.closest('[data-table-select-column]');
        if(button){if(button.getAttribute('aria-pressed')==='true')clearTableSelection();else selectTableColumn(Number(button.dataset.tableSelectColumn));return;}
        const link=event.target.closest('a[href]');if(link&&event.shiftKey){event.preventDefault();return;}
        if(link&&native){event.preventDefault();request('open_link',{reference:link.href}).catch(error=>{$('tableMessage').textContent=error.message;});}
      });
    }
    $('tablePreview').addEventListener('focusin',event=>{const cell=event.target.closest('[data-table-preview-row]');if(cell){tableSession.active={row:Number(cell.dataset.tablePreviewRow),column:Number(cell.dataset.tableColumn)};syncTableControls();}});
    $('tableSelectColumn').addEventListener('click',()=>selectTableColumn());
    $('tableClearSelection').addEventListener('click',clearTableSelection);
    dialog.addEventListener('copy',event=>{
      if(!tableSession?.selection||!event.clipboardData||tableSession.tab==='source'||event.target.matches?.('input,select,textarea:not([data-table-row])'))return;
      event.preventDefault();event.clipboardData.setData('text/plain',TableData.serialize(tableCopyData(),'tsv'));event.clipboardData.setData('text/html',TableData.serialize(tableCopyData(),'html'));
    });
    dialog.addEventListener('keydown',event=>{
      if(!tableSession||tableSession.tab==='source')return;
      const inCell=event.target.matches?.('textarea[data-table-row]'),context=inCell||!event.target.matches?.('input,textarea,select');
      if(context&&(event.ctrlKey||event.metaKey)&&!event.altKey&&(event.key===' '||event.code==='Space')){event.preventDefault();selectTableColumn();return;}
      if(context&&event.shiftKey&&['ArrowUp','ArrowDown'].includes(event.key)&&(tableSession.selection||event.target.matches?.('[data-table-preview-row]'))){event.preventDefault();extendTableColumn((tableSession.selection?.focus??tableSession.active.row)+(event.key==='ArrowDown'?1:-1));return;}
      if(!tableSession.selection||!context)return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'){event.preventDefault();copyTableCells();return;}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();clearTableSelection();return;}
      if(inCell&&!['Shift','Control','Meta','Alt'].includes(event.key))clearTableSelection();
    });
    const separator=()=>({tabs:'\t',comma:',',semicolon:';'}[$('tableSeparator').value]||'auto');
    $('tableForm').addEventListener('submit',event=>{event.preventDefault();applyTable();});
    for(const id of ['tableCancel','tableClose'])$(id).addEventListener('click',()=>dialog.close());
    // A queued close event may arrive after another table session has opened.
    dialog.addEventListener('close',()=>{if(dialog.open)return;clearTimeout(tablePreviewTimer);tableSession=null;for(const id of ['tableGrid','tablePreview'])$(id).innerHTML='';$('tableSource').textContent='';$('tablePasteInput').value='';editor.focus();});
    $('tableTabs').addEventListener('click',event=>{const button=event.target.closest('[data-table-tab]');if(button)setTableTab(button.dataset.tableTab);});
    $('tableTabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['cells','preview','source'],index=tabs.indexOf(tableSession.tab),next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;setTableTab(tabs[next]);$('tableTabs').querySelector(`[data-table-tab="${tabs[next]}"]`).focus();});
    $('tableGrid').addEventListener('focusin',event=>{const input=event.target;if(!input.matches('textarea[data-table-row]'))return;tableSession.active={row:Number(input.dataset.tableRow),column:Number(input.dataset.tableColumn)};syncTableControls();});
    $('tableGrid').addEventListener('input',event=>{const input=event.target;if(!input.matches('textarea[data-table-row]'))return;tableSession.data.rows[Number(input.dataset.tableRow)][Number(input.dataset.tableColumn)]=input.value;fitTableCell(input);tableSession.selection=null;syncTableControls();scheduleTablePreview();});
    $('tableGrid').addEventListener('paste',event=>{
      if(!event.clipboardData)return;const input=event.target;if(!input.matches('textarea[data-table-row]'))return;
      try{const data=TableData.clipboard(event.clipboardData.getData('text/plain'),event.clipboardData.getData('text/html'));if(!data)return;event.preventDefault();pasteTableCells(data,Number(input.dataset.tableRow),Number(input.dataset.tableColumn));}
      catch(error){event.preventDefault();$('tableMessage').textContent=error.message;}
    });
    $('tableGrid').addEventListener('keydown',event=>{
      if(event.key!=='Tab'||!event.target.matches('textarea[data-table-row]'))return;const {row,column}=tableSession.active,columns=tableSession.data.rows[0].length,index=row*columns+column+(event.shiftKey?-1:1);if(index<0)return;
      event.preventDefault();if(index>=tableSession.data.rows.length*columns){try{TableData.size(tableSession.data.rows.length+1,columns);tableSession.data.rows.push(Array(columns).fill(''));tableSession.data.originals.push([]);tableSession.data.rowMeta.push({});renderTableGrid();}catch(error){$('tableMessage').textContent=error.message;$('tableApply').focus();return;}}focusTableCell(Math.floor(index/columns),index%columns);
    });
    dialog.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();applyTable();}});
    for(const [id,kind]of [['tableAddRow','add-row'],['tableAddColumn','add-column'],['tableDeleteRow','delete-row'],['tableDeleteColumn','delete-column']])$(id).addEventListener('click',()=>changeTableStructure(kind));
    $('tableResize').addEventListener('click',resizeTable);$('tableCopy').addEventListener('click',copyTableCells);$('tablePasteAsText').addEventListener('click',()=>applyTable(true));
    $('tableHeader').addEventListener('change',()=>{tableSession.data.header=$('tableHeader').checked;renderTableGrid();});
    $('tableFormat').addEventListener('change',()=>{syncTableControls();scheduleTablePreview();});
    $('tableAlignment').addEventListener('change',()=>{tableSession.data.align[tableSession.active.column]=$('tableAlignment').value;scheduleTablePreview();});
    $('tableLoadPaste').addEventListener('click',()=>{try{loadTableData(TableData.fromText($('tablePasteInput').value,separator()));}catch(error){$('tableMessage').textContent=error.message;}});
    $('tablePasteInput').addEventListener('paste',event=>{
      if(!event.clipboardData)return;
      try{const rich=event.clipboardData.getData('text/html'),data=/<table(?:\s|>)/i.test(rich)?TableData.fromHTML(rich):TableData.fromText(event.clipboardData.getData('text/plain'),separator());if(!data)return;event.preventDefault();loadTableData(data);}catch(error){event.preventDefault();$('tableMessage').textContent=error.message;}
    });
    editor.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='v')tablePlainPasteUntil=Date.now()+1500;},true);
    editor.addEventListener('paste',event=>{
      if(event.defaultPrevented||!event.clipboardData||Date.now()<tablePlainPasteUntil||!tableFileReady()||activityBlocked()||!['text','markdown'].includes(note().mode))return;
      const plain=event.clipboardData.getData('text/plain'),rich=event.clipboardData.getData('text/html'),richTable=/<table(?:\s|>)/i.test(rich);
      if(!richTable&&(note().mode!=='markdown'||!plain.includes('\t'))||/<(?:pre|code)\b/i.test(rich))return;
      const from=editor.selectionStart,to=editor.selectionEnd,text=editor.value,lineStart=text.lastIndexOf('\n',from-1)+1,nextBreak=text.indexOf('\n',to),lineEnd=nextBreak<0?text.length:nextBreak;
      if(text.slice(lineStart,from).trim()||text.slice(to,lineEnd).trim()||TableData.inFence(text,from))return;
      try{const data=TableData.clipboard(plain,rich);if(!data||!richTable&&data.rows.length<2)return;event.preventDefault();event.stopImmediatePropagation();showTableEditor({paste:true,data,plain,source:'clipboard'});}
      catch(error){toast(error.message+' The normal text paste was kept.');}
    },true);
  }
