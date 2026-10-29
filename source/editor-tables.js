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
  function showTableEditor({paste=false,data=null,plain='',source=''}={}){
    if(!tableFileReady()||activityBlocked())return false;
    closeMenus();let existing=null;
    try{if(!paste&&!data)existing=tableAtSelection();}catch(error){toast(error.message);return false;}
    const file=note(),format=existing?.format||(file.mode==='html'?'html':/\.csv$/i.test(file.title)?'csv':/\.tsv$/i.test(file.title)?'tsv':'markdown');
    tableSession={fileId:file.id,mode:file.mode,text:editor.value,from:existing?.from??editor.selectionStart,to:existing?.to??editor.selectionEnd,direction:editor.selectionDirection||'none',indent:existing?.indent||'',existing:Boolean(existing),initialFormat:format,data:data||existing?.data||TableData.blank(),active:{row:0,column:0},tab:'cells',plain,source};
    tableSession.initialFingerprint=tableFingerprint(tableSession.data);tableSession.plain=plain.replace(/\r\n?/g,'\n');
    $('tableDialogTitle').textContent=existing?'Edit Table':'Insert Table';$('tableApply').textContent=existing?'Update Table':'Insert Table';$('tableFormat').value=format;$('tableHeader').checked=tableSession.data.header;
    $('tableMessage').textContent=tableImportMessage(tableSession.data);$('tablePasteInput').value='';$('tableSeparator').value='auto';$('tablePasteDetails').open=paste&&!data;$('tablePasteAsText').hidden=!plain;
    renderTableGrid();setTableTab('cells');$('tableDialog').showModal();
    if(paste&&!data)$('tablePasteInput').focus();else focusTableCell(0,0);
    return true;
  }
  function tableCellAt(row,column){return $('tableGrid').querySelector(`[data-table-row="${row}"][data-table-column="${column}"]`);}
  function focusTableCell(row,column){
    if(!tableSession)return;const data=tableSession.data;row=Math.max(0,Math.min(data.rows.length-1,row));column=Math.max(0,Math.min(data.rows[0].length-1,column));tableSession.active={row,column};tableCellAt(row,column)?.focus();syncTableControls();
  }
  function renderTableGrid(){
    const data=tableSession.data,columns=data.rows[0].length;
    $('tableGrid').innerHTML='<table class="table-edit-grid"><thead><tr><th class="table-row-number" aria-label="Row"></th>'+Array.from({length:columns},(_,c)=>'<th scope="col">'+tableColumnName(c)+'</th>').join('')+'</tr></thead><tbody>'+data.rows.map((row,r)=>'<tr'+(data.header&&r===0?' class="table-header-row"':'')+'><th scope="row" class="table-row-number">'+(r+1)+'</th>'+row.map((value,c)=>`<td><textarea rows="1" data-table-row="${r}" data-table-column="${c}" aria-label="Row ${r+1}, column ${tableColumnName(c)}" spellcheck="false">${escape(value)}</textarea></td>`).join('')+'</tr>').join('')+'</tbody></table>';
    $('tableGrid').querySelector('table').style.minWidth=(columns*160+43)+'px';
    for(const input of $('tableGrid').querySelectorAll('textarea'))if(input.value.includes('\n')||input.value.length>80)fitTableCell(input);
    syncTableControls();scheduleTablePreview();
  }
  function fitTableCell(input){input.style.height='auto';input.style.height=Math.min(140,Math.max(38,input.scrollHeight))+'px';}
  function syncTableControls(){
    if(!tableSession)return;const data=tableSession.data,{row,column}=tableSession.active,format=$('tableFormat').value;
    $('tableRows').value=String(data.rows.length);$('tableColumns').value=String(data.rows[0].length);$('tableHeader').checked=data.header;
    $('tableSelection').textContent=`Row ${row+1} · column ${tableColumnName(column)}`;$('tableSummary').textContent=`${data.rows.length} row${data.rows.length===1?'':'s'} × ${data.rows[0].length} column${data.rows[0].length===1?'':'s'}`;
    $('tableDeleteRow').disabled=data.rows.length<=1;$('tableDeleteColumn').disabled=data.rows[0].length<=1;$('tableAlignment').value=data.align[column]||'none';$('tableAlignment').disabled=!['markdown','html'].includes(format);
  }
  function setTableTab(tab){
    tableSession.tab=tab;
    for(const button of document.querySelectorAll('[data-table-tab]')){const selected=button.dataset.tableTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    $('tableGrid').hidden=tab!=='cells';$('tablePreview').hidden=tab!=='preview';$('tableSource').hidden=tab!=='source';renderTablePreview();
  }
  function scheduleTablePreview(){clearTimeout(tablePreviewTimer);tablePreviewTimer=setTimeout(()=>{tablePreviewTimer=null;if(tableSession&&tableSession.tab!=='cells')renderTablePreview();},100);}
  function renderTablePreview(){
    if(!tableSession||tableSession.tab==='cells')return;const data=tableSession.data;
    if(tableSession.tab==='source'){$('tableSource').textContent=TableData.serialize(data,$('tableFormat').value);return;}
    $('tablePreview').innerHTML='<table class="table-result"><tbody>'+data.rows.map((row,r)=>'<tr>'+row.map((value,c)=>{const tag=data.header&&r===0?'th':'td';return '<'+tag+' style="text-align:'+(['left','center','right'].includes(data.align[c])?data.align[c]:'left')+'">'+escape(value).replace(/\n/g,'<br>')+'</'+tag+'>';}).join('')+'</tr>').join('')+'</tbody></table>';
  }
  function loadTableData(data){
    if(!data)throw new Error('No table was found. Paste cells, Markdown, CSV or tab-separated text.');
    tableSession.data=data;tableSession.active={row:0,column:0};$('tableMessage').textContent=tableImportMessage(data)||'Table loaded. Review the cells, then insert it.';$('tablePasteDetails').open=false;$('tablePasteInput').value='';renderTableGrid();setTableTab('cells');focusTableCell(0,0);
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
      $('tableDialog').close();toast(asText?'Pasted the original clipboard text.':session.existing?'Updated table. Undo restores the previous table.':'Inserted table. Use Tools → Insert/Edit Table to edit its cells.');return true;
    }catch(error){$('tableMessage').textContent=error.message;return false;}
  }
  async function copyTableCells(){
    if(!tableSession)return;const text=TableData.serialize(tableSession.data,'tsv'),focused=document.activeElement;
    try{
      if(native)await request('clipboard',{text});
      else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else{const input=document.createElement('textarea');input.value=text;input.className='table-copy-buffer';$('tableDialog').append(input);input.select();try{if(!document.execCommand('copy'))throw new Error('Clipboard unavailable.');}finally{input.remove();focused?.focus();}}
      $('tableMessage').textContent='Copied cells as tab-separated text.';
    }catch(error){$('tableMessage').textContent='Could not copy cells: '+error.message;}
  }
  function wireEditorTables(){
    const dialog=$('tableDialog');
    const separator=()=>({tabs:'\t',comma:',',semicolon:';'}[$('tableSeparator').value]||'auto');
    $('tableForm').addEventListener('submit',event=>{event.preventDefault();applyTable();});
    for(const id of ['tableCancel','tableClose'])$(id).addEventListener('click',()=>dialog.close());
    // A queued close event may arrive after another table session has opened.
    dialog.addEventListener('close',()=>{if(dialog.open)return;clearTimeout(tablePreviewTimer);tableSession=null;for(const id of ['tableGrid','tablePreview'])$(id).innerHTML='';$('tableSource').textContent='';$('tablePasteInput').value='';editor.focus();});
    $('tableTabs').addEventListener('click',event=>{const button=event.target.closest('[data-table-tab]');if(button)setTableTab(button.dataset.tableTab);});
    $('tableTabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['cells','preview','source'],index=tabs.indexOf(tableSession.tab),next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;setTableTab(tabs[next]);$('tableTabs').querySelector(`[data-table-tab="${tabs[next]}"]`).focus();});
    $('tableGrid').addEventListener('focusin',event=>{const input=event.target;if(!input.matches('textarea[data-table-row]'))return;tableSession.active={row:Number(input.dataset.tableRow),column:Number(input.dataset.tableColumn)};syncTableControls();});
    $('tableGrid').addEventListener('input',event=>{const input=event.target;if(!input.matches('textarea[data-table-row]'))return;tableSession.data.rows[Number(input.dataset.tableRow)][Number(input.dataset.tableColumn)]=input.value;fitTableCell(input);scheduleTablePreview();});
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
