// Exercise the actual pointer handlers with a minimal layout model, without a browser.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../source/app.js'), 'utf8');
const handlers = source.slice(source.indexOf('  function updateTabDrag(){'), source.indexOf('  function reopenFile()'));
const transfers = fs.readFileSync(path.join(__dirname, '../source/tab-transfer.js'), 'utf8');
const live=fs.readFileSync(path.join(__dirname,'../source/live-tab-drag.js'),'utf8');
const startLive=live.slice(live.indexOf('  function tryStartLiveTabDrag('),live.indexOf('  async function startLiveNativeDrag('));
const dragCallbacks = transfers.slice(0, transfers.indexOf('  function commitIncomingTransfer('));

function fixture() {
  const listeners = new Map();
  const frames = new Map();
  const animations = [];
  const saved = [];
  let frameId = 0, newFiles = 0;
  const classList = () => {
    const values = new Set();
    return {add: (...names) => names.forEach(n => values.add(n)), remove: (...names) => names.forEach(n => values.delete(n)), contains: n => values.has(n),toggle(name,on){on?values.add(name):values.delete(name);}};
  };
  const target = name => ({
    classList: classList(),
    addEventListener(type, callback) {listeners.set(`${name}:${type}`, callback);},
    emit(type, event) {listeners.get(`${name}:${type}`)?.(event);},
    closest() {return null;},
  });
  const tabs = Object.assign(target('tabs'), {
    children: [], scrollLeft: 0, captured: new Set(),
    getBoundingClientRect: () => ({left:50,right:950,width:900}),
    setPointerCapture(id) {this.captured.add(id);},
    hasPointerCapture(id) {return this.captured.has(id);},
    releasePointerCapture(id) {this.captured.delete(id);},
    insertBefore(node, before) {
      this.children = this.children.filter(n => n !== node);
      const index = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(index, 0, node);node.isConnected=true;
    },
    appendChild(node) {this.insertBefore(node, null);},
  });
  const tab = id => ({
    dataset: {tabId: id}, classList: classList(), isConnected: true, style: {},
    get offsetWidth() {return 190;},
    get offsetLeft() {return tabs.children.indexOf(this) * 191;},
    get nextElementSibling() {return tabs.children[tabs.children.indexOf(this)+1] || null;},
    getBoundingClientRect() {const left=50+this.offsetLeft-tabs.scrollLeft;return {left,right:left+190,top:33,bottom:69,width:190,height:36};},
    setAttribute(){},removeAttribute(){},remove(){tabs.children=tabs.children.filter(n=>n!==this);this.isConnected=false;},
    querySelector() {return null;},
    closest(selector) {return selector.includes('[data-close-file]') ? null : this;},
    getAnimations: () => [],
    animate(keyframes) {animations.push({id,keyframes});},
    cloneNode() {return {classList:classList(),style:{},setAttribute(){},removeAttribute(){},remove(){this.removed=true;}};},
  });
  tabs.children = ['a','b','c'].map(tab);
  const doc = target('document');
  const bar = target('bar');
  bar.getBoundingClientRect=()=>({left:0,right:1000,top:30,bottom:70});
  const win = target('window');
  doc.body = {classList:classList(),append(node) {tabs.children=tabs.children.filter(n=>n!==node);node.isConnected=true;this.ghost=node;}};
  doc.createElement=()=>tab(null);
  doc.querySelector = selector => selector === '.tabbar' ? bar : null;
  const state = {settings:{openIds:['a','b','c']},activeId:'b'};
  const context = vm.createContext({
    document:doc,window:win,state,native:true,nativeLiveDragEnabled:false,liveNativeDrag:null,ready:true,startupBlocked:false,updateBrowserDragPreview(drag){drag.browserTabCursor=true;},
    openFiles:()=>state.settings.openIds.map(id=>({id,tags:[]})),movingFiles:new Set(),closingFiles:new Set(),applicationCloseRunning:false,activityBlocked:()=>false,uid:()=> 'drag-token',postWindowMessage(){},
    $: id => {assert.equal(id, 'fileTabs');return tabs;},
    performance:{now:()=>1000},matchMedia:()=>({matches:false}),
    requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},
    cancelAnimationFrame:id=>frames.delete(id),
    closeMenus(){},renderTabs(){},save(){saved.push([...state.settings.openIds]);},request:async()=>({finished:true}),
    makeNote(){newFiles++;},moveFileToWindow(id,point={},target,index){saved.push({detached:id,point,...(target?{target,index}:{})});return Promise.resolve(true);},
  });
  vm.runInContext('let draggedTabId=null,tabDrag=null,tabDragFrame=0,suppressTabClickUntil=0;\n'+dragCallbacks+'\n'+fs.readFileSync(path.join(__dirname,'../source/tag-features.js'),'utf8')+'\n'+startLive+'\n'+handlers+'\nwireTabDragging();',context);
  // Destination lookup is exercised with the real transfer code in
  // test_window_features; keep these geometry/gesture checks synchronous.
  context.moveDroppedFile=(id,point,target,allowDetach=true)=>allowDetach||target?context.moveFileToWindow(id,point,target?.id,target?.index):Promise.resolve(false);
  const event = (element, x, extras={}) => ({target:element,pointerId:1,button:0,clientX:x,clientY:50,preventDefault(){this.prevented=true;},...extras});
  const tick = () => {const next=frames.entries().next().value;assert.ok(next,'A drag frame is scheduled');frames.delete(next[0]);next[1]();};
  return {tabs,doc,bar,win,state,saved,animations,context,event,tick,newFileCount:()=>newFiles,order:()=>tabs.children.map(t=>t.dataset.tabId)};
}

// A short click must not become a drag or move a tab.
{
  const f=fixture();const a=f.tabs.children[0];
  f.tabs.emit('pointerdown',f.event(a,145));
  f.doc.emit('pointermove',f.event(a,147));
  assert.equal(vm.runInContext('draggedTabId',f.context),null);
  f.doc.emit('pointerup',f.event(a,147));
  assert.deepEqual(f.order(),['a','b','c']);assert.equal(f.saved.length,0);
}

// WebKit may deliver the next mouse press without a fresh pointerdown after
// native DnD consumed its previous release. Keep the known pointer identity.
{
  const f=fixture(),a=f.tabs.children[0];f.context.nativeLiveDragEnabled=true;
  f.doc.emit('pointermove',f.event(a,145,{buttons:0}));
  f.tabs.emit('mousedown',f.event(a,145));f.doc.emit('pointermove',f.event(a,300,{buttons:1}));f.tick();
  assert.deepEqual(f.order(),['b','a','c']);f.doc.emit('pointerup',f.event(a,300,{buttons:0}));
  assert.deepEqual(f.saved,[['b','a','c']]);assert.equal(f.tabs.captured.size,0);
}

// Neighboring tabs move and animate while the pointer is still held down.
{
  const f=fixture();const a=f.tabs.children[0];
  f.tabs.emit('pointerdown',f.event(a,145));f.doc.emit('pointermove',f.event(a,300));f.tick();
  assert.deepEqual(f.order(),['b','a','c']);
  assert.deepEqual(f.state.settings.openIds,['a','b','c'],'The saved order waits until release');
  assert.ok(f.animations.some(a=>a.id==='b'),'Neighboring tabs animate aside');
  assert.match(f.doc.body.ghost.style.transform,/translate3d/,'The grabbed tab follows the pointer');
  f.doc.emit('pointerup',f.event(a,300));
  assert.deepEqual(Array.from(f.state.settings.openIds),['b','a','c']);
  assert.deepEqual(f.saved,[['b','a','c']]);assert.equal(f.state.activeId,'b');
  assert.equal(f.tabs.captured.size,0);assert.equal(f.doc.body.ghost,a,'The actual held tab returns to the bar');assert.equal(a.classList.contains('tab-drag-ghost'),false);assert.ok(f.tabs.children.includes(a));
}

// A neighbor moves exactly when the dragged edge reaches its midpoint.
{
  const f=fixture();const a=f.tabs.children[0];
  f.tabs.emit('pointerdown',f.event(a,145));f.doc.emit('pointermove',f.event(a,240));f.tick();
  assert.deepEqual(f.order(),['a','b','c']);assert.equal(f.animations.length,0);
  f.doc.emit('pointermove',f.event(a,241));f.tick();
  assert.deepEqual(f.order(),['b','a','c']);assert.equal(f.animations.length,1);
  // Holding still must not oscillate or skip another tab.
  f.tick();assert.deepEqual(f.order(),['b','a','c']);
}
{
  const f=fixture();const c=f.tabs.children[2];
  f.tabs.emit('pointerdown',f.event(c,527));f.doc.emit('pointermove',f.event(c,432));f.tick();
  assert.deepEqual(f.order(),['a','b','c']);
  f.doc.emit('pointermove',f.event(c,431));f.tick();
  assert.deepEqual(f.order(),['a','c','b']);
  // Reversing across the same halfway boundary restores the adjacent order.
  f.doc.emit('pointermove',f.event(c,432));f.tick();
  assert.deepEqual(f.order(),['a','b','c']);
}

// Dropping at the left edge must be able to reach the first position.
{
  const f=fixture();const c=f.tabs.children[2];
  f.tabs.emit('pointerdown',f.event(c,527));f.doc.emit('pointermove',f.event(c,60));f.tick();
  assert.deepEqual(f.order(),['c','a','b']);f.doc.emit('pointerup',f.event(c,60));
  assert.deepEqual(f.saved,[['c','a','b']]);
}

// Escape and losing focus restore the original order without saving a partial move.
for (const cancel of ['escape','blur','pointercancel']) {
  const f=fixture();const a=f.tabs.children[0];
  f.tabs.emit('pointerdown',f.event(a,145));f.doc.emit('pointermove',f.event(a,800));f.tick();
  assert.deepEqual(f.order(),['b','c','a']);
  if(cancel==='escape')f.doc.emit('keydown',f.event(a,800,{key:'Escape'}));
  else if(cancel==='blur')f.win.emit('blur',{});
  else f.doc.emit('pointercancel',f.event(a,800));
  assert.deepEqual(f.order(),['a','b','c']);assert.equal(f.saved.length,0);
  assert.equal(f.doc.body.classList.contains('tabs-reordering'),false);
}

// Only empty tab-bar space creates a new file on double-click.
{
  const f=fixture();f.bar.emit('dblclick',f.event(f.tabs,800));
  assert.equal(f.newFileCount(),1);
  const existingTab=f.tabs.children[0];f.bar.emit('dblclick',f.event(existingTab,145));
  assert.equal(f.newFileCount(),1);
  const button={closest:()=>({})};f.bar.emit('dblclick',f.event(button,925));
  assert.equal(f.newFileCount(),1);
}
// Leaving the tab bar detaches only on release, and does not commit a partial reorder.
for(const location of [{clientX:300,clientY:150},{clientX:-30,clientY:50},{clientX:1040,clientY:50}]){
  const f=fixture(),a=f.tabs.children[0];
  f.tabs.emit('pointerdown',f.event(a,145));f.doc.emit('pointermove',f.event(a,300));f.tick();
  assert.deepEqual(f.order(),['b','a','c']);
  const drop=f.event(a,location.clientX,{...location,screenX:1800,screenY:300});f.doc.emit('pointermove',drop);f.tick();
  assert.equal(f.saved.length,0,'No transfer or recovery write starts while still dragging');
  assert.equal(f.doc.body.ghost.classList.contains('detaching'),true);
  f.doc.emit('pointerup',drop);
  assert.deepEqual(f.order(),['a','b','c']);assert.deepEqual(f.state.settings.openIds,['a','b','c'],'The handoff owns removal after the new window is ready');
  assert.deepEqual(JSON.parse(JSON.stringify(f.saved)),[{detached:'a',point:{screenX:1800,screenY:300}}]);assert.equal(f.tabs.captured.size,0);
}
// Returning to the bar reorders normally; Escape outside never opens a window.
{
  const f=fixture(),a=f.tabs.children[0];f.tabs.emit('pointerdown',f.event(a,145));
  f.doc.emit('pointermove',f.event(a,300,{clientY:160}));f.tick();f.doc.emit('keydown',f.event(a,300,{key:'Escape'}));
  assert.equal(f.saved.length,0);assert.deepEqual(f.order(),['a','b','c']);
}
// A claimed destination inserts into that existing window.
for(const clientY of [150,50]){
  const f=fixture(),a=f.tabs.children[0];f.context.native=false;f.context.tabDropDestination=()=>({id:'existing-window',index:1});
  f.tabs.emit('pointerdown',f.event(a,145));f.doc.emit('pointermove',f.event(a,300,{clientY}));f.tick();f.doc.emit('pointerup',f.event(a,300,{clientY,screenX:1300,screenY:100}));
  assert.deepEqual(JSON.parse(JSON.stringify(f.saved)),[{detached:'a',point:{screenX:1300,screenY:100},target:'existing-window',index:1}]);
}
// The restored pointer path stays active on Fedora, even if a previous host
// advertised native dragging. Reorder and tear-off use the same DOM gesture.
for(const nativeHost of [true,false]){
  const f=fixture(),a=f.tabs.children[0];f.context.native=nativeHost;
  f.context.nativeDragEnabled=true;
  f.tabs.emit('pointerdown',f.event(a,145));
  f.doc.emit('pointermove',f.event(a,300));f.tick();
  assert.equal(f.tabs.captured.size,1,'The classic handler captures the pointer');
  assert.deepEqual(f.order(),['b','a','c']);
  const drop=f.event(a,300,{clientY:160,screenX:1300,screenY:900});
  f.doc.emit('pointermove',drop);f.tick();f.doc.emit('pointerup',drop);
  assert.deepEqual(JSON.parse(JSON.stringify(f.saved)),[{detached:'a',point:{screenX:1300,screenY:900,...(!nativeHost?{tabAnchor:{x:95,y:17}}:{})}}]);
  assert.equal(f.tabs.captured.size,0);
}
// Once detached, returning over the source tab bar still creates a window.
for(const nativeHost of [true,false]){
 const f=fixture(),a=f.tabs.children[0];f.context.native=nativeHost;
 f.tabs.emit('pointerdown',f.event(a,145));f.doc.emit('pointermove',f.event(a,200,{clientY:170,screenX:500,screenY:500}));f.tick();
 f.doc.emit('pointermove',f.event(a,300,{screenX:600,screenY:380}));f.tick();f.doc.emit('pointerup',f.event(a,300,{screenX:600,screenY:380}));
 assert.deepEqual(f.order(),['a','b','c']);assert.equal(f.saved.length,1);assert.equal(f.saved[0].detached,'a','Source return uses popout rather than in-window reorder');
}
console.log('Passed: restored pointer dragging, live halfway movement, pop-out on release and source return, browser target drops, cancellation and double-click.');
