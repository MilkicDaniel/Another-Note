const fs=require('node:fs'),path=require('node:path');
const {Worker:Thread}=require('node:worker_threads');
const engine=['symbol-index.js','search-worker.js'].map(name=>fs.readFileSync(path.join(__dirname,'../source',name),'utf8')).join('\n');
function workerPlatform(){
  const blobs=new Map();let sequence=0;
  class Blob{constructor(parts){this.text=parts.join('');}}
  class Worker{
    constructor(url){
      const code=blobs.get(url);if(!code)throw new Error('Missing worker source');
      this.thread=new Thread('const {parentPort}=require("node:worker_threads");global.self=globalThis;self.postMessage=data=>parentPort.postMessage(data);\n'+code+'\nparentPort.on("message",data=>self.onmessage({data}));',{eval:true});
      this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.({message:error.message}));
    }
    postMessage(data){this.thread.postMessage(data);}
    terminate(){return this.thread.terminate();}
  }
  return {Blob,Worker,URL:{createObjectURL(blob){const key=`worker-${++sequence}`;blobs.set(key,blob.text);return key;},revokeObjectURL:key=>blobs.delete(key)},engine,blobs};
}
function executeJob(payload){
  const platform=workerPlatform();
  return new Promise((resolve,reject)=>{
    const url=platform.URL.createObjectURL(new platform.Blob([engine])),worker=new platform.Worker(url);
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('Worker test timed out'));},3000);
    worker.onmessage=event=>{if(event.data.progress)return;clearTimeout(timer);worker.terminate();platform.URL.revokeObjectURL(url);event.data.error?reject(new Error(event.data.error)):resolve(event.data.result);};
    worker.onerror=error=>{clearTimeout(timer);worker.terminate();reject(new Error(error.message));};worker.postMessage(payload);
  });
}
module.exports={workerPlatform,executeJob,engine};
