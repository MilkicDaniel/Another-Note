// Large-file display and native editing checks. Optional local Playwright/Chromium.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.join(__dirname,'..'),version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const original=Array.from({length:1000},(_,i)=>`<section id="entry-${i}">\n  <p>Entry ${i} — 日本語 😊 &amp; a color #ff0044. ${'Wrapped text with spaces. '.repeat(5)}</p>\n</section>`).join('\n')+'\n';
const fixture={format:'vista-notes',version:1,updatedAt:100,activeId:'large',settings:{theme:'dark',fontSize:15,openIds:['large','small']},notes:[{id:'large',title:'large.html',content:original,mode:'html',createdAt:1,updatedAt:100,removedAt:0,trashedAt:0},{id:'small',title:'small.txt',content:'Small file',mode:'text',createdAt:1,updatedAt:100,removedAt:0,trashedAt:0}]};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1200,height:860}}),page=await context.newPage(),errors=[],network=[];
 page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{if(/^https?:/.test(route.request().url())){network.push(route.request().url());return route.abort();}return route.continue();});
 await page.addInitScript(value=>{if(!localStorage.getItem('vista-notes.workspace.v1'))localStorage.setItem('vista-notes.workspace.v1',JSON.stringify(value));},fixture);
 const text=()=>page.locator('#editor').evaluate(editor=>editor.value);
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const seek=async entry=>{
  await settle();
  await page.locator('#editor').evaluate((editor,line)=>{const row=document.getElementById('lineNumbers').children[line],top=row.getBoundingClientRect().top-editor.getBoundingClientRect().top;editor.scrollTop+=top-80;},entry*3+1);
  await settle();
  await page.waitForFunction(entry=>document.getElementById('highlightCode').textContent.includes('Entry '+entry+' —'),entry);
 };
 const aligned=async entry=>{
  const delta=await page.evaluate(entry=>{
   const root=document.getElementById('highlightCode'),at=root.textContent.indexOf('Entry '+entry+' —');if(at<0)return null;
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),a=document.createRange();let text,offset=0,started=false;
   while((text=walker.nextNode())){const end=offset+text.textContent.length;
    if(!started&&at<end){a.setStart(text,at-offset);started=true;}
    if(started&&at+5<=end){a.setEnd(text,at+5-offset);break;}offset=end;
   }
   const row=document.getElementById('lineNumbers').children[entry*3+1],b=document.createRange();b.selectNodeContents(row);
   return a.getClientRects()[0].top-b.getClientRects()[0].top;
  },entry);assert.ok(delta!==null&&Math.abs(delta)<1,'Highlight text and its native line gutter align: '+delta);
 };
 try{
  await page.goto(pathToFileURL(path.join(root,'dist/Another-Note.html')).href);await page.waitForFunction(()=>document.getElementById('highlightCode').classList.contains('highlight-window'));
  assert.equal(await text(),original);assert.ok(await page.locator('#highlightCode *').count()<1500);assert.ok(await page.locator('#foldControls button').count()<100);await aligned(0);
  for(const entry of [450,999,25]){await seek(entry);await aligned(entry);assert.equal(await page.locator('#highlight').evaluate(el=>el.scrollTop),await page.locator('#editor').evaluate(el=>el.scrollTop));}
  await seek(450);await page.locator('[data-fold-line="1350"]').focus();const focusedFold=await page.locator('[data-fold-line="1350"]').getAttribute('data-fold-key');await seek(700);assert.equal(await page.evaluate(()=>document.activeElement.dataset.foldKey),focusedFold,'Scrolling retains keyboard focus on a fold control');await page.locator('#editor').focus();
  await seek(450);await page.locator('#foldGutter').hover();await page.locator('[data-fold-line="1350"]').click();assert.equal(await text(),original,'Folding keeps the entire original source');
  const copied=await page.locator('#editor').evaluate(editor=>{
   const raw=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').get.call(editor);HTMLTextAreaElement.prototype.setSelectionRange.call(editor,0,raw.length,'backward');
   const values={},event=new Event('copy',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{setData:(type,value)=>values[type]=value}});editor.dispatchEvent(event);return {text:values['text/plain'],direction:editor.selectionDirection};
  });assert.equal(copied.text,original,'Copy exports all source, including offscreen and folded text, without display padding');assert.equal(copied.direction,'backward');
  await page.locator('#editor').evaluate(editor=>{editor.focus();editor.setSelectionRange(editor.value.indexOf('Entry 450'),editor.value.indexOf('Entry 450')+5,'backward');});await page.keyboard.type('Updated');assert.ok((await text()).includes('Updated 450'));await page.keyboard.press('Control+z');assert.equal(await text(),original,'Undo remains exact after windowed rendering and a folded edit');
  await page.getByRole('tab',{name:'small.txt',exact:true}).click();assert.equal(await text(),'Small file');assert.equal(await page.locator('#highlightCode').evaluate(el=>el.classList.contains('highlight-window')),false);assert.equal(await page.locator('#highlightCode').evaluate(el=>el.style.paddingTop),'');
  await page.getByRole('tab',{name:'large.html',exact:true}).click();await seek(700);await aligned(700);
  await page.setViewportSize({width:560,height:780});await seek(700);await aligned(700);
  await page.getByRole('button',{name:'Preferences',exact:true}).click();await page.getByRole('button',{name:'Editor Appearance & Formatting…',exact:true}).click();await page.locator('#preferencesFontSize').fill('18');await page.locator('#preferencesApply').click();await page.locator('#editorPreferencesDialog').waitFor({state:'hidden'});await seek(700);await aligned(700);
  if(process.env.QA_SCREENSHOTS){fs.mkdirSync(process.env.QA_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.QA_SCREENSHOTS,`Another-Note-large-file-startup-${version}.png`)});}
  assert.equal(await text(),original);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log('Passed: bounded highlight/fold DOM, visible text/gutter geometry, distant/bottom scroll, wraps/Unicode/colors, complete folded clipboard text, backward selection, native edits/undo, tab switches, resize, font changes and offline operation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
