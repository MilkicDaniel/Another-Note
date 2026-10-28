const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{executeJob}=require('./worker_harness.cjs');
const code=fs.readFileSync(path.join(__dirname,'../source/symbol-references.js'),'utf8');
function fixture(extraCall=false){
 const files=[{id:'definition',title:'utils.js',mode:'javascript',content:'function greet() { return 1; }'},{id:'call',title:'app.js',mode:'javascript',content:'greet();'+(extraCall?'\ngreet();':'')}],elements=new Map(),f={files,selected:null,lists:[],messages:[],jobs:0};let active='call';
 const editor={value:files[1].content,setSelectionRange(a,b){f.selected=[a,b];}},$=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',checked:false,textContent:''});return elements.get(id);};
 const c=vm.createContext({editor,$,openFiles:()=>files,note:()=>files.find(x=>x.id===active),closeMenus(){},closeCompletions(){},syncSelectControls(){},document:{querySelector:()=>({classList:{add(){}}})},toast:m=>f.messages.push(m),
 selectNote(id){active=id;editor.value=files.find(x=>x.id===id).content;},scrollToEditorMatch:at=>f.scrolled=at,storeCursor(){},runFindAll:async result=>f.lists.push(result),
 runSearchJob:async(channel,data)=>{assert.equal(channel,'navigation');f.jobs++;return f.pending?f.pending(data):executeJob(data);}});
 vm.runInContext(code,c);f.context=c;f.active=()=>active;f.click=()=>c.navigateSymbolReference({id:active,text:editor.value,name:'greet',offset:editor.value.indexOf('greet')+2});return f;
}
(async()=>{
 const f=fixture();await f.click();assert.equal(f.active(),'definition');assert.deepEqual(f.selected,[9,14]);assert.equal(f.lists.length,0);assert.equal(f.scrolled,9);
 await f.click();assert.equal(f.active(),'call');assert.deepEqual(f.selected,[0,5],'A unique reverse reference is navigable too');
 const many=fixture(true);await many.click();assert.equal(many.active(),'call');assert.equal(many.lists[0].total,3);assert.equal(many.jobs,1,'Multiple results reuse the finished search for the list');
 const stale=fixture();let finish;stale.pending=data=>new Promise(resolve=>{finish=()=>executeJob(data).then(resolve);});const navigating=stale.click();stale.files[1].content='a newer edit';stale.context.editor.value='a newer edit';await finish();await navigating;assert.equal(stale.active(),'call');assert.equal(stale.selected,null);
 assert.equal(f.files[0].content,'function greet() { return 1; }');assert.equal(f.files[1].content,'greet();');
 console.log('Passed: direct unique function navigation across open tabs, reverse navigation, multiple-result list reuse, stale-click cancellation and unchanged text.');
})().catch(error=>{console.error(error);process.exitCode=1;});
