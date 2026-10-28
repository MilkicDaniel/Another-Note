self.onmessage=async event=>{
  const job=event.data;
  try{
    if(job.type!=='format')throw new Error('Unknown formatting operation.');
    const result=await EditorVendor.formatCode(job.text,job.mode,job.filename,job.tabSize);
    self.postMessage({id:job.id,result});
  }catch(error){self.postMessage({id:job.id,error:error.message||String(error)});}
};
