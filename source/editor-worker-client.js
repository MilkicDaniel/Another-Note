  const editorWorkers=new Map(),editorWorkerStarts=new Map(),editorWorkerJobs=new Map();
  let editorWorkerSequence=0;
  function stopEditorWorker(record,message){
    if(record.stopped)return;record.stopped=true;clearTimeout(record.bootTimer);clearTimeout(record.idleTimer);record.worker.terminate();
    if(record.url){URL.revokeObjectURL(record.url);record.url=null;}
    if(editorWorkers.get(record.channel)===record)editorWorkers.delete(record.channel);
    const error=new Error(message);record.rejectBoot?.(error);record.rejectBoot=null;
    for(const [id,job]of editorWorkerJobs){if(job.record!==record)continue;clearTimeout(job.timer);editorWorkerJobs.delete(id);job.reject(error);}
  }
  function getEditorWorker(channel){
    const existing=editorWorkers.get(channel);if(existing?.ready)return Promise.resolve(existing);
    if(editorWorkerStarts.has(channel))return editorWorkerStarts.get(channel);
    const starting=(async()=>{
      const element=$(channel==='format'?'formatWorkerSource':'spellingWorkerSource');
      let source=String(element.textContent||'').trim();
      if(!source&&native)source=(await request('editor_bundle',{bundle:channel})).source;
      if(!source)throw new Error('Editor tools are missing. Re-extract the Fedora package and run install.py.');
      const binary=atob($('editorWorkerBootstrap').textContent),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const url=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));let worker;
      try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
      const record={channel,worker,url,ready:false,stopped:false};editorWorkers.set(channel,record);
      const loaded=new Promise((resolve,reject)=>{
        record.rejectBoot=reject;record.bootTimer=setTimeout(()=>stopEditorWorker(record,'Editor tools took too long to start.'),15000);
        worker.onmessage=event=>{
          if(record.stopped)return;const message=event.data;
          if(message.bootError){stopEditorWorker(record,message.bootError);return;}
          if(message.ready){clearTimeout(record.bootTimer);record.ready=true;record.rejectBoot=null;URL.revokeObjectURL(record.url);record.url=null;resolve(record);return;}
          const job=editorWorkerJobs.get(message.id);if(!job||job.record!==record)return;
          clearTimeout(job.timer);editorWorkerJobs.delete(message.id);message.error?job.reject(new Error(message.error)):job.resolve(message.result);
          if(record.channel==='format'&&![...editorWorkerJobs.values()].some(job=>job.record===record))record.idleTimer=setTimeout(()=>stopEditorWorker(record,'Idle formatting tools were released.'),60000);
        };
        worker.onerror=event=>stopEditorWorker(record,event.message||'Editor tools could not start.');
      });
      try{worker.postMessage({type:'boot',source});}catch(error){stopEditorWorker(record,error.message);}
      return loaded;
    })();
    const pending=starting.finally(()=>editorWorkerStarts.delete(channel));editorWorkerStarts.set(channel,pending);return pending;
  }
  async function editorJob(type,data){
    const record=await getEditorWorker(type==='format'?'format':'spelling');
    clearTimeout(record.idleTimer);
    if(record.stopped)throw new Error('Editor tools stopped. Try the command again.');
    return new Promise((resolve,reject)=>{
      const id=++editorWorkerSequence,timer=setTimeout(()=>stopEditorWorker(record,'The editor operation took too long and was stopped.'),20000);
      editorWorkerJobs.set(id,{resolve,reject,timer,record});
      try{record.worker.postMessage({type,id,...data});}catch(error){clearTimeout(timer);editorWorkerJobs.delete(id);reject(error);}
    });
  }
