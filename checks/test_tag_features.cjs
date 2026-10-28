// Tag metadata, filtered rendering, and drag order must never close hidden files.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),main=fs.readFileSync(path.join(root,'source/app.js'),'utf8'),tags=fs.readFileSync(path.join(root,'source/tag-features.js'),'utf8');
function extract(name){const start=main.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=main.slice(start),end=rest.slice(1).search(/^  (?:async )?function /m);return rest.slice(0,end+1);}
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  let time=1000;const f={saves:[],elements:new Map(),confirmations:[],messages:[],confirmed:false};
  const element=id=>{if(!f.elements.has(id))f.elements.set(id,{hidden:true,innerHTML:'',textContent:'',dataset:{},classList:{toggle(){}},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]});return f.elements.get(id);};
  const state={format:'vista-notes',version:1,updatedAt:100,activeId:'a',tags:['Work','Personal'],settings:{openIds:['a','hidden','b','untagged'],tagFilter:{kind:'all'}},notes:['a','hidden','b','untagged'].map((id,index)=>({id,title:id+'.txt',content:'saved '+id,mode:'text',createdAt:1,updatedAt:100,tags:index===3?[]:index===1?['Personal']:['Work'],tagsUpdatedAt:100}))};
  const context=vm.createContext({state,$:element,MODES:{text:'Plain Text'},DEFAULTS:{},logicalTime:100,ready:true,startupBlocked:false,trashView:false,searchTerm:'',uid:()=>`created-${++time}`,draggedTabId:null,movingFiles:new Set(),closingFiles:new Set(),applicationCloseRunning:false,clock:()=>++time,
    icon:name=>`<svg data-icon="${name}"></svg>`,confirmAction:async(...args)=>{f.confirmations.push(args);return f.onConfirm?f.onConfirm():f.confirmed;},toast:message=>f.messages.push(message),
    note:()=>context.state.notes.find(file=>file.id===context.state.activeId),liveNotes:()=>context.state.notes.filter(file=>!file.removedAt&&!file.trashedAt),
    escape:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    save:()=>f.saves.push(plain(context.state)),closeMenus(){},renderRecentFiles(){},syncTabScroll(){},syncSelectControls(){},selectNote(id){context.state.activeId=id;if(!context.state.settings.openIds.includes(id))context.state.settings.openIds.push(id);context.renderTabs();},
  });
  vm.runInContext(tags+'\n'+['fileSignature','captureSavedState','normalizeSavedState','isFileModified','fileLabel','mergeRecentSettings','validateWorkspace','mergeWorkspaces','openFiles','renderTabs','updateFileIndicators','makeNote'].map(extract).join('\n'),context);
  for(const file of state.notes){file.savedSignature=context.fileSignature(file);file.savedState=context.captureSavedState(file);}
  f.context=context;f.state=()=>context.state;f.call=(name,...args)=>context[name](...args);f.file=id=>context.state.notes.find(file=>file.id===id);f.bar=()=>element('fileTabs').innerHTML;
  return f;
}
{
  const f=fixture(),ids=plain(f.state().settings.openIds),notes=plain(f.state().notes);
  f.call('setTabTagFilter',{kind:'tag',tag:'Work'});assert.equal(f.call('revealFileForNavigation',f.file('b')),false);assert.equal(f.state().settings.tagFilter.kind,'tag');
  assert.equal(f.call('revealFileForNavigation',f.file('hidden')),true);assert.deepEqual(plain(f.state().settings.tagFilter),{kind:'all'},'Navigating to a file outside a tag returns to the first filter option');
  Object.assign(f.file('a'),{fileKey:'a',diskPath:'/code/a.txt'});f.state().settings.tagFilter={kind:'folder',folder:'/code'};
  assert.equal(f.call('revealFileForNavigation',f.file('hidden')),true);assert.equal(f.state().settings.tagFilter.kind,'all');
  f.state().settings.tagFilter={kind:'tag',tag:'Work'};vm.runInContext('closeReviewFileId="hidden"',f.context);assert.equal(f.call('revealFileForNavigation',f.file('hidden')),false);assert.equal(f.state().settings.tagFilter.kind,'tag','A close review keeps the selected filter');
  assert.deepEqual(plain(f.state().settings.openIds),ids);assert.equal(f.file('hidden').content,notes[1].content);
}
{
  const f=fixture(),before=plain(f.state().notes),ids=plain(f.state().settings.openIds),signature=f.file('a').savedSignature;
  assert.equal(f.call('createWorkspaceTag','  New   project ').created,true);assert.ok(f.call('workspaceTags').includes('New project'));
  assert.deepEqual(plain(f.state().notes),before,'Creating a reusable tag does not assign it or change any file');assert.deepEqual(plain(f.state().settings.openIds),ids);assert.equal(f.file('a').savedSignature,signature);
  const count=f.saves.length;assert.equal(f.call('createWorkspaceTag','NEW PROJECT').created,false);assert.equal(f.saves.length,count,'Duplicate names are case-insensitive and do not write again');assert.equal(f.call('createWorkspaceTag','  '),null);
  f.state().tagChanges=[{name:'Deleted tag',updatedAt:1,deleted:true}];assert.equal(f.call('createWorkspaceTag','Deleted tag').created,true);assert.equal(f.state().tagChanges.find(tag=>tag.name==='Deleted tag').deleted,false);
}
{
  const f=fixture(),ids=plain(f.state().settings.openIds),notes=plain(f.state().notes);
  f.call('toggleTabTagFilter',{kind:'tag',tag:'Work'});assert.equal(f.state().settings.tagFilter.kind,'tag');
  f.call('toggleTabTagFilter',{kind:'tag',tag:'WORK'});assert.deepEqual(plain(f.state().settings.tagFilter),{kind:'all'},'Clicking the selected tag clears it');
  Object.assign(f.file('a'),{fileKey:'file-a',diskPath:'/project/a.txt'});
  f.call('toggleTabTagFilter',{kind:'folder',folder:'/project'});assert.equal(f.state().settings.tagFilter.kind,'folder');
  f.call('toggleTabTagFilter',{kind:'folder',folder:'/project'});assert.deepEqual(plain(f.state().settings.tagFilter),{kind:'all'},'Clicking the selected folder clears it');
  f.call('toggleTabTagFilter',{kind:'untagged'});f.call('toggleTabTagFilter',{kind:'untagged'});assert.deepEqual(plain(f.state().settings.tagFilter),{kind:'all'});
  assert.deepEqual(plain(f.state().settings.openIds),ids);assert.equal(f.file('a').content,notes[0].content);assert.equal(f.call('isFileModified',f.file('a')),false);
}
{
  const f=fixture(),before=plain(f.state().notes),signature=f.file('a').savedSignature;
  Object.assign(f.file('a'),{fileKey:'a-key',diskPath:'/work/project/a.txt'});
  Object.assign(f.file('b'),{fileKey:'b-key',diskPath:'/work/project/b.txt'});
  Object.assign(f.file('hidden'),{fileKey:'other-key',diskPath:'/other/project/hidden.txt'});
  f.file('a').content='unsaved edits in a saved file';
  assert.deepEqual(plain(f.call('folderTags')).map(item=>[item.path,item.count]),[['/other/project',1],['/work/project',2]],'Folder tags use distinct complete paths and ignore untitled files');
  f.call('setTabTagFilter',{kind:'folder',folder:'/work/project'});assert.match(f.bar(),/data-tab-id="a"/);assert.match(f.bar(),/data-tab-id="b"/);assert.doesNotMatch(f.bar(),/data-tab-id="hidden"|data-tab-id="untagged"/);
  assert.equal(f.file('a').savedSignature,signature);assert.deepEqual(plain(f.state().tags),['Work','Personal'],'Automatic folders never enter the manual tag registry');
  f.state().settings.openIds=f.state().settings.openIds.filter(id=>id!=='a');f.call('renderTabs');assert.equal(f.call('folderTags').find(item=>item.path==='/work/project').count,1);
  f.state().settings.openIds=f.state().settings.openIds.filter(id=>id!=='b');f.call('renderTabs');assert.deepEqual(plain(f.state().settings.tagFilter),{kind:'all'},'The final closed file removes the folder filter');
  assert.equal(f.state().notes.length,before.length,'Closed and history files do not keep folder tags alive');
  Object.assign(f.file('untagged'),{folderKey:'browser-folder',folderPath:'Documents/code'});assert.equal(f.call('fileFolder',f.file('untagged')).label,'code');
  f.file('untagged').savedState=null;assert.equal(f.call('fileFolder',f.file('untagged')),null,'Unsaved browser drafts do not create folders');
  f.state().settings.openIds.push('a');f.state().settings.tagFilter={kind:'folder',folder:'/work/project'};const created=f.call('makeNote');assert.deepEqual(plain(created.tags),[]);assert.deepEqual(plain(f.state().settings.tagFilter),{kind:'all'},'A new unsaved file is visible and has no imaginary folder');
}
{
  const f=fixture(),local=plain(f.state()),remote=plain(local);
  local.dictionaryChanges=[{name:'wrngWord',updatedAt:200,deleted:false}];remote.dictionaryChanges=[{name:'WRNGWORD',updatedAt:300,deleted:true},{name:'snake_case',updatedAt:250,deleted:false}];
  const merged=f.call('mergeWorkspaces',local,remote);assert.equal(merged.dictionaryChanges.find(item=>item.name==='WRNGWORD').deleted,true);
  const stale=f.call('mergeWorkspaces',merged,local);assert.equal(stale.dictionaryChanges.find(item=>item.name==='WRNGWORD').deleted,true,'Stale saves cannot resurrect a removed personal word');
  const restored=f.call('validateWorkspace',plain(stale));assert.deepEqual(plain(restored.dictionaryChanges),plain(stale.dictionaryChanges));
}
{
  const f=fixture(),before=plain(f.state()),signature=f.file('a').savedSignature;
  f.call('setFileTag','a','  Project   blue  ',true);
  assert.deepEqual(plain(f.file('a').tags),['Work','Project blue']);assert.equal(f.file('a').updatedAt,100);assert.equal(f.file('a').savedSignature,signature);assert.equal(f.call('isFileModified',f.file('a')),false);
  assert.equal(f.file('a').content,before.notes[0].content);assert.deepEqual(plain(f.state().settings.openIds),before.settings.openIds);assert.ok(f.state().tags.includes('Project blue'));
  const saved=f.saves.length;f.call('setFileTag','a','PROJECT BLUE',true);assert.equal(f.saves.length,saved,'Reusing a tag is idempotent and case insensitive');
  f.call('setFileTag','a','work',false);assert.deepEqual(plain(f.file('a').tags),['Project blue']);assert.ok(f.state().tags.includes('Work'),'Unassigning keeps tags reusable');
  f.call('setFileTag','b','Project blue',true);assert.deepEqual(plain(f.file('b').tags),['Work','Project blue']);
  const copy=f.call('validateWorkspace',plain(f.state()));assert.deepEqual(plain(copy.notes[0].tags),['Project blue']);assert.ok(copy.tags.includes('Project blue'));assert.equal(copy.notes[0].tagsUpdatedAt,f.file('a').tagsUpdatedAt);
}
{
  const f=fixture(),notes=plain(f.state().notes),ids=plain(f.state().settings.openIds);
  f.call('setTabTagFilter',{kind:'tag',tag:'Work'});
  assert.match(f.bar(),/data-tab-id="a"/);assert.match(f.bar(),/data-tab-id="b"/);assert.doesNotMatch(f.bar(),/data-tab-id="hidden"|data-tab-id="untagged"/);
  assert.deepEqual(plain(f.state().notes),notes);assert.deepEqual(plain(f.state().settings.openIds),ids);assert.equal(f.state().activeId,'a');assert.equal(f.call('openFiles').length,4);
  f.call('reorderDisplayedTabs',['b','a']);assert.deepEqual(plain(f.state().settings.openIds),['b','hidden','a','untagged']);
  f.call('setTabTagFilter',{kind:'untagged'});assert.match(f.bar(),/data-tab-id="untagged"/);assert.doesNotMatch(f.bar(),/data-tab-id="a"/);assert.equal(f.state().activeId,'untagged','Filtering selects the first match when the current file is outside the filter');
  f.call('setTabTagFilter',{kind:'tag',tag:'Nothing'});assert.equal(f.bar(),'');assert.equal(f.elements.get('tagEmptyState').hidden,false);assert.equal(f.elements.get('notePane').hidden,true);assert.match(f.elements.get('tagEmptyDescription').textContent,/Nothing/);assert.equal(f.state().settings.openIds.length,4,'An empty filter is not an empty window');
  f.call('setTabTagFilter',{kind:'all'});assert.equal(f.elements.get('tagEmptyState').hidden,true);assert.equal(f.elements.get('notePane').hidden,false);for(const id of ids)assert.ok(f.bar().includes(`data-tab-id="${id}"`));
}
{
  const f=fixture(),before=plain(f.state().notes),ids=plain(f.state().settings.openIds);
  f.state().activeId='b';f.call('setTabTagFilter',{kind:'tag',tag:'Work'});assert.equal(f.state().activeId,'b','A matching current file stays selected');
  f.call('setTabTagFilter',{kind:'tag',tag:'Personal'});assert.equal(f.state().activeId,'hidden');
  f.state().settings.openIds=['b','hidden','a','untagged'];f.call('setTabTagFilter',{kind:'tag',tag:'Work'});assert.equal(f.state().activeId,'b','First match follows the actual tab order');
  Object.assign(f.file('a'),{fileKey:'a-key',diskPath:'/code/a.txt'});Object.assign(f.file('hidden'),{fileKey:'h-key',diskPath:'/code/hidden.txt'});
  f.call('setTabTagFilter',{kind:'folder',folder:'/code'});assert.equal(f.state().activeId,'hidden','Folder filters also select their first matching tab');
  f.call('setTabTagFilter',{kind:'tag',tag:'Missing'});assert.equal(f.state().activeId,'hidden');assert.equal(f.elements.get('tagEmptyState').hidden,false);
  f.call('setTabTagFilter',{kind:'all'});assert.equal(f.state().activeId,'hidden');assert.equal(f.elements.get('tagEmptyState').hidden,true,'Clearing the filter reveals the current file');
  f.context.closingFiles.add('a');f.call('setTabTagFilter',{kind:'tag',tag:'Work'});assert.equal(f.state().settings.tagFilter.kind,'all','Closing reviews cannot be disrupted by a filter change');
  for(const file of before){assert.equal(f.file(file.id).content,file.content);assert.equal(f.call('isFileModified',f.file(file.id)),false);}
  assert.deepEqual(plain(f.state().settings.openIds).sort(),ids.sort(),'Filter navigation never closes a file');
}
{
  const f=fixture();f.state().settings.tagFilter={kind:'tag',tag:'Work'};
  const incoming={id:'new',title:'new.txt',content:'unsaved incoming',mode:'text',createdAt:1,updatedAt:200,tags:['Work'],tagsUpdatedAt:200};f.state().notes.push(incoming);
  f.call('insertFileTab','new',1);assert.deepEqual(plain(f.state().settings.openIds),['a','hidden','new','b','untagged']);
  f.call('insertFileTab','a',2);assert.deepEqual(plain(f.state().settings.openIds),['hidden','new','b','a','untagged'],'Returning a native drag interprets positions in the visible bar');
  f.call('insertFileTab','b',0);assert.deepEqual(plain(f.state().settings.openIds),['hidden','b','new','a','untagged']);
  assert.equal(new Set(f.state().settings.openIds).size,5);assert.equal(incoming.content,'unsaved incoming');
}
{
  const f=fixture(),local=plain(f.state()),remote=plain(local);
  local.notes[0].tags=['Work','New tag'];local.notes[0].tagsUpdatedAt=300;local.tags.push('New tag');
  remote.notes[0].content='new content from another window';remote.notes[0].updatedAt=400;remote.tags.push('Other tag');
  const merged=f.call('mergeWorkspaces',local,remote);assert.equal(merged.notes[0].content,'new content from another window');assert.deepEqual(plain(merged.notes[0].tags),['Work','New tag']);assert.ok(merged.tags.includes('Other tag'));
  const removed=plain(merged);removed.notes[0].tags=[];removed.notes[0].tagsUpdatedAt=500;
  const stale=f.call('mergeWorkspaces',removed,remote);assert.deepEqual(plain(stale.notes[0].tags),[],'A stale content save cannot resurrect removed tags');
  const repeat=f.call('mergeWorkspaces',local,plain(local));assert.equal(repeat.notes[0],local.notes[0],'Routine recovery retains live file references');
}
{
  const f=fixture();f.context.targetId='hidden';vm.runInContext('tagContextFileId=targetId;renderTabTagMenu()',f.context);
  const menu=f.elements.get('tabTagMenu').innerHTML;assert.match(menu,/data-file-tag="Personal"/);assert.match(menu,/aria-checked="true" data-file-tag="Personal"/);assert.match(menu,/data-create-tag/);
  f.call('setFileTag','hidden','<Plans & ideas>',true);vm.runInContext('renderTabTagMenu()',f.context);assert.match(f.elements.get('tabTagMenu').innerHTML,/&lt;Plans &amp; ideas&gt;/);assert.equal(f.state().activeId,'a','Right-click tagging targets that file without switching the editor');
  const legacy=plain(f.state());delete legacy.tags;delete legacy.tagChanges;for(const file of legacy.notes){delete file.tags;delete file.tagsUpdatedAt;}const restored=f.call('validateWorkspace',legacy);assert.deepEqual(plain(restored.tags),[]);assert.deepEqual(plain(restored.notes[0].tags),[]);
}
{
  const f=fixture();f.call('setTabTagFilter',{kind:'tag',tag:'work'});const file=f.call('makeNote');
  assert.deepEqual(plain(file.tags),['Work']);assert.ok(file.tagsUpdatedAt>0);assert.equal(f.call('isFileModified',file),false);assert.ok(f.bar().includes(`data-tab-id="${file.id}"`));
  f.call('setTabTagFilter',{kind:'tag',tag:'New project'});assert.equal(f.elements.get('tagEmptyState').hidden,false);const first=f.call('makeNote');
  assert.deepEqual(plain(first.tags),['New project']);assert.equal(f.elements.get('tagEmptyState').hidden,true);assert.ok(f.state().tags.includes('New project'));
  f.call('setTabTagFilter',{kind:'untagged'});assert.deepEqual(plain(f.call('makeNote').tags),[]);
  f.call('setTabTagFilter',{kind:'all'});assert.deepEqual(plain(f.call('makeNote').tags),[]);
}
{
  const f=fixture();f.state().notes.push({id:'closed',title:'old-history.txt',content:'saved',mode:'text',createdAt:1,updatedAt:1});
  f.state().settings.closedIds=['closed'];f.call('setTabTagFilter',{kind:'tag',tag:'Work'});
  const menu=f.elements.get('savedFilesMenu').innerHTML;
  assert.match(menu,/data-open-file="hidden"/,'The dropdown includes hidden files that are still open in this window');
  assert.doesNotMatch(menu,/data-open-file="closed"|Show All Files/,'History and saved-but-closed files are excluded');
  assert.ok(menu.indexOf('data-open-file="a"')<menu.indexOf('data-open-file="hidden"'),'The dropdown retains window tab order');
}
(async()=>{
  {
    const f=fixture(),before=plain(f.state());
    assert.equal(await f.call('removeFileTag','a','Work'),false);
    assert.deepEqual(plain(f.state()),before,'Cancel leaves assignments and the registry intact');assert.equal(f.saves.length,0);
    f.confirmed=true;assert.equal(await f.call('removeFileTag','a','Work'),true);
    assert.deepEqual(plain(f.file('a').tags),[]);assert.deepEqual(plain(f.file('b').tags),['Work']);assert.ok(f.call('workspaceTags').includes('Work'));
    assert.equal(f.call('isFileModified',f.file('a')),false);assert.match(f.confirmations[0][1],/a.txt/);
  }
  {
    const f=fixture();f.file('a').content+=' unsaved';f.state().tags.push('Unused');f.state().settings.tagFilter={kind:'tag',tag:'Work'};
    f.state().notes.push({...plain(f.file('b')),id:'closed',trashedAt:20});const stale=plain(f.state()),ids=plain(f.state().settings.openIds);
    assert.equal(await f.call('deleteTag','Work'),false);assert.deepEqual(plain(f.state()),stale);
    f.confirmed=true;assert.equal(await f.call('deleteTag','Work'),true);
    assert.equal(f.call('workspaceTags').includes('Work'),false);assert.equal(f.state().notes.some(file=>file.tags.includes('Work')),false,'Deletion covers hidden, closed and trashed files');
    assert.deepEqual(plain(f.state().settings.tagFilter),{kind:'all'});assert.deepEqual(plain(f.state().settings.openIds),ids);
    assert.equal(f.file('a').content,stale.notes[0].content);assert.equal(f.file('a').savedSignature,stale.notes[0].savedSignature);assert.equal(f.call('isFileModified',f.file('a')),true);
    const original=f.file('b');assert.equal(f.call('isFileModified',original),false);
    const remote=plain(stale);remote.notes[0].content='Remote text';remote.notes[0].updatedAt=5000;remote.notes[0].tags.push('Remote tag');remote.notes[0].tagsUpdatedAt=5000;
    const merged=f.call('mergeWorkspaces',f.state(),remote);
    assert.equal(merged.notes[0].content,'Remote text');assert.deepEqual(plain(merged.notes[0].tags),['Remote tag']);assert.equal(merged.tags.includes('Work'),false,'A stale window cannot resurrect a deleted tag');
    const restored=f.call('validateWorkspace',plain(merged));assert.deepEqual(plain(restored.tagChanges),plain(merged.tagChanges));
    f.call('setFileTag','b','Work',true);assert.ok(f.call('workspaceTags').includes('Work'),'A deleted name can be deliberately created again');
    const recreated=f.call('mergeWorkspaces',f.state(),stale);assert.deepEqual(plain(recreated.notes.find(file=>file.id==='a').tags),[],'Recreating a tag does not restore its old assignments');
    assert.equal(recreated.notes.find(file=>file.id==='b').tags.includes('Work'),true);
    assert.equal(await f.call('deleteTag','Unused'),true);assert.equal(f.call('workspaceTags').includes('Unused'),false,'Unused registry entries can also be deleted');
    assert.match(f.elements.get('tagFilterMenu').innerHTML,/data-manage-tags/);
  }
  console.log('Passed: confirmed unassign/delete, cancel, global tag deletion and recreation, stale-window protection, clean saved baselines, display-only filtering, transfer order and legacy workspaces.');
})().catch(error=>{console.error(error);process.exitCode=1;});
