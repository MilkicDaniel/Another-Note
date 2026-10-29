  const selectControls=new Map();
  function popupPosition(anchor,width,height,viewportWidth,viewportHeight,side=false){
    const gap=8,maxX=Math.max(gap,viewportWidth-width-gap),maxY=Math.max(gap,viewportHeight-height-gap);
    let left=side?anchor.right-2:anchor.left,top=side?anchor.top:anchor.bottom+3;
    if(side&&left+width>viewportWidth-gap)left=anchor.left-width+2;
    if(!side&&top+height>viewportHeight-gap)top=anchor.top-height-3;
    return {left:Math.max(gap,Math.min(maxX,left)),top:Math.max(gap,Math.min(maxY,top))};
  }
  function positionPopup(popup,trigger,side=false){
    popup.style.left='0px';popup.style.top='0px';popup.style.right='auto';popup.style.bottom='auto';
    const rect=popup.getBoundingClientRect(),position=popupPosition(trigger.getBoundingClientRect(),rect.width,rect.height,innerWidth,innerHeight,side);
    popup.style.left=`${position.left}px`;popup.style.top=`${position.top}px`;
  }
  function popupItems(popup){return [...popup.querySelectorAll('button')].filter(button=>!button.disabled&&!button.hidden&&button.closest('.menu-popover')===popup);}
  function closeSubmenus(){
    document.querySelectorAll('.submenu-popover').forEach(popup=>popup.hidden=true);
    document.querySelectorAll('[data-submenu]').forEach(trigger=>trigger.setAttribute('aria-expanded','false'));
  }
  function closeMenus(){
    if(typeof dismissEditorContextMenu==='function')dismissEditorContextMenu();
    document.querySelectorAll('.menu-popover').forEach(popup=>{if(popup.getAttribute('popover')!==null)popup.hidePopover?.();popup.hidden=true;});
    document.querySelectorAll('.menu-trigger,.tab-dropdown,[data-submenu],.select-trigger').forEach(trigger=>trigger.setAttribute('aria-expanded','false'));
  }
  function wirePopupKeys(popup,trigger,submenu=false){
    popup.addEventListener('keydown',event=>{
      if(event.defaultPrevented)return;
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();event.stopPropagation();const items=popupItems(popup);if(!items.length)return;
        const index=items.indexOf(document.activeElement);
        const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        if(!submenu)closeSubmenus();
        items[next].focus();
      }else if(event.key==='Escape'||(submenu&&event.key==='ArrowLeft')){
        event.preventDefault();event.stopPropagation();
        if(submenu)closeSubmenus();else closeMenus();trigger.focus();
      }
    });
  }
  function openRecentSubmenu(focus=false){
    if(typeof deferredWorkspace!=='undefined'&&deferredWorkspace){loadDeferredWorkspace().then(()=>openRecentSubmenu(focus)).catch(error=>toast(error.message));return;}
    refreshRecentOpenTabs();
    if(!ready)return;
    const trigger=$('recentMenuTrigger'),popup=$('recentFilesMenu'),parent=trigger.closest('.menu');
    const parentPopup=trigger.closest('.menu-popover');
    if(parentPopup.hidden){closeMenus();parentPopup.hidden=false;parent.firstElementChild.setAttribute('aria-expanded','true');positionPopup(parentPopup,parent.firstElementChild);}
    closeSubmenus();renderRecentFiles();popup.hidden=false;trigger.setAttribute('aria-expanded','true');positionPopup(popup,trigger,true);
    if(focus)(popupItems(popup)[0]||popup).focus();
  }
  function syncSelectControls(){
    for(const [select,control] of selectControls){
      const {trigger,options}=control;
      const signature=JSON.stringify([...select.options].map(option=>[option.value,option.textContent,option.disabled]));
      if(control.signature!==signature){
        control.signature=signature;options.innerHTML='';
        for(const option of select.options){
          const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.dataset.selectValue=option.value;button.textContent=option.textContent;button.disabled=option.disabled;
          button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));closeMenus();trigger.focus();});options.append(button);
        }
      }
      const option=[...select.options].find(item=>item.value===select.value);
      trigger.querySelector('.select-label').textContent=option?.textContent||'';
      trigger.disabled=select.disabled;
      for(const button of options.querySelectorAll('[role="option"]')){
        const selected=button.dataset.selectValue===select.value;button.setAttribute('aria-selected',String(selected));button.classList.toggle('active',selected);
      }
      if(select.disabled){if(options.getAttribute('popover')!==null)options.hidePopover?.();options.hidden=true;trigger.setAttribute('aria-expanded','false');}
    }
  }
  function wireSelectControls(){
    document.querySelectorAll('#language,#tabSize,#findAllScope,#sortBy,#colorFormat,#colorOccurrence').forEach(select=>{
      const control=document.createElement('div');control.className='select-control';
      const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.id=`${select.id}Trigger`;
      trigger.setAttribute('aria-label',select.getAttribute('aria-label')||'Search scope');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',`${select.id}Options`);
      trigger.innerHTML='<span class="select-label"></span><svg aria-hidden="true"><use href="#i-chevron"/></svg>';
      const options=document.createElement('div');options.id=`${select.id}Options`;options.className='menu-popover select-options';options.hidden=true;options.setAttribute('role','listbox');options.setAttribute('aria-labelledby',trigger.id);
      if(select.closest('dialog')&&typeof options.showPopover==='function')options.setAttribute('popover','manual');
      select.before(control);control.append(select,trigger,options);select.hidden=true;select.tabIndex=-1;selectControls.set(select,{trigger,options});
      document.querySelector(`label[for="${select.id}"]`)?.setAttribute('for',trigger.id);
      const open=()=>{if(select.disabled)return;closeMenus();syncSelectControls();options.hidden=false;if(options.getAttribute('popover'))options.showPopover();trigger.setAttribute('aria-expanded','true');positionPopup(options,trigger);};
      trigger.addEventListener('click',()=>{if(options.hidden)open();else closeMenus();});
      trigger.addEventListener('keydown',event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
          event.preventDefault();open();const items=popupItems(options),selected=items.find(button=>button.dataset.selectValue===select.value);(selected||items[event.key==='ArrowDown'?0:items.length-1])?.focus();
        }
      });
      options.addEventListener('keydown',event=>{
        if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key!==' '){
          const items=popupItems(options),index=items.indexOf(document.activeElement);
          const ordered=[...items.slice(index+1),...items.slice(0,index+1)];
          const match=ordered.find(button=>button.textContent.toLowerCase().startsWith(event.key.toLowerCase()));if(match){event.preventDefault();match.focus();}
        }
      });
      wirePopupKeys(options,trigger);select.addEventListener('change',syncSelectControls);
    });
    syncSelectControls();
  }
  function wireMenus(){
    document.querySelectorAll('.menu').forEach(menu=>{
      const trigger=menu.firstElementChild,popup=menu.querySelector('.menu-popover');
      const open=()=>{closeMenus();popup.hidden=false;trigger.setAttribute('aria-expanded','true');positionPopup(popup,trigger);};
      trigger.addEventListener('click',()=>{if(popup.hidden)open();else closeMenus();});
      trigger.addEventListener('pointerenter',event=>{
        if(event.pointerType==='touch'||!popup.hidden||![...document.querySelectorAll('.menu')].some(item=>!item.querySelector('.menu-popover').hidden))return;
        const focusInMenu=Boolean(document.activeElement?.closest('.menu'));
        open();if(focusInMenu)trigger.focus({preventScroll:true});
      });
      trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();if(popup.hidden)trigger.click();popupItems(popup)[0]?.focus();}});
      wirePopupKeys(popup,trigger);
    });
    const trigger=$('recentMenuTrigger'),popup=$('recentFilesMenu'),parent=trigger.closest('.menu-popover');
    trigger.addEventListener('click',()=>{if(popup.hidden)openRecentSubmenu(true);else closeSubmenus();});
    trigger.addEventListener('pointerenter',()=>openRecentSubmenu());
    trigger.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();openRecentSubmenu(true);}});
    parent.addEventListener('pointermove',event=>{const button=event.target.closest('button');if(button&&button!==trigger&&button.closest('.menu-popover')===parent)closeSubmenus();});
    parent.addEventListener('pointerleave',event=>{if(!parent.contains(event.relatedTarget))closeSubmenus();});
    wirePopupKeys(popup,trigger,true);wireSelectControls();
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('.menu,.menu-popover,.select-control'))closeMenus();});
    window.addEventListener('resize',closeMenus);
    document.addEventListener('scroll',event=>{const target=event.target;if(!target.closest?.('.menu-popover'))closeMenus();else if(target===parent)closeSubmenus();},true);
  }
