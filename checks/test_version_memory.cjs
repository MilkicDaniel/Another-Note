const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../source/file-features.js'),'utf8');
let serial=0;const disk=new Map(),calls=[],dialog={open:false},messages=[];
const c=vm.createContext({native:true,startupBlocked:false,MODES:{text:'Plain Text'},$:()=>dialog,uid:()=>`v${++serial}`,clock:()=>serial,toast:message=>messages.push(message),
 request:async(command,args)=>{
   calls.push({command,args});
   if(command==='versions_append'){
     if(c.failAppend)throw new Error('Temporary history write failure');
     const before=disk.get(args.fileId)||[];if(before.at(-1)?.content!==args.version.content)before.push(args.version);disk.set(args.fileId,before);return {saved:true,count:before.length};
   }
   if(command==='versions_load')return {versions:disk.get(args.fileId)||[]};
   if(command==='versions_store'){const merged=new Map([...(disk.get(args.fileId)||[]),...args.versions].map(v=>[v.id,v]));const versions=[...merged.values()];disk.set(args.fileId,versions);return {saved:true,versions};}
   throw new Error(command);
 },
});vm.runInContext(source,c);vm.runInContext('nativeHistoryAppend=true',c);
const cache=vm.runInContext('versionCache',c),queues=vm.runInContext('versionQueues',c),errors=vm.runInContext('versionErrors',c);
(async()=>{
  const file={id:'a',title:'a.txt',content:'first',mode:'text'};
  await c.checkpointVersion(file,'Saved',true);file.content='second';await c.checkpointVersion(file,'Saved',true);
  assert.deepEqual(calls.map(call=>call.command),['versions_append','versions_append'],'Automatic checkpoints send one new version without loading all past contents');
  assert.ok(calls.every(call=>!('versions' in call.args)));assert.equal(cache.size,0);assert.equal(queues.size,0,'Settled queues release their references');assert.equal(disk.get('a').length,2);
  c.failAppend=true;file.content='failed checkpoint';assert.equal(await c.checkpointVersion(file,'Saved',true),false);assert.equal(cache.get('a')[0].content,'failed checkpoint');assert.ok(errors.has('a'));
  c.failAppend=false;file.content='after recovery';await c.checkpointVersion(file,'Saved',true);assert.ok(!errors.has('a'));assert.deepEqual(disk.get('a').map(v=>v.content),['first','second','failed checkpoint','after recovery'],'An append failure preserves its pending version and recovers it with the next successful write');
  cache.clear();const text='x'.repeat(1024*1024);
  for(let i=0;i<12;i++){cache.set('file-'+i,[{id:'v'+i,content:text.repeat(4)}]);c.trimVersionMemoryCache();}
  assert.ok([...cache.values()].reduce((n,versions)=>n+c.versionHistoryMemory(versions),0)<=16*1024*1024);assert.ok(cache.size<=4);assert.equal(disk.get('a').length,4,'Eviction affects memory only');
  cache.set('active-history',[{id:'large',content:text.repeat(10)}]);dialog.open=true;vm.runInContext("historyFileId='active-history'",c);c.trimVersionMemoryCache();assert.ok(cache.has('active-history'),'An open history viewer keeps its selected versions available');
  dialog.open=false;vm.runInContext('historyFileId=null',c);c.trimVersionMemoryCache();assert.ok(!cache.has('active-history'),'Closing history releases its oversized contents');
  cache.set('unsaved-history',[{content:text.repeat(10)}]);errors.set('unsaved-history','Not saved');c.trimVersionMemoryCache();assert.ok(cache.has('unsaved-history'),'Memory pruning cannot discard an unpersisted checkpoint');errors.delete('unsaved-history');c.trimVersionMemoryCache();assert.ok(!cache.has('unsaved-history'));
  console.log('Passed: compact native checkpoints, no eager history loading, queue cleanup, global history cache budget, disk history preservation, history-view pinning and failed-write recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
