// Operate the packaged WebView2 editor on the disposable Windows test desktop.
// The debug port is enabled only in the test process's environment.
const assert=require('node:assert/strict');
const port=Number(process.argv[2]),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function pages(){return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(page=>page.type==='page'&&page.url.startsWith('file:')&&page.url.includes('Another-Note'));}
async function connect(page){
  const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let sequence=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data),request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);});
  socket.addEventListener('close',()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Editor closed'));}pending.clear();});
  return {close:()=>socket.close(),async evaluate(expression){
    const id=++sequence,result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Editor evaluation timed out'));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
  }};
}
async function until(check,label){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await check())return;await pause(100);}throw Error(label);}
const snapshot=`(()=>({ids:[...document.querySelectorAll('#fileTabs [data-tab-id]')].map(tab=>tab.dataset.tabId),text:document.getElementById('editor').value,start:document.getElementById('editor').selectionStart,end:document.getElementById('editor').selectionEnd,direction:document.getElementById('editor').selectionDirection,busy:document.querySelector('.app-window').inert}))()`;
async function write(editor,text){await editor.evaluate(`(()=>{const input=document.getElementById('editor');input.focus();input.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:${JSON.stringify(text)},bubbles:true,cancelable:true}));input.value=${JSON.stringify(text)};input.setSelectionRange(3,9,'backward');input.dispatchEvent(new InputEvent('input',{inputType:'insertText',bubbles:true}));})()`);}
(async()=>{
  const targets=await pages();assert.equal(targets.length,2,'Two real packaged editor pages are ready');
  const destination=await connect(targets[0]),source=await connect(targets[1]);
  try{
    await write(destination,'destination draft stays selected');await write(source,'source draft with undo');
    const originalSource=await source.evaluate(snapshot),originalDestination=await destination.evaluate(snapshot);
    await source.evaluate(`document.querySelector('[data-action="new"]').click()`);await write(source,'second source draft');
    const sourceTabs=await source.evaluate(snapshot);assert.equal(sourceTabs.ids.length,2);
    await destination.evaluate(`document.querySelector('[data-action="collectTabs"]').click()`);
    await until(async()=>{const view=await destination.evaluate(snapshot);return view.ids.length===3&&!view.busy;},'Consolidation did not complete');
    await until(async()=>(await pages()).length===1,'The emptied source window did not close');
    const collected=await destination.evaluate(snapshot);
    assert.deepEqual(collected.ids,[...originalDestination.ids,...sourceTabs.ids]);assert.equal(collected.text,'destination draft stays selected');
    await destination.evaluate(`document.querySelector('[data-tab-id="${originalSource.ids[0]}"] [role="tab"]').click()`);
    const transferred=await destination.evaluate(snapshot);assert.equal(transferred.text,'source draft with undo');assert.equal(transferred.start,3);assert.equal(transferred.end,9);assert.equal(transferred.direction,'backward');
    await destination.evaluate(`document.getElementById('editor').dispatchEvent(new InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true}))`);
    assert.equal((await destination.evaluate(snapshot)).text,'','The original undo history moved with the tab');
    await destination.evaluate(`document.getElementById('editor').dispatchEvent(new InputEvent('beforeinput',{inputType:'historyRedo',bubbles:true,cancelable:true}))`);
    assert.equal((await destination.evaluate(snapshot)).text,'source draft with undo');
    console.log('Passed: real packaged Windows tab consolidation, source close, draft text, target order, active tab, backward selection and undo/redo.');
  }finally{destination.close();source.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
