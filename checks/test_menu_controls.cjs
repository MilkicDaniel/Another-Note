// Exercise the actual menu module against the real shell and a small event-capable DOM.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),shell=fs.readFileSync(path.join(root,'source/shell.html'),'utf8');
const code=fs.readFileSync(path.join(root,'source/menu-controls.js'),'utf8'),main=fs.readFileSync(path.join(root,'source/app.js'),'utf8');
const decode=text=>text.replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[entity]));
let document;
class UIEvent{
  constructor(type,options={}){Object.assign(this,{type,bubbles:true,defaultPrevented:false},options);}
  preventDefault(){this.defaultPrevented=true;}
  stopPropagation(){this.stopped=true;}
}
function matches(node,selector){
  return selector.split(',').some(part=>{
    const s=part.trim();if(s.startsWith('#'))return node.id===s.slice(1);
    if(s.startsWith('.'))return node.classList.contains(s.slice(1));
    const attr=s.match(/^\[([^=\]]+)(?:="?([^"\]]+)"?)?\]$/);
    if(attr)return node.getAttribute(attr[1])!==null&&(attr[2]===undefined||node.getAttribute(attr[1])===attr[2]);
    return node.tag===s;
  });
}
class Element{
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.listeners=new Map();this.style={};this.dataset={};this.hidden=false;this.disabled=false;this._text='';this.rect={left:12,top:10,right:68,bottom:39,width:56,height:29};}
  get id(){return this.attrs.id||'';}set id(value){this.attrs.id=value;}
  get className(){return this.attrs.class||'';}set className(value){this.attrs.class=value;}
  get classList(){const self=this;return {contains:name=>self.className.split(/\s+/).includes(name),toggle(name,on){const set=new Set(self.className.split(/\s+/).filter(Boolean));if(on===undefined)on=!set.has(name);on?set.add(name):set.delete(name);self.className=[...set].join(' ');}};}
  setAttribute(name,value){this.attrs[name]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
  getAttribute(name){return Object.hasOwn(this.attrs,name)?this.attrs[name]:null;}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}set textContent(text){this._text=String(text);this.children=[];}
  get innerHTML(){return this.markup||'';}set innerHTML(value){this.markup=value;this._text='';this.children=[];parse(value,this);}
  get firstElementChild(){return this.children[0];}
  get options(){return this.querySelectorAll('option');}
  get value(){return this._value??(this.tag==='select'?this.options[0]?.value||'':this.attrs.value||'');}set value(value){this._value=String(value);}
  append(...nodes){for(const node of nodes){if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);this.children.push(node);node.parentNode=this;}}
  before(node){const parent=this.parentNode;parent.children.splice(parent.children.indexOf(this),0,node);node.parentNode=parent;}
  querySelectorAll(selector){const result=[];const visit=node=>{for(const child of node.children){if(matches(child,selector))result.push(child);visit(child);}};visit(this);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let node=this;node;node=node.parentNode)if(matches(node,selector))return node;return null;}
  contains(target){for(let node=target;node;node=node.parentNode)if(node===this)return true;return false;}
  addEventListener(type,callback){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(callback);}
  dispatchEvent(event){event.target??=this;for(const callback of this.listeners.get(event.type)||[])callback(event);if(event.bubbles&&!event.stopped&&this.parentNode)this.parentNode.dispatchEvent(event);return !event.defaultPrevented;}
  emit(type,options={}){const event=new UIEvent(type,options);this.dispatchEvent(event);return event;}
  click(){if(!this.disabled)this.emit('click');}
  focus(){document.activeElement=this;}
  showPopover(){assert.notEqual(this.getAttribute('popover'),null,'Only popover-enabled elements may enter the top layer');this.popoverOpen=true;}
  hidePopover(){assert.notEqual(this.getAttribute('popover'),null,'Ordinary menus must not call the popover API');this.popoverOpen=false;}
  getBoundingClientRect(){
    const popup=this.classList.contains('menu-popover'),width=popup?(this.classList.contains('select-options')?140:290):this.rect.width;
    const height=popup?Math.max(38,Math.min(400,this.querySelectorAll('button').length*29+12)):this.rect.height;
    const left=parseFloat(this.style.left) || this.rect.left,top=parseFloat(this.style.top) || this.rect.top;
    return {left,top,width,height,right:left+width,bottom:top+height};
  }
}
function parse(html,parent){
  const stack=[parent],voidTags=new Set(['input','meta','link','br','hr','img','use','path','circle']);
  for(const token of html.matchAll(/<[^>]+>|[^<]+/g)){
    const value=token[0];if(value.startsWith('<!'))continue;
    if(value.startsWith('</')){const tag=value.slice(2,-1).trim();const at=stack.map(node=>node.tag).lastIndexOf(tag);if(at>0)stack.length=at;continue;}
    if(!value.startsWith('<')){stack.at(-1)._text+=decode(value);continue;}
    const tag=value.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const node=new Element(tag);
    for(const attr of value.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:="([^"]*)")?/g))node.setAttribute(attr[1],decode(attr[2]||''));
    stack.at(-1).append(node);if(!voidTags.has(tag)&&!value.endsWith('/>'))stack.push(node);
  }
}
document=new Element('document');parse(shell,document);document.createElement=tag=>new Element(tag);document.getElementById=id=>document.querySelector('#'+id);
const $=document.getElementById.bind(document),window=new Element('window');
const state={settings:{openIds:[],closedIds:['a','b'],recentFiles:[{id:'a',closedAt:1},{id:'b',closedAt:2}]},notes:[{id:'a',title:'config.json',hasSavedFile:true},{id:'b',title:'run.sh',hasSavedFile:true}]};
let saves=0,opened=null;
const context=vm.createContext({native:false,windowPeers:new Map(),refreshRecentOpenTabs(){},clock:()=>100,document,window,$,state,ready:true,innerWidth:1000,innerHeight:700,Event:UIEvent,
  liveNotes:()=>state.notes,isFileModified:()=>false,escape:text=>String(text).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),save:()=>saves++,toast(){},trashView:false,selectNote:id=>opened=id});
function extract(name){const start=main.search(new RegExp(`^  function ${name}\\(`,'m')),rest=main.slice(start),end=rest.slice(1).search(/^  (?:async )?function /m);assert.ok(start>=0);return rest.slice(0,end+1);}
vm.runInContext(code+'\n'+['fileLabel','wasFileSaved','allOpenFileIds','eligibleRecentFiles','renderRecentFiles','showRecentFiles','clearRecentHistory','openRecentFile'].map(extract).join('\n'),context);context.wireMenus();

// All app dropdowns use matching controls; selecting an item still dispatches the real select change.
for(const id of ['language','findAllScope','sortBy','colorFormat']){
  const select=$(id),trigger=$(`${id}Trigger`),popup=$(`${id}Options`);
  assert.ok(select.hidden);assert.ok(trigger);assert.equal(trigger.getAttribute('aria-haspopup'),'listbox');
  trigger.click();assert.equal(popup.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(popup.querySelectorAll('button').length,select.options.length);
  trigger.emit('keydown',{key:'ArrowDown'});assert.equal(document.activeElement.dataset.selectValue,select.value);
  const old=document.activeElement;old.emit('keydown',{key:'ArrowDown'});assert.notEqual(document.activeElement,old);
  document.activeElement.emit('keydown',{key:'Escape'});assert.equal(popup.hidden,true);assert.equal(document.activeElement,trigger);
}
let changed=0;$('language').addEventListener('change',()=>changed++);
$('languageTrigger').click();const json=$('languageOptions').querySelectorAll('button').find(button=>button.dataset.selectValue==='json');json.click();
assert.equal($('language').value,'json');assert.equal(changed,1);assert.equal($('languageTrigger').querySelector('.select-label').textContent,'JSON');assert.equal($('languageOptions').hidden,true);
$('language').value='bash';context.syncSelectControls();assert.equal($('languageTrigger').querySelector('.select-label').textContent,'Bash','Automatic extension changes update the visible control');
$('language').disabled=true;context.syncSelectControls();assert.equal($('languageTrigger').disabled,true);$('languageTrigger').click();assert.equal($('languageOptions').hidden,true);
$('colorOccurrence').innerHTML='<option value="0">#fff · Column 10</option><option value="1">#282a2e · Column 30</option>';$('colorOccurrence').value='1';context.syncSelectControls();
assert.equal($('colorOccurrenceOptions').querySelectorAll('button').length,2);assert.equal($('colorOccurrenceTrigger').querySelector('.select-label').textContent,'#282a2e · Column 30','Dynamic picker choices use the styled menu too');
$('colorFormat').value='hsl';context.syncSelectControls();assert.equal($('colorFormatTrigger').querySelector('.select-label').textContent,'HSL');

// Recent files form a keyboard- and pointer-operable nested menu, without opening a dialog.
const recent=$('recentMenuTrigger'),popup=$('recentFilesMenu'),fileMenu=recent.closest('.menu'),parent=recent.closest('.menu-popover');
fileMenu.firstElementChild.click();assert.equal(parent.hidden,false);
recent.emit('keydown',{key:'ArrowRight'});assert.equal(popup.hidden,false);assert.equal(document.activeElement.dataset.openRecent,'b');assert.equal(parent.hidden,false);
document.activeElement.emit('keydown',{key:'ArrowDown'});assert.equal(document.activeElement.dataset.openRecent,'a');
document.activeElement.emit('keydown',{key:'ArrowLeft'});assert.equal(popup.hidden,true);assert.equal(parent.hidden,false);assert.equal(document.activeElement,recent);
recent.emit('pointerenter',{bubbles:false});assert.equal(popup.hidden,false);
context.openRecentFile('b');assert.equal(opened,'b');assert.equal(parent.hidden,true);assert.equal(popup.hidden,true);
context.showRecentFiles();assert.equal(parent.hidden,false);assert.equal(popup.hidden,false);
context.clearRecentHistory();assert.equal(saves,1);assert.equal(state.notes.length,2);assert.equal($('clearRecentButton').disabled,true);assert.match($('recentFilesList').textContent,/No recently closed/);
$('clearRecentButton').emit('keydown',{key:'Escape'});assert.equal(parent.hidden,false);assert.equal(popup.hidden,true);
recent.emit('keydown',{key:'Escape'});assert.equal(parent.hidden,true);assert.equal(document.activeElement,fileMenu.firstElementChild);

// Menu placement flips or clamps at every viewport edge, including short windows.
for(const [width,height] of [[1000,700],[560,400],[320,260]]){
  for(const anchor of [{left:5,top:5,right:55,bottom:30},{left:width-70,top:height-40,right:width-5,bottom:height-10}]){
    for(const side of [false,true]){
      const w=Math.min(290,width-16),h=Math.min(350,height-16),position=context.popupPosition(anchor,w,h,width,height,side);
      assert.ok(position.left>=8&&position.left+w<=width-8);assert.ok(position.top>=8&&position.top+h<=height-8);
    }
  }
}
assert.equal($('recentDialog'),null);assert.ok($('importFiles').getAttribute('multiple')!==null);
const view=document.querySelectorAll('.menu').find(menu=>menu.firstElementChild.textContent==='View');
const menus=Object.fromEntries(document.querySelectorAll('.menu').map(menu=>[menu.firstElementChild.textContent.trim(),menu]));
assert.ok(menus.Preferences);assert.equal(menus.Preferences.querySelectorAll('[data-theme-choice]').length,3);assert.equal(view.querySelectorAll('[data-theme-choice]').length,0);
assert.equal(menus.Preferences.querySelectorAll('[data-tab-size]').length,3);assert.ok(menus.Preferences.querySelector('[data-action="shortcuts"]'));assert.ok(menus.Preferences.querySelector('[data-action="dictionary"]'));
for(const action of ['duplicate','trash','manageTags'])assert.ok(menus.File.querySelector(`[data-action="${action}"]`));assert.ok(menus.File.querySelector('#pinButton'));
for(const action of ['indent','outdent','toggleComment','toggleSpellcheck','reviewSpelling'])assert.ok(menus.Edit.querySelector(`[data-action="${action}"]`));
assert.ok(menus.Tools.querySelector('#formatButton'));assert.equal(menus.Help.querySelector('[data-action="shortcuts"]'),null);
assert.ok($('spellStatus').closest('nav'));assert.equal($('spellStatus').parentNode,$('minimapToggle').parentNode);assert.equal($('spellStatus').parentNode.children.indexOf($('spellStatus'))+1,$('minimapToggle').parentNode.children.indexOf($('minimapToggle')),'Spellcheck sits immediately to the left of the minimap toggle');
const css=fs.readFileSync(path.join(root,'source/app.css'),'utf8');
assert.match(css,/grid-template-areas:"menu" "tabs" "editor" "results" "status"/);
assert.match(css,/\.app-window>\.statusbar\{grid-area:status;/,'The hidden results panel cannot move the footer into a zero-height row');
console.log('Passed: app-styled dropdowns, nested recents and clearing, keyboard/pointer behavior, viewport placement, Preferences and menu categories, adjacent toolbar spelling/minimap controls and fixed footer grid area.');
