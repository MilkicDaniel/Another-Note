const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),main=fs.readFileSync(path.join(root,'source/app.js'),'utf8');
function extract(name){const start=main.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=main.slice(start),next=rest.slice(1).search(/^  (?:async )?function /m);return rest.slice(0,next+1);}
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(text,mode='javascript',start=0,end=start){
  let time=10;const f={messages:[],saves:0,replacements:0},elements=new Map();
  const editor={value:text,selectionStart:start,selectionEnd:end,readOnly:false,focus(){},setRangeText(value,from,to){f.replacements++;this.value=this.value.slice(0,from)+value+this.value.slice(to);},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};
  const file={id:'a',content:text,title:'file.js',mode,updatedAt:1},state={notes:[file],dictionaryChanges:[],settings:{spellcheck:true}},histories=new Map();
  const context=vm.createContext({state,editor,histories,note:()=>file,currentView:'edit',findSession:null,ready:true,clock:()=>++time,
    $:id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',title:'',disabled:false,hidden:true,style:{},setAttribute(){}});return elements.get(id);},
    findHistorySnapshot:()=>null,restoreFindHistory(){},checkpointVersion(){},afterEdit(){f.saves++;},closeMenus(){},save(){f.saves++;},paintEditor(){},setView(){},clearError(){},showError:text=>f.messages.push(text),
    toast:text=>f.messages.push(text),activityBlocked:()=>false,referenceMenuOption:()=>'',icon:name=>name,setTimeout:()=>1,clearTimeout(){},innerWidth:1200,innerHeight:800,positionPopup(){},
    escape:text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  });
  vm.runInContext(fs.readFileSync(path.join(root,'source/tag-features.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'source/editor-tools.js'),'utf8')+'\n'+['fileSignature','captureSavedState','isFileModified','trimUndoHistory','rememberHistory','undo','replaceText','formatJSON'].map(extract).join('\n'),context);
  file.savedState=context.captureSavedState(file);file.savedSignature=context.fileSignature(file);
  f.c=context;f.file=file;f.editor=editor;f.histories=histories;return f;
}
(async()=>{
  for(const size of [2,4,8]){
    const f=fixture('alpha\nbeta\ngamma','text',2,8);f.c.state.settings.tabSize=size;
    f.c.indentLines();assert.equal(f.file.content,' '.repeat(size)+'alpha\n'+' '.repeat(size)+'beta\ngamma');assert.deepEqual([f.editor.selectionStart,f.editor.selectionEnd],[2+size,8+size*2]);
    f.c.indentLines(true);assert.equal(f.file.content,'alpha\nbeta\ngamma');f.c.undo();assert.equal(f.file.content,' '.repeat(size)+'alpha\n'+' '.repeat(size)+'beta\ngamma');
    const mixed=fixture('   alpha\n\tbeta','text',0,14);mixed.c.state.settings.tabSize=size;mixed.c.indentLines(true);assert.equal(mixed.file.content,' '.repeat(Math.max(0,3-size))+'alpha\nbeta');
    const code=fixture('const x=1;');code.c.state.settings.tabSize=size;code.c.editorJob=async(type,job)=>{assert.equal(job.tabSize,size);return 'const x = 1;\n';};await code.c.prettyFormat();
  }
  for(const mode of ['text','javascript','html','css','json','python','java','bash','markdown']){
    const f=fixture('alpha\nbeta\ngamma',mode,2);assert.equal(f.c.indentLines(),true);assert.equal(f.file.content,'  alpha\nbeta\ngamma',mode+' indents the current whole line');assert.deepEqual([f.editor.selectionStart,f.editor.selectionEnd],[4,4]);
    assert.equal(f.histories.get('a').undo.length,1);f.c.undo();assert.equal(f.file.content,'alpha\nbeta\ngamma');assert.equal(f.c.isFileModified(f.file),false);f.c.undo(true);assert.equal(f.file.content,'  alpha\nbeta\ngamma');
    f.c.indentLines(true);assert.equal(f.file.content,'alpha\nbeta\ngamma');assert.deepEqual([f.editor.selectionStart,f.editor.selectionEnd],[2,2]);
  }
  {
    const f=fixture('alpha\nbeta\ngamma','text',2,8);f.editor.selectionDirection='backward';let direction;
    f.editor.setSelectionRange=function(start,end,value){this.selectionStart=start;this.selectionEnd=end;direction=value;};
    f.c.indentLines();assert.equal(f.file.content,'  alpha\n  beta\ngamma');assert.deepEqual([f.editor.selectionStart,f.editor.selectionEnd],[4,12]);assert.equal(direction,'backward');
    f.c.indentLines(true);assert.equal(f.file.content,'alpha\nbeta\ngamma');assert.deepEqual([f.editor.selectionStart,f.editor.selectionEnd],[2,8]);
  }
  {
    const f=fixture('alpha\nbeta\ngamma','text',0,6);f.c.indentLines();assert.equal(f.file.content,'  alpha\nbeta\ngamma','A selection ending at the next line start leaves it untouched');assert.deepEqual([f.editor.selectionStart,f.editor.selectionEnd],[2,8]);f.c.indentLines(true);assert.equal(f.file.content,'alpha\nbeta\ngamma');
  }
  for(const [text,start,expected]of [['\nnext',0,'  \nnext'],['alpha\n',6,'alpha\n  '],['',0,'  ']]){
    const f=fixture(text,'text',start);f.c.indentLines();assert.equal(f.file.content,expected,'Blank current lines indent');f.c.indentLines(true);assert.equal(f.file.content,text);
  }
  for(const [text,position,expected,next]of [['  alpha',1,'alpha',0],[' alpha',4,'alpha',3],['\talpha',3,'alpha',2],[' \talpha',4,'\talpha',3]]){
    const f=fixture(text,'text',position);f.c.indentLines(true);assert.equal(f.file.content,expected);assert.deepEqual([f.editor.selectionStart,f.editor.selectionEnd],[next,next]);
  }
  {
    const f=fixture('  alpha\n beta\n\tgamma\nlast','text',1,20);f.c.indentLines(true);assert.equal(f.file.content,'alpha\nbeta\ngamma\nlast','Mixed indentation is removed one level per affected line');f.c.undo();assert.equal(f.file.content,'  alpha\n beta\n\tgamma\nlast');
    const plain=fixture('alpha\nbeta','text',1,8);assert.equal(plain.c.indentLines(true),false);assert.equal(plain.saves,0);assert.equal(plain.histories.size,0,'Unindenting flush-left lines is a no-op');
    plain.editor.readOnly=true;assert.equal(plain.c.indentLines(),false);assert.equal(plain.file.content,'alpha\nbeta');
  }
  for(const [mode,prefix]of Object.entries({javascript:'//',java:'//',python:'#',bash:'#'})){
    const source='  first()\n    second()\n\nlast()',end=source.indexOf('last()'),f=fixture(source,mode,2,end);
    f.c.toggleComment();assert.equal(f.file.content,`  ${prefix} first()\n  ${prefix}   second()\n\nlast()`);assert.equal(f.histories.get('a').undo.length,1);
    f.c.toggleComment();assert.equal(f.file.content,source,'Toggling twice restores selected lines including indentation');
    f.c.undo();assert.match(f.file.content,new RegExp(prefix.replace(/\//g,'\\/')));f.c.undo();assert.equal(f.file.content,source);
    assert.equal(f.c.isFileModified(f.file),false,'Undo restores the saved baseline');
    f.c.undo(true);assert.notEqual(f.file.content,source);
  }
  for(const text of ['let x = 1;','  ','','// already\n// commented']){
    const f=fixture(text,'javascript',text.length);f.c.toggleComment();assert.notEqual(f.file.content,text);f.c.toggleComment();assert.equal(f.file.content,text,'Caret comment roundtrip');
  }
  {
    const f=fixture('alpha\nbeta\ngamma','python',0,6);f.c.toggleComment();assert.equal(f.file.content,'# alpha\nbeta\ngamma','A selection ending at the next line does not comment it');
  }
  for(const mode of ['javascript','python','html','css']){
    const f=fixture('\nnext line',mode,0);f.c.toggleComment();assert.notEqual(f.file.content,'\nnext line');assert.ok(f.file.content.endsWith('\nnext line'),'Commenting the first empty line leaves the next line intact');f.c.toggleComment();assert.equal(f.file.content,'\nnext line');
  }
  for(const [mode,source,expected]of [['css','color: red;','/* color: red; */'],['html','<p>hello</p>','<!-- <p>hello</p> -->']]){
    const f=fixture(source,mode,0,source.length);f.c.toggleComment();assert.equal(f.file.content,expected);f.c.toggleComment();assert.equal(f.file.content,source);f.c.undo();assert.equal(f.file.content,expected);
  }
  for(const [mode,source,expected]of [
    ['javascript','first();\nsecond();\nlast();','// first();\n// second();\nlast();'],
    ['java','first();\nsecond();\nlast();','// first();\n// second();\nlast();'],
    ['python','first()\nsecond()\nlast()','# first()\n# second()\nlast()'],
    ['bash','echo first\necho second\necho last','# echo first\n# echo second\necho last'],
    ['html','<p>First</p>\n<div>Second</div>\n<p>Last</p>','<!-- <p>First</p>\n<div>Second</div> -->\n<p>Last</p>'],
    ['css','.first { color: red; }\n.second { color: blue; }\n.last {}','/* .first { color: red; }\n.second { color: blue; } */\n.last {}']
  ]){
    const f=fixture(source,mode,3,source.indexOf('\n')+5);f.c.toggleComment();assert.equal(f.file.content,expected,mode+' expands both partially selected lines');f.c.toggleComment();assert.equal(f.file.content,source,mode+' uncomments whole lines');f.c.undo();assert.equal(f.file.content,expected);
  }
  for(const [mode,source]of [['text','hello'],['json','{}'],['css','/* existing */'],['html','<!-- existing -->']]){
    const f=fixture(source,mode,2,3);f.c.toggleComment();if(['text','json'].includes(mode))assert.equal(f.file.content,source);
  }
  {
    const f=fixture('unchanged');assert.equal(f.c.setDictionaryWord('wrngWord'),true);assert.deepEqual(plain(f.c.dictionaryWords()),['wrngWord']);
    assert.equal(f.c.isFileModified(f.file),false);f.c.setDictionaryWord('WRNGWORD',true);assert.deepEqual(plain(f.c.dictionaryWords()),[]);
    f.c.setDictionaryWord('snake_case');assert.deepEqual(plain(f.c.dictionaryWords()),['snake_case']);assert.equal(f.c.setDictionaryWord('two words'),false);
    f.c.spellData={id:'a',text:'<wrng & okay>',matches:[{start:1,end:5,word:'wrng'}]};f.editor.value=f.c.spellData.text;
    vm.runInContext('spellcheckFiles.add("a");spellResult=spellData',f.c);const decorated=f.c.decorateSpelling('&lt;<span class="tok-string">wrng</span> &amp; okay&gt;');
    assert.equal(decorated,'&lt;<span class="tok-string"><span class="spell-error">wrng</span></span> &amp; okay&gt;','Spell marks preserve escaped text and syntax spans');
  }
  {
    const f=fixture('speling');assert.equal(f.c.spellcheckEnabled(),false,'Old saved global settings never enable spelling');
    const signature=f.c.fileSignature(f.file),updated=f.file.updatedAt;f.c.toggleSpellcheck();assert.equal(f.c.spellcheckEnabled(),true);assert.match(f.c.$('spellcheckMenu').innerHTML,/F6/);
    f.file.id='other';assert.equal(f.c.spellcheckEnabled(),false,'Each file starts off');f.c.toggleSpellcheck();assert.equal(f.c.spellcheckEnabled(),true);
    f.file.id='a';assert.equal(f.c.spellcheckEnabled(),true,'Switching tabs retains the session setting');f.c.toggleSpellcheck();assert.equal(f.c.spellcheckEnabled(),false);
    f.file.id='other';assert.equal(f.c.spellcheckEnabled(),true,'Disabling one file leaves another enabled');
    assert.equal(f.saves,0,'Spelling toggles never save or mark the file dirty');assert.equal(f.c.fileSignature(f.file),signature);assert.equal(f.file.updatedAt,updated);
    const fresh=fixture('speling');assert.equal(fresh.c.spellcheckEnabled(),false,'A new app session resets spelling');
  }
  {
    const f=fixture('speling');f.c.editorJob=async()=>['speling','Speling','spelling'];await f.c.openSpellingMenu({word:'speling',start:0,end:7},10,10);
    const menu=f.c.$('spellingMenu').innerHTML;assert.doesNotMatch(menu,/tag-menu-heading|>speling<|>Speling</);assert.match(menu,/>spelling</);assert.match(menu,/Add to Dictionary/);
  }
  {
    const f=fixture('const x=1;');f.c.editorJob=async()=> 'const x = 1;\n';await f.c.prettyFormat();assert.equal(f.file.content,'const x = 1;\n');assert.equal(f.histories.get('a').undo.length,1);f.c.undo();assert.equal(f.file.content,'const x=1;');
    f.c.editorJob=async()=>{throw new Error('Invalid syntax');};await f.c.prettyFormat();assert.equal(f.file.content,'const x=1;');assert.match(f.messages.at(-1),/Invalid syntax/);
    let complete;f.c.editorJob=()=>new Promise(resolve=>complete=resolve);const pending=f.c.prettyFormat();f.file.content=f.editor.value='newer draft';complete('old formatted text');await pending;assert.equal(f.file.content,'newer draft','A formatter cannot overwrite newer edits');
  }
  {
    const text='before {"x":1} after',f=fixture(text,'text',7,14);f.c.editorJob=async(type,job)=>{assert.equal(job.mode,'json');assert.equal(job.text,'{"x":1}');return '{\n  "x": 1\n}\n';};await f.c.formatJSON();assert.equal(f.file.content,'before {\n  "x": 1\n} after','Selected JSON formatting keeps surrounding text');f.c.undo();assert.equal(f.file.content,text);
    const block=fixture('prose\n```json\n{"x":1}\n```\nmore','markdown',18);block.c.editorJob=async(type,job)=>{assert.equal(job.text,'{"x":1}\n');return '{\n  "x": 1\n}\n';};await block.c.formatJSON();assert.equal(block.file.content,'prose\n```json\n{\n  "x": 1\n}\n```\nmore','Fenced JSON formatting remains available');
  }
  console.log('PASS: comment toggling, selection boundaries, one-step undo, personal dictionary, syntax-safe spelling overlay and stale formatting protection');
})().catch(error=>{console.error(error);process.exitCode=1;});
