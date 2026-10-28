(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'vista-notes.workspace.v1';
  const MODES = {markdown:'Markdown',bash:'Bash',json:'JSON',java:'Java',javascript:'JavaScript',html:'HTML',css:'CSS',python:'Python',text:'Plain text'};
  const DEFAULTS = {theme:'system',fontSize:15,wrap:true,minimap:true,tabSize:2,view:'edit',sort:'updated',openIds:null,closedIds:[],recentFiles:[],recentClearedAt:0,tagFilter:{kind:'all'}};
  const native = Boolean(window.webkit?.messageHandlers?.vistaNotes);
  const editor = $('editor');
  const requests = new Map();
  const histories = new Map();
  const cursors = new Map();
  let knownNativeOpenIds=null;
  let state, database = null, trashView = false, currentView = 'edit';
  let logicalTime = Date.now(), nativeSequence = 0, listTimer, toastTimer;
  let saveQueue = null, saving = null, storageFailure = '', startupBlocked = false, ready = false, browserRecoveryPending = false;
  let composing = false, lastBackup = '', searchTerm = '';
  let draggedTabId = null, suppressTabClickUntil = 0, wheelZoomAmount = 0;
  let tabDrag = null, tabDragFrame = 0;
  let findSession = null;
  let pendingFindInput = null;
  let findAllState = null, findAllContext = {id:null,selection:null}, findAllResize = null;
  const uid = () => globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clock = () => logicalTime = Math.max(Date.now(), logicalTime + 1);
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const note = () => state.notes.find(n => n.id === state.activeId && !n.removedAt);
  const liveNotes = () => state.notes.filter(n => !n.trashedAt && !n.removedAt);
  const dateText = n => new Date(n.updatedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const emptyWorkspace = () => ({format:'vista-notes',version:1,updatedAt:clock(),activeId:null,settings:{...DEFAULTS},tags:[],tagChanges:[],notes:[]});

  /* TAG_FEATURES */
  /* TAB_SCROLLING */
  /* EDITOR_WORKER_CLIENT */
  /* EDITOR_TOOLS */
  /* CODE_INTELLIGENCE */
  /* EDITOR_COMPLETIONS */
  /* EDITOR_COLORS */
  /* COLOR_PICKER */
  /* SYMBOL_REFERENCES */
  /* EDITOR_LINKS */
  /* CODE_PREVIEWS */
  /* EDITOR_MINIMAP */
  /* EDITOR_SCROLLBARS */
  /* EDITOR_OCCURRENCES */
  /* CODE_STRUCTURE */
  /* EDITOR_COLOR_SPACING */
  /* EDITOR_STRUCTURE */
  /* KEYBOARD_SHORTCUTS */

  function fileSignature(file){
    const cache=fileSignature.cache||(fileSignature.cache=new WeakMap()),previous=cache.get(file);
    if(previous&&previous.title===file.title&&previous.mode===file.mode&&previous.content===file.content)return previous.signature;
    const text=JSON.stringify([file.title,file.mode,file.content]);let a=2166136261,b=5381;
    for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b,33)^code;}
    const signature=`${text.length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
    cache.set(file,{title:file.title,mode:file.mode,content:file.content,signature});return signature;
  }
  function captureSavedState(file){return {title:file.title,content:file.content,mode:file.mode,lineEnding:file.lineEnding||'lf',bom:Boolean(file.bom)};}
  function normalizeSavedState(value){if(value===null)return null;if(!value||typeof value.title!=='string'||typeof value.content!=='string'||!Object.hasOwn(MODES,value.mode))throw new Error('The saved file copy is invalid.');return captureSavedState({...value,title:value.title.slice(0,250),content:value.content.replace(/\r\n?/g,'\n')});}
  function isFileModified(file){
    if(typeof file.savedSignature!=='string')return false;
    const saved=file.savedState;if(saved)return file.title!==saved.title||file.mode!==saved.mode||file.content!==saved.content||(file.lineEnding||'lf')!==(saved.lineEnding||'lf')||Boolean(file.bom)!==Boolean(saved.bom);
    // A new draft's saved hash is usually its original empty state. Reject
    // longer text using JSON's minimum length before hashing the full draft.
    const length=/^(\d+):/.exec(file.savedSignature)?.[1];
    if(length&&10+(file.title?.length||0)+(file.mode?.length||0)+(file.content?.length||0)>Number(length))return true;
    return file.savedSignature!==fileSignature(file);
  }
  function fileLabel(file){return file.title?.trim()?file.title:String(file.content||'').split('\n',1)[0].trim().slice(0,250)||'untitled';}
  function updateFileIndicators(){
    const byId=new Map(state.notes.map(file=>[file.id,file]));
    $('fileTabs').querySelectorAll('[data-tab-id]').forEach(tab=>{
      const file=byId.get(tab.dataset.tabId);if(!file)return;const modified=isFileModified(file);
      tab.classList.toggle('modified',modified);const dot=tab.querySelector('[data-file-dirty]');if(dot)dot.hidden=!modified;
      const label=fileLabel(file),select=tab.querySelector('[role="tab"]');
      if(select){select.textContent=label;select.setAttribute('aria-label',label);select.setAttribute('aria-description',modified?'Unsaved changes since last file save':'No unsaved changes');}
      tab.querySelector('[data-close-file]')?.setAttribute('aria-label',`Close ${label}`);
    });
  }
  function request(command, args = {}) {
    return new Promise((resolve,reject) => {
      const id = `request-${++nativeSequence}`;
      const timer = ['save_file','import','export','open_link'].includes(command)?null:setTimeout(() => {requests.delete(id);reject(new Error('The desktop app did not respond. Your last saved files remain on disk.'));},['detach_file','move_file'].includes(command)?45000:30000);
      requests.set(id,{resolve,reject,timer});
      try {window.webkit.messageHandlers.vistaNotes.postMessage(JSON.stringify({id,command,...args}));}
      catch(error){clearTimeout(timer);requests.delete(id);reject(error);}
    });
  }
  window.vistaNotesNativeResult = (id,result,error) => {
    const pending = requests.get(id);
    if (!pending) return;
    clearTimeout(pending.timer); requests.delete(id);
    error ? pending.reject(new Error(error)) : pending.resolve(result);
  };

  function validateWorkspace(value) {
    if (!value || value.format !== 'vista-notes' || value.version !== 1 || !Array.isArray(value.notes)) throw new Error('This is not a supported Another Note backup.');
    const seen = new Set();
    const notes = value.notes.map(n => {
      if (!n || typeof n.id !== 'string' || !n.id || seen.has(n.id) || typeof n.title !== 'string' || typeof n.content !== 'string' || !Object.hasOwn(MODES,n.mode) || !Number.isFinite(n.updatedAt) || !Number.isFinite(n.createdAt)) throw new Error('This backup contains an invalid file. No files have been changed.');
      seen.add(n.id);
      const file={id:n.id,title:n.title.slice(0,250),content:n.content.replace(/\r\n?/g,'\n'),mode:n.mode,createdAt:n.createdAt,updatedAt:n.updatedAt,lineNumbers:n.lineNumbers!==false,pinned:Boolean(n.pinned),trashedAt:Number(n.trashedAt)||0,removedAt:Number(n.removedAt)||0};file.savedSignature=typeof n.savedSignature==='string'?n.savedSignature:fileSignature(file);if(typeof n.fileKey==='string'&&n.fileKey.length<200){file.fileKey=n.fileKey;file.diskPath=String(n.diskPath||'').slice(0,4096);}if(typeof n.folderKey==='string'&&typeof n.folderPath==='string'){file.folderKey=n.folderKey.slice(0,4096);file.folderPath=n.folderPath.slice(0,4096);}file.lineEnding=['lf','crlf','cr'].includes(n.lineEnding)?n.lineEnding:'lf';file.bom=Boolean(n.bom);file.tags=normalizeTags(n.tags);file.tagsUpdatedAt=Number.isFinite(n.tagsUpdatedAt)?n.tagsUpdatedAt:0;if(Object.hasOwn(n,'savedState'))file.savedState=normalizeSavedState(n.savedState);else if(!isFileModified(file))file.savedState=captureSavedState(file);if(file.savedState)file.savedSignature=fileSignature(file.savedState);file.hasSavedFile=n.hasSavedFile===true||n.hasSavedFile!==false&&Boolean(n.fileKey||n.savedState?.title?.trim());if(Array.isArray(n.versions))file.versions=normalizeVersions(n.versions);return file;
    });
    const settings = {...DEFAULTS,...value.settings};
    settings.tagFilter=normalizeTagFilter(settings.tagFilter);
    if (!['system','light','dark'].includes(settings.theme)) settings.theme = 'system';
    settings.fontSize = Math.max(8,Math.min(72,Number(settings.fontSize)||15));
    settings.minimap=settings.minimap!==false;
    settings.tabSize=[2,4,8].includes(Number(settings.tabSize))?Number(settings.tabSize):2;
    settings.wrap = settings.wrap !== false;
    if (!['updated','title','created'].includes(settings.sort)) settings.sort = 'updated';
    settings.view = 'edit';delete settings.spellcheck;
    const available=new Set(notes.filter(n=>!n.trashedAt&&!n.removedAt).map(n=>n.id));
    settings.openIds=Array.isArray(value.settings?.openIds)?[...new Set(value.settings.openIds)].filter(id=>available.has(id)):[...available];
    settings.closedIds=Array.isArray(value.settings?.closedIds)?[...new Set(value.settings.closedIds)].filter(id=>available.has(id)).slice(-30):[];
    const recent=Array.isArray(value.settings?.recentFiles)?value.settings.recentFiles:settings.closedIds.map(id=>({id,closedAt:0}));
    const recentIds=new Set();settings.recentFiles=recent.filter(item=>item&&available.has(item.id)&&!recentIds.has(item.id)&&recentIds.add(item.id)).map(item=>({id:item.id,closedAt:Number.isFinite(item.closedAt)?item.closedAt:0})).slice(-30);
    Object.assign(settings,mergeRecentSettings(settings,{}));
    delete settings.sidebar;
    const updatedAt = Number(value.updatedAt)||0;
    const tagChanges=normalizeTagChanges(value.tagChanges),dictionaryChanges=normalizeTagChanges(value.dictionaryChanges);
    logicalTime = Math.max(logicalTime,updatedAt,Number.isFinite(settings.shortcutsUpdatedAt)?settings.shortcutsUpdatedAt:0,settings.recentClearedAt||0,...settings.recentFiles.map(item=>item.closedAt),...notes.flatMap(n=>[n.updatedAt,n.tagsUpdatedAt]),...tagChanges.map(item=>item.updatedAt),...dictionaryChanges.map(item=>item.updatedAt));
    return applyTagChanges({format:'vista-notes',version:1,updatedAt,activeId:typeof value.activeId === 'string'?value.activeId:null,settings,tags:normalizeTags(value.tags,...notes.map(n=>n.tags)),tagChanges,dictionaryChanges,notes});
  }
  function mergeWorkspaces(a,b,preferLocalSettings=true) {
    const notes = new Map(a.notes.map(n=>[n.id,n]));
    for (const n of b.notes) notes.set(n.id,mergeFileTags(notes.get(n.id),n));
    const newest = a.updatedAt >= b.updatedAt ? a : b;
    return applyTagChanges({...newest,settings:mergeRecentSettings(preferLocalSettings?a.settings:newest.settings,preferLocalSettings?b.settings:(newest===a?b:a).settings),activeId:preferLocalSettings?a.activeId:newest.activeId,tags:normalizeTags(a.tags,b.tags,...[...notes.values()].map(n=>n.tags)),tagChanges:normalizeTagChanges(a.tagChanges,b.tagChanges),dictionaryChanges:normalizeTagChanges(a.dictionaryChanges,b.dictionaryChanges),notes:[...notes.values()]});
  }

  function openDatabase() {
    return new Promise((resolve,reject) => {
      if (!window.indexedDB) return reject(new Error('Browser database unavailable.'));
      const op = indexedDB.open('vista-notes',2);
      op.onupgradeneeded = () => {for(const name of ['workspace','fileHandles','fileVersions'])if(!op.result.objectStoreNames.contains(name))op.result.createObjectStore(name);};
      op.onerror = () => reject(op.error);
      op.onsuccess = () => resolve(op.result);
      op.onblocked = () => reject(new Error('Close older Another Note windows and try again.'));
    });
  }
  function readDatabase() {
    return new Promise((resolve,reject) => {
      const tx = database.transaction('workspace','readonly');
      const r = tx.objectStore('workspace').get('current');
      r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
    });
  }
  function writeDatabase(snapshot) {
    return new Promise((resolve,reject) => {
      const tx=database.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),read=store.get('current');
      read.onsuccess=()=>{let merged=snapshot;try{if(read.result)merged=mergeWorkspaces(snapshot,validateWorkspace(read.result));}catch(_){}store.put(merged,'current');};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Saving was interrupted.'));
    });
  }
  function savedIndicator(label,kind='') {
    $('saveState').className = `save-indicator ${kind}`;
    $('saveState').hidden = kind!=='failed';
    $('saveLabel').textContent = kind==='failed'?label:'';
  }
  function storageError(error) {
    storageFailure = error.message || String(error);
    savedIndicator('Not saved','failed');
    showError(`Could not save your latest changes. ${storageFailure} Use Back up to keep a copy before closing.`);
  }
  function save() {
    if (startupBlocked || !ready) return;
    state.updatedAt = clock();
    let journalSaved=false;
    if(!native){try{
      const remote=localStorage.getItem(KEY);
      if(remote){
        const active=note(),incoming=validateWorkspace(JSON.parse(remote));state=mergeWorkspaces(state,incoming);
        const current=active&&state.notes.find(file=>file.id===active.id),changed=active&&(!current||fileSignature(current)!==fileSignature(active));
        if(changed&&isFileModified(active)){
          const copy={...active,id:uid(),title:`${fileLabel(active)} (this window)`,updatedAt:clock(),trashedAt:0,removedAt:0,savedState:null,hasSavedFile:false};
          delete copy.fileKey;delete copy.diskPath;delete copy.folderKey;delete copy.folderPath;state.notes.push(copy);trashView=false;
          cursors.set(copy.id,{start:editor.selectionStart,end:editor.selectionEnd,top:editor.scrollTop,left:editor.scrollLeft});
          const history=histories.get(active.id);if(history)histories.set(copy.id,{...history,undo:[...history.undo],redo:[...history.redo]});
          // Selecting the new identity saves the merged workspace. Its next
          // merge retains this draft because the other journal lacks that ID.
          selectNote(copy.id);toast('The file changed in another window. Your edits were kept in a separate file.');return;
        }
        if(active&&(!current||current.removedAt)){
          state.activeId=openFiles()[0]?.id||null;renderAll();if(note())return;
        }else if(active&&(changed||current.savedSignature!==active.savedSignature||Boolean(current.trashedAt)!==Boolean(active.trashedAt))){
          trashView=Boolean(current.trashedAt);selectNote(current.id);return;
        }
      }
    }catch(_){}}
    publishWindowState();
    const snapshot=browserStorageSnapshot();
    if(!native){try{localStorage.setItem(KEY,JSON.stringify(snapshot));journalSaved=true;}catch(_){}}
    if(!native)browserRecoveryPending=!journalSaved;
    if (!native && !database) {
      if (journalSaved) {storageFailure=''; savedIndicator('Recovery saved');clearError();}
      else storageError(new Error('Browser storage is full or disabled.'));
      return;
    }
    saveQueue = {snapshot,journalSaved};
    savedIndicator('Saving…','busy');
    if (!saving) saving = drainSaveQueue().finally(() => {saving=null;});
  }
  async function drainSaveQueue() {
    while (saveQueue) {
      const {snapshot,journalSaved} = saveQueue;
      saveQueue = null;
      try {
        if (native){const result=await request('save',{state:snapshot});updateNativeOpenTabs(result.openIds);}else await writeDatabase(snapshot);
        storageFailure = '';
        if (!saveQueue) {browserRecoveryPending=false;savedIndicator(native?'Recovery saved to disk':'Recovery saved');clearError();}
      } catch(error) {
        if (journalSaved) {storageFailure='';savedIndicator('Recovery saved');}
        else storageError(error);
      }
    }
  }
  async function flush() {
    await Promise.all([...documentSaves.values()]);
    save();
    if (saving) await saving;
    await flushVersionHistory();
    if (storageFailure || startupBlocked) throw new Error(storageFailure || 'Files could not be loaded safely.');
    return true;
  }
  window.vistaNotesPrepareClose = async () => {
    try {const context=await request('close_prompt');if(movingFiles.size||collectingTabs||sendingTabCollection){await request('close_cancelled');return;}if(!startupBlocked&&!await prepareApplicationClose({preserveDrafts:context.windowCount===1})){await request('close_cancelled');return;}if(!startupBlocked)await flush();await request('close_ready');}
    catch(error){storageError(error);await request('close_failed',{message:error.message}).catch(()=>{});}
  };
  function showError(message) {$('errorBanner').textContent=message;$('errorBanner').hidden=false;}
  function clearError(){if(!startupBlocked)$('errorBanner').hidden=true;}
  function toast(message,duration=3400){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,duration);}

  // Tokenizers always escape unmatched text as well as matched tokens.
  function tokenize(code,expression,classify) {
    let result='',last=0;
    for (const match of code.matchAll(expression)) {
      result += escape(code.slice(last,match.index));
      const kind=classify(match[0],match.index,code);
      result += `<span class="tok-${kind}">${escape(match[0])}</span>`;
      last=match.index+match[0].length;
    }
    return result+escape(code.slice(last));
  }
  function colorJSON(code) {
    return tokenize(code,/"(?:\\[\s\S]|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g,(t,i) => t[0]==='"'?(/^\s*:/.test(code.slice(i+t.length))?'property':'string'):/^(true|false|null)$/.test(t)?'keyword':/^-?\d/.test(t)?'number':'operator');
  }
  function colorBash(code) {
    const re = /(^|(?<=\s))#[^\n]*|'[^']*'|"(?:\\[\s\S]|[^"\\])*"|\$\{[^}]*\}|\$\([^\n)]*\)|\$[a-zA-Z_][\w]*|\$[0-9?#@!*_-]|\b(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|select|time|export|local|readonly|return|exit)\b|\b(?:echo|printf|cd|pwd|ls|cat|mkdir|rm|cp|mv|grep|rg|sed|awk|find|chmod|chown|sudo|dnf|apt|git|curl|wget|python3?|node|jq|read|source|set|test|true|false|exec|touch|systemctl|head|tail|sort|uniq|tee|sleep|date|wc|tar|unzip)\b|\b\d+(?:\.\d+)?\b|[|&;<>!=]+/gm;
    return tokenize(code,re,t=>t[0]==='#'?'comment':t[0]==='"'||t[0]==="'"?'string':t[0]==='$'?'variable':/^\d/.test(t)?'number':/^[|&;<>!=]/.test(t)?'operator':/^(if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|select|time|export|local|readonly|return|exit)$/.test(t)?'keyword':'command');
  }
  function colorMarkdown(code) {
    let fenced=false,language='text';
    return code.split('\n').map(line=>{
      const fence=line.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
      if (fence) {if(!fenced)language=normalizeLanguage(fence[2]);fenced=!fenced;return `<span class="tok-fence">${escape(line)}</span>`;}
      if (fenced) return colorCode(line,language);
      if (/^\s{0,3}#{1,6}\s/.test(line)) return `<span class="tok-heading">${escape(line)}</span>`;
      return tokenize(line,/`[^`]*`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]*\)|^\s*[-*+]\s|^\s*>/g,t=>t[0]==='`'?'code':t[0]==='['?'keyword':'emphasis');
    }).join('\n');
  }
  /* SYNTAX_FORMATS */
  function normalizeLanguage(language){const key=String(language||'').toLowerCase(),aliases={sh:'bash',shell:'bash',zsh:'bash',js:'javascript',py:'python',htm:'html',md:'markdown'};return Object.hasOwn(aliases,key)?aliases[key]:Object.hasOwn(MODES,key)?key:'text';}
  function modeForFilename(name,fallback='text'){
    const extension=String(name||'').trim().split(/[\\/]/).at(-1).match(/\.([^.]+)$/)?.[1].toLowerCase();
    const types={json:'json',sh:'bash',bash:'bash',zsh:'bash',md:'markdown',markdown:'markdown',txt:'text',text:'text',log:'text',java:'java',js:'javascript',mjs:'javascript',cjs:'javascript',html:'html',htm:'html',css:'css',py:'python',pyw:'python'};
    return Object.hasOwn(types,extension)?types[extension]:fallback;
  }
  function refreshFileSyntax(file){
    if(note()?.id!==file.id)return;
    $('language').value=file.mode;paintEditor();updateStats();
  }
  function colorCode(code,mode){return mode==='bash'?colorBash(code):mode==='json'?colorJSON(code):mode==='markdown'?colorMarkdown(code):mode==='java'||mode==='javascript'?colorCLike(code,mode):mode==='python'?colorPython(code):mode==='css'?colorCSS(code):mode==='html'?colorHTML(code):escape(code);}

  /* EDITOR_RENDERING */
  function updateStats(){
    syncSelectControls();const n=note();if(!n)return;
    if(!$('wordCount').hidden){const words=n.content.trim()?n.content.trim().split(/\s+/u).length:0;$('wordCount').textContent=`${words.toLocaleString()} ${words===1?'word':'words'}`;}
    if(!$('charCount').hidden)$('charCount').textContent=`${n.content.length.toLocaleString()} characters`;
    if(!$('noteDate').hidden)$('noteDate').textContent=`Edited ${dateText(n)}`;
    if(!$('noteType').hidden)$('noteType').textContent=`${MODES[n.mode]} ${n.mode!=='text'&&n.mode!=='markdown'?'code':'file'}`;
    document.title=`${isFileModified(n)?'● ':''}${fileLabel(n)} — Another Note`;
  }

  function trimUndoHistory(history){
    let size=[...history.undo,...history.redo].reduce((sum,entry)=>sum+entry.content.length*2,0);
    while((size>32*1024*1024||history.undo.length+history.redo.length>100)&&(history.undo.length>1||history.redo.length>1)){
      const entries=history.undo.length>1?history.undo:history.redo;size-=entries.shift().content.length*2;
    }
    if(typeof histories!=='undefined'){
      const all=[...histories.values()],bytes=h=>[...h.undo,...h.redo].reduce((sum,entry)=>sum+entry.content.length*2,0);let total=all.reduce((sum,h)=>sum+bytes(h),0);
      for(const other of all.sort((a,b)=>(a===history)-(b===history)||(a.last||0)-(b.last||0))){
        while(total>64*1024*1024&&(other.undo.length>1||other.redo.length>1)){const entries=other.undo.length>1?other.undo:other.redo;total-=entries.shift().content.length*2;}
        if(total<=64*1024*1024)break;
      }
    }
    return history;
  }
  function rememberHistory(n=note(),force=false){if(!n)return;checkpointVersion(n,force?'Before an edit':'Before typing',force);let h=histories.get(n.id);if(!h){h={undo:[],redo:[],last:0};histories.set(n.id,h);}const entry={content:n.content,start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection||'none',find:findHistorySnapshot()};if(force||Date.now()-h.last>500||!h.undo.length)h.undo.push(entry);h.last=Date.now();h.redo=[];trimUndoHistory(h);}
  function undo(redo=false){const n=note();if(!n||n.trashedAt||currentView!=='edit')return;const h=histories.get(n.id);if(!h)return;const from=redo?h.redo:h.undo,to=redo?h.undo:h.redo;const entry=from.pop();if(!entry)return;to.push({content:n.content,start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection||'none',find:findHistorySnapshot()});trimUndoHistory(h);n.content=entry.content;n.updatedAt=clock();editor.value=entry.content;editor.focus();editor.setSelectionRange(entry.start,entry.end,['forward','backward'].includes(entry.direction)?entry.direction:'none');restoreFindHistory(entry.find);h.last=0;afterEdit();}
  function afterEdit(){const n=note();if(!n)return;scheduleVersion(n);updateFileIndicators();paintEditor();updateStats();save();if(!$('findBar').hidden)refreshInlineFind();refreshFindAllStatus();clearTimeout(listTimer);listTimer=setTimeout(renderList,350);}
  function replaceText(start,end,text,selectionStart=start+text.length,selectionEnd=selectionStart){const n=note();if(!n||n.trashedAt)return;rememberHistory(n,true);const before=editor.value;editor.setRangeText(text,start,end,'end');if(findSession?.text===before)trackFindEdit(start,end,editor.value.length-before.length+end-start);editor.setSelectionRange(selectionStart,selectionEnd);n.content=editor.value;n.updatedAt=clock();afterEdit();editor.focus();}
  function storeCursor(){const n=note();if(n)cursors.set(n.id,{start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection||'none',top:editor.scrollTop,left:editor.scrollLeft});}
  function selectNote(id,focus=false){
    closeCompletions();
    const switching=state.activeId!==id;
    if(switching&&typeof clearOccurrenceHighlights==='function')clearOccurrenceHighlights(false);
    storeCursor();state.activeId=id;const n=note();if(!n){renderAll();return;}
    if(switching||focus)revealFileForNavigation(n);
    if(!n.trashedAt&&!state.settings.openIds.includes(id))state.settings.openIds.push(id);
    if(!$('findAllPanel').hidden&&$('findAllScope').value==='file')findAllContext.id=id;
    checkpointVersion(n,'Opened');currentView='edit';editor.value=n.content;$('noteTitle').value=n.title;$('language').value=n.mode;
    $('notePane').hidden=false;$('emptyState').hidden=true;$('trashBanner').hidden=!n.trashedAt;
    editor.readOnly=Boolean(n.trashedAt)||startupBlocked;$('noteTitle').readOnly=editor.readOnly;$('language').disabled=editor.readOnly;
    $('pinButton').disabled=editor.readOnly;$('pinButton').classList.toggle('active',n.pinned);$('pinButton').textContent=n.pinned?'Unpin File':'Pin File';
    $('pinButton').setAttribute('aria-label',n.pinned?'Unpin file':'Pin file');
    setView(currentView,false);syncFileViewControls();paintEditor();updateStats();renderList();save();
    const cursor=cursors.get(id);if(cursor){editor.setSelectionRange(cursor.start,cursor.end,['forward','backward'].includes(cursor.direction)?cursor.direction:'none');editor.scrollTop=cursor.top;editor.scrollLeft=cursor.left;}else{editor.setSelectionRange(0,0);editor.scrollTop=0;editor.scrollLeft=0;}
    syncScroll();if(!$('findBar').hidden&&!n.trashedAt){beginFindSession();refreshInlineFind();}else closeFind(false);
    $('fileTabs').querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest',inline:'nearest'});
    if(focus)editor.focus();
  }
  function snippet(content){return content.replace(/^[#>`~*\-\s]+/gm,'').replace(/\n+/g,' ').slice(0,140)||'Empty file';}
  function renderList(){if(!state)return;refreshFindAllStatus();renderTabs();$('noteCount').textContent=liveNotes().length;$('trashCount').textContent=state.notes.filter(n=>n.trashedAt&&!n.removedAt).length;if(!$('filesDialog').open)return;$('trashNav').classList.toggle('active',trashView);$('trashNav').querySelector('span').textContent=trashView?'Back to files':'Trash';$('listLabel').textContent=trashView?'TRASH':'ALL FILES';let notes=state.notes.filter(n=>!n.removedAt&&Boolean(n.trashedAt)===trashView);notes.sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||(state.settings.sort==='title'?fileLabel(a).localeCompare(fileLabel(b)):state.settings.sort==='created'?b.createdAt-a.createdAt:b.updatedAt-a.updatedAt));$('noteList').innerHTML=notes.length?notes.map(n=>`<button type="button" class="note-card ${n.id===state.activeId?'selected':''}" data-note="${escape(n.id)}" role="listitem" aria-current="${n.id===state.activeId?'true':'false'}"><span class="note-card-header">${icon(n.mode!=='text'&&n.mode!=='markdown'?'code':'note')}<span class="note-card-title">${escape(fileLabel(n))}</span>${n.pinned?'<span class="pin-mark">PIN</span>':''}</span><span class="note-card-preview">${escape(snippet(n.content))}</span><span class="note-card-meta"><span>${new Date(n.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><span class="type-tag ${n.mode}">${escape(MODES[n.mode])}</span></span></button>`).join(''):`<div class="list-empty">${trashView?'Trash is empty.':'No saved files.'}</div>`;}
  function renderAll(){
    renderList();const n=note();if(n){selectNote(n.id);return;}
    if(!state.settings.openIds.length&&typeof releaseEmptyEditorView==='function')releaseEmptyEditorView();
    if(syncTagEmptyState())return;
    closeFind(false);syncSpellStatus();syncFileViewControls();
    $('notePane').hidden=true;$('emptyState').hidden=false;$('language').disabled=true;syncSelectControls();
    $('emptyTitle').textContent=trashView?'Trash is empty':'No file open';
    $('emptyDescription').textContent=trashView?'Deleted files stay here until you remove them forever.':'Create a file or use File → Open Saved File.';
    document.title='Another Note';$('position').textContent='Line 1, Column 1';
  }
  function makeNote(title='',content='',mode='text'){
    if(startupBlocked)return toast('Fix the storage error before creating files.');
    if(state.settings.tagFilter?.kind==='folder')state.settings.tagFilter={kind:'all'};
    const time=clock(),tags=newFileTags();const n={id:uid(),title,content,mode,hasSavedFile:false,pinned:false,createdAt:time,updatedAt:time,trashedAt:0,removedAt:0,tags,tagsUpdatedAt:tags.length?time:0};state.tags=normalizeTags(state.tags,tags);
    n.savedSignature=fileSignature({...n,content:''});n.savedState=null;state.notes.push(n);trashView=false;searchTerm='';state.settings.view='edit';selectNote(n.id,true);return n;
  }
  function touchNote(){const n=note();if(n)n.updatedAt=clock();}
  function duplicate(){const n=note();if(n)makeNote(`${fileLabel(n)} (copy)`,n.content,n.mode);}
  function moveToTrash(){
    const n=note();if(!n||n.trashedAt)return;const id=n.id;
    checkpointVersion(n,'Before moving to Trash',true);n.trashedAt=clock();n.updatedAt=n.trashedAt;state.settings.openIds=state.settings.openIds.filter(x=>x!==id);
    const next=state.settings.openIds.at(-1);if(next)selectNote(next);else{state.activeId=null;renderAll();save();}
    closeWindowIfEmpty();toast('Moved to Trash. Restore it from File → Open Saved File.');
  }
  function restore(){const n=note();if(!n)return;n.trashedAt=0;n.updatedAt=clock();trashView=false;save();selectNote(n.id);toast('File restored.');}
  function confirmAction(title,message,label,danger=false){
    const dialog=$('confirmDialog');if(dialog.open)return Promise.resolve(false);
    $('dialogTitle').textContent=title;$('dialogMessage').textContent=message;
    $('dialogConfirm').textContent=label;$('dialogConfirm').classList.toggle('danger',danger);
    dialog.returnValue='cancel';
    return new Promise(resolve=>{
      dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});
      dialog.showModal();dialog.querySelector('[value="cancel"]').focus();
    });
  }
  async function confirmDelete(){
    const n=note();if(!n||!n.trashedAt)return;const id=n.id;
    if(!await confirmAction('Delete this file forever?',`“${fileLabel(n)}” and its version history will be removed from this workspace permanently. A file saved on disk stays on disk. This cannot be undone.`,'Delete Forever',true))return;
    const original=state.notes.find(x=>x.id===id);if(!original)return;
    original.removedAt=clock();original.updatedAt=original.removedAt;original.content='';original.title='';original.savedState=null;original.savedSignature=fileSignature(original);delete original.fileKey;delete original.diskPath;delete original.versions;histories.delete(id);cursors.delete(id);deleteVersionHistory(id).catch(error=>toast(error.message));
    state.activeId=state.notes.find(x=>x.trashedAt&&!x.removedAt)?.id||null;save();renderAll();toast('File permanently deleted.');
  }
  function setView(){currentView='edit';if(state)state.settings.view='edit';}
  function applySettings(){
    const s=state.settings;const resolved=s.theme==='system'?(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):s.theme;
    document.body.dataset.theme=resolved;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;document.documentElement.style.backgroundColor=resolved==='dark'?'#191e23':'#fcfcfc';document.documentElement.style.setProperty('--editor-size',`${s.fontSize}px`);
    if(native)request('appearance',{theme:resolved}).catch(()=>{});
    document.documentElement.style.setProperty('--editor-line',`${Math.round(s.fontSize*1.6)}px`);
    document.documentElement.style.setProperty('--tab-size',String(editorTabSize()));$('tabSize').value=String(editorTabSize());
    document.querySelectorAll('[data-tab-size]').forEach(button=>{const selected=Number(button.dataset.tabSize)===editorTabSize();button.setAttribute('aria-checked',String(selected));button.textContent=`${selected?'✓ ':''}${button.dataset.tabSize} spaces`;});
    document.body.classList.toggle('no-wrap',!s.wrap);editor.wrap=s.wrap?'soft':'off';
    $('wrapMenu').textContent=`${s.wrap?'✓ ':''}Word Wrap`;$('fontSizeButton').textContent=`${s.fontSize} px`;$('sortBy').value=s.sort;syncSelectControls();syncMinimapControls();refreshShortcutLabels();
    document.querySelectorAll('[data-theme-choice]').forEach(button=>{const selected=button.dataset.themeChoice===s.theme;button.setAttribute('aria-checked',String(selected));button.textContent=`${selected?'✓ ':''}${({dark:'Dark',light:'Light',system:'Follow System'})[button.dataset.themeChoice]}`;});paintEditor();
  }
  function toggleWrap(){state.settings.wrap=!state.settings.wrap;applySettings();save();}
  function syncFileViewControls(){
    const file=note(),shown=file?.lineNumbers!==false,button=$('lineNumbersMenu');
    $('lineGutter').hidden=!shown;button.disabled=!file;button.setAttribute('aria-pressed',String(Boolean(file)&&shown));button.textContent=`${file&&shown?'✓ ':''}Line Numbers for This File`;
  }
  function toggleLineNumbers(){
    const file=note();if(!file||startupBlocked)return;
    file.lineNumbers=file.lineNumbers===false;file.updatedAt=clock();syncFileViewControls();paintEditor();save();
  }
  function zoom(delta){
    const size=Math.max(8,Math.min(72,state.settings.fontSize+delta));if(size===state.settings.fontSize)return;
    state.settings.fontSize=size;applySettings();save();
  }
  function wheelZoom(event){
    if(event.defaultPrevented||!ready||$('confirmDialog').open||$('helpDialog').open||$('shortcutsDialog').open||$('renameDialog').open||$('historyDialog').open||$('closeDialog').open||$('fileChangedDialog').open||$('filesDialog').open||$('tagDialog').open||$('manageTagsDialog').open||$('dictionaryDialog').open||$('spellingDialog').open||$('licensesDialog').open||$('colorDialog').open)return;
    const overSize=event.target.closest?.('#fontSizeButton');
    if((!event.ctrlKey&&!event.metaKey&&!overSize)||!event.deltaY)return;
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
    if(Math.sign(delta)!==Math.sign(wheelZoomAmount))wheelZoomAmount=0;
    wheelZoomAmount+=delta;
    const steps=Math.min(4,Math.floor(Math.abs(wheelZoomAmount)/40));
    if(steps){zoom(-Math.sign(wheelZoomAmount)*steps);wheelZoomAmount=0;}
  }

  function insertCode(language){const n=note();if(!n||n.trashedAt)return;if(n.mode!=='markdown'){n.mode='markdown';$('language').value='markdown';}setView('edit');const start=editor.selectionStart,end=editor.selectionEnd;const selected=editor.value.slice(start,end);const initial=language==='bash'?'echo "Hello, world!"':language==='json'?'{\n  "name": "Another Note",\n  "saved": true\n}':'';const code=selected||initial;const prefix=(start>0&&!editor.value.slice(0,start).endsWith('\n\n')?'\n\n':'')+`\`\`\`${language==='text'?'':language}\n`;replaceText(start,end,prefix+code+'\n```\n',start+prefix.length,start+prefix.length+code.length);}
  async function formatJSON(){const n=note();if(!n||n.trashedAt||activityBlocked())return;setView('edit');let start=editor.selectionStart,end=editor.selectionEnd;let source=editor.value.slice(start,end);if(!source.trim()){
      if(n.mode==='json'){start=0;end=editor.value.length;source=editor.value;}
      else{const re=/^[ \t]*```json[ \t]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;let nearest=null;for(const m of editor.value.matchAll(re)){const contentStart=m.index+m[0].indexOf('\n')+1;const contentEnd=contentStart+m[1].length;if(start>=m.index&&start<=m.index+m[0].length){nearest={start:contentStart,end:contentEnd,source:m[1]};break;}}if(!nearest)return toast('Select JSON text, or place the cursor inside a JSON code block.');({start,end,source}=nearest);}
    }
    const id=n.id,text=editor.value;
    try{let formatted=await editorJob('format',{mode:'json',text:source,tabSize:editorTabSize(),filename:'selection.json'});if(note()?.id!==id||editor.value!==text)return toast('The file changed while formatting. Run the command again.');if(!source.endsWith('\n'))formatted=formatted.replace(/\n$/,'');replaceText(start,end,formatted);clearError();toast('JSON formatted and validated.');}
    catch(error){showError(`Could not format JSON: ${error.message}`);toast('The JSON was left unchanged.');}
  }
  async function copyText(text){try{if(native)await request('clipboard',{text});else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const temp=document.createElement('textarea');temp.value=text;temp.style.position='fixed';temp.style.opacity='0';document.body.append(temp);temp.select();if(!document.execCommand('copy'))throw new Error('Clipboard unavailable.');temp.remove();}toast('Copied to clipboard.');}catch(error){toast(`Could not copy. ${error.message}`);}}
  async function printFile(){const file=note();if(!file)return;const article=document.createElement('article');article.id='printOutput';article.innerHTML=`<h1>${escape(fileLabel(file))}</h1><pre>${escape(file.content)}</pre>`;document.body.append(article);try{if(native)await request('print');else window.print();}finally{article.remove();}}
  function exportName(n){const ext={markdown:'md',text:'txt',bash:'sh',json:'json',java:'java',javascript:'js',html:'html',css:'css',python:'py'}[n.mode]||'txt';const name=fileLabel(n).trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').slice(0,150);return /\.[a-z0-9]+$/i.test(name)?name:`${name}.${ext}`;}
  async function download(name,text,mime='text/plain;charset=utf-8'){
    if(native){try{await request('export',{name,text});return true;}catch(error){if(error.message!=='Cancelled')toast(`Could not export. ${error.message}`);return false;}}
    const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);return true;
  }
  /* FILE_FEATURES */
  /* FILE_FOLDERS */
  /* FILE_REFRESH */
  /* FILE_DROPS */
  /* FILE_CLOSING */
  /* SEARCH_FEATURES */
  /* WINDOW_FEATURES */
  /* TAB_TRANSFER */
  /* WINDOW_COLLECTION */
  /* LIVE_TAB_DRAG */
  async function importEntries(entries,trusted=false){if(startupBlocked)return toast('The saved workspace must be recovered before importing.');let count=0,last=null;const opened=[],errors=[];const addOpened=file=>{last=file;if(!file.trashedAt&&!file.removedAt)opened.push(file.id);};for(const file of entries){try{if(file.error)throw new Error(file.error);if(typeof file.text!=='string')throw new Error('Unsupported file.');const name=String(file.name||'Imported file');const limit=/\.(?:vnotes|json)$/i.test(name)?128:20;if(file.text.length>limit*1024*1024)throw new Error(`This file is larger than ${limit} MB.`);let parsed=null;try{parsed=JSON.parse(file.text);}catch(_){}if(parsed?.format==='vista-notes'){
          const incoming=validateWorkspace(parsed);state.tags=normalizeTags(state.tags,incoming.tags);state.tagChanges=normalizeTagChanges(state.tagChanges,incoming.tagChanges);state.dictionaryChanges=normalizeTagChanges(state.dictionaryChanges,incoming.dictionaryChanges);for(const n of incoming.notes.filter(n=>!n.removedAt)){let existing=state.notes.find(x=>x.id===n.id);if(existing&&!existing.removedAt&&existing.content===n.content&&existing.title===n.title&&existing.mode===n.mode&&Boolean(existing.trashedAt)===Boolean(n.trashedAt)){existing.tags=normalizeTags(existing.tags,n.tags);existing.tagsUpdatedAt=clock();if(n.versions?.length)importVersionHistory(existing.id,n.versions);addOpened(existing);continue;}const copy={...n,id:uid(),updatedAt:clock()};delete copy.fileKey;delete copy.diskPath;delete copy.folderKey;delete copy.folderPath;if(copy.versions){importVersionHistory(copy.id,copy.versions);delete copy.versions;}state.notes.push(copy);addOpened(copy);count++;}applyTagChanges(state);
        }else if(/\.vnotes$/i.test(name)){throw new Error('Not a valid Another Note backup.');}
        else{const mode=modeForFilename(name);const time=clock();const n={id:uid(),title:name,content:file.text.replace(/\r\n?/g,'\n'),mode,hasSavedFile:true,pinned:false,createdAt:time,updatedAt:time,trashedAt:0,removedAt:0};const format=fileTextFormat(file.text);n.lineEnding=file.lineEnding||format.lineEnding;n.bom=Boolean(file.bom??format.bom);n.content=n.content.replace(/^\ufeff/,'');
          if(trusted&&native&&file.fileKey){const existing=liveNotes().find(item=>item.fileKey===file.fileKey);if(existing){await refreshOpenedFile(existing,n);addOpened(existing);continue;}n.fileKey=file.fileKey;n.diskPath=file.diskPath;}
          if(trusted&&!native&&file.handle){let existing=null;for(const item of liveNotes()){const handle=browserFileHandles.get(item.id);if(handle&&await handle.isSameEntry?.(file.handle)){existing=item;break;}}if(existing){await refreshOpenedFile(existing,n);if(file.folderKey&&file.folderPath&&(existing.folderKey!==file.folderKey||existing.folderPath!==file.folderPath)){existing.folderKey=file.folderKey;existing.folderPath=file.folderPath;existing.updatedAt=clock();}addOpened(existing);continue;}await rememberBrowserHandle(n.id,file.handle);}
          if(file.folderKey&&file.folderPath){n.folderKey=file.folderKey;n.folderPath=file.folderPath;}
          n.savedSignature=fileSignature(n);n.savedState=captureSavedState(n);state.notes.push(n);checkpointVersion(n,'Opened file',true);addOpened(n);count++;}
      }catch(error){errors.push(`${file.name}: ${error.message}`);}}
    for(const id of opened)if(!state.settings.openIds.includes(id))state.settings.openIds.push(id);
    if(opened.length)last=state.notes.find(file=>file.id===opened.at(-1));
    if(count){trashView=Boolean(last.trashedAt);searchTerm='';state.settings.view='edit';selectNote(last.id);save();toast(`Imported ${count} ${count===1?'file':'files'}. Existing files were kept.`);}else if(last){trashView=false;selectNote(last.id,true);toast(opened.length>1?'Files opened in tabs.':'File is already open.');}else if(entries.length)toast('No new files imported.');
    if(errors.length)toast(`${opened.length?`Opened ${opened.length} ${opened.length===1?'file':'files'}. `:''}Could not open ${errors.length===1?'this file':`${errors.length} files`}: ${errors.slice(0,3).join('; ')}${errors.length>3?'; …':''}`,8000);
    return opened;
  }
  async function openImport(){if(startupBlocked)return;if(native){try{const result=await request('import');await importEntries(result.files,true);}catch(error){if(error.message!=='Cancelled')toast(error.message);}}else if(typeof window.showOpenFilePicker==='function'){try{const handles=await window.showOpenFilePicker({multiple:true});const entries=[];for(const handle of handles){try{entries.push(await readBrowserFile(handle));}catch(error){entries.push({name:handle.name,error:error.message});}}await importEntries(entries,true);}catch(error){if(error.name!=='AbortError')toast(`Could not open file. ${error.message}`);}}else $('importFiles').click();}
  window.vistaNotesImport = entries => importEntries(entries,native);

  /* MENU_CONTROLS */

  function openFiles(){const byId=new Map(liveNotes().map(n=>[n.id,n]));return (state.settings.openIds||[]).map(id=>byId.get(id)).filter(Boolean);}
  function renderTabs(){
    if(draggedTabId)return;
    const opened=openFiles();state.settings.openIds=opened.map(n=>n.id);syncFolderTagFilter();
    const markup=displayedFiles().map(n=>`<div class="file-tab ${n.id===state.activeId?'active':''} ${n.pinned?'pinned':''} ${isFileModified(n)?'modified':''} ${typeof liveNativeDrag!=='undefined'&&liveNativeDrag?.id===n.id?'live-tab-drag-source':''}" data-tab-id="${escape(n.id)}" draggable="false"><button class="file-tab-select" data-open-file="${escape(n.id)}" role="tab" aria-selected="${n.id===state.activeId}" aria-label="${escape(fileLabel(n))}">${escape(fileLabel(n))}</button><button class="file-tab-close" data-close-file="${escape(n.id)}" aria-label="Close ${escape(fileLabel(n))}"><span class="file-unsaved" data-file-dirty aria-label="Unsaved changes" ${isFileModified(n)?'':'hidden'}>●</span><span class="file-close-glyph" aria-hidden="true">×</span></button></div>`).join('');
    if(renderTabs.markup!==markup){$('fileTabs').innerHTML=markup;renderTabs.markup=markup;}
    $('savedFilesMenu').innerHTML=opened.length?opened.map(n=>`<button data-open-file="${escape(n.id)}" class="${n.id===state.activeId?'active':''}"><span class="saved-file-name">${escape(fileLabel(n))}</span><span class="file-kind">${escape(MODES[n.mode])}</span></button>`).join(''):'<span class="empty-label">No open files</span>';
    updateFileIndicators();renderTagFilter();syncTagEmptyState();renderRecentFiles();syncTabScroll();if(typeof restoreLiveTabPreview==='function')restoreLiveTabPreview();
  }

  function rememberClosedFiles(ids){
    for(const id of ids){
      state.settings.closedIds=(state.settings.closedIds||[]).filter(value=>value!==id);state.settings.closedIds.push(id);
      if(wasFileSaved(liveNotes().find(file=>file.id===id))){state.settings.recentFiles=(state.settings.recentFiles||[]).filter(item=>item.id!==id);state.settings.recentFiles.push({id,closedAt:clock()});}
    }
    state.settings.closedIds=state.settings.closedIds.slice(-30);state.settings.recentFiles=state.settings.recentFiles.slice(-30);
  }

  function wasFileSaved(file){return Boolean(file&&(file.hasSavedFile===true||file.hasSavedFile!==false&&(file.fileKey||file.savedState?.title?.trim())));}
  function mergeRecentSettings(a={},b={}){
    const stamp=value=>Number.isFinite(value)&&value>0?value:0,cleared=Math.max(stamp(a.recentClearedAt),stamp(b.recentClearedAt)),byId=new Map();
    for(const item of [...(a.recentFiles||[]),...(b.recentFiles||[])]){
      if(!item||typeof item.id!=='string')continue;const closedAt=stamp(item.closedAt);if(cleared&&closedAt<=cleared)continue;
      if(!byId.has(item.id)||closedAt>byId.get(item.id).closedAt)byId.set(item.id,{id:item.id,closedAt});
    }
    const recentFiles=[...byId.values()].sort((x,y)=>x.closedAt-y.closedAt||x.id.localeCompare(y.id)).slice(-30);
    const closedIds=cleared>stamp(a.recentClearedAt)&&Array.isArray(a.closedIds)?a.closedIds.filter(id=>recentFiles.some(item=>item.id===id)):a.closedIds;
    const shortcuts=stamp(b.shortcutsUpdatedAt)>stamp(a.shortcutsUpdatedAt)?{shortcutBindings:b.shortcutBindings||{},shortcutsUpdatedAt:b.shortcutsUpdatedAt}:{};
    return {...a,...shortcuts,...(Array.isArray(closedIds)?{closedIds}:{}),recentFiles,recentClearedAt:cleared};
  }
  function allOpenFileIds(){
    const ids=new Set(state.settings.openIds);for(const peer of windowPeers.values())for(const id of peer.openIds||[])ids.add(id);
    if(native&&knownNativeOpenIds)for(const id of knownNativeOpenIds)ids.add(id);return ids;
  }
  function eligibleRecentFiles(){
    if(native&&knownNativeOpenIds===null)return [];
    const opened=allOpenFileIds(),files=new Map(liveNotes().map(file=>[file.id,file]));
    return (state.settings.recentFiles||[]).filter(item=>wasFileSaved(files.get(item.id))&&!opened.has(item.id)).slice().reverse();
  }
  function updateNativeOpenTabs(ids,render=true){
    if(!native||!Array.isArray(ids))return;knownNativeOpenIds=new Set(ids.filter(id=>typeof id==='string'));
    if(render&&ready&&state)renderRecentFiles();
  }
  function refreshRecentOpenTabs(){
    if(native)request('open_tabs').then(result=>updateNativeOpenTabs(result.openIds)).catch(()=>{knownNativeOpenIds=null;renderRecentFiles();});
    else postWindowMessage({type:'hello'});
  }
  function renderRecentFiles(){
    const byId=new Map(liveNotes().map(file=>[file.id,file])),recent=eligibleRecentFiles();
    const markup=recent.length?recent.map(item=>{const file=byId.get(item.id);return `<button type="button" class="recent-file" role="menuitem" data-open-recent="${escape(file.id)}"><span>${escape(fileLabel(file))}</span><small>${item.closedAt?escape(new Date(item.closedAt).toLocaleString()):'Previously closed'}</small></button>`;}).join(''):'<span class="empty-label recent-empty">No recently closed saved files</span>';
    if(renderRecentFiles.markup!==markup){
      const focused=typeof document!=='undefined'?document.activeElement?.dataset?.openRecent:null;
      $('recentFilesList').innerHTML=markup;renderRecentFiles.markup=markup;
      if(focused){const buttons=[...$('recentFilesList').querySelectorAll('button')];(buttons.find(button=>button.dataset.openRecent===focused)||buttons[0]||$('recentMenuTrigger')).focus();}
    }
    $('clearRecentButton').disabled=!(state.settings.recentFiles||[]).length;
  }
  function showRecentFiles(){openRecentSubmenu(true);}
  function clearRecentHistory(){state.settings.recentClearedAt=clock();state.settings.closedIds=[];state.settings.recentFiles=[];renderRecentFiles();save();toast('Recent history cleared. Saved files were kept.');}
  function openRecentFile(id){if(!eligibleRecentFiles().some(file=>file.id===id))return;closeMenus();trashView=false;selectNote(id,true);}
  function updateTabDrag(){
    if(!tabDrag||!draggedTabId)return;
    const tabs=$('fileTabs'),drag=tabDrag,rect=tabs.getBoundingClientRect();
    const outside=tabDragIsOutside(drag)||drag.detached;drag.detaching=outside;drag.ghost.classList.toggle('detaching',outside);document.body.classList.toggle('tabs-detaching',outside);
    if(outside){const transform=`translate3d(${drag.pointerX-drag.grabOffset-drag.startLeft}px,${drag.pointerY-drag.grabOffsetY-drag.top}px,0)`;if(drag.ghost.style.transform!==transform)drag.ghost.style.transform=transform;tabDragFrame=requestAnimationFrame(updateTabDrag);return;}
    const edge=38;
    if(drag.pointerX<rect.left+edge)tabs.scrollLeft-=Math.min(16,(rect.left+edge-drag.pointerX)/3);
    else if(drag.pointerX>rect.right-edge)tabs.scrollLeft+=Math.min(16,(drag.pointerX-rect.right+edge)/3);
    const left=Math.max(rect.left,Math.min(rect.right-drag.width,drag.pointerX-drag.grabOffset));
    const transform=`translate3d(${left-drag.startLeft}px,0,0)`;if(drag.ghost.style.transform!==transform)drag.ghost.style.transform=transform;
    const delta=left-(drag.lastLeft??drag.startLeft);if(delta)drag.direction=Math.sign(delta);drag.lastLeft=left;
    const slot=drag.placeholder||drag.element,ordered=[...tabs.children],current=ordered.indexOf(slot);let destination=current;
    if(drag.direction>0){for(let i=current+1;i<ordered.length;i++){const tab=ordered[i];if(left+drag.width>=rect.left+tab.offsetLeft-tabs.scrollLeft+tab.offsetWidth/2)destination=i;else break;}}
    else if(drag.direction<0){for(let i=current-1;i>=0;i--){const tab=ordered[i];if(left<=rect.left+tab.offsetLeft-tabs.scrollLeft+tab.offsetWidth/2)destination=i;else break;}}
    const others=ordered.filter(tab=>tab!==slot),before=others[destination]||null;
    if(destination!==current){
      const positions=new Map(others.map(tab=>[tab,tab.getBoundingClientRect().left]));
      others.forEach(tab=>tab.getAnimations().forEach(animation=>animation.cancel()));
      tabs.insertBefore(slot,before);
      if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
        others.forEach(tab=>{
          const offset=positions.get(tab)-tab.getBoundingClientRect().left;
          if(Math.abs(offset)>.5)tab.animate([{transform:`translateX(${offset}px)`},{transform:'translateX(0)'}],{duration:120,easing:'cubic-bezier(.2,.7,.3,1)'});
        });
      }
    }
    tabDragFrame=requestAnimationFrame(updateTabDrag);
  }
  function tabDragIsOutside(drag){
    const rect=document.querySelector('.tabbar').getBoundingClientRect(),margin=24;
    return drag.pointerX<rect.left-margin||drag.pointerX>rect.right+margin||drag.pointerY<rect.top-margin||drag.pointerY>rect.bottom+margin;
  }
  function liftTabElement(drag){
    const tabs=$('fileTabs'),slot=document.createElement('div');slot.className='file-tab tab-drag-placeholder';slot.dataset.tabId=drag.id;slot.setAttribute('aria-hidden','true');
    slot.style.cssText=`flex:0 0 ${drag.width}px;min-width:${drag.width}px;max-width:${drag.width}px`;
    drag.placeholder=slot;drag.originalStyle=drag.element.style.cssText;tabs.insertBefore(slot,drag.element);
    drag.ghost=drag.element;drag.element.classList.add('tab-drag-ghost');drag.element.style.cssText=`left:${drag.startLeft}px;top:${drag.top}px;width:${drag.width}px;height:${drag.height}px;transform:translate3d(0,0,0)`;
    document.body.append(drag.element);
  }
  function restoreTabElement(drag){
    if(!drag.placeholder)return;const tabs=$('fileTabs');
    if(drag.placeholder.isConnected){tabs.insertBefore(drag.element,drag.placeholder);drag.placeholder.remove();}else tabs.appendChild(drag.element);
    drag.element.classList.remove('tab-drag-ghost','detaching');drag.element.style.cssText=drag.originalStyle||'';drag.placeholder=null;
  }
  function finishTabDrag(cancelled=false){
    const drag=tabDrag;if(!drag)return;
    cancelAnimationFrame(tabDragFrame);tabDragFrame=0;tabDrag=null;
    if(typeof discardBrowserDragPreview==='function')discardBrowserDragPreview(drag);
    if(!draggedTabId)return;
    const tabs=$('fileTabs');restoreTabElement(drag);
    if(cancelled){
      const elements=new Map([...tabs.children].map(tab=>[tab.dataset.tabId,tab]));
      drag.originalIds.forEach(id=>{const tab=elements.get(id);if(tab)tabs.appendChild(tab);});
    }else{
      reorderDisplayedTabs([...tabs.children].map(tab=>tab.dataset.tabId));
    }
    if(!native&&drag.token)postWindowMessage({type:'drag-end',token:drag.token,recipient:drag.dropTarget});clearTabDrop();
    draggedTabId=null;suppressTabClickUntil=performance.now()+200;
    drag.element.classList.remove('dragging');if(drag.ghost!==drag.element)drag.ghost.remove();document.body.classList.remove('tabs-reordering','tabs-detaching');
    if(tabs.hasPointerCapture(drag.pointerId))tabs.releasePointerCapture(drag.pointerId);
    renderTabs();if(!cancelled)save();
  }
  function wireTabDragging(){
    const tabs=$('fileTabs');let lastPointerId=null;
    tabs.addEventListener('dragstart',event=>event.preventDefault());
    tabs.addEventListener('lostpointercapture',()=>{if(tabDrag&&!tabDrag.nativeHandoff)finishTabDrag(true);});
    function pressTab(event,pointerId=event.pointerId){
      if(!ready||event.button!==0||tabDrag||event.target.closest('[data-close-file]'))return;
      const tab=event.target.closest('[data-tab-id]');if(!tab)return;
      const rect=tab.getBoundingClientRect();
      tabDrag={element:tab,id:tab.dataset.tabId,pointerId,startX:event.clientX,startY:event.clientY,pointerX:event.clientX,pointerY:event.clientY,width:rect.width,startLeft:rect.left,top:rect.top,height:rect.height,grabOffset:event.clientX-rect.left,grabOffsetY:event.clientY-rect.top,originalIds:[...state.settings.openIds],ghost:null};
    }
    tabs.addEventListener('pointerdown',event=>{lastPointerId=event.pointerId;pressTab(event);});
    // WebKit can retain a pressed pointer when GDK consumes a drag's release.
    // Its next native mouse press still arrives as mousedown; use the pointer
    // identity from motion so another drag works immediately after a handoff.
    tabs.addEventListener('mousedown',event=>{
      if(native&&typeof nativeLiveDragEnabled!=='undefined'&&nativeLiveDragEnabled&&lastPointerId!==null&&!tabDrag)pressTab(event,lastPointerId);
    });
    document.addEventListener('pointermove',event=>{
      lastPointerId=event.pointerId;
      const drag=tabDrag;if(!drag||event.pointerId!==drag.pointerId)return;
      drag.pointerX=event.clientX;drag.pointerY=event.clientY;
      if(!draggedTabId){
        if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<4)return;
        if(!drag.element.isConnected){tabDrag=null;return;}
        draggedTabId=drag.id;closeMenus();
        tabs.setPointerCapture(event.pointerId);liftTabElement(drag);document.body.classList.add('tabs-reordering');tabDragFrame=requestAnimationFrame(updateTabDrag);
      }
      publishTabDragPoint(drag,event);if(typeof tryStartLiveTabDrag==='function')tryStartLiveTabDrag(drag,event);event.preventDefault();
    },{passive:false});
    document.addEventListener('pointerup',event=>{
      if(!tabDrag||event.pointerId!==tabDrag.pointerId)return;
      if(draggedTabId){
        event.preventDefault();const drag=tabDrag;drag.pointerX=event.clientX;drag.pointerY=event.clientY;
        drag.lastPoint={screenX:event.screenX,screenY:event.screenY};if(drag.nativeHandoff){drag.released=true;return;}
        const id=drag.id,target=tabDropDestination(drag,event),point={...drag.lastPoint};
        drag.dropTarget=target&&!target.blocked?target.id:null;
        if(!native&&!target&&(tabDragIsOutside(drag)||drag.detached))point.tabAnchor={x:drag.grabOffset,y:drag.grabOffsetY};
        if(tabDragIsOutside(drag)||target||drag.detached){finishTabDrag(true);moveDroppedFile(id,point,target);}
        else{cancelAnimationFrame(tabDragFrame);updateTabDrag();finishTabDrag();if(native)moveDroppedFile(id,point,null,false);}
      }else tabDrag=null;
    });
    document.addEventListener('pointercancel',event=>{if(tabDrag&&!tabDrag.nativeHandoff&&event.pointerId===tabDrag.pointerId)finishTabDrag(true);});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&draggedTabId){event.preventDefault();finishTabDrag(true);}},true);
    window.addEventListener('blur',()=>{if(!tabDrag?.nativeHandoff&&!tabDrag?.browserTabCursor)finishTabDrag(true);});
    document.querySelector('.tabbar').addEventListener('dblclick',event=>{
      if(!ready||startupBlocked||performance.now()<suppressTabClickUntil||event.target.closest('.file-tab,button,.menu,.tab-navigation'))return;
      event.preventDefault();makeNote();
    });
  }
  function reopenFile(){let id;while((id=state.settings.closedIds.pop())){if(liveNotes().some(n=>n.id===id)){trashView=false;selectNote(id,true);return;}}toast('No closed files to reopen.');}
  function switchFile(direction){const ids=openFiles().map(n=>n.id);if(!ids.length)return;const i=ids.indexOf(state.activeId);trashView=false;selectNote(ids[(i+direction+ids.length)%ids.length],true);}
  function renameFile(){const n=note();if(!n||n.trashedAt)return;$('noteTitle').value=n.title;$('renameDialog').showModal();$('noteTitle').focus();const end=n.title.lastIndexOf('.');$('noteTitle').setSelectionRange(0,end>0?end:n.title.length);}

  function showFiles(){trashView=false;$('filesDialog').showModal();renderList();}
  function searchPattern(query,regex,matchCase){
    return new RegExp(regex?query:query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gmu'+(matchCase?'':'i'));
  }
  function captureFindAllSelection(){
    const file=note();if(!file||file.trashedAt||file.removedAt)return null;
    const range=!$('findBar').hidden&&findSession?.id===file.id?(findSession.scope||findSession.candidate):{start:editor.selectionStart,end:editor.selectionEnd};
    return range&&range.end>range.start?{id:file.id,start:range.start,end:range.end,text:file.content}:null;
  }
  function showFindAll(scope='file'){
    findAllReference=null;syncReferencePanel();
    searchHighlightOwner='all';
    const file=note(),fromBar=!$('findBar').hidden&&findSession?.id===file?.id;
    findAllContext={id:file?.id||null,selection:captureFindAllSelection()};
    if(fromBar){$('findAllInput').value=$('findInput').value;$('findAllRegex').checked=$('findRegex').checked;$('findAllCase').checked=$('findCase').checked;}
    else{
      const selection=file?editor.value.slice(editor.selectionStart,editor.selectionEnd):'';
      if(selection&&selection.length<=200){$('findAllInput').value=selection;$('findAllRegex').checked=false;}
      else if(!$('findAllInput').value){$('findAllInput').value=$('findInput').value;$('findAllRegex').checked=$('findRegex').checked;$('findAllCase').checked=$('findCase').checked;}
    }
    $('findAllScope').value=scope==='file'&&fromBar&&$('findSelection').checked?'selection':scope;
    $('findAllPanel').hidden=false;document.querySelector('.app-window').classList.add('find-all-open');syncSelectControls();
    const search=runFindAll();$('findAllInput').focus();$('findAllInput').select();return search;
  }
  function closeFindAll(){
    searchHighlightOwner='inline';
    findAllSequence++;clearTimeout(findAllSearchTimer);findAllSearchTimer=null;findAllPendingKey=null;cancelSearchJob('all');
    $('findAllPanel').hidden=true;document.querySelector('.app-window').classList.remove('find-all-open');
    if(findAllResize){const grip=$('findAllResize');if(grip.hasPointerCapture(findAllResize.pointerId))grip.releasePointerCapture(findAllResize.pointerId);findAllResize=null;document.body.classList.remove('find-results-resizing');}
    if(note()){paintEditor();editor.focus();}
  }
  function findAllSources(scope,context){
    const files=openFiles();
    if(scope==='all')return files;
    const file=files.find(file=>file.id===(scope==='selection'?context.selection?.id:context.id));
    if(!file)throw new Error(scope==='selection'?'Select a range in the editor before choosing Selected range.':'Open a file to search, or choose Open tabs.');
    if(scope==='selection'&&file.content!==context.selection.text)throw new Error('The selected range changed. Select it again and reopen Find All, or choose Current file.');
    return [file];
  }
  function findAllLineStarts(text){const starts=[0];for(let i=text.indexOf('\n');i!==-1;i=text.indexOf('\n',i+1))starts.push(i+1);return starts;}
  function findAllLineAt(starts,offset){let low=0,high=starts.length;while(low+1<high){const mid=(low+high)>>1;if(starts[mid]<=offset)low=mid;else high=mid;}return low;}
  function findAllSnippet(item){
    const {source,start,end,line}=item,lineStart=source.lineStarts[line-1],lineEnd=(source.lineStarts[line]??source.content.length+1)-1;
    const from=Math.max(lineStart,start-60),matchEnd=Math.min(end,lineEnd),cropEnd=Math.min(matchEnd,start+120),to=Math.min(lineEnd,matchEnd+100);
    const highlighted=end===start?'<mark>│</mark>':cropEnd===start?'<mark>↵</mark>':previewCodeHTML(source,start,cropEnd,{start,end:cropEnd});
    return (from>lineStart?'…':'')+previewCodeHTML(source,from,start)+highlighted+(cropEnd<matchEnd||end>lineEnd?'<mark>…</mark>':'')+previewCodeHTML(source,matchEnd,to)+(to<lineEnd?'…':'');
  }
  function renderFindAllResults(){
    const result=findAllState;if(!result)return;
    const count=result.total??result.results.length,fileCount=result.groups.length;
    const symbol=result.symbol,kind=symbol?.kind==='type'?'Class':symbol?.kind==='class'?'CSS class':symbol?.kind==='id'?'ID':'Function';
    $('findAllSummary').textContent=result.error?'Search needs attention':!result.query?'Enter text to find':symbol?`${kind} “${symbol.name}” · ${count} ${count===1?'usage':'usages'} in ${fileCount} ${fileCount===1?'file':'files'}`:`${count} ${count===1?'match':'matches'} in ${fileCount} ${fileCount===1?'file':'files'} — “${result.query}”`;
    
    let html='';
    for(const group of result.groups){
      if(!group.matches.length)continue;const shown=group.matches.slice(0,Math.max(0,result.visibleCount-group.matches[0].index));if(!shown.length)continue;
      html+=`<details class="find-all-group" data-find-group="${escape(group.source.id)}" ${result.collapsed.has(group.source.id)?'':'open'}><summary><span class="find-all-file-name">${escape(fileLabel(group.source))}</span><span class="find-all-file-count">${group.total??group.matches.length}</span></summary>`;
      html+=shown.map(item=>`<button class="find-result-row ${item.index===result.selected?'selected':''}" data-find-result="${item.index}" tabindex="${item.index===result.selected?'0':'-1'}" aria-current="${item.index===result.selected}" aria-label="${escape(fileLabel(group.source))}, line ${item.line}, column ${item.column}"><span class="find-result-position">${item.line}:${item.column}</span><code>${findAllSnippet(item)}</code></button>`).join('')+'</details>';
    }
    if(!html)html=`<p class="find-all-empty">${result.error?escape(result.error):!result.query?'Type above to search open tabs.':symbol?'No usages found in open tabs.':'No matches found.'}</p>`;
    if(result.results.length>result.visibleCount)html+=`<button class="find-all-more" data-action="findAllMore">Show next ${Math.min(200,result.results.length-result.visibleCount)} matches (${result.visibleCount} of ${count} shown)</button>`;
    $('findAllResults').innerHTML=html;renderFindAllPreview();refreshFindAllStatus();if(note())paintEditor();
  }
  function renderFindAllPreview(){
    const item=findAllState?.results[findAllState.selected];
    if(!item){$('findAllPreviewTitle').textContent='Preview';$('findAllPreviewCode').innerHTML='<p class="find-all-empty">Select a result to preview its source.</p>';return;}
    const {source,start,end,line}=item;
    $('findAllPreviewTitle').textContent=`${fileLabel(source)} — Line ${line}, Column ${item.column}`;
    const rows=[];
    for(let row=Math.max(0,line-3);row<Math.min(source.lineStarts.length,line+3);row++){
      const a=source.lineStarts[row],b=(source.lineStarts[row+1]??source.content.length+1)-1;
      const current=end===start?row===line-1:start<=b&&end>a;
      const from=current?Math.max(a,Math.min(start,b)-100):a,to=Math.min(b,from+360),left=Math.max(from,Math.min(to,start)),right=Math.max(left,Math.min(to,end));
      const text=current?previewCodeHTML(source,from,left)+(right>left?previewCodeHTML(source,left,right,{start:left,end:right}):`<mark>${end===start?'│':'↵'}</mark>`)+previewCodeHTML(source,right,to):previewCodeHTML(source,from,to);
      rows.push(`<div class="find-preview-row ${current?'current':''}"><span class="find-preview-number">${row+1}</span><code>${from>a?'…':''}${text||' '}${to<b?'…':''}</code></div>`);
    }
    $('findAllPreviewCode').innerHTML=rows.join('');
  }
  function refreshFindAllStatus(){
    const result=findAllState;if(!result||$('findAllPanel').hidden)return;
    const settingsChanged=$('findAllInput').value!==result.query||$('findAllRegex').checked!==result.regex||$('findAllCase').checked!==result.matchCase||$('findAllScope').value!==result.scope||result.key!==findAllSearchKey();
    let changed=false;
    try{const files=findAllSources(result.scope,result.context);changed=files.length!==result.sources.length||files.some((file,i)=>file.id!==result.sources[i]?.id||file.title!==result.sources[i]?.title||file.content!==result.sources[i]?.content);}catch(error){changed=error.message!==result.error;}
    result.stale=settingsChanged||changed;
    const key=findAllSearchKey();
    if(result.stale&&key!==findAllCancelledKey){if(!findAllSearchTimer&&findAllPendingKey!==key)scheduleFindAll();return;}
    if(findAllPendingKey)return;
    const message=key===findAllCancelledKey?'Search cancelled.':result.error||(result.truncated?`Showing the first ${result.results.length.toLocaleString()} of ${result.total.toLocaleString()} matches. Narrow the scope to see later results.`:'');
    $('findAllStatus').textContent=message;$('findAllStatus').hidden=!message;$('findAllStatus').className=`find-all-status ${result.error?'error':''}`;
    $('findAllInput').setAttribute('aria-invalid',String(result.regexError));
  }
  function selectFindAllResult(index,focus=false){
    searchHighlightOwner='all';
    const result=findAllState,item=result?.results[index];if(!item)return;
    result.selected=index;result.visibleCount=Math.max(result.visibleCount,Math.ceil((index+1)/200)*200);result.collapsed.delete(item.source.id);
    renderFindAllResults();const button=$('findAllResults').querySelector(`[data-find-result="${index}"]`);
    button?.scrollIntoView({block:'nearest'});if(focus)button?.focus();
  }
  function scrollToFindAllMatch(item){
    scrollToEditorMatch(item.start);
  }
  async function openFindAllResult(index=findAllState?.selected){
    const item=findAllState?.results[index];if(!item)return;
    const file=openFiles().find(file=>file.id===item.source.id);
    if(!file||file.content!==item.source.content){await runFindAll();toast('This file changed. Results refreshed; choose a match again.');return;}
    selectFindAllResult(index);trashView=false;
    if(state.activeId!==file.id||!fileMatchesTag(file))selectNote(file.id,true);
    setView('edit');editor.focus();
    if(findSession?.id===file.id){findSession.programSelection={start:item.start,end:item.end};findSession.current={start:item.start,end:item.end};}
    editor.setSelectionRange(item.start,item.end);scrollToFindAllMatch(item);
  }
  function stepFindAllResult(direction,open=true){
    const count=findAllState?.results.length||0;if(!count)return;
    const index=(findAllState.selected+direction+count)%count;
    if(open)openFindAllResult(index);else selectFindAllResult(index,true);
  }
  function expandFindAllGroups(expand){if(!findAllState)return;findAllState.collapsed=expand?new Set():new Set(findAllState.groups.map(group=>group.source.id));renderFindAllResults();}
  function moreFindAllResults(){if(!findAllState)return;findAllState.visibleCount+=200;renderFindAllResults();}
  function sizeFindAll(height){
    const max=Math.max(0,window.innerHeight-200),min=Math.min(140,max),value=Math.max(min,Math.min(max,height));
    document.querySelector('.app-window').style.setProperty('--find-results-height',`${value}px`);
    $('findAllResize').setAttribute('aria-valuemin',String(min));$('findAllResize').setAttribute('aria-valuemax',String(max));$('findAllResize').setAttribute('aria-valuenow',String(Math.round(value)));
  }
  function wireFindAll(){
    $('findAllInput').addEventListener('input',scheduleFindAll);
    $('findAllInput').addEventListener('keydown',event=>{
      if(event.isComposing||event.defaultPrevented)return;
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();runFindAll();}
      else if(event.key==='ArrowDown'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!$('findAllInput').value.includes('\n')&&findAllState?.results.length){event.preventDefault();selectFindAllResult(Math.max(0,findAllState.selected),true);}
    });
    for(const id of ['findAllRegex','findAllCase'])$(id).addEventListener('change',runFindAll);
    $('findAllScope').addEventListener('change',()=>{
      if($('findAllScope').value==='selection')findAllContext.selection=captureFindAllSelection();
      else if($('findAllScope').value==='file')findAllContext.id=note()?.id||findAllContext.id;
      runFindAll();
    });
    $('findAllResults').addEventListener('toggle',event=>{const group=event.target.dataset?.findGroup;if(group&&findAllState){if(event.target.open)findAllState.collapsed.delete(group);else findAllState.collapsed.add(group);}},true);
    $('findAllResults').addEventListener('keydown',event=>{
      if(event.altKey||event.ctrlKey||event.metaKey)return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();stepFindAllResult(event.key==='ArrowDown'?1:-1,false);}
      else if(event.key==='Enter'||event.key==='F4'){event.preventDefault();openFindAllResult();}
    });
    const grip=$('findAllResize');
    const finish=()=>{if(findAllResize&&grip.hasPointerCapture(findAllResize.pointerId))grip.releasePointerCapture(findAllResize.pointerId);findAllResize=null;document.body.classList.remove('find-results-resizing');};
    grip.addEventListener('pointerdown',event=>{if(event.button!==0||findAllResize)return;event.preventDefault();findAllResize={pointerId:event.pointerId,y:event.clientY,height:$('findAllPanel').getBoundingClientRect().height};grip.setPointerCapture(event.pointerId);document.body.classList.add('find-results-resizing');});
    grip.addEventListener('pointermove',event=>{if(findAllResize&&event.pointerId===findAllResize.pointerId)sizeFindAll(findAllResize.height+findAllResize.y-event.clientY);});
    grip.addEventListener('pointerup',finish);grip.addEventListener('pointercancel',finish);window.addEventListener('blur',finish);
    grip.addEventListener('keydown',event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();sizeFindAll($('findAllPanel').getBoundingClientRect().height+(event.key==='ArrowUp'?20:-20));}});
    window.addEventListener('resize',()=>{if(!$('findAllPanel').hidden)sizeFindAll($('findAllPanel').getBoundingClientRect().height);});
  }
  function findHistorySnapshot(){
    if($('findBar').hidden||findSession?.id!==state.activeId)return null;
    return {session:findSession,candidate:findSession.candidate?{...findSession.candidate}:null,scope:findSession.scope?{...findSession.scope}:null};
  }
  function restoreFindHistory(snapshot){
    if(!snapshot||snapshot.session!==findSession)return;
    findSession.candidate=snapshot.candidate?{...snapshot.candidate}:null;findSession.scope=snapshot.scope?{...snapshot.scope}:null;
    findSession.text=editor.value;findSession.current=null;findSession.programSelection={start:editor.selectionStart,end:editor.selectionEnd};
  }
  function beginFindSession(){
    const file=note();if(!file)return;
    const start=editor.selectionStart,end=editor.selectionEnd;
    findSession={id:file.id,text:editor.value,candidate:end>start?{start,end}:null,scope:null,current:null,programSelection:null};
    $('findSelection').checked=false;pendingFindInput=null;
  }
  function findInFile(replacing=false){
    searchHighlightOwner='inline';
    if(!note()||note().trashedAt)return;
    if($('findBar').hidden||findSession?.id!==note().id)beginFindSession();
    setView('edit');$('findBar').hidden=false;$('replaceRow').hidden=!replacing;
    resizeSearchFields();
    $('findInput').focus();$('findInput').select();return findMatches(false);
  }
  function closeFind(focus=true){cancelInlineSearch();$('findBar').hidden=true;findSession=null;pendingFindInput=null;clearInlineHighlights();if(focus)editor.focus();}
  function rebaseFindRange(range,start,oldEnd,newEnd,length){
    if(!range)return null;
    const delta=newEnd-oldEnd;
    const from=range.start<=start?range.start:range.start>=oldEnd?range.start+delta:start;
    const to=range.end<start?range.end:range.end>=oldEnd?range.end+delta:newEnd;
    return {start:Math.max(0,Math.min(length,from)),end:Math.max(0,Math.min(length,Math.max(from,to)))};
  }
  function trackFindEdit(start,end,length){
    if($('findBar').hidden||findSession?.id!==note()?.id)return;
    findSession.candidate=rebaseFindRange(findSession.candidate,start,end,start+length,editor.value.length);
    findSession.scope=rebaseFindRange(findSession.scope,start,end,start+length,editor.value.length);
    findSession.text=editor.value;findSession.current=null;
  }
  function trackFindInput(){
    const pending=pendingFindInput;pendingFindInput=null;
    if(!pending||pending.id!==note()?.id||findSession?.text!==pending.text)return;
    const before=pending.text,after=editor.value;
    let start=pending.start,end=pending.end,length=after.length-before.length+end-start;
    if(length<0&&start===end&&pending.type.startsWith('delete')){start=editor.selectionStart;end=start+before.length-after.length;length=0;}
    if(length>=0&&before.slice(0,start)===after.slice(0,start)&&before.slice(end)===after.slice(start+length))trackFindEdit(start,end,length);
  }
  function syncFindSession(){
    if(!note())return false;
    if(findSession?.id!==note().id)beginFindSession();
    const text=editor.value;
    if(findSession.text!==text){
      // An edit without an exact range invalidates the scope instead of risking outside text.
      findSession.candidate=null;findSession.scope=null;findSession.current=null;findSession.programSelection=null;findSession.text=text;
    }
    return true;
  }
  function captureFindSelection(){
    if($('findBar').hidden||!syncFindSession())return;
    const start=editor.selectionStart,end=editor.selectionEnd,program=findSession.programSelection;
    if(end<=start||(program&&program.start===start&&program.end===end))return;
    findSession.candidate={start,end};findSession.current=null;
    if($('findSelection').checked&&!findSession.scope){findSession.scope={start,end};refreshInlineFind();}
  }
  function toggleFindSelection(){
    if(!syncFindSession())return;
    findSession.scope=$('findSelection').checked&&findSession.candidate?{...findSession.candidate}:null;
    findSession.current=null;return findMatches(false);
  }
  function updateFindStatus(result,selected=null){
    const count=result.total??result.matches.length,index=selected?result.matches.findIndex(match=>match.start===selected.start&&match.end===selected.end):-1;
    $('findCount').textContent=(!$('findInput').value||result.error?'':count?(index>=0?`${index+1} of ${count}`:`${count} ${count===1?'match':'matches'}`):'No matches')+(result.truncated?' · Navigate first 100,000; narrow the scope for more':'');
    $('findError').textContent=result.error;$('findError').hidden=!result.error;
    $('findInput').setAttribute('aria-invalid',String(result.regexError));
    const scope=$('findSelection').checked?findSession?.scope:null;
    $('findScopeLabel').hidden=!scope;$('findScopeLabel').textContent=scope?`${scope.end-scope.start} selected characters`:'';
    $('findPreviousButton').disabled=!count;$('findNextButton').disabled=!count;
    const readOnly=editor.readOnly||startupBlocked||!note()||Boolean(note().trashedAt);
    $('replaceInput').disabled=readOnly;$('replaceOneButton').disabled=!count||readOnly;$('replaceAllButton').disabled=!count||readOnly;
  }
  function selectFindMatch(result,match){
    if(!match)return;
    findSession.current=match;findSession.programSelection={start:match.start,end:match.end};
    editor.setSelectionRange(match.start,match.end);
    scrollToEditorMatch(match.start);
    updateFindStatus(result,match);paintEditor();
  }
  function findReplacementText(){
    const value=$('replaceInput').value;
    return $('findRegex').checked?value.replace(/\\(\\|n|t)/g,(_,code)=>code==='n'?'\n':code==='t'?'\t':'\\'):value;
  }
  const actions={scrollTabsLeft:()=>scrollTabs(-1),scrollTabsRight:()=>scrollTabs(1),new:()=>makeNote(),showAllTabs:()=>setTabTagFilter({kind:'all'}),import:openImport,openFolder:openFolderFiles,export:()=>exportNote(false),saveAs:()=>exportNote(true),versions:showVersionHistory,closeVersions:()=>$('historyDialog').close(),restoreVersion,manualVersion,backup,manageTags:openManageTags,indent:()=>indentLines(false),outdent:()=>indentLines(true),undo:()=>undo(),redo:()=>undo(true),find:()=>showFindAll('all'),findAll:()=>showFindAll('file'),runFindAll,closeFindAll,cancelInlineSearch,cancelFindAll,findAllPrevious:()=>stepFindAllResult(-1),findAllNext:()=>stepFindAllResult(1),findAllExpand:()=>expandFindAllGroups(true),findAllCollapse:()=>expandFindAllGroups(false),findAllMore:moreFindAllResults,findText:()=>findInFile(false),findReplace:()=>findInFile(true),replaceOne:()=>replaceFindMatch(false),replaceAll:()=>replaceFindMatch(true),findNext:()=>findMatches(true),findPrevious:()=>findMatches(true,true),closeFind:()=>closeFind(),files:showFiles,duplicate,trash:moveToTrash,restore,permanent:confirmDelete,copy:()=>{const n=note();if(n)copyText(n.content);},wrap:toggleWrap,lineNumbers:toggleLineNumbers,zoomIn:()=>zoom(1),zoomOut:()=>zoom(-1),format:prettyFormat,formatJSON,toggleComment,complete:requestCodeCompletions,toggleSpellcheck,reviewSpelling,dictionary:openDictionary,licenses:()=>{$('licensesText').textContent=$('thirdPartyLicenses').content.textContent;$('licensesDialog').showModal();},detach:()=>moveFileToWindow(),collectTabs:collectAllTabs,close:()=>closeFile(),closeSaved:closeSavedFiles,closeWindow:closeEditorWindow,recent:showRecentFiles,clearRecent:clearRecentHistory,reopen:reopenFile,previous:()=>switchFile(-1),next:()=>switchFile(1),rename:renameFile,shortcuts:showKeyboardShortcuts,about:()=>$('helpDialog').showModal(),print:printFile};
  function wireEvents(){wireWindowFeatures();wireTabTransfers();wireMenus();wireTagFeatures();wireTabDragging();wireFindAll();document.addEventListener('wheel',wheelZoom,{passive:false});document.addEventListener('click',e=>{const version=e.target.closest('[data-version-index]');if(version){selectVersion(Number(version.dataset.versionIndex));return;}const found=e.target.closest('[data-find-result]');if(found){openFindAllResult(Number(found.dataset.findResult));return;}const recent=e.target.closest('[data-open-recent]');if(recent){openRecentFile(recent.dataset.openRecent);return;}if(performance.now()<suppressTabClickUntil&&e.target.closest('.tabbar')){e.preventDefault();return;}const closer=e.target.closest('[data-close-file]');if(closer){closeFile(closer.dataset.closeFile).catch(error=>toast(error.message));return;}const opener=e.target.closest('[data-open-file]');if(opener){if(performance.now()<suppressTabClickUntil)return;trashView=false;selectNote(opener.dataset.openFile,true);closeMenus();return;}const action=e.target.closest('[data-action]');if(action){closeMenus();if(!ready)return;Promise.resolve(actions[action.dataset.action]?.()).catch(error=>toast(error.message));}const theme=e.target.closest('[data-theme-choice]');if(theme){state.settings.theme=theme.dataset.themeChoice;applySettings();save();closeMenus();}const block=e.target.closest('[data-insert]');if(block){insertCode(block.dataset.insert);closeMenus();}});
    $('noteList').addEventListener('click',e=>{const card=e.target.closest('[data-note]');if(card){selectNote(card.dataset.note,true);$('filesDialog').close();}});
    $('sortBy').addEventListener('change',()=>{state.settings.sort=$('sortBy').value;renderList();save();});
    $('trashNav').addEventListener('click',()=>{trashView=!trashView;renderList();});
    $('noteTitle').addEventListener('input',()=>{const n=note();if(!n||n.trashedAt)return;n.title=$('noteTitle').value;const mode=modeForFilename(n.title,n.mode);if(mode!==n.mode){n.mode=mode;refreshFileSyntax(n);}touchNote();updateStats();renderList();save();});
    $('noteTitle').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('renameDialog').close();editor.focus();}});
    $('historyDialog').addEventListener('close',()=>{historyFileId=null;historySelection=-1;$('historyPreview').innerHTML='';$('historyVersions').innerHTML='';trimVersionMemoryCache();});
    $('language').addEventListener('change',()=>{const n=note();if(!n)return;n.mode=$('language').value;touchNote();paintEditor();updateStats();renderList();save();});
    $('pinButton').addEventListener('click',()=>{const n=note();if(!n||n.trashedAt)return;n.pinned=!n.pinned;touchNote();$('pinButton').classList.toggle('active',n.pinned);$('pinButton').textContent=n.pinned?'Unpin File':'Pin File';$('pinButton').setAttribute('aria-label',n.pinned?'Unpin file':'Pin file');renderList();save();});
    wireSearchFields();$('findInput').addEventListener('input',refreshInlineFind);
    for(const id of ['findInput','replaceInput'])$(id).addEventListener('focus',()=>{searchHighlightOwner='inline';paintEditor();});
    $('findAllInput').addEventListener('focus',()=>{searchHighlightOwner='all';paintEditor();});
    $('findInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!e.defaultPrevented){e.preventDefault();findMatches(true);}});
    $('replaceInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!e.defaultPrevented){e.preventDefault();replaceFindMatch(e.ctrlKey||e.metaKey);}});
    $('findRegex').addEventListener('change',()=>findMatches(false));$('findCase').addEventListener('change',()=>findMatches(false));$('findSelection').addEventListener('change',toggleFindSelection);
    $('fileTabs').addEventListener('dblclick',e=>{if(e.target.closest('[data-open-file]'))renameFile();});
    editor.addEventListener('beforeinput',e=>{if(e.inputType==='historyUndo'||e.inputType==='historyRedo'){e.preventDefault();undo(e.inputType==='historyRedo');}else if(!editor.readOnly){rememberHistory();pendingFindInput=!$('findBar').hidden&&findSession?{id:state.activeId,text:editor.value,start:editor.selectionStart,end:editor.selectionEnd,type:e.inputType||''}:null;}});
    editor.addEventListener('input',()=>{const n=note();if(!n||n.trashedAt||startupBlocked)return;trackFindInput();n.content=editor.value;touchNote();afterEdit();});
    editor.addEventListener('scroll',syncScroll);editor.addEventListener('click',updatePosition);editor.addEventListener('keyup',()=>{updatePosition();captureFindSelection();});editor.addEventListener('select',()=>{updatePosition();captureFindSelection();});editor.addEventListener('pointerup',captureFindSelection);editor.addEventListener('compositionstart',()=>composing=true);editor.addEventListener('compositionend',()=>composing=false);
    editor.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||composing||editor.readOnly)return;const n=note();if(!n)return;if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&n.mode!=='text'){e.preventDefault();const start=editor.selectionStart;const before=editor.value.slice(0,start);const line=before.slice(before.lastIndexOf('\n')+1);let indent=(line.match(/^\s*/)||[''])[0];if(n.mode==='json'&&/[{\[]\s*$/.test(line))indent+=' '.repeat(editorTabSize());replaceText(start,editor.selectionEnd,'\n'+indent);}});
    document.addEventListener('keydown',e=>{
      if(e.defaultPrevented||!ready||$('confirmDialog').open||$('helpDialog').open||$('shortcutsDialog').open||$('renameDialog').open||$('historyDialog').open||$('closeDialog').open||$('fileChangedDialog').open||$('filesDialog').open||$('tagDialog').open||$('manageTagsDialog').open||$('dictionaryDialog').open||$('spellingDialog').open||$('licensesDialog').open||$('colorDialog').open)return;
      if(e.key==='Escape'){closeMenus();$('toast').hidden=true;if(!$('findAllPanel').hidden&&$('findAllPanel').contains(document.activeElement)){e.preventDefault();closeFindAll();}else if(!$('findBar').hidden){e.preventDefault();closeFind();}else if(!$('findAllPanel').hidden){e.preventDefault();closeFindAll();}return;}
    });
    $('fontSizeButton').addEventListener('click',()=>{state.settings.fontSize=15;applySettings();save();});
    $('tabSize').addEventListener('change',()=>setEditorTabSize($('tabSize').value));
    document.querySelectorAll('[data-tab-size]').forEach(button=>button.addEventListener('click',()=>setEditorTabSize(button.dataset.tabSize)));
    $('importFiles').addEventListener('change',async()=>{const entries=[];try{for(const file of $('importFiles').files){try{entries.push(await readBrowserImportFile(file));}catch(error){entries.push({name:file.name,error:error.message});}}await importEntries(entries);}finally{$('importFiles').value='';}});
    matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(state?.settings.theme==='system')applySettings();});
    window.addEventListener('resize',()=>{updateLineNumbers();syncScroll();});new ResizeObserver(()=>{updateLineNumbers();syncScroll();}).observe($('codeSurface'));
    window.addEventListener('pagehide',()=>{save();flushVersionHistory().catch(()=>{});});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
    window.addEventListener('beforeunload',e=>{if(shouldConfirmWindowClose()){e.preventDefault();e.returnValue='';}});
    window.addEventListener('storage',e=>{if(!native&&e.key===KEY&&e.newValue){try{receiveWorkspaceUpdate(JSON.parse(e.newValue));}catch(_){}}});
  }

  async function initialize(){wireCodeStructure();wireKeyboardShortcuts();wireEvents();wireFileDrops();wireFolderImport();wireTabScrolling();wireEditorTools();wireEditorCompletions();wireEditorColors();wireEditorLinks();wireEditorScrollbars();wireSymbolReferences();wireMinimap();wireOccurrenceHighlights();let found=false,initialTransfer=null;state=emptyWorkspace();const seed=await receiveBrowserWindowSeed();if(native){document.body.classList.add('desktop-app');$('storageCaption').textContent='Files saved to disk';try{const result=await request('load');nativeHistoryAppend=result.historyAppend===true;if(result.state){state=validateWorkspace(result.state);found=true;}updateNativeOpenTabs(result.openIds,false);initialTransfer=result.transfer;nativeLiveDragEnabled=result.liveDrag===true;if(result.recovered)toast('Recovered your files from the previous saved copy.');}catch(error){startupBlocked=true;storageFailure=error.message;showError(`Your saved workspace could not be opened. ${error.message} Existing files have been kept. Close the app and restore a backup; the workspace will not be overwritten.`);savedIndicator('Could not open files','failed');}}
    else{const copies=[];let invalid=false;try{const text=localStorage.getItem(KEY);if(text)copies.push(validateWorkspace(JSON.parse(text)));}catch(_){invalid=true;}try{database=await openDatabase();const [data]=await Promise.all([readDatabase(),loadBrowserFileHandles().catch(()=>{})]);if(data)copies.push(validateWorkspace(data));}catch(_){}if(copies.length){state=copies.reduce((a,b)=>mergeWorkspaces(a,b,false));found=true;}else if(invalid){startupBlocked=true;storageFailure='The saved workspace could not be read.';showError('Your saved workspace could not be read. Its data has been kept. Export a backup before changing browser storage.');}}
    if(seed){state=mergeWorkspaces(validateWorkspace(seed.workspace),state);initialTransfer=seed.transfer;if(seed.handle)await rememberBrowserHandle(seed.transfer.fileId,seed.handle);found=true;startupBlocked=false;storageFailure='';}
    else restoreWindowTabs();
    ready=true;
    if(!startupBlocked&&(!found||!state.settings.openIds.length&&!state.activeId)){const time=clock(),tags=newFileTags();const blank={id:uid(),title:'',content:'',mode:'text',pinned:false,createdAt:time,updatedAt:time,trashedAt:0,removedAt:0,tags,tagsUpdatedAt:tags.length?time:0};state.tags=normalizeTags(state.tags,tags);blank.savedSignature=fileSignature(blank);blank.savedState=null;state.notes.push(blank);state.activeId=blank.id;state.settings.openIds=[blank.id];}

    const active=state.notes.find(n=>n.id===state.activeId&&!n.removedAt);if(active)trashView=Boolean(active.trashedAt);else state.activeId=state.settings.openIds.at(-1)||null;
    applySettings();renderAll();wireExternalFileChanges();finishWindowTransfer(initialTransfer);if(!startupBlocked)save();else{const message=$('errorBanner').textContent;const p=document.createElement('p');p.textContent=message;$('emptyState').append(p);$('emptyTitle').textContent='Your saved files need attention.';$('emptyState').querySelector('button').hidden=true;}
    if(initialTransfer&&!startupBlocked)await flush();
    if(native)request('ready',{theme:document.body.dataset.theme,failed:startupBlocked,build:document.querySelector('meta[name="another-note-build"]')?.content}).catch(()=>{});else completeBrowserWindowSeed(startupBlocked);if(!native&&navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  }
  initialize().catch(error=>{startupBlocked=true;storageFailure=error.message;showError(`Could not start Another Note: ${error.message}`);savedIndicator('Could not open files','failed');if(native)request('ready',{theme:document.documentElement.dataset.theme||'dark',failed:true,build:document.querySelector('meta[name="another-note-build"]')?.content}).catch(()=>{});else completeBrowserWindowSeed(true);});
})();
