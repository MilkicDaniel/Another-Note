  const shortcutDefinitions=[
    ['new','New file',['Ctrl+N']],['import','Open files',['Ctrl+O']],['export','Save file',['Ctrl+S']],['saveAs','Save file as',['Ctrl+Shift+S']],
    ['close','Close tab',['Ctrl+W']],['reopen','Reopen closed file',['Ctrl+Shift+T']],['next','Next tab',['Ctrl+Tab']],['previous','Previous tab',['Ctrl+Shift+Tab']],['rename','Rename file',['F2']],
    ['findText','Find in file',['Ctrl+F']],['findReplace','Find and replace',['Ctrl+H']],['find','Find in open tabs',['Ctrl+Shift+F']],
    ['resultNext','Next search result',['F3','Ctrl+Alt+ArrowDown']],['resultPrevious','Previous search result',['Shift+F3','Ctrl+Alt+ArrowUp']],['openResult','Open selected search result',['F4']],
    ['findUsages','Find usages at cursor',['Alt+F7']],['toggleSpellcheck','Toggle spelling for this file',['F6']],
    ['complete','Show code suggestions',['Ctrl+Space'],'editor'],['toggleComment','Toggle comment',['Ctrl+/'],'editor'],['format','Format file',['Ctrl+Shift+L']],
    ['indent','Indent selected lines',['Tab'],'editor'],['outdent','Unindent selected lines',['Shift+Tab'],'editor'],
    ['undo','Undo',['Ctrl+Z'],'editor'],['redo','Redo',['Ctrl+Shift+Z','Ctrl+Y'],'editor'],
    ['zoomIn','Increase text size',['Ctrl+=','Ctrl+Shift+Plus','Ctrl+Plus']],['zoomOut','Decrease text size',['Ctrl+-']],['print','Print',['Ctrl+P']],
    ['fold','Collapse section',['Ctrl+Shift+['],'editor'],['unfold','Expand section',['Ctrl+Shift+]'],'editor'],
    ['foldAll','Collapse all sections',['Ctrl+Alt+Shift+['],'editor'],['unfoldAll','Expand all sections',['Ctrl+Alt+Shift+]'],'editor'],
    ['minimap','Show or hide minimap',[]],['wrap','Toggle word wrap',[]],['lineNumbers','Toggle line numbers for this file',[]],['versions','Version history',[]],
  ].map(([id,label,keys,scope='app'])=>({id,label,keys,scope}));
  let shortcutRecording=null;
  function normalizeShortcut(value){
    if(typeof value!=='string'||value.length>80)return null;
    const parts=value.split('+'),key=parts.pop(),modifiers=new Set(parts);
    if(!key||parts.some(part=>!['Ctrl','Alt','Shift'].includes(part))||modifiers.size!==parts.length)return null;
    const valid=/^(?:F(?:[1-9]|1\d|2[0-4])|Tab|Space|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Insert|Delete|Backspace|Plus|[A-Z0-9]|[^\w\s+])$/.test(key);
    if(!valid||(!modifiers.has('Ctrl')&&!modifiers.has('Alt')&&!/^(?:F\d+|Tab)$/.test(key)))return null;
    return [...['Ctrl','Alt','Shift'].filter(part=>modifiers.has(part)),key].join('+');
  }
  function eventShortcut(event){
    if(event.isComposing||event.getModifierState?.('AltGraph'))return null;
    let key=event.key;if(!key||['Control','Meta','Alt','Shift','Dead','Unidentified'].includes(key))return null;
    if(key===' ')key='Space';else if(key==='+')key='Plus';else if(key.length===1&&/[a-z]/i.test(key))key=key.toUpperCase();
    if(event.code==='BracketLeft'&&(event.ctrlKey||event.metaKey))key='[';if(event.code==='BracketRight'&&(event.ctrlKey||event.metaKey))key=']';
    if(event.code==='Slash'&&(event.ctrlKey||event.metaKey)&&!event.shiftKey)key='/';
    return normalizeShortcut([...(event.ctrlKey||event.metaKey?['Ctrl']:[]),...(event.altKey?['Alt']:[]),...(event.shiftKey?['Shift']:[]),key].join('+'));
  }
  function configuredShortcuts(id){
    const definition=shortcutDefinitions.find(item=>item.id===id);if(!definition)return [];
    const settings=state?.settings?.shortcutBindings,keys=settings&&Object.hasOwn(settings,id)?settings[id]:definition.keys;
    return Array.isArray(keys)?[...new Set(keys.map(normalizeShortcut).filter(Boolean))].slice(0,4):definition.keys;
  }
  function shortcutMatchesEvent(id,event){const key=eventShortcut(event);return Boolean(key&&configuredShortcuts(id).includes(key));}
  function shortcutLabel(key){return key.split('+').map(part=>part==='Plus'?'+':part==='Space'?'Space':part.replace('Arrow','')).join(' + ');}
  function shortcutText(id){const keys=configuredShortcuts(id);return keys.length?keys.map(shortcutLabel).join(' / '):'Unassigned';}
  function shortcutScope(definition){return definition.scope!=='editor'||document.activeElement===editor||$('foldGutter')?.contains(document.activeElement);}
  function shortcutConflict(id,keys){return shortcutDefinitions.find(item=>item.id!==id&&configuredShortcuts(item.id).some(key=>keys.includes(key)));}
  function setShortcutBinding(id,keys){
    if(!shortcutDefinitions.some(item=>item.id===id))return false;
    const normalized=[...new Set(keys.map(normalizeShortcut).filter(Boolean))],conflict=shortcutConflict(id,normalized);
    if(conflict){$('shortcutMessage').textContent=`Already assigned to “${conflict.label}”. Clear or change that shortcut first.`;return false;}
    const bindings={...(state.settings.shortcutBindings||{}),[id]:normalized},defaults=shortcutDefinitions.find(item=>item.id===id).keys;
    if(JSON.stringify(normalized)===JSON.stringify(defaults))delete bindings[id];
    state.settings.shortcutBindings=bindings;state.settings.shortcutsUpdatedAt=clock();
    shortcutRecording=null;$('shortcutMessage').textContent='Shortcut saved.';renderKeyboardShortcuts();refreshShortcutLabels();save();return true;
  }
  function refreshShortcutLabels(){
    document.querySelectorAll('[data-shortcut-label]').forEach(label=>label.textContent=configuredShortcuts(label.dataset.shortcutLabel).map(shortcutLabel).join(' / '));
  }
  function renderKeyboardShortcuts(){
    $('shortcutList').innerHTML=shortcutDefinitions.map(item=>{
      const assigned=configuredShortcuts(item.id),custom=state?.settings?.shortcutBindings&&Object.hasOwn(state.settings.shortcutBindings,item.id);
      return `<div class="shortcut-row"><span>${escape(item.label)}</span><button type="button" class="shortcut-key${shortcutRecording===item.id?' recording':''}" data-record-shortcut="${item.id}" aria-label="Change ${escape(item.label)} shortcut">${shortcutRecording===item.id?'Press keys…':escape(shortcutText(item.id))}</button><button type="button" class="shortcut-clear" data-clear-shortcut="${item.id}" aria-label="Clear ${escape(item.label)} shortcut"${assigned.length?'':' disabled'}>×</button><button type="button" class="shortcut-reset" data-reset-shortcut="${item.id}"${custom?'':' disabled'}>Reset</button></div>`;
    }).join('');
  }
  function showKeyboardShortcuts(){closeMenus();shortcutRecording=null;$('shortcutMessage').textContent='Click a shortcut, then press the keys you want to use.';renderKeyboardShortcuts();$('shortcutsDialog').showModal();}
  function runKeyboardShortcut(id){
    if(id!=='complete'&&typeof closeCompletions==='function')closeCompletions();
    if(id==='resultNext'||id==='resultPrevious'){
      const backwards=id==='resultPrevious';if(!$('findAllPanel').hidden)stepFindAllResult(backwards?-1:1);else if(!$('findBar').hidden)findMatches(true,backwards);else return false;return true;
    }
    if(id==='openResult'){if($('findAllPanel').hidden)return false;openFindAllResult();return true;}
    if(id==='indent'||id==='outdent'){if(editor.readOnly)return false;indentLines(id==='outdent');return true;}
    Promise.resolve(actions[id]?.()).catch(error=>toast(error.message));return true;
  }
  function dispatchKeyboardShortcut(event){
    if(event.defaultPrevented)return;
    if(shortcutRecording&&$('shortcutsDialog').open){
      event.preventDefault();event.stopImmediatePropagation();
      if(event.key==='Escape'){shortcutRecording=null;$('shortcutMessage').textContent='Change cancelled.';renderKeyboardShortcuts();return;}
      if((event.key==='Backspace'||event.key==='Delete')&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey){setShortcutBinding(shortcutRecording,[]);return;}
      const key=eventShortcut(event);if(key){setShortcutBinding(shortcutRecording,[key]);}else if(!['Control','Meta','Alt','Shift'].includes(event.key))$('shortcutMessage').textContent='Use a modifier such as Ctrl or Alt, a function key, or Tab.';
      return;
    }
    if(!ready||composing||event.isComposing||activityBlocked())return;
    const key=eventShortcut(event);if(!key)return;
    const definition=shortcutDefinitions.find(item=>shortcutScope(item)&&configuredShortcuts(item.id).includes(key));
    if(definition){
      if(event.repeat&&definition.id==='toggleSpellcheck'){event.preventDefault();return;}
      if(runKeyboardShortcut(definition.id)!==false){event.preventDefault();event.stopImmediatePropagation();}
    }else if((event.ctrlKey||event.metaKey)&&shortcutDefinitions.some(item=>shortcutScope(item)&&item.keys.includes(key))){
      // A reassigned app chord must not fall through to the browser's Save
      // Page or native textarea undo action.
      event.preventDefault();event.stopImmediatePropagation();
    }
  }
  function wireKeyboardShortcuts(){
    document.addEventListener('keydown',dispatchKeyboardShortcut,true);
    $('shortcutList').addEventListener('click',event=>{
      const record=event.target.closest('[data-record-shortcut]'),clear=event.target.closest('[data-clear-shortcut]'),reset=event.target.closest('[data-reset-shortcut]');
      if(record){shortcutRecording=record.dataset.recordShortcut;$('shortcutMessage').textContent='Press the shortcut. Escape cancels; Backspace clears it.';renderKeyboardShortcuts();$('shortcutList').querySelector(`[data-record-shortcut="${shortcutRecording}"]`)?.focus();}
      else if(clear)setShortcutBinding(clear.dataset.clearShortcut,[]);
      else if(reset){const id=reset.dataset.resetShortcut,defaults=shortcutDefinitions.find(item=>item.id===id).keys;if(setShortcutBinding(id,defaults)){$('shortcutMessage').textContent='Default shortcut restored.';}}
    });
    $('resetShortcutsButton').addEventListener('click',()=>{state.settings.shortcutBindings={};state.settings.shortcutsUpdatedAt=clock();shortcutRecording=null;$('shortcutMessage').textContent='All default shortcuts restored.';renderKeyboardShortcuts();refreshShortcutLabels();save();});
    $('shortcutsDialog').addEventListener('close',()=>shortcutRecording=null);
  }
