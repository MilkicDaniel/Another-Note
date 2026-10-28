const fs=require('node:fs'),path=require('node:path'),{Worker}=require('node:worker_threads');
const html=fs.readFileSync(path.join(__dirname,'../dist/Another-Note.html'),'utf8');
const payload=id=>html.match(new RegExp(`id="${id}"[^>]*>([^<]+)<`))[1];
const bootstrap=Buffer.from(payload('editorWorkerBootstrap'),'base64').toString();
function createEditorWorker(channel,{fallback=false}={}){
  const code=`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.process=undefined;globalThis.WorkerGlobalScope=function(){};globalThis.location={href:'blob:file:///offline-worker'};globalThis.fetch=()=>{throw new Error('Network must not be used');};${fallback?'globalThis.DecompressionStream=undefined;':''}globalThis.postMessage=message=>parentPort.postMessage(message);parentPort.on('message',data=>self.onmessage({data}));${bootstrap}`;
  const worker=new Worker(code,{eval:true});let id=0,resolveBoot,rejectBoot;const jobs=new Map(),ready=new Promise((resolve,reject)=>{resolveBoot=resolve;rejectBoot=reject;});
  worker.on('message',message=>{if(message.ready){resolveBoot();return;}if(message.bootError){rejectBoot(new Error(message.bootError));return;}const job=jobs.get(message.id);if(!job)return;jobs.delete(message.id);message.error?job.reject(new Error(message.error)):job.resolve(message.result);});
  worker.on('error',error=>{rejectBoot(error);for(const job of jobs.values())job.reject(new Error(error.message));jobs.clear();});
  worker.postMessage({type:'boot',source:payload(channel==='format'?'formatWorkerSource':'spellingWorkerSource')});
  const call=async(type,data)=>{await ready;return new Promise((resolve,reject)=>{const jobId=++id;jobs.set(jobId,{resolve,reject});worker.postMessage({id:jobId,type,...data});});};
  return {call,ready,terminate:()=>worker.terminate()};
}
module.exports={createEditorWorker};
