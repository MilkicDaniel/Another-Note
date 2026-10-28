const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {workerPlatform,executeJob}=require('./worker_harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../source/editor-occurrences.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(text){
 const platform=workerPlatform(),elements=new Map(),listeners=new Map(),files=[{id:'a',content:text},{id:'b',content:text}],editor={value:text,selectionStart:0,selectionEnd:0,addEventListener:(name,fn)=>listeners.set(name,fn)};
 const $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,textContent:id==='searchWorkerSource'?platform.engine:'',setAttribute(){}});return elements.get(id);};
 let active=0,paints=0;const messages=[];
 const c=vm.createContext({...platform,$,editor,ready:true,startupBlocked:false,note:()=>files[active],paintEditor:()=>paints++,setTimeout,clearTimeout,requestAnimationFrame:callback=>setTimeout(callback,0),toast:message=>messages.push(message),escape:text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/search-features.js'),'utf8')+'\n'+source,c);c.wireOccurrenceHighlights();
 return {c,editor,files,messages,elements,listeners,platform,select(query,at=text.indexOf(query)){editor.selectionStart=at;editor.selectionEnd=at+query.length;},switchFile(){active=1;},paints:()=>paints};
}
(async()=>{
 const text='render render() renderCard render_card Renderer render\n// render\n"render"';
 const found=await executeJob({op:'occurrences',query:'render',regex:false,matchCase:true,text});
 assert.equal(found.total,5);for(const item of found.matches)assert.equal(text.slice(item.start,item.end),'render');
 const unicode=await executeJob({op:'occurrences',query:'猫',regex:false,matchCase:true,text:'猫 猫咪 大猫 猫_ 猫 𐐀猫 猫𐐀'});assert.equal(unicode.total,2,'Unicode and identifier boundaries exclude longer names');
 const punctuation=await executeJob({op:'occurrences',query:'a+b',regex:false,matchCase:true,text:'a+b aab xa+b a+by a+b'});assert.equal(punctuation.total,2,'Selected text is literal, never regex');
 const f=fixture(text);f.select('render');await f.c.highlightSelectedOccurrences();
 assert.equal(f.c.currentOccurrenceHighlights().matches.length,5);assert.deepEqual(f.files,[{id:'a',content:text},{id:'b',content:text}]);assert.deepEqual([f.editor.selectionStart,f.editor.selectionEnd],[0,6],'Highlighting preserves native selection');
 assert.equal(f.elements.has('replaceOneButton'),false,'Occurrence scans do not alter Find/Replace controls');assert.equal(f.platform.blobs.size,0,'Worker URLs are released');
 const html=f.c.decorateOccurrenceMatches(f.c.escape(text));assert.equal((html.match(/class="occurrence-hit"/g)||[]).length,5);assert.ok(!html.includes('class="search-hit"'));
 const both=f.c.decorateSearchRanges(html,[{start:0,end:6}]);assert.ok(both.includes('class="search-hit"')&&both.includes('class="occurrence-hit"'),'Find and selected-word highlights coexist');
 f.listeners.get('select')();assert.ok(f.c.currentOccurrenceHighlights(),'Unchanged selection keeps highlights for minimap navigation');
 let prevented=false;f.listeners.get('keydown')({key:'Escape',preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(f.c.currentOccurrenceHighlights(),null);
 f.select('render');const old=f.c.highlightSelectedOccurrences();f.select('Renderer');const newer=f.c.highlightSelectedOccurrences();await Promise.all([old,newer]);assert.equal(f.c.currentOccurrenceHighlights().query,'Renderer');assert.equal(f.c.currentOccurrenceHighlights().total,1,'A newer double-click supersedes an older worker response');
 f.editor.selectionStart=0;f.editor.selectionEnd=0;f.listeners.get('select')();assert.equal(f.c.currentOccurrenceHighlights(),null,'Changing the selection clears matching words');
 f.select('render');f.listeners.get('select')();f.select('Renderer');f.listeners.get('select')();
 const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Selection highlighting timed out');};
 await wait(()=>f.c.currentOccurrenceHighlights()?.total===1);assert.equal(f.c.currentOccurrenceHighlights().query,'Renderer','Mouse or keyboard selection highlights the latest selected word without a double-click');
 const scans=f.paints();f.listeners.get('select')();f.listeners.get('keyup')({key:'Shift'});await new Promise(resolve=>setTimeout(resolve,130));assert.equal(f.paints(),scans,'Repeated events for an unchanged selection do no extra work');
 f.select('render');f.listeners.get('select')();prevented=false;f.listeners.get('keydown')({key:'Escape',preventDefault(){prevented=true;}});f.listeners.get('keyup')({key:'Escape'});f.listeners.get('select')();await new Promise(resolve=>setTimeout(resolve,130));assert.ok(prevented);assert.equal(f.c.currentOccurrenceHighlights(),null,'Escape cancels a pending scan and unchanged-selection events cannot re-enable it');
 f.select('render');const pending=f.c.highlightSelectedOccurrences();f.editor.value=f.files[0].content='Changed';assert.equal(f.c.currentOccurrenceHighlights(),null);await pending;assert.equal(f.c.currentOccurrenceHighlights(),null,'Editing cannot restore stale results');
 f.editor.value=text;f.files[0].content=text;f.select('render');await f.c.highlightSelectedOccurrences();f.switchFile();assert.equal(f.c.currentOccurrenceHighlights(),null,'Highlights belong only to the current file');
 const blank=fixture(' \n ');blank.editor.selectionStart=0;blank.editor.selectionEnd=2;await blank.c.highlightSelectedOccurrences();assert.equal(blank.c.currentOccurrenceHighlights(),null);assert.equal(blank.platform.blobs.size,0,'Whitespace does not start a worker');
 console.log('PASS: mouse/keyboard/double-click selection, debounced scans and Escape suppression, literal whole-word/Unicode matches, worker cleanup, intact source/selection, no Find side effects and stale-response protection');
})().catch(error=>{console.error(error);process.exitCode=1;});
