// Native bridge contract with real UI interactions and synthetic disk contents.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const source='function first() {\n  return "first";\n}\n\nconst last = 1;\n';
const full=(id,title,content,mode)=>({id,title,content,mode,createdAt:1,updatedAt:100,fileKey:id+'-key',diskPath:'/synthetic/'+title,tags:['Keep open tags'],tagsUpdatedAt:90,savedState:{title,content,mode,lineEnding:'lf',bom:false}});
const active=full('active','active.js',source,'javascript'),other=full('other','other.txt','Original other file','text');
const link={id:'closed',title:'closed.txt',mode:'text',createdAt:1,updatedAt:101,fileKey:'closed-key',diskPath:'/synthetic/closed.txt',fileLink:true};
const workspace={format:'vista-notes',version:1,updatedAt:100,activeId:'active',settings:{theme:'dark',openIds:['active','other'],closedIds:['closed'],recentFiles:[{id:'closed',closedAt:90}]},notes:[active,other,link]};
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
  await page.addInitScript(workspace=>{
    const clone=value=>JSON.parse(JSON.stringify(value));
    const host=window.__desktop={state:workspace,commands:[],saved:[],exports:[],purged:[],versions:{},disk:{other:'Changed after close',closed:'Closed source\n\u2603\n'},missing:false};
    const asLink=(file,stamp)=>({id:file.id,title:file.title,mode:file.mode,createdAt:file.createdAt,updatedAt:stamp,fileKey:file.fileKey,diskPath:file.diskPath,fileLink:true});
    window.webkit={messageHandlers:{vistaNotes:{postMessage(raw){
      const data=JSON.parse(raw);host.commands.push(data);
      setTimeout(()=>{
        try{
          let result={saved:true,openIds:host.state.settings.openIds};
          if(data.command==='load')result={state:clone(host.state),openIds:host.state.settings.openIds,historyAppend:true};
          else if(data.command==='save'){
            host.saved.push(clone(data.state));const old=new Map(host.state.notes.map(file=>[file.id,file]));
            host.state=clone(data.state);host.state.notes=host.state.notes.map(file=>old.get(file.id)?.updatedAt>file.updatedAt?old.get(file.id):file);
            host.state.notes=host.state.notes.map(file=>{
              if(file.fileLink||host.state.settings.openIds.includes(file.id)||file.content!==file.savedState?.content)return file;
              host.purged.push(file.id);delete host.versions[file.id];return asLink(file,host.state.updatedAt+1);
            });
            result={saved:true,openIds:host.state.settings.openIds,fileLinks:host.state.notes.filter(file=>file.fileLink)};
          }else if(['open_file_link','read_file_link'].includes(data.command)){
            if(host.missing)throw new Error('The linked file could not be found.');
            let file=host.state.notes.find(file=>file.id===data.fileId);
            if(file.fileLink){
              const content=host.disk[file.id],stamp=Math.max(Date.now(),file.updatedAt+1);
              file={...file,content,updatedAt:stamp,historyEpoch:file.updatedAt,hasSavedFile:true,lineEnding:'lf',bom:false,savedState:{title:file.title,content,mode:file.mode,lineEnding:'lf',bom:false}};delete file.fileLink;
            }
            if(data.command==='open_file_link'){
              host.state.notes=host.state.notes.map(item=>item.id===file.id?file:item);
              if(!host.state.settings.openIds.includes(file.id))host.state.settings.openIds.push(file.id);
            }
            result={file:clone(file),openIds:host.state.settings.openIds};
          }else if(data.command==='versions_load')result={versions:clone(host.versions[data.fileId]||[])};
          else if(data.command==='versions_append'){
            const file=host.state.notes.find(file=>file.id===data.fileId);
            if(file&&!file.fileLink&&(file.historyEpoch||0)===(data.historyEpoch||0))(host.versions[data.fileId]||=[]).push(data.version);
          }else if(data.command==='versions_store')result={versions:data.versions};
          else if(data.command==='export'){host.exports.push(data);}
          window.vistaNotesNativeResult(data.id,result);
        }catch(error){window.vistaNotesNativeResult(data.id,null,error.message);}
      },0);
    }}}};
  },workspace);
  const text=()=>page.locator('#editor').evaluate(editor=>editor.value);
  const view=()=>page.locator('#editor').evaluate(editor=>({content:editor.value,start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection,folds:document.querySelectorAll('.fold-toggle.folded').length}));
  const action=async name=>{await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();};
  try{
    await page.goto(pathToFileURL(path.join(root,'fedora/Another-Note.html')).href);
    await page.waitForFunction(()=>window.__desktop.saved.length>0);
    await page.getByRole('button',{name:'View',exact:true}).click();await page.locator('[data-action="foldAll"]').click();
    await page.locator('#editor').focus();await page.keyboard.press('Control+End');await page.keyboard.type('// Keep open edits');
    await page.locator('#editor').evaluate(editor=>editor.setSelectionRange(editor.value.length-7,editor.value.length-2,'backward'));
    const before=await view();
    await page.locator('[data-close-file="other"]').click();
    await page.waitForFunction(()=>window.__desktop.purged.includes('other'));
    assert.deepEqual(await view(),before,'Closing another file keeps native text, folds and backward selection');
    const saved=await page.evaluate(()=>window.__desktop.state);
    assert.deepEqual(saved.notes.find(file=>file.id==='active').tags,active.tags);assert.equal(saved.notes.find(file=>file.id==='active').savedState.content,source);
    const compacted=saved.notes.find(file=>file.id==='other');assert.equal('content' in compacted,false);assert.equal('savedState' in compacted,false);assert.equal('tags' in compacted,false);
    assert.ok(await page.evaluate(()=>window.__desktop.versions.active.length>0),'The open tab retains its history');
    await page.locator('#editor').focus();await page.keyboard.press('Control+z');assert.equal(await text(),source,'Open-tab undo survives closed-file compaction');
    await page.waitForFunction(()=>window.__desktop.saved.at(-1).notes.find(file=>file.id==='other').fileLink===true);
    await action('Back Up All Files…');await page.waitForFunction(()=>window.__desktop.exports.length>0);
    const backup=JSON.parse(await page.evaluate(()=>window.__desktop.exports.at(-1).text));assert.equal(backup.notes.find(file=>file.id==='closed').content,'Closed source\n\u2603\n');
    assert.equal(await page.getByRole('tab').count(),1,'Reading closed contents for a backup does not open their tabs');
    await page.locator('#editor').focus();await page.keyboard.press('Control+Shift+t');
    await page.waitForFunction(()=>document.getElementById('editor').value==='Changed after close');
    await page.waitForFunction(()=>window.__desktop.saved.at(-1).notes.find(file=>file.id==='other').content==='Changed after close');
    assert.deepEqual(await page.evaluate(()=>window.__desktop.saved.at(-1).notes.find(file=>file.id==='other').tags),[],'Reopened links start without previous tags');
    await page.getByRole('tab',{name:'active.js',exact:true}).click();assert.equal(await text(),source);
    await action('Open Saved File…');await page.locator('[data-note="closed"]').click();
    await page.waitForFunction(()=>document.getElementById('editor').value==='Closed source\n\u2603\n');
    assert.equal(await page.getByRole('tab').count(),3);
    assert.ok(await page.evaluate(()=>window.__desktop.saved.every(state=>Number.isFinite(state.updatedAt)&&state.notes.every(file=>Number.isFinite(file.updatedAt)))),'Lightweight records retain valid edit/save clocks');
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    console.log('Passed: closed link-only records, open-tab source/tags/baseline/folds/backward selection/history/undo preservation, rereading current disk contents, fresh reopened tags, portable backup contents and closed-file discovery.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
