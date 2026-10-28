// Exercise incoming-tab geometry while its placeholder changes the DOM layout.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const transfer=fs.readFileSync(path.join(__dirname,'../source/tab-transfer.js'),'utf8');
const live=fs.readFileSync(path.join(__dirname,'../source/live-tab-drag.js'),'utf8');
const classes=()=>{const values=new Set();return {add:tag=>values.add(tag),remove:(...tags)=>tags.forEach(tag=>values.delete(tag)),contains:tag=>values.has(tag),toggle:(tag,on)=>on?values.add(tag):values.delete(tag)};};
let animations=0,viewportWidth=900,scrollLeft=0,baseWidth=190,compressedWidth=null;
const tabs={children:[],getBoundingClientRect:()=>({left:50,right:50+viewportWidth}),insertBefore(node,before){node.remove();const at=before?this.children.indexOf(before):this.children.length;this.children.splice(at,0,node);node.isConnected=true;}};
Object.defineProperty(tabs,'scrollLeft',{get:()=>scrollLeft,set:value=>{scrollLeft=Math.max(0,Math.min(Math.max(0,tabs.children.length*190-viewportWidth),value));}});
function node(id){return {dataset:id?{tabId:id}:{},style:{},classList:classes(),isConnected:Boolean(id),setAttribute(){},querySelector:()=>null,scrollIntoView(){},animate(){animations++;this.animations=(this.animations||0)+1;},remove(){tabs.children=tabs.children.filter(child=>child!==this);this.isConnected=false;},getBoundingClientRect(){const index=tabs.children.filter(child=>!child.classList.contains('live-tab-drag-source')).indexOf(this),width=compressedWidth&&tabs.children.some(tab=>!tab.dataset.tabId)?compressedWidth:baseWidth,left=50+width*index-scrollLeft+(parseFloat(this.style.transform?.slice(12))||0);return {left,right:left+width,top:33,bottom:69,width};}};}
tabs.children=['a','b','c'].map(node);
const bar={classList:classes(),getBoundingClientRect:()=>({left:0,right:1000,top:29,bottom:69})};
const state={settings:{openIds:['a','b','c']}};
const window={screenX:0,screenY:0,outerWidth:1002,innerWidth:1000,outerHeight:800,innerHeight:800};
const context=vm.createContext({window,state,native:true,ready:true,startupBlocked:false,movingFiles:new Set(),closingFiles:new Set(),applicationCloseRunning:false,activityBlocked:()=>false,
  document:{visibilityState:'visible',createElement:()=>node(),querySelector:()=>bar},$:()=>tabs,matchMedia:()=>({matches:false}),innerWidth:1000,innerHeight:800,setTimeout:()=>1,clearTimeout(){},escape:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
vm.runInContext(transfer.slice(0,transfer.indexOf('  function commitIncomingTransfer('))+'\n'+live,context);
const meta={token:'incoming',title:'First <draft> & plans',modified:true};
assert.equal(window.vistaNotesLiveTabHover(meta,330,50).index,1);
assert.deepEqual(tabs.children.map(tab=>tab.dataset.tabId||'preview'),['a','preview','b','c']);
assert.match(tabs.children[1].innerHTML,/First &lt;draft&gt; &amp; plans/);
assert.match(tabs.children[1].innerHTML,/file-unsaved/);
const held=tabs.children[1],heldLeft=held.getBoundingClientRect().left;
let transform=held.style.transform,transformWrites=[];Object.defineProperty(held.style,'transform',{get:()=>transform,set:value=>{transformWrites.push(value);transform=value;}});
window.vistaNotesLiveTabHover(meta,334,50);assert.equal(held.getBoundingClientRect().left-heldLeft,4,'The held tab follows small pointer movements without waiting for a slot change');assert.equal(held.animations||0,0,'The held tab is never delayed by neighbor animations');
for(let i=0;i<10;i++)assert.equal(window.vistaNotesLiveTabHover(meta,330,50).index,1,'A stationary pointer must not oscillate as neighbors move');
assert.ok(!transformWrites.includes(''),'A floating preview never clears its transform between pointer updates');
transformWrites=[];for(let i=0;i<12;i++)window.vistaNotesLiveTabHover(meta,330,50);assert.equal(transformWrites.length,0,'An unchanged pointer does not repaint the held tab');
assert.equal(context.screenTabLayout().slots[1].left,241,'Browser peers receive the same baseline geometry as the preview');
assert.equal(window.vistaNotesLiveTabHover(meta,336,50).index,2,'Crossing the midpoint advances the insertion position');
assert.deepEqual(tabs.children.map(tab=>tab.dataset.tabId||'preview'),['a','b','preview','c']);
assert.ok(animations>0,'Neighbors animate while the pointer is held');
assert.deepEqual(state.settings.openIds,['a','b','c'],'Preview never commits tab ownership or order');
assert.equal(window.vistaNotesLiveTabHover(meta,400,82).index,2,'A small vertical slip stays in the tab placement band');
assert.equal(window.vistaNotesLiveTabHover(meta,400,400).index,2,'Dropping into the editor body keeps the insertion position already chosen');
assert.equal(held.style.transform,'','A preview outside the bar rests at the chosen slot');
window.vistaNotesClearLiveTabHover();assert.deepEqual(tabs.children.map(tab=>tab.dataset.tabId),['a','b','c']);
assert.equal(bar.classList.contains('tab-drop-preview'),false);
window.vistaNotesLiveTabHover({token:'zero-offset',title:'Aligned'},145,50);window.vistaNotesLiveTabHover({token:'zero-offset',title:'Aligned'},145,400);assert.equal(tabs.children.find(tab=>!tab.dataset.tabId).style.transform,'','An aligned held tab also clears its transform when it enters the body');window.vistaNotesClearLiveTabHover();
assert.equal(window.vistaNotesLiveTabHover({token:'body',title:'Body entry'},100,400).index,3,'Entering the body first still appends by default');window.vistaNotesClearLiveTabHover();
window.vistaNotesLiveTabHover({token:'offset',title:'Off-center grab',grabRatio:.2},330,50);assert.equal(tabs.children.find(tab=>!tab.dataset.tabId).getBoundingClientRect().left,292,'The source grab point is retained in the destination');window.vistaNotesClearLiveTabHover();
// An active detached gesture cannot insert itself into its source window.
context.own={token:'own',id:'a'};vm.runInContext('liveNativeDrag=own;movingFiles.add("a")',context);tabs.children[0].classList.add('live-tab-drag-source');
assert.equal(window.vistaNotesLiveTabHover({token:'own',title:'a'},80,50).detach,true);
assert.ok(!tabs.children.some(tab=>!tab.dataset.tabId),'Returning to the source keeps the compact drag rather than an incoming placeholder');
assert.equal(context.tabLayout().slots.length,2);
assert.equal(window.vistaNotesLiveTabHover(meta,80,50).blocked,true,'Other drags cannot interrupt an active transfer');
window.vistaNotesClearLiveTabHover();
// Late IPC results from a window we already left must not resurrect its tab.
vm.runInContext('liveNativeDrag=null;movingFiles.clear()',context);
window.vistaNotesLiveTabHover(meta,330,50,20);
window.vistaNotesClearLiveTabHover(meta.token,21);
assert.equal(window.vistaNotesLiveTabHover(meta,336,50,20).stale,true);
assert.equal(tabs.children.some(tab=>!tab.dataset.tabId),false);
window.vistaNotesLiveTabHover(meta,336,50,22);
window.vistaNotesClearLiveTabHover(meta.token,21);
assert.equal(tabs.children.some(tab=>!tab.dataset.tabId),true,'An old leave must not clear a newer re-entry');
window.vistaNotesClearLiveTabHover(meta.token,23);
assert.equal(tabs.children.some(tab=>!tab.dataset.tabId),false);
// Adding a tab can shrink its neighbors. Measure those final widths while
// collapsing the placeholder's gap so the threshold cannot oscillate.
tabs.children=Array.from({length:6},(_,i)=>node('small-'+i));baseWidth=150;compressedWidth=128;
const compressed={token:'compressed',title:'Fits into a smaller tab'};
assert.equal(window.vistaNotesLiveTabHover(compressed,255,50,24).index,2,'Insertion uses the compressed widths immediately');
for(let i=0;i<8;i++)assert.equal(window.vistaNotesLiveTabHover(compressed,255,50,24).index,2,'Neighbor movement must not shift its own midpoint');
assert.equal(window.vistaNotesLiveTabHover(compressed,241.9,50,25).index,1);
assert.equal(window.vistaNotesLiveTabHover(compressed,242,50,26).index,2);
window.vistaNotesClearLiveTabHover(compressed.token,27);baseWidth=190;compressedWidth=null;
// A held incoming tab can reach offscreen tabs without repeated mouse motion.
const frames=new Map();let nextFrame=0;
context.requestAnimationFrame=callback=>{frames.set(++nextFrame,callback);return nextFrame;};context.cancelAnimationFrame=id=>frames.delete(id);
tabs.children=Array.from({length:8},(_,i)=>node('file-'+i));viewportWidth=300;tabs.scrollLeft=0;
const crowded={token:'crowded',title:'Incoming file',modified:false};
const initial=window.vistaNotesLiveTabHover(crowded,345,50,30).index;
function tick(time){const frame=frames.entries().next().value;assert.ok(frame,'Edge scrolling schedules the next frame');frames.delete(frame[0]);frame[1](time);}
for(let i=0;i<40;i++)tick(i*16.667);
assert.ok(tabs.scrollLeft>300,'The bar scrolls while the pointer stays near the edge');
assert.ok(window.vistaNotesLiveTabHover(crowded,345,50,31).index>initial,'Insertion follows offscreen tabs as the bar scrolls');
assert.equal(state.settings.openIds.join(','),'a,b,c','Scrolling does not change ownership');
window.vistaNotesLiveTabHover(crowded,200,50,32);assert.equal(frames.size,0,'Moving away from the edge stops scrolling');
window.vistaNotesLiveTabHover(crowded,345,50,33);assert.equal(frames.size,1);
const dropped=window.vistaNotesLiveTabHover(crowded,345,50,34,true).index,atDrop=tabs.scrollLeft;
assert.equal(frames.size,0,'Dropping freezes scrolling before the transfer');
assert.equal(tabs.children.find(tab=>!tab.dataset.tabId).style.transform,'','Release snaps the held tab into its final slot');
assert.equal(window.vistaNotesLiveTabHover(crowded,60,50,34).index,dropped,'Late points cannot move a dropped preview');assert.equal(tabs.scrollLeft,atDrop);
tabs.children.find(tab=>!tab.dataset.tabId).remove();context.restoreLiveTabPreview();
assert.equal(frames.size,0,'A rerender must keep a released preview frozen');
assert.equal(window.vistaNotesLiveTabHover(crowded,60,50,34).index,dropped);
window.vistaNotesClearLiveTabHover(crowded.token,35);
window.vistaNotesLiveTabHover({token:'cancelled',title:'Cancelled'},345,50,36);assert.equal(frames.size,1);
window.vistaNotesClearLiveTabHover('cancelled',37);assert.equal(frames.size,0,'Leaving cancels pending scroll frames');
assert.equal(tabs.children.some(tab=>!tab.dataset.tabId),false);
console.log('Passed: pointer-following incoming tab, retained grab point, midpoint placement, neighbor animation, forgiving vertical movement, body position retention, source-window detach, edge scrolling, frozen drop and protected ownership.');
