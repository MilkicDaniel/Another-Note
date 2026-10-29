// Real Chromium check of editing tables in place in the note view. PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE are optional.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.join(__dirname,'..'),version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),output=process.env.QA_SCREENSHOTS;
const table='| Name | Port |\n| --- | --- |\n| web | 80 |\n| db | 5432 |',content='Intro\n\n'+table+'\n';
const note=(id,title,body,mode,updatedAt)=>({id,title,content:body,mode,createdAt:1,updatedAt,removedAt:0,trashedAt:0});
const fixture={format:'vista-notes',version:1,updatedAt:100,activeId:'notes',settings:{theme:'dark',openIds:['notes','style','fresh']},notes:[note('notes','servers.txt',content,'text',100),note('style','site.css','body { color: red; }\n','css',90),note('fresh','plan.md','Plan\n','markdown',80)]};
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  const page=await (await browser.newContext({viewport:{width:1100,height:820},colorScheme:'dark'})).newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>/^https?:/.test(route.request().url())?route.abort():route.continue());
  await page.addInitScript(value=>{if(!localStorage.getItem('vista-notes.workspace.v1'))localStorage.setItem('vista-notes.workspace.v1',JSON.stringify(value));},fixture);
  const view=page.locator('#noteTables'),source=()=>page.locator('#editor').inputValue(),menu=page.locator('#editorContextMenu');
  const cell=(r,c,t=0)=>view.locator(`[data-note-table="${t}"] [data-note-row="${r}"][data-note-cell-column="${c}"]`),slot=i=>view.locator(`[data-note-text="${i}"]`);
  const active=()=>page.evaluate(()=>{const el=document.activeElement;return el.matches('.note-cell-input')?'cell:'+el.closest('[data-note-row]').dataset.noteRow+','+el.closest('[data-note-row]').dataset.noteCellColumn:el.dataset.noteText!==undefined?'text:'+el.dataset.noteText:el.id||el.tagName;});
  const tab=id=>page.locator(`#fileTabs [data-tab-id="${id}"] [role="tab"]`).click();
  const openDialog=async()=>{await page.getByRole('button',{name:'Tools',exact:true}).click();await page.locator('[data-action="table"]').click();await page.locator('#tableDialog').waitFor({state:'visible'});};
  const shot=async name=>{if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`Another-Note-${name}-${version}.png`)});}};
  try{
    await page.goto(pathToFileURL(path.join(root,'dist/Another-Note.html')).href);await view.waitFor({state:'visible'});
    assert.equal(await slot(0).inputValue(),'Intro','Text above the table is editable in the table view');assert.equal(await slot(1).inputValue(),'');

    // Clicking a cell edits it in place; every keystroke updates the file, and focus stays in the cell.
    await cell(1,1).click();assert.equal(await active(),'cell:1,1');await page.keyboard.press('Control+a');await page.keyboard.type('8080');
    assert.match(await source(),/\| web +\| 8080 \|/);assert.equal(await active(),'cell:1,1','Typing never re-renders the view under the caret');
    await page.keyboard.press('Tab');assert.equal(await active(),'cell:2,0');await page.keyboard.press('Shift+Tab');assert.equal(await active(),'cell:1,1');
    await page.keyboard.press('Enter');assert.equal(await active(),'cell:2,1','Enter moves to the cell below');
    await page.keyboard.press('Escape');assert.equal(await cell(1,1).textContent(),'8080');
    await page.keyboard.press('Control+z');assert.equal(await source(),content,'One undo restores the cell edit and the original table text');
    assert.equal(await cell(1,1).textContent(),'80');

    // Escape restores the exact original text and leaves no undo step behind.
    await cell(2,0).click();await page.keyboard.type('-primary');assert.notEqual(await source(),content);await page.keyboard.press('Escape');
    assert.equal(await source(),content,'Escape restores the exact original source');assert.equal(await cell(2,0).textContent(),'db');

    // Tab past the last cell adds a row, as in the dialog.
    await cell(2,1).click();await page.keyboard.press('Tab');assert.equal(await view.locator('[data-note-table="0"] tbody tr').count(),4);assert.equal(await active(),'cell:3,0');
    await page.keyboard.type('cache');await page.keyboard.press('Tab');await page.keyboard.type('6379');await view.focus();
    assert.match(await source(),/\| cache +\| 6379 +\|$/m);await shot('inline-table-edit');
    await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');assert.equal(await source(),content);

    // Text above and below the table; blank lines are added only as separators and removed with the text.
    await slot(1).click();await page.keyboard.type('Below the table');assert.equal(await source(),content.slice(0,-1)+'\n\nBelow the table\n');assert.equal(await active(),'text:1');
    await slot(0).click();await page.keyboard.press('End');await page.keyboard.type(' text');assert.ok((await source()).startsWith('Intro text\n\n| Name'));
    await page.keyboard.press('Control+a');await page.keyboard.press('Delete');assert.ok((await source()).startsWith('| Name'),'Clearing the text above leaves the table at the start');
    await slot(1).click();await page.keyboard.press('Control+a');await page.keyboard.press('Delete');assert.equal(await source(),table+'\n','Clearing the text below removes its separator');
    await slot(0).click();await page.keyboard.type('Intro');assert.equal(await source(),content,'Typing the original text back restores the file exactly');

    // A table typed into the surrounding text becomes a second grid once focus leaves the note.
    await slot(1).click();await page.keyboard.type('Extra\n\n| a | b |\n| --- | --- |\n| 1 | 2 |');assert.equal(await view.locator('table').count(),1);
    await page.locator('#noteTableViewToggle').focus();await page.waitForFunction(()=>document.querySelectorAll('#noteTables table').length===2);
    assert.equal(await slot(1).inputValue(),'Extra');assert.equal(await cell(1,1,1).textContent(),'2');
    await view.focus();for(let i=0;i<4&&await source()!==content;i++)await page.keyboard.press('Control+z');assert.equal(await source(),content);

    // Right-click: insert and delete rows and columns.
    await cell(1,0).click({button:'right'});await menu.waitFor({state:'visible'});await menu.locator('[data-editor-command="rowBelow"]').click();
    assert.equal(await view.locator('[data-note-table="0"] tbody tr').count(),4);assert.equal(await active(),'cell:2,0');await page.keyboard.type('mail');await view.focus();
    await cell(0,1).click({button:'right'});await menu.locator('[data-editor-command="columnRight"]').click();assert.equal(await view.locator('[data-note-table="0"] tbody tr:first-child th').count(),3);
    await page.keyboard.type('Owner');await view.focus();assert.match(await source(),/^\| Name +\| Port +\| Owner \|$/m);
    await cell(1,2).click({button:'right'});await menu.locator('[data-editor-command="deleteColumn"]').click();await cell(2,0).click({button:'right'});await menu.locator('[data-editor-command="deleteRow"]').click();
    const aligned='Intro\n\n| Name | Port |\n| ---- | ---- |\n| web  | 80   |\n| db   | 5432 |\n';assert.equal(await source(),aligned,'Row and column commands rewrite only the table, aligned as the dialog does');
    await cell(1,1).click();await page.keyboard.press('Control+a');await page.keyboard.press('Shift+F10');await menu.waitFor({state:'visible'});await menu.locator('[data-editor-command="cut"]').click();
    await page.waitForFunction(()=>!/\| web +\| 80 /.test(document.getElementById('editor').value));assert.equal(await active(),'cell:1,1','Cut works inside the cell being edited');await page.keyboard.press('Escape');assert.equal(await source(),aligned);

    // A table inserted from Edit Source still opens as a grid.
    await tab('fresh');await page.locator('#editor').click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await openDialog();assert.equal(await page.locator('#tableViewHint').isVisible(),false,'Markdown files need no warning');
    await page.locator('#tableFormatTrigger').click();await page.locator('#tableFormatOptions [data-select-value="csv"]').click();assert.match(await page.locator('#tableViewHint').textContent(),/CSV tables are inserted as plain text/);
    await page.locator('#tableFormatTrigger').click();await page.locator('#tableFormatOptions [data-select-value="markdown"]').click();await page.locator('#tableApply').click();
    await view.waitFor({state:'visible'});assert.equal(await view.locator('table').count(),1);await page.locator('#noteTableViewToggle').click();await page.locator('#editor').waitFor({state:'visible'});
    await page.locator('#editor').press('Control+End');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await openDialog();await page.locator('#tableApply').click();
    await view.waitFor({state:'visible'});assert.equal(await view.locator('table').count(),2,'A table inserted from Edit Source is shown as a grid');
    assert.match(await page.locator('#toast').textContent(),/Click a cell to edit it/);

    // Code files keep tables as text and the dialog says so.
    await tab('style');await page.locator('#editor').click();await openDialog();assert.match(await page.locator('#tableViewHint').textContent(),/CSS files show tables as text/);await shot('table-dialog-code-hint');
    await page.locator('#tableCancel').click();
    assert.deepEqual(errors,[]);
    console.log('Passed: in-place cell editing with Tab/Enter/Escape and one-step undo, new rows from Tab, text above/below/between tables, typed tables becoming grids, right-click row/column commands and Cut, grid after insert from Edit Source, and dialog notes for CSV/TSV and code files.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
