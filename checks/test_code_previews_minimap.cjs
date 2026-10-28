const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../source'),main=fs.readFileSync(path.join(root,'app.js'),'utf8');
const syntax=main.slice(main.indexOf('  function tokenize('),main.indexOf('  /* EDITOR_RENDERING */')).replace('/* SYNTAX_FORMATS */',fs.readFileSync(path.join(root,'syntax-formats.js'),'utf8'));
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const c=vm.createContext({escape});vm.runInContext(syntax+'\n'+fs.readFileSync(path.join(root,'code-previews.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'editor-minimap.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(root,'editor-occurrences.js'),'utf8'),c);
const file={id:'js',mode:'javascript',content:'/* a multiline\n comment */\nfunction render() { return "<value> & safe"; }\nrender();'};
let start=file.content.indexOf('function'),end=file.content.indexOf('\nrender');
let html=c.previewCodeHTML(file,start,end,{start:file.content.indexOf('render'),end:file.content.indexOf('render')+6});
assert.match(html,/tok-keyword/);assert.match(html,/tok-string/);assert.match(html,/<mark><span class="tok-command">render<\/span><\/mark>/);assert.match(html,/&lt;value&gt; &amp; safe/);assert.ok(!html.includes('<value>'));
const comment=file.content.indexOf(' comment');assert.match(c.previewCodeHTML(file,comment,comment+8),/tok-comment/,'A clipped line retains multiline comment coloring');
assert.match(c.previewCodeHTML(file,start,start+8,{start:start+2,end:start+2}),/<mark>│<\/mark>/,'Zero-width matches retain their marker');
const decoded=c.syntaxRuns(c.colorCode(file.content,file.mode)).map(run=>run.text).join('');assert.equal(decoded,file.content,'Syntax spans preserve exact source offsets and escaped text');
const changed={...file,content:'const answer = 42;'};assert.match(c.previewCodeHTML(changed,0,changed.content.length),/tok-number/);assert.doesNotMatch(c.previewCodeHTML(changed,0,changed.content.length),/render/,'Updated source snapshots invalidate cached previews');
const large={id:'large',mode:'javascript',content:'\n'.repeat(300000)+'const value = "end";'};const saved=c.colorCode;let largest=0;c.colorCode=(text,mode)=>{largest=Math.max(largest,text.length);return saved(text,mode);};assert.match(c.previewCodeHTML(large,300000,large.content.length),/tok-keyword/);assert.ok(largest<6000,'Large files color a bounded neighborhood');c.colorCode=saved;
const minified={id:'minified',mode:'javascript',content:'x'.repeat(2000000)+'; const answer = 42;'};largest=0;c.colorCode=(text,mode)=>{largest=Math.max(largest,text.length);return saved(text,mode);};assert.match(c.previewCodeHTML(minified,2000001,minified.content.length),/tok-keyword/);assert.ok(largest<6000,'A long minified line cannot defeat the preview work budget');c.colorCode=saved;
for(const height of [120,500,1000])for(const scale of [.05,.12,.18])for(const scrollHeight of [500,5000,100000]){
 const clientHeight=400,max=Math.max(0,scrollHeight-clientHeight);
 for(const top of [0,max/2,max]){const g=c.minimapGeometry(height,scale,scrollHeight,clientHeight,top);assert.ok(g.top>=8&&g.top+g.thumb<=height-8+.001);assert.equal(g.maxScroll,max);if(max===0)assert.equal(g.offset,0);}
}
const elements=new Map(),calls=[],listeners=new Map(),state={settings:{fontSize:15,wrap:false,minimap:true}};
const node=id=>{if(!elements.has(id))elements.set(id,{hidden:false,style:{},setAttribute(name,value){this[name]=value;},getBoundingClientRect:()=>({width:132,height:500,top:80}),addEventListener(type,handler){listeners.set(id+':'+type,handler);},focus(){},setPointerCapture(){},hasPointerCapture:()=>false});return elements.get(id);};
const text=Array.from({length:2000},(_,i)=>`const line${i} = "value ${i}";`).join('\n'),source={id:'big',mode:'javascript',content:text},starts=[0];for(let at=text.indexOf('\n');at>=0;at=text.indexOf('\n',at+1))starts.push(at+1);
const editor={value:text,clientWidth:900,clientHeight:500,scrollHeight:48080,scrollTop:0,selectionStart:17,selectionEnd:23};
let scrollTop=0;Object.defineProperty(editor,'scrollTop',{get:()=>scrollTop,set:value=>scrollTop=Math.max(0,Math.min(editor.scrollHeight-editor.clientHeight,value))});
node('minimapCanvas').getContext=()=>({setTransform(){},clearRect(){calls.push('clear');},fillText(text,x,y){calls.push({text,x,y});},fillRect(x,y,width,height){calls.push({rect:true,x,y,width,height});}});
let saves=0;c.$=node;c.editor=editor;c.state=state;c.note=()=>source;c.ready=true;c.editorLayout={lineHeight:24,cellWidth:9,key:'layout',offsets:starts.map((_,i)=>i*24)};c.editorLineStarts=()=>starts;c.window={devicePixelRatio:2};c.document={body:{dataset:{theme:'dark'}}};c.getComputedStyle=()=>({fontSize:'15px',fontFamily:'monospace',paddingLeft:'4px',paddingRight:'23px',getPropertyValue:()=> '#abcdef'});c.syncScroll=()=>{};c.paintEditor=()=>{};c.save=()=>saves++;c.actions={};
c.renderMinimap();assert.ok(calls.length>50&&calls.length<2500,'Only the visible map section is painted, in syntax runs');assert.equal(node('minimapCanvas').width,264,'Canvas respects display scaling');assert.ok(calls.filter(x=>x.text).every(x=>x.y>=-5&&x.y<510),'Drawing stays within the map viewport');
editor.scrollTop=editor.scrollHeight-editor.clientHeight;c.renderMinimap();assert.equal(node('editorMinimap')['aria-valuenow'],'47580');assert.ok(parseFloat(node('minimapViewport').style.top)>300);
c.toggleMinimap();assert.equal(node('editorMinimap').hidden,true);const before=calls.length;c.renderMinimap();assert.equal(calls.length,before,'Hidden minimaps do no rendering work');c.toggleMinimap();assert.equal(node('editorMinimap').hidden,false);assert.equal(saves,2);assert.equal(source.content,text);assert.deepEqual([editor.selectionStart,editor.selectionEnd],[17,23]);
c.window.devicePixelRatio=1;c.renderMinimap();assert.equal(node('minimapCanvas').width,132,'Display scale changes invalidate the canvas cache');
c.wireMinimap();let prevented=false;listeners.get('editorMinimap:keydown')({key:'Home',preventDefault(){prevented=true;},stopPropagation(){}});assert.ok(prevented);assert.equal(editor.scrollTop,0,'Home returns to the first line without moving the caret');
c.editorLineAt=offset=>{let low=0,high=starts.length;while(low+1<high){const mid=(low+high)>>1;if(starts[mid]<=offset)low=mid;else high=mid;}return low;};
const wordMatches=[{start:text.indexOf('value'),end:text.indexOf('value')+5},{start:text.lastIndexOf('value'),end:text.lastIndexOf('value')+5}];c.currentOccurrenceHighlights=()=>({matches:wordMatches});c.renderMinimap();
assert.ok(calls.some(call=>call.rect&&call.width>3),'Visible words have individual minimap highlights');assert.ok(calls.some(call=>call.rect&&call.x===128&&call.y>300),'Overview ticks include matches beyond the visible map section');
console.log('PASS: syntax-colored and escaped previews, exact/zero-width matches, multiline context, bounded large-file coloring, minimap geometry, windowed canvas drawing, HiDPI, hidden rendering, remembered toggle and intact content/selection');
