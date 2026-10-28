const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../windows/bridge.js'),'utf8');
(async()=>{
 const events={},received=[],requests=[],window={addEventListener:(name,fn)=>events[name]=fn},document={title:'File — Another Note',addEventListener:(name,fn)=>events[name]=fn,querySelector:()=>null};
 const c=vm.createContext({window,document,innerWidth:1100,innerHeight:800,JSON});vm.runInContext(code,c);
 window.vistaNotesNativeResult=(...args)=>received.push(args);window.webkit.messageHandlers.vistaNotes.postMessage(JSON.stringify({id:'load',command:'load'}));assert.equal(requests.length,0,'Native bridge exists before pywebview initialization and queues startup requests');
 window.pywebview={api:{dispatch:async raw=>{const data=JSON.parse(raw);requests.push(data);return {result:{saved:true},error:null};}}};events.pywebviewready();await new Promise(r=>setImmediate(r));assert.equal(requests[0].command,'load');assert.deepEqual(received,[['load',{saved:true},null]]);assert.equal(requests.find(x=>x.command==='geometry').width,1100);assert.ok(requests.some(x=>x.command==='title'));
 window.pywebview.api.dispatch=async()=>{throw Error('host failed');};window.webkit.messageHandlers.vistaNotes.postMessage('{"id":"save","command":"save"}');await new Promise(r=>setImmediate(r));assert.match(received.at(-1)[2],/host failed/);console.log('PASS: early Windows native detection, queued load, secure API response routing, geometry/title events and error propagation');
})().catch(e=>{console.error(e);process.exitCode=1;});
