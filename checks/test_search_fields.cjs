// Run real search-field sizing and keyboard wiring against measurable textareas.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync(path.join(__dirname,'../source/app.js'),'utf8'),shell=fs.readFileSync(path.join(__dirname,'../source/shell.html'),'utf8');
const ids=['findInput','replaceInput','findAllInput'];
for(const id of ids)assert.match(shell,new RegExp(`<textarea id="${id}"[^>]*rows="1"`),'A real textarea accepts pasted/native line breaks');
function target(){const listeners=new Map();return {addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},emit(type,extra={}){const event={target:this,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,preventDefault(){this.defaultPrevented=true;},...extra};for(const fn of listeners.get(type)||[])fn(event);return event;}};}
const document={activeElement:null},window=target(),nodes=new Map(),observers=[];
function field(id){
  let value='',height='28px',writes=0;
  const style={overflowY:'',get height(){return height;},set height(text){height=text;writes++;}};
  return Object.defineProperties(target(),Object.getOwnPropertyDescriptors({id,style,width:220,shown:true,selectionStart:0,selectionEnd:0,scrollTop:0,
    get value(){return value;},set value(text){value=String(text).replace(/\r\n?/g,'\n');},
    get clientWidth(){return this.shown?this.width:0;},get writes(){return writes;},
    get scrollHeight(){const columns=Math.max(1,Math.floor((this.clientWidth-16)/8));return this.value.split('\n').reduce((rows,line)=>rows+Math.max(1,Math.ceil([...line].length/columns)),0)*18+8;},
    getBoundingClientRect(){return {width:this.clientWidth};},focus(){document.activeElement=this;},
    setRangeText(text,start=this.selectionStart,end=this.selectionEnd){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.selectionStart=this.selectionEnd=start+text.length;},
  }));
}
const $=id=>{if(!nodes.has(id))nodes.set(id,field(id));return nodes.get(id);};
const c=vm.createContext({$,document,window,WeakMap,paintEditor(){},getComputedStyle:()=>({borderTopWidth:'1px',borderBottomWidth:'1px'}),
  ResizeObserver:class{constructor(callback){this.callback=callback;this.targets=[];observers.push(this);}observe(node){this.targets.push(node);}},
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/search-features.js'),'utf8'),c);
let searches=0;const finds=[],replacements=[];c.refreshInlineFind=()=>searches++;c.findMatches=(...args)=>finds.push(args);c.replaceFindMatch=all=>replacements.push(all);
const start=app.indexOf('    wireSearchFields();'),end=app.indexOf("    $('findRegex').addEventListener",start);assert.ok(start>=0&&end>start);vm.runInContext(app.slice(start,end),c);
c.resizeSearchFields();for(const id of ids)assert.equal($(id).style.height,'28px');
for(const id of ids){
  const node=$(id);node.value='first\nsecond\n';node.emit('input');assert.equal(node.style.height,'64px','Each field includes its trailing empty line');
  node.value='one';node.emit('input');assert.equal(node.style.height,'28px','Removing lines shrinks the field');
  node.value='a'.repeat(60);node.emit('input');const wide=Number.parseInt(node.style.height);node.width=100;window.emit('resize');assert.ok(Number.parseInt(node.style.height)>wide,'Wrapped text grows when the window narrows');
  node.width=220;window.emit('resize');assert.equal(Number.parseInt(node.style.height),wide);assert.equal(node.value,'a'.repeat(60),'Resizing never rewrites the query');
  node.scrollTop=20;node.emit('input');assert.equal(node.scrollTop,20);assert.equal(node.style.overflowY,'','Normal scrolling is restored after measuring');
}
const hidden=$('replaceInput');hidden.shown=false;hidden.value='one\ntwo\nthree';const before=hidden.writes;hidden.emit('input');assert.equal(hidden.writes,before,'Hidden rows wait for usable layout');hidden.shown=true;c.resizeSearchFields();assert.equal(hidden.style.height,'64px');
const observer=observers[0];observer.callback(observer.targets.map(target=>({target})));const writes=ids.map(id=>$(id).writes);observer.callback(observer.targets.map(target=>({target})));assert.deepEqual(ids.map(id=>$(id).writes),writes,'Height-only notifications do not start a resize loop');
function newline(node){const event=node.emit('keydown',{key:'Enter',shiftKey:true});assert.equal(event.defaultPrevented,undefined);node.setRangeText('\n');node.emit('input');}
const find=$('findInput');find.value='firstsecond';find.selectionStart=find.selectionEnd=5;newline(find);assert.equal(find.value,'first\nsecond');assert.equal(find.style.height,'46px');assert.equal(finds.length,0);assert.ok(searches>0);
find.emit('keydown',{key:'Enter'});assert.deepEqual(finds,[[true]],'Enter continues to find the next match');find.emit('keydown',{key:'Enter',isComposing:true});assert.equal(finds.length,1,'IME confirmation never runs a search');
const replace=$('replaceInput');replace.value='old';replace.selectionStart=0;replace.selectionEnd=3;newline(replace);assert.equal(replace.value,'\n');assert.equal(replacements.length,0,'Adding a replacement line does not edit the document');
replace.emit('keydown',{key:'Enter'});replace.emit('keydown',{key:'Enter',ctrlKey:true});replace.emit('keydown',{key:'Enter',metaKey:true});assert.deepEqual(replacements,[false,true,true],'Enter replaces one and Ctrl/Cmd+Enter replaces all');
replace.value='left\r\nright';replace.emit('input');assert.equal(replace.value,'left\nright');assert.equal(replace.style.height,'46px');
console.log('Passed: real multiline controls, grow/shrink with trailing lines and wrapping, hidden-row resize, no height-observer loop, exact query text, native Shift+Enter, IME safety and existing Enter replacement actions.');
