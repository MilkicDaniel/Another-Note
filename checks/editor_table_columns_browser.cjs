const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const original='<table><thead><tr><th></th><th>Project Records (Home Stream)</th><th>Project Records Movies</th></tr></thead><tbody><tr><td>Smoother tab highlight and a tablet top bar on one line</td><td><a href="https://example.invalid/commit/a83b5c7">a83b5c7</a></td><td><a href="https://example.invalid/commit/c55d3f0">c55d3f0</a></td></tr><tr><td>Refresh button on the show page</td><td><a href="https://example.invalid/commit/5426aff">5426aff</a></td><td><a href="https://example.invalid/commit/e5d3551">e5d3551</a></td></tr></tbody></table>';
const unsafe='<table><tr><th>Values</th></tr><tr><td><img src="https://example.invalid/image" onerror="window.tableExecuted=1"><script>window.tableExecuted=1</script><a href="javascript:window.tableExecuted=1">Safe text</a></td></tr></table>';
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try{
    for(const native of [false,true]){
      const settings={theme:native?'light':'dark',fontSize:native?18:15,openIds:['table','unsafe'],editorPreferences:{appearance:{fontFamily:native?'Georgia':'',fontStyle:native?'bold-italic':'regular'}}};
      const workspace={format:'vista-notes',version:1,updatedAt:100,activeId:'table',settings,notes:[['table','sample.html',original],['unsafe','unsafe.html',unsafe]].map(([id,title,content])=>({id,title,content,mode:'html',createdAt:1,updatedAt:100}))};
      const context=await browser.newContext({viewport:{width:1400,height:940}}),page=await context.newPage(),errors=[],network=[];
      page.on('pageerror',error=>errors.push(error.message));await page.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
      await page.addInitScript(({workspace,native})=>{
        window.__tableCopied=null;window.__tableOpenedLinks=[];
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__tableCopied=text;}}});
        if(native)window.webkit={messageHandlers:{vistaNotes:{postMessage(raw){
          const data=JSON.parse(raw);let result={saved:true,openIds:workspace.settings.openIds};
          if(data.command==='load')result={state:workspace,openIds:workspace.settings.openIds};
          if(data.command==='save')window.__lastTableSave=data.state;
          if(data.command==='clipboard')window.__tableCopied=data.text;
          if(data.command==='open_link')window.__tableOpenedLinks.push(data.reference);
          if(data.command==='versions_load')result={versions:[]};
          if(data.command==='versions_store')result={versions:data.versions};
          setTimeout(()=>window.vistaNotesNativeResult(data.id,result),0);
        }}}};
        else localStorage.setItem('vista-notes.workspace.v1',JSON.stringify(workspace));
      },{workspace,native});
      const source=()=>page.locator('#editor').evaluate(editor=>editor.value),cell=(r,c)=>page.locator(`#tableGrid textarea[data-table-row="${r}"][data-table-column="${c}"]`);
      const previewCell=(r,c)=>page.locator(`#tablePreview [data-table-preview-row="${r}"][data-table-column="${c}"]`);
      const font=locator=>locator.evaluate(el=>{const style=getComputedStyle(el);return {family:style.fontFamily,size:style.fontSize,weight:style.fontWeight,style:style.fontStyle,line:style.lineHeight};});
      const open=async()=>{await page.getByRole('button',{name:'Tools',exact:true}).click();await page.locator('[data-action="table"]').click();await page.locator('#tableDialog').waitFor({state:'visible'});};
      const copyEvent=()=>page.locator('#tableDialog').evaluate(dialog=>{const data=new DataTransfer(),event=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data});dialog.dispatchEvent(event);return {handled:event.defaultPrevented,text:data.getData('text/plain'),html:data.getData('text/html')};});
      const shot=async name=>{if(process.env.QA_SCREENSHOTS){fs.mkdirSync(process.env.QA_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,`Another-Note-${name}-${native?'light-custom-font':'dark'}-${version}.png`)});}};
      try{
        await page.goto(pathToFileURL(path.join(root,'dist/Another-Note.html')).href);await page.waitForFunction(()=>document.getElementById('editor').value.includes('Smoother tab'));
        const editorFont=await font(page.locator('#editor'));
        await page.locator('#noteTableViewToggle').click();
        await page.locator('#editor').evaluate(editor=>{const at=editor.value.indexOf('a83b5c7');editor.focus();editor.setSelectionRange(at,at+7,'backward');});
        const originalSelection=await page.locator('#editor').evaluate(editor=>({start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection}));
        await open();const cellFont=await font(cell(1,1));
        assert.equal(cellFont.family,editorFont.family);assert.equal(cellFont.size,'13px');assert.equal(cellFont.weight,native?'700':'400');assert.equal(cellFont.style,native?'italic':'normal');
        await page.locator('#tableGrid [data-table-select-column="1"]').click();
        assert.equal(await page.locator('#tableGrid .table-cell-selected').count(),3);assert.match(await page.locator('#tableSelection').textContent(),/B1:B3/);
        assert.equal((await copyEvent()).text,'Project Records (Home Stream)\na83b5c7\n5426aff');
        await page.locator('#tableCopy').click();assert.equal(await page.evaluate(()=>window.__tableCopied),'Project Records (Home Stream)\na83b5c7\n5426aff');
        await cell(1,1).click();await cell(2,2).click({modifiers:['Shift']});
        assert.equal(await page.locator('#tableGrid .table-cell-selected').count(),2);assert.match(await page.locator('#tableSelection').textContent(),/B2:B3/);
        assert.equal((await copyEvent()).text,'a83b5c7\n5426aff','A range stays in its anchor column even if the last click lands in another column');
        await page.keyboard.press('Control+c');assert.equal(await page.evaluate(()=>window.__tableCopied),'a83b5c7\n5426aff');
        await page.keyboard.press('Control+Space');assert.equal(await page.locator('#tableGrid .table-cell-selected').count(),3);
        await page.keyboard.press('Shift+ArrowUp');assert.match(await page.locator('#tableSelection').textContent(),/B1:B2/);
        await page.keyboard.press('Escape');assert.equal(await page.locator('#tableDialog').isVisible(),true);assert.equal(await page.locator('#tableGrid .table-cell-selected').count(),0);
        await cell(2,1).click();await cell(1,1).click({modifiers:['Shift']});assert.equal((await copyEvent()).text,'a83b5c7\n5426aff','Backward selection copies cells in table order');
        assert.equal(await source(),original);assert.deepEqual(await font(cell(1,1)),cellFont);await shot('table-column-selection');
        await page.locator('#tableGrid [data-table-select-column="1"]').click();assert.equal(await page.locator('#tableGrid .table-cell-selected').count(),0,'Clicking the selected heading clears its selection');
        await page.locator('#tableGrid [data-table-select-column="2"]').focus();await page.keyboard.press('Control+Space');assert.match(await page.locator('#tableSelection').textContent(),/C1:C3/,'Keyboard selection follows the focused column heading');
        await page.locator('#tableClearSelection').click();await cell(1,1).focus();await page.keyboard.press('Control+a');
        assert.equal((await copyEvent()).handled,false,'Normal text selection inside a cell keeps native copy behavior');
        await page.getByRole('tab',{name:'Preview',exact:true}).click();
        assert.equal(await page.locator('#tablePreview a').count(),4);assert.equal(await page.locator('#tablePreview img, #tablePreview script').count(),0);
        const previewStyle=await previewCell(1,1).evaluate(el=>{const table=el.closest('table'),style=getComputedStyle(el);return {border:style.borderTopWidth,borderStyle:style.borderTopStyle,background:getComputedStyle(table).backgroundColor,header:getComputedStyle(table.querySelector('th')).backgroundColor,widths:[...table.rows[1].cells].map(cell=>cell.getBoundingClientRect().width)};});
        assert.equal(previewStyle.border,'1px');assert.equal(previewStyle.borderStyle,'solid');assert.equal(previewStyle.background,previewStyle.header);assert.ok(previewStyle.widths[0]>previewStyle.widths[1],'Column widths follow the contents rather than equal-sized boxes');
        assert.equal((await font(previewCell(1,1))).family,editorFont.family);await shot('table-reference-preview');
        await page.locator('#tablePreview [data-table-select-column="1"]').click();assert.equal((await copyEvent()).text,'Project Records (Home Stream)\na83b5c7\n5426aff');
        await previewCell(1,1).click();await previewCell(2,2).click({modifiers:['Shift']});assert.equal((await copyEvent()).text,'a83b5c7\n5426aff');
        await previewCell(1,1).click();await previewCell(2,1).locator('a').click({modifiers:['Shift']});assert.equal((await copyEvent()).text,'a83b5c7\n5426aff');assert.deepEqual(await page.evaluate(()=>window.__tableOpenedLinks),[],'Shift-click selects linked items without opening them');
        await page.locator('#tableClearSelection').click();await previewCell(1,1).focus();await page.keyboard.press('Shift+ArrowDown');assert.equal((await copyEvent()).text,'a83b5c7\n5426aff','Preview cells support keyboard-only column ranges');
        await page.locator('#tableClearSelection').click();await page.getByRole('tab',{name:'Edit Cells',exact:true}).click();
        await page.locator('#tableHeader').uncheck();await page.getByRole('tab',{name:'Preview',exact:true}).click();
        await page.locator('#tablePreview [data-table-select-column="2"]').click();assert.equal((await copyEvent()).text,'Project Records Movies\nc55d3f0\ne5d3551');
        await page.setViewportSize({width:560,height:820});const bounds=await page.locator('#tableDialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=561);assert.equal(await page.locator('#tableCopy').isVisible(),true);assert.equal(await page.locator('#tableApply').isVisible(),true);await shot('table-column-narrow');
        await page.locator('#tableCancel').click();assert.equal(await source(),original);assert.deepEqual(await font(page.locator('#editor')),editorFont);
        assert.deepEqual(await page.locator('#editor').evaluate(editor=>({start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection})),originalSelection,'Selection and styling do not change the original source caret');
        await page.setViewportSize({width:1400,height:940});await page.getByRole('tab',{name:'unsafe.html',exact:true}).click();await open();await page.getByRole('tab',{name:'Preview',exact:true}).click();
        assert.equal(await page.locator('#tablePreview a, #tablePreview img, #tablePreview script').count(),0);assert.equal(await page.evaluate(()=>window.tableExecuted),undefined);assert.equal(await source(),unsafe);
        await page.locator('#tableCancel').click();
        await page.getByRole('button',{name:'Tools',exact:true}).click();await page.locator('[data-action="pasteTable"]').click();
        await page.locator('#tablePasteInput').evaluate(input=>{const data=new DataTransfer();data.setData('text/html','<table><tr><th style="text-align:right"><a href="https://example.invalid/heading">Heading</a></th></tr><tr><td><a href="https://example.invalid/value">Value</a></td></tr></table>');data.setData('text/plain','Heading\nValue');input.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
        await page.getByRole('tab',{name:'Preview',exact:true}).click();assert.equal(await page.locator('#tablePreview a').count(),1,'Rich clipboard links can be previewed safely without adding markup to plain cell values');
        await page.getByRole('tab',{name:'Source',exact:true}).click();assert.deepEqual(await page.locator('#tableSource').evaluate(source=>{const template=document.createElement('template');template.innerHTML=source.textContent;return [...template.content.querySelectorAll('th,td')].map(cell=>cell.style.textAlign||cell.getAttribute('align'));}),['right','right'],'Preview link metadata must not remove exported column alignment');
        await page.locator('#tableCancel').click();assert.equal(await source(),unsafe);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
      }finally{await context.close();}
    }
    console.log('Passed: reference-style borders/layout, unchanged regular/custom font settings, column and vertical-range selection, exact column clipboard data, keyboard selection/copy/Escape, native cell text copy, headerless tables, safe link previews, source/backward-caret preservation and narrow layouts in browser/native bridges.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
