import {gunzipSync} from 'fflate';

// Only this small bootstrap is parsed when a worker starts. Decompression and
// library initialization stay off the editor thread, including on older hosts.
self.onmessage=async event=>{
  if(event.data.type!=='boot')return;
  try{
    const binary=atob(event.data.source),compressed=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)compressed[i]=binary.charCodeAt(i);
    let bytes;
    if(typeof DecompressionStream==='function'){
      try{bytes=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}catch(_){}
    }
    bytes??=gunzipSync(compressed);
    const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    new Function(source)();
    self.postMessage({ready:true});
  }catch(error){self.postMessage({bootError:error.message||String(error)});}
};
