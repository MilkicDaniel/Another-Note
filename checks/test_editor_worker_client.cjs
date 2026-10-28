const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../source/editor-worker-client.js'),'utf8');
function fixture(native=false){
  let serial=0;const timers=new Map(),f={workers:[],requests:[],created:[],revoked:[],failBoot:false,hold:false};
  class FakeWorker{
    constructor(url){this.url=url;this.jobs=[];f.workers.push(this);}
    postMessage(message){this.jobs.push(message);if(message.type==='boot'){this.channel=message.source;queueMicrotask(()=>this.onmessage?.({data:f.failBoot?{bootError:'bad compressed tools'}:{ready:true}}));}
      else if(!f.hold)queueMicrotask(()=>this.onmessage?.({data:{id:message.id,result:message.text?.toUpperCase()||'suggestions'}}));}
    terminate(){this.stopped=true;}
  }
  const elements={editorWorkerBootstrap:{textContent:Buffer.from('bootstrap').toString('base64')},spellingWorkerSource:{textContent:native?'':'spelling'},formatWorkerSource:{textContent:native?'':'format'}};
  const context=vm.createContext({native,$:id=>elements[id],Worker:FakeWorker,Blob,Uint8Array,atob,queueMicrotask,
    request:async(command,args)=>{f.requests.push({command,args});return {source:args.bundle};},
    URL:{createObjectURL:blob=>{f.created.push(blob);return 'blob:'+f.created.length;},revokeObjectURL:url=>f.revoked.push(url)},
    setTimeout:(callback,ms)=>{const id=++serial;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id),
  });vm.runInContext(source,context);f.c=context;f.timers=timers;return f;
}
(async()=>{
  for(const native of [false,true]){
    const f=fixture(native);assert.equal(f.workers.length,0,'No worker is created by loading the editor');
    const values=await Promise.all([f.c.editorJob('spell',{text:'one'}),f.c.editorJob('suggest',{text:'two'})]);assert.deepEqual(values,['ONE','TWO']);assert.equal(f.workers.length,1,'Concurrent spelling jobs share one initialization');
    assert.equal(await f.c.editorJob('format',{text:'three'}),'THREE');assert.equal(f.workers.length,2);assert.equal(f.revoked.length,2,'Bootstrap URLs are released after loading');
    if(native)assert.deepEqual(f.requests.map(item=>item.args.bundle),['spelling','format'],'Native bundles are read only when their tool is requested');else assert.equal(f.requests.length,0);
    f.hold=true;const pending=f.c.editorJob('format',{text:'pending'});await new Promise(resolve=>setImmediate(resolve));
    const rejected=assert.rejects(pending,/took too long/);const timeout=[...f.timers.values()].find(timer=>timer.ms===20000);timeout.callback();await rejected;
    assert.equal(f.workers[1].stopped,true);assert.notEqual(f.workers[0].stopped,true,'A formatter timeout leaves spelling available');f.hold=false;assert.equal(await f.c.editorJob('spell',{text:'still works'}),'STILL WORKS');
    assert.equal(await f.c.editorJob('format',{text:'retry'}),'RETRY');assert.equal(f.workers.length,3,'A failed tool can be loaded again');
  }
  {
    const f=fixture();f.failBoot=true;await assert.rejects(f.c.editorJob('spell',{text:'one'}),/bad compressed tools/);assert.equal(f.workers[0].stopped,true);f.failBoot=false;assert.equal(await f.c.editorJob('spell',{text:'retry'}),'RETRY');
  }
  {
    const f=fixture();await f.c.editorJob('format',{text:'formatted'});const idle=[...f.timers.values()].find(timer=>timer.ms===60000);assert.ok(idle);idle.callback();assert.equal(f.workers[0].stopped,true,'Idle formatting releases its runtime');
    assert.equal(await f.c.editorJob('format',{text:'again'}),'AGAIN');assert.equal(f.workers.length,2,'Formatting loads again when needed');
  }
  console.log('PASS: lazy tool loading, one shared initialization, browser/native sources, timeout isolation, cleanup and retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
