// Real Chromium check. PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE are optional.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.join(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'source/vendor/editor-themes.json'),'utf8'));
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),output=process.env.QA_SCREENSHOTS;
const original='function greet(name) {\n  const color = "#ff0044";\n  return "Hello " + name;\n}\n\nconst count = 3;\n';
const fixture={format:'vista-notes',version:1,updatedAt:100,activeId:'sample',settings:{theme:'system',openIds:['sample']},notes:[{id:'sample',title:'sample.js',content:original,mode:'javascript',createdAt:1,updatedAt:100,removedAt:0,trashedAt:0}]};
const rgb=hex=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1200,height:860},colorScheme:'dark'}),page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{if(/^https?:/.test(route.request().url())){network.push(route.request().url());return route.abort();}return route.continue();});
  await page.addInitScript(value=>{if(!localStorage.getItem('vista-notes.workspace.v1'))localStorage.setItem('vista-notes.workspace.v1',JSON.stringify(value));},fixture);
  const open=async()=>{await page.getByRole('button',{name:'Preferences',exact:true}).click();await page.getByRole('button',{name:'Editor Appearance & Formatting…',exact:true}).click();await page.locator('#editorPreferencesDialog').waitFor({state:'visible'});};
  const apply=async()=>{await page.locator('#preferencesApply').click();await page.locator('#editorPreferencesDialog').waitFor({state:'hidden'});};
  const cancel=async()=>{await page.keyboard.press('Escape');await page.locator('#editorPreferencesDialog').waitFor({state:'hidden'});};
  const choose=(mode,id)=>page.locator(mode==='dark'?'#preferencesThemeDark':'#preferencesThemeLight').selectOption(id);
  const tab=name=>page.getByRole('tab',{name,exact:true}).click();
  const palette=mode=>page.locator('#preferencesPalette').selectOption(mode);
  const keyword=()=>page.evaluate(()=>{const el=document.querySelector('#highlight .tok-keyword');return el?getComputedStyle(el).color:'';});
  const background=()=>page.locator('.note-pane').evaluate(el=>getComputedStyle(el).backgroundColor);
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vista-notes.workspace.v1')).settings.editorPreferences);
  const snapshot=()=>page.locator('#editor').evaluate(el=>({text:el.value,start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection,display:Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').get.call(el)}));
  const shot=async name=>{if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`Another-Note-${name}-${version}.png`)});}};
  try{
    await page.goto(pathToFileURL(path.join(root,'dist/Another-Note.html')).href);await page.waitForFunction(()=>document.getElementById('editor').value.includes('const count'));
    await page.getByRole('button',{name:'View',exact:true}).click();await page.locator('[data-action="foldAll"]').click();
    await page.locator('#editor').evaluate(el=>{el.focus();el.setSelectionRange(el.value.indexOf('count'),el.value.indexOf('count')+5,'backward');});
    const before=await snapshot();assert.equal(before.text,original);assert.notEqual(before.display,original,'The fixture exercises folded and projected text');
    await open();assert.equal(await page.locator('#preferencesThemeDark option').count(),11);assert.equal(await page.locator('#preferencesThemeLight option').count(),7);
    for(const theme of catalog){
      await choose(theme.mode,theme.id);
      assert.equal(await page.locator('#preferencesPreview').evaluate(el=>getComputedStyle(el.parentElement).backgroundColor),rgb(theme.surfaces.paper),theme.name+' background');
      assert.equal(await page.locator('#preferencesPreview .tok-keyword').first().evaluate(el=>getComputedStyle(el).color),rgb(theme.colors.keyword),theme.name+' syntax');
      assert.equal(await page.locator('#preferencesThemePreview .pv-menubar').evaluate(el=>getComputedStyle(el).backgroundColor),rgb(theme.surfaces.chrome),theme.name+' menu bar');
    }
    assert.equal(await background(),'rgb(25, 30, 35)','Preview does not change the applied theme');await cancel();assert.deepEqual(await snapshot(),before,'Cancel keeps text, folds, display spacing and backward selection');
    await open();await choose('dark','dracula');await choose('light','atom-one-light');await shot('themes-presets');await apply();
    assert.equal(await background(),'rgb(40, 42, 54)');assert.equal(await keyword(),'rgb(255, 121, 198)');assert.deepEqual(await snapshot(),before,'Applying themes keeps text, folds and selection');
    await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.body.dataset.theme==='light');assert.equal(await background(),'rgb(250, 250, 250)');assert.equal(await keyword(),'rgb(166, 38, 164)');
    await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.body.dataset.theme==='dark');assert.equal(await background(),'rgb(40, 42, 54)');
    await open();await page.locator('#preferencesThemeName').fill('Cancelled theme');await page.locator('#preferencesSaveTheme').click();await cancel();await open();assert.equal(await page.locator('#preferencesThemeDark option').count(),11,'Cancel discards a new saved theme');
    await tab('Colors');await page.locator('[data-syntax-hex="keyword"]').fill('#12ab34');await page.locator('[data-surface-hex="paper"]').fill('#232533');
    await tab('Themes');await page.locator('#preferencesThemeName').fill('My Night');await page.locator('#preferencesSaveTheme').click();const darkId=await page.locator('#preferencesThemeDark').inputValue();
    await palette('light');await tab('Colors');await page.locator('[data-syntax-hex="keyword"]').fill('#a12b56');await page.locator('[data-surface-hex="paper"]').fill('#f4f2ed');await tab('Themes');await page.locator('#preferencesThemeName').fill('My Day');await page.locator('#preferencesSaveTheme').click();const lightId=await page.locator('#preferencesThemeLight').inputValue();
    await palette('dark');await shot('themes-custom');await apply();assert.equal(await background(),'rgb(35, 37, 51)');assert.equal(await keyword(),'rgb(18, 171, 52)');
    const saved=await state();assert.equal(saved.appearance.selectedThemes.dark,darkId);assert.equal(saved.appearance.selectedThemes.light,lightId);assert.equal(Object.keys(saved.customThemes).length,2);
    await page.reload();await page.waitForFunction(()=>document.getElementById('editor').value.includes('const count'));assert.equal(await background(),'rgb(35, 37, 51)');assert.equal(await keyword(),'rgb(18, 171, 52)');
    await open();assert.equal(await page.locator('#preferencesThemeDark').inputValue(),darkId);assert.equal(await page.locator('#preferencesThemeLight').inputValue(),lightId);
    await tab('Colors');await page.locator('[data-syntax-hex="keyword"]').fill('#44cc66');await tab('Themes');await page.locator('#preferencesThemeName').fill('My Night revised');await page.locator('#preferencesUpdateTheme').click();await apply();
    assert.equal((await state()).customThemes[darkId].name,'My Night revised');assert.equal(await keyword(),'rgb(68, 204, 102)');
    await open();await page.locator('#preferencesDeleteTheme').click();await cancel();assert.ok((await state()).customThemes[darkId],'Cancel restores a deleted theme');
    await open();await page.locator('#preferencesDeleteTheme').click();await apply();assert.equal((await state()).customThemes[darkId],undefined);assert.equal(await keyword(),'rgb(68, 204, 102)','Delete keeps the applied colors');
    await open();await page.locator('#preferencesResetAll').click();await apply();assert.equal(Object.keys((await state()).customThemes).length,1,'Restore defaults retains the saved theme library');
    await open();await choose('light',lightId);await choose('dark','nord');await apply();await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.body.dataset.theme==='light');assert.equal(await background(),'rgb(244, 242, 237)');assert.equal(await keyword(),'rgb(161, 43, 86)');
    await page.setViewportSize({width:540,height:780});await open();const bounds=await page.locator('#editorPreferencesDialog').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=541&&bounds.y+bounds.height<=781);assert.ok(await page.locator('#preferencesApply').isVisible());await shot('themes-narrow');await cancel();
    // An actual native edit and undo still work after changing themes repeatedly.
    await page.locator('#editor').evaluate(el=>{el.focus();el.setSelectionRange(el.value.indexOf('count'),el.value.indexOf('count')+5,'backward');});await page.keyboard.type('total');assert.ok((await snapshot()).text.includes('const total = 3'));await page.keyboard.press('Control+z');assert.equal((await snapshot()).text,original);
    await page.setViewportSize({width:1200,height:860});await open();await palette('light');await tab('Colors');await page.locator('[data-syntax-hex="number"]').fill('#123abc');
    const peer=await context.newPage();peer.on('pageerror',error=>errors.push(error.message));await peer.route('**/*',route=>{if(/^https?:/.test(route.request().url())){network.push(route.request().url());return route.abort();}return route.continue();});
    await peer.goto(pathToFileURL(path.join(root,'dist/Another-Note.html')).href);await peer.waitForFunction(()=>document.getElementById('editor').value.includes('const count'));
    await peer.getByRole('button',{name:'Preferences',exact:true}).click();await peer.getByRole('button',{name:'Editor Appearance & Formatting…',exact:true}).click();await peer.locator('#preferencesThemeDark').selectOption('dracula');await peer.locator('#preferencesApply').click();await peer.locator('#editorPreferencesDialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('vista-notes.workspace.v1')).settings.editorPreferences.appearance.selectedThemes.dark==='dracula');
    await apply();const concurrent=await state();assert.equal(concurrent.appearance.selectedThemes.dark,'dracula','An open dialog retains another window’s theme selection');assert.equal(concurrent.appearance.colors.light.number,'#123abc','Applying an open dialog retains its own changed fields');assert.ok(concurrent.customThemes[lightId],'Concurrent saves retain the theme library');
    await peer.waitForFunction(()=>getComputedStyle(document.querySelector('#highlight .tok-keyword')).color==='rgb(255, 121, 198)');await peer.close();
    assert.deepEqual(errors,[]);assert.deepEqual(network,[],'Theme choices, previews and saved themes work offline');
    console.log('Passed: Chromium previews of all 16 presets, interface/syntax colors, separate modes, system switching, custom save/update/delete/Cancel/reset/restart, cross-window updates and open-dialog merging, intact folds/selection/source, native undo and narrow layout.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
