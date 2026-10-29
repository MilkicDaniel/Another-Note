  let tagContextFileId=null,tagDialogFileId=null,closeReviewFileId=null;
  function tagKey(value){return String(value||'').toLowerCase();}
  function normalizeTags(...lists){
    const result=[],seen=new Set();
    for(const list of lists){if(!Array.isArray(list))continue;for(const value of list){
      if(typeof value!=='string')continue;
      const name=value.replace(/[\x00-\x1f\x7f]/g,' ').trim().replace(/\s+/g,' ').slice(0,64),key=tagKey(name);
      if(name&&!seen.has(key)){seen.add(key);result.push(name);}
    }}
    return result;
  }
  function normalizeTagChanges(...lists){
    const changes=new Map();
    for(const list of lists){if(!Array.isArray(list))continue;for(const item of list){
      const name=normalizeTags([item?.name])[0];if(!name||!Number.isFinite(item.updatedAt)||item.updatedAt<0)continue;
      const key=tagKey(name),previous=changes.get(key),change={name,updatedAt:item.updatedAt,deleted:item.deleted===true};
      if(!previous||change.updatedAt>previous.updatedAt||change.updatedAt===previous.updatedAt&&change.deleted)changes.set(key,change);
    }}
    return [...changes.values()];
  }
  function applyTagChanges(workspace){
    const changes=normalizeTagChanges(workspace.tagChanges),deleted=new Map(changes.filter(item=>item.deleted).map(item=>[tagKey(item.name),item.updatedAt]));
    workspace.tagChanges=changes;
    workspace.notes=workspace.notes.map(file=>{
      const tags=normalizeTags(file.tags),removed=tags.filter(tag=>deleted.has(tagKey(tag)));if(!removed.length)return file;
      return {...file,tags:tags.filter(tag=>!deleted.has(tagKey(tag))),tagsUpdatedAt:Math.max(file.tagsUpdatedAt||0,...removed.map(tag=>deleted.get(tagKey(tag))))};
    });
    workspace.tags=normalizeTags(workspace.tags,changes.filter(item=>!item.deleted).map(item=>item.name),...workspace.notes.map(file=>file.tags)).filter(tag=>!deleted.has(tagKey(tag)));
    if(workspace.settings.tagFilter?.kind==='tag'&&deleted.has(tagKey(workspace.settings.tagFilter.tag)))workspace.settings={...workspace.settings,tagFilter:{kind:'all'}};
    return workspace;
  }
  function normalizeTagFilter(value){
    if(value?.kind==='untagged')return {kind:'untagged'};
    if(value?.kind==='folder'&&typeof value.folder==='string'&&value.folder.length<=4096)return {kind:'folder',folder:value.folder};
    const tag=normalizeTags([value?.tag])[0];
    return value?.kind==='tag'&&tag?{kind:'tag',tag}:{kind:'all'};
  }
  function mergeFileTags(a,b){
    if(!a)return b;
    const content=b.updatedAt>a.updatedAt?b:a;
    if(content.fileLink)return content;
    const metadata=(b.tagsUpdatedAt||0)>(a.tagsUpdatedAt||0)?b:a;
    if(metadata===content||(metadata.tagsUpdatedAt||0)===(content.tagsUpdatedAt||0)&&JSON.stringify(normalizeTags(metadata.tags))===JSON.stringify(normalizeTags(content.tags)))return content;
    return {...content,tags:normalizeTags(metadata.tags),tagsUpdatedAt:metadata.tagsUpdatedAt||0};
  }
  function fileMatchesTag(file,filter=state.settings.tagFilter){
    filter=normalizeTagFilter(filter);const tags=normalizeTags(file.tags);
    if(filter.kind==='folder')return fileFolder(file)?.key===filter.folder;
    return filter.kind==='all'||(filter.kind==='untagged'?!tags.length:tags.some(tag=>tagKey(tag)===tagKey(filter.tag)));
  }
  function displayedFiles(){return openFiles().filter(file=>fileMatchesTag(file)||file.id===closeReviewFileId);}
  function revealFileForNavigation(file){
    if(!file||file.trashedAt||closingFiles.size||applicationCloseRunning||file.id===closeReviewFileId||fileMatchesTag(file))return false;
    state.settings.tagFilter={kind:'all'};return true;
  }
  function workspaceTags(){return normalizeTags(state.tags,...state.notes.map(file=>file.tags)).sort((a,b)=>a.localeCompare(b));}
  function fileFolder(file){
    if(file.fileKey&&file.diskPath){const path=String(file.diskPath).replace(/\\/g,'/'),at=path.lastIndexOf('/');if(at>=0){const key=path.slice(0,at)||'/';return {key,label:key.split('/').filter(Boolean).at(-1)||key,path:key};}}
    if(file.savedState&&typeof file.folderPath==='string'&&file.folderPath&&file.folderKey)return {key:file.folderKey,label:file.folderPath.split('/').filter(Boolean).at(-1)||file.folderPath,path:file.folderPath};
    return null;
  }
  function folderTags(){
    const folders=new Map();for(const file of openFiles()){const folder=fileFolder(file);if(!folder)continue;const item=folders.get(folder.key);if(item)item.count++;else folders.set(folder.key,{...folder,count:1});}
    return [...folders.values()].sort((a,b)=>a.path.localeCompare(b.path));
  }
  function syncFolderTagFilter(){
    const filter=normalizeTagFilter(state.settings.tagFilter);
    if(filter.kind==='folder'&&!folderTags().some(folder=>folder.key===filter.folder))state.settings.tagFilter={kind:'all'};
  }
  function newFileTags(){
    const filter=normalizeTagFilter(state.settings.tagFilter);
    return filter.kind==='tag'?[workspaceTags().find(tag=>tagKey(tag)===tagKey(filter.tag))||filter.tag]:[];
  }
  function syncTagEmptyState(){
    const filter=normalizeTagFilter(state.settings.tagFilter),current=note();
    const empty=!startupBlocked&&!trashView&&filter.kind!=='all'&&!displayedFiles().length;
    $('tagEmptyState').hidden=!empty;$('notePane').hidden=empty||!current;$('emptyState').hidden=empty||Boolean(current);
    if(empty)$('tagEmptyDescription').textContent=filter.kind==='tag'?`No open files are tagged “${filter.tag}”.`:'No untagged files are open.';
    $('language').disabled=empty||!current||Boolean(current.trashedAt)||startupBlocked;syncSelectControls();
    return empty;
  }
  function reorderDisplayedTabs(order){
    // Replace only the visible slots. Hidden files keep their place and ownership.
    const allowed=new Set(displayedFiles().map(file=>file.id)),seen=new Set();
    const ids=order.filter(id=>allowed.has(id)&&!seen.has(id)&&seen.add(id));
    for(const id of allowed)if(!seen.has(id))ids.push(id);
    let index=0;state.settings.openIds=state.settings.openIds.map(id=>allowed.has(id)?ids[index++]:id);
  }
  function insertFileTab(id,index){
    const ids=state.settings.openIds.filter(value=>value!==id),visible=displayedFiles().map(file=>file.id).filter(value=>value!==id);
    const at=Number.isFinite(index)?Math.max(0,Math.min(visible.length,index)):visible.length;
    const before=visible[at],last=visible.at(-1),position=before?ids.indexOf(before):last?ids.indexOf(last)+1:ids.length;
    ids.splice(position,0,id);state.settings.openIds=ids;
  }
  function tagFilterLabel(){const filter=normalizeTagFilter(state.settings.tagFilter);return filter.kind==='folder'?`Folder: ${folderTags().find(folder=>folder.key===filter.folder)?.label||filter.folder}`:filter.kind==='tag'?filter.tag:filter.kind==='untagged'?'Untagged':'All files';}
  function renderTagFilter(){
    const opened=openFiles(),visible=displayedFiles(),filter=normalizeTagFilter(state.settings.tagFilter),label=tagFilterLabel();
    const button=$('tagFilterButton');$('tagFilterLabel').textContent=label;$('tagFilterCount').textContent=filter.kind==='all'?'':`${visible.length}/${opened.length}`;
    button.classList.toggle('active',filter.kind!=='all');
    const currentHidden=note()&&opened.some(file=>file.id===state.activeId)&&!visible.some(file=>file.id===state.activeId);
    const description=`Filter tabs: ${label}. ${visible.length} of ${opened.length} files shown.${currentHidden?' The current file is hidden by this filter.':''} Right-click to show all files. All files stay open.`;
    button.setAttribute('aria-label',description);
    const choices=[{filter:{kind:'all'},label:'All files',count:opened.length},{filter:{kind:'untagged'},label:'Untagged',count:opened.filter(file=>!normalizeTags(file.tags).length).length},...workspaceTags().map(tag=>({filter:{kind:'tag',tag},label:tag,count:opened.filter(file=>fileMatchesTag(file,{kind:'tag',tag})).length}))];
    $('tagFilterMenu').innerHTML='<div class="tag-menu-heading">Show tabs</div>'+choices.map((choice,index)=>{
      const checked=filter.kind===choice.filter.kind&&(filter.kind!=='tag'||tagKey(filter.tag)===tagKey(choice.filter.tag));
      return `${index===2?'<div class="menu-sep" role="separator"></div>':''}<button type="button" role="menuitemradio" aria-checked="${checked}" data-tag-filter="${choice.filter.kind}" ${choice.filter.tag?`data-filter-tag="${escape(choice.filter.tag)}"`:''}><span class="tag-check" aria-hidden="true">${checked?'✓':''}</span><span class="tag-name">${escape(choice.label)}</span><span class="tag-count">${choice.count}</span></button>`;
    }).join('')+(folderTags().length?'<div class="menu-sep" role="separator"></div><div class="tag-menu-heading">Folders</div>'+folderTags().map(folder=>`<button type="button" role="menuitemradio" aria-checked="${filter.kind==='folder'&&filter.folder===folder.key}" data-tag-filter="folder" data-filter-folder="${escape(folder.key)}"><span class="tag-check" aria-hidden="true">${icon('folder')}</span><span class="tag-name">${escape(folder.label)}</span><span class="tag-count">${folder.count}</span></button>`).join(''):'')+'<div class="menu-sep" role="separator"></div><button type="button" data-manage-tags><span class="tag-check" aria-hidden="true">'+icon('tag')+'</span><span class="tag-name">Manage tags…</span></button><div class="tag-menu-help">Folder tags last while files are open.</div>';
    $('fileTabs').classList.toggle('filtered-empty',filter.kind!=='all'&&!visible.length);
    $('fileTabs').dataset.emptyMessage=opened.length?'No files match this tag':'No open files';
  }
  function setTabTagFilter(filter){
    if(!ready||startupBlocked||draggedTabId||closingFiles.size||applicationCloseRunning)return;
    state.settings.tagFilter=normalizeTagFilter(filter);closeMenus();
    const current=note(),first=openFiles().find(file=>fileMatchesTag(file));
    if(first&&(!current||!fileMatchesTag(current))){trashView=false;selectNote(first.id);return;}
    renderTabs();save();
  }
  function toggleTabTagFilter(filter){
    filter=normalizeTagFilter(filter);const current=normalizeTagFilter(state.settings.tagFilter);
    const selected=current.kind===filter.kind&&(filter.kind==='tag'?tagKey(current.tag)===tagKey(filter.tag):filter.kind==='folder'?current.folder===filter.folder:true);
    setTabTagFilter(selected?{kind:'all'}:filter);
  }
  function setFileTag(id,name,assigned){
    if(startupBlocked||!ready||movingFiles.has(id)||closingFiles.has(id))return false;
    const file=liveNotes().find(file=>file.id===id);if(!file)return false;
    const canonical=workspaceTags().find(tag=>tagKey(tag)===tagKey(name))||normalizeTags([name])[0];if(!canonical)return false;
    const previous=normalizeTags(file.tags),tags=previous.filter(tag=>tagKey(tag)!==tagKey(canonical));
    if(previous.some(tag=>tagKey(tag)===tagKey(canonical))===assigned)return true;
    if(assigned)tags.push(canonical);
    if(JSON.stringify(previous)===JSON.stringify(tags))return true;
    file.tags=tags;file.tagsUpdatedAt=clock();
    if(assigned)state.tagChanges=normalizeTagChanges(state.tagChanges,[{name:canonical,updatedAt:file.tagsUpdatedAt,deleted:false}]);
    state.tags=normalizeTags(state.tags,[canonical]);
    renderTabs();save();return true;
  }
  async function removeFileTag(id,name){
    const file=liveNotes().find(file=>file.id===id);if(!file||!normalizeTags(file.tags).some(tag=>tagKey(tag)===tagKey(name)))return false;
    closeMenus();
    if(!await confirmAction('Remove tag from this file?',`Remove “${name}” from “${fileLabel(file)}”? The tag will remain available for other files.`,'Remove Tag',true))return false;
    return setFileTag(id,name,false);
  }
  function renderManageTags(){
    const tags=workspaceTags();
    $('manageTagsList').innerHTML=tags.length?tags.map(tag=>{
      const count=state.notes.filter(file=>!file.removedAt&&normalizeTags(file.tags).some(value=>tagKey(value)===tagKey(tag))).length;
      return `<div class="manage-tag-row"><span class="tag-name">${escape(tag)}</span><span class="tag-count">${count} ${count===1?'file':'files'}</span><button type="button" class="tag-delete-button danger" data-delete-tag="${escape(tag)}" aria-label="Delete tag ${escape(tag)}">${icon('trash')}</button></div>`;
    }).join(''):'<p class="tag-menu-help">No tags yet.</p>';
  }
  function createWorkspaceTag(value){
    if(!ready||startupBlocked||draggedTabId||movingFiles.size||closingFiles.size||applicationCloseRunning)return null;
    const name=normalizeTags([value])[0];if(!name)return null;
    const existing=workspaceTags().find(tag=>tagKey(tag)===tagKey(name));if(existing)return {name:existing,created:false};
    state.tagChanges=normalizeTagChanges(state.tagChanges,[{name,updatedAt:clock(),deleted:false}]);
    state.tags=normalizeTags(state.tags,[name]);renderTabs();renderManageTags();save();return {name,created:true};
  }
  function openManageTags(){
    if(!ready||startupBlocked||draggedTabId||movingFiles.size||closingFiles.size||applicationCloseRunning||activityBlocked())return;
    closeMenus();renderManageTags();$('manageTagName').value='';$('manageTagMessage').hidden=true;$('manageTagsDialog').showModal();$('manageTagName').focus();
  }
  async function deleteTag(name){
    const canonical=workspaceTags().find(tag=>tagKey(tag)===tagKey(name));
    if(!canonical||!ready||startupBlocked||movingFiles.size||closingFiles.size||applicationCloseRunning)return false;
    if(!await confirmAction('Delete this tag?',`Delete “${canonical}” and remove it from all files, including closed files and files in Trash? File contents will be kept.`,'Delete Tag',true))return false;
    if(startupBlocked||movingFiles.size||closingFiles.size||applicationCloseRunning)return false;
    state.tagChanges=normalizeTagChanges(state.tagChanges,[{name:canonical,updatedAt:clock(),deleted:true}]);
    applyTagChanges(state);renderTabs();renderManageTags();save();
    $('manageTagsList').querySelector('[data-delete-tag]')?.focus();toast(`Deleted tag “${canonical}”.`);return true;
  }
  function renderTabTagMenu(){
    const file=liveNotes().find(file=>file.id===tagContextFileId),menu=$('tabTagMenu');
    if(!file||!state.settings.openIds.includes(file.id)){menu.hidden=true;return;}
    const selected=new Set(normalizeTags(file.tags).map(tagKey)),tags=workspaceTags();
    const folder=fileFolder(file);
    menu.innerHTML=`<div class="tag-menu-heading">Tags <span>${escape(fileLabel(file))}</span></div>${folder?`<div class="tag-menu-help">Folder: ${escape(folder.label)}</div>`:''}<div class="tag-choice-list">${tags.length?tags.map(tag=>`<button type="button" role="menuitemcheckbox" aria-checked="${selected.has(tagKey(tag))}" data-file-tag="${escape(tag)}"><span class="tag-check" aria-hidden="true">${selected.has(tagKey(tag))?'✓':''}</span><span class="tag-name">${escape(tag)}</span></button>`).join(''):'<div class="tag-menu-help">No tags yet</div>'}</div><div class="menu-sep" role="separator"></div><button type="button" data-create-tag><span class="tag-check" aria-hidden="true">+</span><span class="tag-name">Create tag…</span></button><button type="button" data-manage-tags><span class="tag-check" aria-hidden="true">${icon('tag')}</span><span class="tag-name">Manage tags…</span></button>`;
  }
  function focusTaggedTab(id){
    const tab=[...$('fileTabs').querySelectorAll('[data-tab-id]')].find(tab=>tab.dataset.tabId===id);
    (tab?.querySelector('[role="tab"]')||$('tagFilterButton')).focus({preventScroll:true});
  }
  function openTabTagMenu(id,x,y,keyboard=false){
    if(!ready||startupBlocked||draggedTabId||activityBlocked()||movingFiles.size||closingFiles.size||applicationCloseRunning)return;
    tagContextFileId=id;closeMenus();renderTabTagMenu();const menu=$('tabTagMenu');menu.hidden=false;
    menu.style.left='0px';menu.style.top='0px';const rect=menu.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(innerWidth-rect.width-8,x))}px`;
    menu.style.top=`${Math.max(8,Math.min(innerHeight-rect.height-8,y))}px`;
    if(keyboard)(popupItems(menu)[0]||menu).focus();
  }
  function openCreateTagDialog(){
    tagDialogFileId=tagContextFileId;closeMenus();const file=liveNotes().find(file=>file.id===tagDialogFileId);if(!file)return;
    $('tagName').value='';$('tagName').setCustomValidity('');$('tagDialogDescription').textContent=`Add a tag to ${fileLabel(file)}. Existing tags can be reused.`;
    $('tagDialog').showModal();$('tagName').focus();
  }
  function wireTagFeatures(){
    const tabs=$('fileTabs'),menu=$('tabTagMenu');
    $('tagFilterButton').addEventListener('contextmenu',event=>{event.preventDefault();setTabTagFilter({kind:'all'});$('tagFilterButton').focus({preventScroll:true});});
    tabs.addEventListener('contextmenu',event=>{const tab=event.target.closest('[data-tab-id]');if(!tab)return;event.preventDefault();openTabTagMenu(tab.dataset.tabId,event.clientX,event.clientY);});
    tabs.addEventListener('keydown',event=>{if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;const tab=event.target.closest('[data-tab-id]');if(!tab)return;event.preventDefault();const rect=tab.getBoundingClientRect();openTabTagMenu(tab.dataset.tabId,rect.left,rect.bottom,true);});
    menu.addEventListener('click',async event=>{
      const tag=event.target.closest('[data-file-tag]');if(tag){event.preventDefault();const id=tagContextFileId,name=tag.dataset.fileTag;
        if(tag.getAttribute('aria-checked')==='true'){await removeFileTag(id,name);focusTaggedTab(id);}
        else if(setFileTag(id,name,true)){renderTabTagMenu();[...menu.querySelectorAll('[data-file-tag]')].find(button=>button.dataset.fileTag===name)?.focus();}return;}
      if(event.target.closest('[data-create-tag]'))openCreateTagDialog();
      if(event.target.closest('[data-manage-tags]'))openManageTags();
    });
    wirePopupKeys(menu,{focus:()=>focusTaggedTab(tagContextFileId)});
    $('tagFilterMenu').addEventListener('click',event=>{if(event.target.closest('[data-manage-tags]')){openManageTags();return;}const button=event.target.closest('[data-tag-filter]');if(!button)return;toggleTabTagFilter({kind:button.dataset.tagFilter,tag:button.dataset.filterTag,folder:button.dataset.filterFolder});$('tagFilterButton').focus();});
    $('manageTagsList').addEventListener('click',event=>{const button=event.target.closest('[data-delete-tag]');if(button)deleteTag(button.dataset.deleteTag);});
    $('manageTagForm').addEventListener('submit',event=>{
      event.preventDefault();const result=createWorkspaceTag($('manageTagName').value);if(!result)return;
      $('manageTagMessage').textContent=result.created?`Created “${result.name}”. It is ready to assign to files.`:`“${result.name}” already exists.`;$('manageTagMessage').hidden=false;
      if(result.created)$('manageTagName').value='';$('manageTagName').focus();
    });
    $('manageTagsDialog').addEventListener('close',()=>$('tagFilterButton').focus());
    $('tagName').addEventListener('input',()=>$('tagName').setCustomValidity(''));
    $('tagForm').addEventListener('submit',event=>{
      event.preventDefault();const name=normalizeTags([$('tagName').value])[0];
      if(!name){$('tagName').setCustomValidity('Enter a tag name.');$('tagName').reportValidity();return;}
      if(setFileTag(tagDialogFileId,name,true))$('tagDialog').close('created');
    });
    $('cancelTagButton').addEventListener('click',()=>$('tagDialog').close('cancel'));
    $('tagDialog').addEventListener('close',()=>focusTaggedTab(tagDialogFileId));
  }
