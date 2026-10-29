// Real Chromium check of the interactive theme preview. PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE are optional.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.join(__dirname,'..'),version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),output=process.env.QA_SCREENSHOTS;
const original='function greet(name) {\n  return "Hello " + name;\n}\n';
const fixture={format:'vista-notes',version:1,updatedAt:100,activeId:'sample',settings:{theme:'dark',openIds:['sample','other']},notes:[{id:'sample',title:'sample.js',content:original,mode:'javascript',createdAt:1,updatedAt:100,removedAt:0,trashedAt:0},{id:'other',title:'other.txt',content:'Other',mode:'text',createdAt:1,updatedAt:90,removedAt:0,trashedAt:0}]};
const style=vm.runInNewContext(fs.readFileSync(path.join(root,'source/editor-style-config.js'),'utf8')+';EditorStyle');
const rgb=hex=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  const page=await (await browser.newContext({viewport:{width:1280,height:860},colorScheme:'dark'})).newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>/^https?:/.test(route.request().url())?route.abort():route.continue());
  await page.addInitScript(value=>{if(!localStorage.getItem('vista-notes.workspace.v1'))localStorage.setItem('vista-notes.workspace.v1',JSON.stringify(value));},fixture);
  const open=async()=>{await page.getByRole('button',{name:'Preferences',exact:true}).click();await page.getByRole('button',{name:'Editor Appearance & Formatting…',exact:true}).click();await page.locator('#editorPreferencesDialog').waitFor({state:'visible'});};
  const selected=()=>page.locator('.preference-color-row.selected').getAttribute('data-pref-row');
  const shot=async name=>{if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`Another-Note-${name}-${version}.png`)});}};
  try{
    await page.goto(pathToFileURL(path.join(root,'dist/Another-Note.html')).href);await page.waitForFunction(()=>document.getElementById('editor').value.includes('greet'));
    await open();
    assert.equal(await page.locator('#editorPreferencesDialog input[type=color]').count(),0,'Colors use the in-app picker rather than the platform color dialog');
    const tabStyle=await page.locator('#preferencesThemesTab').evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderTopLeftRadius,outline:s.outlineStyle,left:s.borderLeftWidth};});
    assert.deepEqual(tabStyle,{radius:'0px',outline:'none',left:'0px'},'The focused selected tab is an underline, not a box');

    // Every color setting is represented in the preview: interface parts, marks, and JavaScript plus Markdown tokens.
    const surfaces=style.surfaceTokens.map(([key])=>key);
    for(const key of surfaces)assert.ok(await page.locator(`#preferencesThemePreview [data-pref="surface:${key}"],#preferencesThemePreview [data-pref-border="surface:${key}"]`).count(),'Preview shows '+key);
    for(const language of ['javascript','markdown','text']){
      await page.locator('#preferencesLanguage').selectOption(language);
      for(const key of style.tokens.map(([key])=>key).filter(key=>key!=='text'))assert.ok(await page.locator(`#preferencesThemePreview .tok-${key}`).count(),`The ${language} preview shows ${key}`);
    }
    await page.locator('#preferencesLanguage').selectOption('javascript');
    await page.locator('#preferencesPreviewExtra .tok-property').click();assert.equal(await page.locator('.preference-color-row.selected').getAttribute('data-pref-row'),'syntax:property');
    assert.equal(await page.locator('#preferencesLanguage').inputValue(),'javascript','Choosing a color does not change the preview language');

    // Clicking the preview moves to the matching setting and opens its picker.
    await page.locator('#preferencesPreviewCode .tok-comment').first().click();
    assert.equal(await selected(),'syntax:comment');assert.equal(await page.locator('#preferencesColorsTab').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#preferencesPicker').evaluate(el=>el.previousElementSibling.dataset.prefRow),'syntax:comment');
    assert.ok(await page.locator('[data-pref-row="syntax:comment"]').isVisible());
    for(const [selector,pref]of [['.pv-tab-active','surface:active-tab'],['.pv-menubar','surface:chrome'],['.pv-status','surface:status'],['.pv-mark-find','surface:find-match'],['#preferencesPreviewGutter','surface:gutter'],['.pv-item[data-pref="surface:hover"]','surface:hover']]){
      await page.locator(selector).first().click({position:{x:3,y:3},force:true});assert.equal(await selected(),pref,selector);
      assert.ok(await page.locator(`[data-pref-row="${pref}"]`).isVisible(),pref+' row is scrolled into view');
    }
    const caret=await page.locator('.pv-mark-caret').boundingBox();await page.mouse.click(caret.x+1,caret.y+caret.height/2);assert.equal(await selected(),'surface:caret');
    const border=await page.locator('.pv-button').boundingBox();await page.mouse.click(border.x+border.width/2,border.y+1);assert.equal(await selected(),'surface:line','Clicking a border edits the border color');

    // Dragging in the picker updates the draft and the preview immediately, without touching the real editor.
    await page.locator('#preferencesPreviewCode .tok-keyword').first().click();assert.equal(await selected(),'syntax:keyword');
    const before=await page.locator('[data-syntax-hex="keyword"]').inputValue(),plane=await page.locator('.preference-picker-plane').boundingBox();
    await page.mouse.move(plane.x+plane.width*.9,plane.y+plane.height*.1);await page.mouse.down();await page.mouse.move(plane.x+plane.width*.95,plane.y+plane.height*.05,{steps:4});await page.mouse.up();
    const after=await page.locator('[data-syntax-hex="keyword"]').inputValue();assert.notEqual(after,before);assert.match(after,/^#[\da-f]{6}$/);
    await page.waitForFunction(value=>getComputedStyle(document.querySelector('#preferencesPreviewCode .tok-keyword')).color===value,rgb(after));
    assert.notEqual(await page.locator('#highlight .tok-keyword').first().evaluate(el=>getComputedStyle(el).color),rgb(after),'The editor keeps its applied colors until Apply');
    await page.locator('[data-picker-action="revert"]').click();assert.equal(await page.locator('[data-syntax-hex="keyword"]').inputValue(),before);
    await page.locator('.preference-picker-swatches button').nth(2).click();const swatch=await page.locator('[data-syntax-hex="keyword"]').inputValue();
    await page.keyboard.press('Escape');assert.equal(await page.locator('#preferencesPicker').count(),0);assert.ok(await page.locator('#editorPreferencesDialog').isVisible(),'Escape closes only the picker');
    await shot('theme-preview-picker');

    // Typed HEX values, new interface colors and theme labels update live; Apply keeps them.
    for(const [pref,value]of [['surface:find-match','#ff00aa'],['surface:caret','#00ff88'],['surface:tab-text','#ccaa00']]){const [kind,key]=pref.split(':');await page.locator(`[data-${kind}-hex="${key}"]`).fill(value);}
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pv-mark-caret')).backgroundColor==='rgb(0, 255, 136)');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pv-tab:not(.pv-tab-active) span')).color==='rgb(204, 170, 0)');
    assert.match(await page.locator('#preferencesThemeDark option:checked').textContent(),/Custom colors|modified/);
    await page.locator('#preferencesApply').click();await page.locator('#editorPreferencesDialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('#editor').evaluate(el=>getComputedStyle(el).caretColor),'rgb(0, 255, 136)');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.file-tab:not(.active)')).color==='rgb(204, 170, 0)',null,{timeout:3000});
    const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('vista-notes.workspace.v1'))).settings.editorPreferences.appearance;
    assert.equal(saved.colors.dark.keyword,swatch);assert.equal(saved.surfaces.dark['find-match'],'#ff00aa');assert.equal(await page.locator('#editor').inputValue(),original);

    // Keyboard: arrows move between all four tabs; the plane is adjustable from the keyboard.
    await open();await page.locator('#preferencesThemesTab').focus();for(const name of ['Colors','Font','Formatting','Themes']){await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.textContent),name);}
    await page.locator('#preferencesColorsTab').click();await page.locator('[data-pref-swatch="surface:accent"]').click();const accent=await page.locator('[data-surface-hex="accent"]').inputValue();
    await page.locator('.preference-picker-plane').focus();await page.keyboard.press('Shift+ArrowDown');assert.notEqual(await page.locator('[data-surface-hex="accent"]').inputValue(),accent);
    await page.locator('#preferencesPalette').selectOption('light');assert.equal(await page.locator('#preferencesPicker').evaluate(el=>el.previousElementSibling.dataset.prefRow),'surface:accent','The open picker follows a mode switch');
    await page.setViewportSize({width:540,height:780});await page.locator('.pv-status').click({position:{x:3,y:3}});assert.equal(await selected(),'surface:status');await shot('theme-preview-narrow');
    await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.locator('#editorPreferencesDialog').waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);
    console.log('Passed: preview shows every color setting, click-to-edit for text, marks, borders and interface parts, live in-app picker, revert/swatches/keyboard, new cursor/search/tab colors, Apply and narrow layout.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
