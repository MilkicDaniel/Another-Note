// Exercise delayed native bridge replies in a real browser, with synthetic files.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const source='function first() {\n  return "first";\n}\n\nfunction second() {\n  return "second";\n}\n';
const files=[['active','active.js',source,'javascript'],['other','other.txt','Another open tab','text'],['closed','closed.txt','Closed file\n\u2603\n','text']].map(([id,title,content,mode])=>({id,title,content,mode,createdAt:1,updatedAt:100,savedState:{title,content,mode,lineEnding:'lf',bom:false}}));
const workspace={format:'vista-notes',version:1,updatedAt:100,activeId:'active',settings:{theme:'dark',openIds:['active','other'],closedIds:['closed'],recentFiles:[{id:'closed',closedAt:50}]},notes:files};
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1200,height:800},colorScheme:'light'}),errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
  await page.addInitScript(workspace=>{
    window.__bridge={commands:[],saved:[],pending:{}};
    window.webkit={messageHandlers:{vistaNotes:{postMessage(raw){
      const data=JSON.parse(raw),bridge=window.__bridge;bridge.commands.push(data);
      if(['load','load_remaining'].includes(data.command)){bridge.pending[data.command]=data.id;return;}
      if(data.command==='save')bridge.saved.push(data.state);
      setTimeout(()=>window.vistaNotesNativeResult(data.id,data.command==='versions_load'?{versions:[]}:{saved:true,openIds:workspace.settings.openIds}),0);
    }}}};
    window.__answerBoot=()=>{
      const state=JSON.parse(JSON.stringify(workspace));state.notes=state.notes.filter(file=>state.settings.openIds.includes(file.id));
      window.vistaNotesNativeResult(window.__bridge.pending.load,{state,deferred:true,availableIds:workspace.notes.map(file=>file.id),openIds:workspace.settings.openIds});
    };
    window.__answerRest=()=>window.vistaNotesNativeResult(window.__bridge.pending.load_remaining,{state:workspace,openIds:workspace.settings.openIds});
  },workspace);
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  try{
    await page.goto(pathToFileURL(path.join(root,'fedora/Another-Note.html')).href);
    await page.waitForFunction(()=>window.__bridge.pending.load);
    assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.theme,document.documentElement.dataset.starting,getComputedStyle(document.documentElement).backgroundColor,getComputedStyle(document.body).backgroundColor]),['dark','dark','rgb(0, 0, 0)','rgb(0, 0, 0)'],'Native startup is black even when the system uses light mode');
    await page.evaluate(()=>window.__answerBoot());
    await page.getByRole('tab',{name:'active.js',exact:true}).waitFor();
    await page.waitForFunction(()=>window.__bridge.pending.load_remaining);
    assert.equal(await page.evaluate(()=>window.__bridge.saved.length),0,'No partial workspace is saved');
    const commands=await page.evaluate(()=>window.__bridge.commands.map(data=>data.command));
    assert.ok(commands.indexOf('ready')<commands.indexOf('load_remaining'),'The window is ready before closed files load');
    await page.getByRole('tab',{name:'other.txt',exact:true}).click();assert.equal(await page.locator('#editor').evaluate(editor=>editor.value),'Another open tab');
    await page.getByRole('tab',{name:'active.js',exact:true}).click();assert.equal(await page.locator('#editor').evaluate(editor=>editor.value),source);
    const fold=page.locator('#foldControls button').first(),bounds=await fold.boundingBox(),editorBounds=await page.locator('#editor').boundingBox();
    await page.mouse.move(editorBounds.x+180,bounds.y+bounds.height/2);await settle();
    assert.equal(await page.locator('#foldGutter').evaluate(el=>el.classList.contains('controls-visible')),false,'A foldable source row leaves controls hidden');
    await page.locator('#foldGutter').hover();await settle();
    assert.equal(await page.locator('#foldGutter').evaluate(el=>el.classList.contains('controls-visible')),true);
    await fold.click();assert.equal(await page.locator('#editor').evaluate(editor=>editor.value),source,'Folding keeps the original source');
    await page.locator('#editor').focus();await page.keyboard.press('Control+End');await page.keyboard.type('// Edited during loading');
    const edited=await page.locator('#editor').evaluate(editor=>editor.value);
    await page.locator('#editor').evaluate(editor=>editor.setSelectionRange(editor.value.length-8,editor.value.length-2,'backward'));
    const before=await page.locator('#editor').evaluate(editor=>({value:editor.value,start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection,folded:document.querySelectorAll('.fold-toggle.folded').length}));
    await page.evaluate(()=>window.__answerRest());
    await page.waitForFunction(()=>window.__bridge.saved.length>0);await settle();
    assert.deepEqual(await page.locator('#editor').evaluate(editor=>({value:editor.value,start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection,folded:document.querySelectorAll('.fold-toggle.folded').length})),before,'Background hydration keeps native text, selection direction and folding');
    const saved=await page.evaluate(()=>window.__bridge.saved);
    for(const state of saved){assert.equal(state.notes.length,3);assert.equal(state.notes.find(file=>file.id==='closed').content,files[2].content);assert.equal(state.notes.find(file=>file.id==='closed').savedState.content,files[2].content);assert.equal(state.notes.find(file=>file.id==='active').content,edited);}
    await page.keyboard.press('Control+z');assert.equal(await page.locator('#editor').evaluate(editor=>editor.value),source,'Undo survives background loading');
    await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('button',{name:'Open Saved File…',exact:true}).click();
    await page.locator('#filesDialog').waitFor({state:'visible'});assert.ok((await page.locator('#noteList').textContent()).includes('closed.txt'));
    if(process.env.QA_SCREENSHOTS){fs.mkdirSync(process.env.QA_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,`Another-Note-lazy-startup-${version}.png`)});}
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    console.log('Passed: black native bootstrap on a light system, visible usable tabs before deferred files, gutter-only fold hover, edits/folding/backward selection/undo during hydration, complete recovery journals and closed-file discovery.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
