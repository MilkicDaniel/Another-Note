const assert=require('node:assert/strict'),{createEditorWorker}=require('./editor_worker_harness.cjs');
(async()=>{
  for(const channel of ['spelling','format']){
    const worker=createEditorWorker(channel,{fallback:true});
    try{
      if(channel==='format')assert.equal(await worker.call('format',{text:'{"a":1}',mode:'json',filename:'file.json'}),'{\n  "a": 1\n}\n');
      else assert.deepEqual((await worker.call('spell',{text:'wrngWord',mode:'javascript',personal:[]})).matches.map(range=>range.word),['wrng']);
    }finally{await worker.terminate();}
  }
  console.log('PASS: offline decompression fallback loads both tools without DecompressionStream or network access');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
