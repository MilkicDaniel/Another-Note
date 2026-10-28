const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const classes=new Set(),events=new Map(),windowEvents=new Map(),tabs={classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},scrollLeft:0,scrollWidth:700,clientWidth:200,scrollBy(options){this.lastScroll=options;},addEventListener(name,handler){events.set(name,handler);},closest:()=>({addEventListener(name,handler){events.set(name,handler);}})},left={},right={};
const context=vm.createContext({$:id=>({fileTabs:tabs,scrollTabsLeft:left,scrollTabsRight:right}[id]),window:{addEventListener(name,handler){windowEvents.set(name,handler);}},matchMedia:()=>({matches:false})});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/tab-scrolling.js'),'utf8')+'\nwireTabScrolling();',context);
assert.equal(left.disabled,true);assert.equal(right.disabled,false);
assert.equal(classes.has('more-tabs-left'),false);assert.equal(classes.has('more-tabs-right'),true);
function wheel(deltaY,extra={}){const event={deltaY,deltaX:0,deltaMode:0,preventDefault(){this.prevented=true;},...extra};events.get('wheel')(event);return event;}
assert.equal(wheel(100).prevented,true);assert.equal(tabs.scrollLeft,100);assert.equal(left.disabled,false);
assert.equal(classes.has('more-tabs-left'),true);assert.equal(classes.has('more-tabs-right'),true);
assert.equal(wheel(50,{target:{closest:()=>({})}}).prevented,undefined);assert.equal(tabs.scrollLeft,100,'Wheel over a popup scrolls its menu, not the tabs behind it');
assert.equal(wheel(-40,{ctrlKey:true}).prevented,undefined);assert.equal(tabs.scrollLeft,100,'Ctrl+wheel remains available for text zoom');
wheel(0,{deltaX:30});assert.equal(tabs.scrollLeft,130);wheel(1,{deltaMode:1});assert.equal(tabs.scrollLeft,162);
tabs.scrollLeft=500;events.get('scroll')();assert.equal(right.disabled,true);
assert.equal(classes.has('more-tabs-left'),true);assert.equal(classes.has('more-tabs-right'),false);
context.scrollTabs(-1);assert.equal(tabs.lastScroll.left,-160);assert.equal(tabs.lastScroll.behavior,'smooth');
tabs.scrollWidth=180;tabs.scrollLeft=0;windowEvents.get('resize')();assert.equal(left.disabled,true);assert.equal(right.disabled,true);assert.equal(wheel(30).prevented,undefined);
assert.equal(classes.size,0,'Both fades disappear once every tab fits');
console.log('PASS: tab wheel/trackpad/arrow scrolling, bounds, resize and preserved Ctrl+wheel zoom');
