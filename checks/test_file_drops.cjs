// File drops must open tabs without becoming editor text or tab transfers.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'source/file-drops.js'),'utf8'),features=fs.readFileSync(path.join(root,'source/file-features.js'),'utf8');
function extract(name){const start=features.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m')),rest=features.slice(start),next=rest.slice(1).search(/^  (?:async )?function /m);assert.ok(start>=0,name);return rest.slice(0,next+1);}
function fixture(native=false){
  const events=new Map(),windowEvents=new Map(),classes=new Set(),f={imports:[],messages:[],filtered:[],busy:false};
  const document={body:{classList:{toggle(name,show){show?classes.add(name):classes.delete(name);}}},addEventListener(name,callback){events.set(name,callback);}};
  const window={addEventListener(name,callback){windowEvents.set(name,callback);}};
  const context=vm.createContext({document,window,native,ready:true,startupBlocked:false,movingFiles:new Set(),closingFiles:new Set(),applicationCloseRunning:false,draggedTabId:null,
    state:{settings:{openIds:['current']},activeId:'current'},activityBlocked:()=>f.busy,toast:text=>f.messages.push(text),
    TextDecoder,Uint8Array,relativeFileFolder:()=>null,browserFolderForHandle:async()=>null,openFiles:()=>f.files||[],fileMatchesTag:file=>!file.hidden,setTabTagFilter:filter=>f.filtered.push(filter),
    importEntries:async(entries,trusted)=>{f.imports.push({entries,trusted});if(f.onImport)await f.onImport(entries);return entries.filter(item=>!item.error).map(item=>item.name);},
  });
  vm.runInContext(['fileTextFormat','readBrowserImportFile','readBrowserFile'].map(extract).join('\n')+'\n'+source+'\nwireFileDrops();',context);
  f.context=context;f.window=window;f.classes=classes;f.events=events;f.windowEvents=windowEvents;
  f.emit=(name,data={types:['Files'],files:[]},extra={})=>{const event={dataTransfer:data,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};events.get(name)(event);return event;};
  f.drain=()=>vm.runInContext('fileDropQueue',context);
  return f;
}
function file(name,text){const bytes=typeof text==='string'?new TextEncoder().encode(text):new Uint8Array(text);return {name,size:bytes.length,arrayBuffer:async()=>bytes.buffer};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  {
    const f=fixture(),files=[file('app.py','\ufeffprint("hello")\r\n'),file('index.html','<script>doNotRun()</script>')];
    assert.equal(f.emit('dragenter',{types:['Files']}).prevented,true);assert.ok(f.classes.has('file-drop-active'));
    f.emit('dragenter',{types:['Files']});f.emit('dragleave');assert.ok(f.classes.has('file-drop-active'),'Moving between children keeps the feedback');
    f.emit('dragleave');assert.equal(f.classes.size,0);
    const over=f.emit('dragover',{types:['Files']});assert.equal(over.dataTransfer.dropEffect,'copy');
    const drop=f.emit('drop',{types:['Files'],files});assert.equal(drop.prevented,true);assert.equal(drop.stopped,true);assert.equal(f.classes.size,0);
    await f.drain();assert.equal(f.imports.length,1);assert.equal(f.imports[0].trusted,true);
    const entries=f.imports[0].entries;assert.equal(entries[0].bom,true);assert.equal(entries[0].lineEnding,'crlf');assert.equal(entries[1].text,'<script>doNotRun()</script>');
  }
  {
    const f=fixture();let captures=0;const handles=['first.js','second.java'].map(name=>({kind:'file',name,getFile:async()=>file(name,'source')}));
    const items=handles.map(handle=>({kind:'file',getAsFile:()=>null,getAsFileSystemHandle(){captures++;return Promise.resolve(handle);}}));
    f.emit('drop',{types:['Files'],items});assert.equal(captures,2,'Every handle is requested synchronously during the drop');
    await f.drain();assert.equal(f.imports[0].entries[0].handle,handles[0]);assert.equal(f.imports[0].entries[1].handle,handles[1]);
  }
  {
    const f=fixture(),good=file('good.css','.card {}'),invalid=file('bad.bin',[255,254]),large={name:'large.txt',size:21*1024*1024,arrayBuffer:()=>{throw new Error('Must not read oversized files');}};
    f.emit('drop',{types:['Files'],files:[good,invalid,large]});await f.drain();
    const entries=f.imports[0].entries;assert.equal(entries[0].text,'.card {}');assert.ok(entries[1].error);assert.match(entries[2].error,/20 MB/);
    f.emit('drop',{types:['Files'],items:[{kind:'file',getAsFile:()=>null,webkitGetAsEntry:()=>({name:'folder',isDirectory:true})}]});await f.drain();
    assert.match(f.imports[1].entries[0].error,/individual files/);
  }
  {
    const f=fixture(),plain=f.emit('drop',{types:['text/plain'],items:[{kind:'string'}],files:[]});
    assert.equal(plain.prevented,undefined,'Text drag and drop remains available');
    const tab=f.emit('drop',{types:['application/x-another-note-tab'],files:[]});assert.equal(tab.prevented,undefined,'Tab MIME is handled by the existing tab flow');
    f.busy=true;const drop=f.emit('drop',{types:['Files'],files:[file('blocked.txt','keep')]});await f.drain();
    assert.equal(drop.prevented,true);assert.equal(f.imports.length,0);assert.match(f.messages[0],/Finish the current dialog/);
    const over=f.emit('dragover',{types:['Files']});assert.equal(over.dataTransfer.dropEffect,'none');assert.equal(f.classes.size,0);
  }
  {
    const f=fixture();let finishRead;
    f.emit('drop',{types:['Files'],files:[{name:'slow.txt',size:4,arrayBuffer:()=>new Promise(resolve=>finishRead=resolve)}]});
    await tick();f.busy=true;finishRead(new TextEncoder().encode('keep').buffer);await f.drain();assert.equal(f.imports.length,0,'A dialog opened while reading is respected');
  }
  {
    const f=fixture();let finishRead;
    f.emit('drop',{types:['Files'],files:[{name:'first.txt',size:1,arrayBuffer:()=>new Promise(resolve=>finishRead=resolve)}]});
    f.emit('drop',{types:['Files'],files:[file('second.txt','2')]});await tick();assert.equal(f.imports.length,0);
    finishRead(new TextEncoder().encode('1').buffer);await f.drain();assert.deepEqual(f.imports.map(item=>item.entries[0].name),['first.txt','second.txt'],'Separate drops keep their order');
  }
  {
    const f=fixture();f.files=[{id:'hidden.py',hidden:true}];
    f.emit('drop',{types:['Files'],files:[file('hidden.py','pass')]});await f.drain();assert.equal(f.filtered[0].kind,'all','Opened files are visible even under an unrelated tag filter');
    f.emit('dragover',{types:['Files']});f.windowEvents.get('blur')();assert.equal(f.classes.size,0);
  }
  {
    const f=fixture(true),drop=f.emit('drop',{types:['Files'],files:[file('native.txt','text')]});await f.drain();
    assert.equal(drop.prevented,true);assert.equal(f.imports.length,0,'The native controller alone handles filesystem paths');
    f.window.vistaNotesFileDropHover(true);assert.ok(f.classes.has('file-drop-active'));
    await f.window.vistaNotesOpenDroppedFiles([{name:'native.txt',text:'text',fileKey:'binding'}]);assert.equal(f.imports[0].entries[0].fileKey,'binding');
  }
  console.log('Passed: multiple file drops, synchronous handle capture, UTF-8/BOM/line endings, limits/errors, folders, ordered imports, busy UI, filter reveal and separation from native tab/text drops.');
})().catch(error=>{console.error(error);process.exitCode=1;});
