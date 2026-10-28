// Installed before the editor's startup theme and native bridge detection.
(() => {
  'use strict';
  const queued=[];
  function send(text){
    const id=JSON.parse(text).id;
    window.pywebview.api.dispatch(text).then(reply=>window.vistaNotesNativeResult?.(id,reply.result,reply.error)).catch(error=>window.vistaNotesNativeResult?.(id,null,String(error)));
  }
  window.webkit={messageHandlers:{vistaNotes:{postMessage(text){if(window.pywebview?.api?.dispatch)send(text);else queued.push(text);}}}};
  function host(command,extra={}){if(window.pywebview?.api?.dispatch)window.pywebview.api.dispatch(JSON.stringify({id:'windows-event',command,...extra})).catch(()=>{});}
  function geometry(){host('geometry',{width:innerWidth,height:innerHeight});}
  window.addEventListener('pywebviewready',()=>{for(const text of queued.splice(0))send(text);geometry();host('title',{title:document.title});});
  window.addEventListener('resize',geometry);
  document.addEventListener('DOMContentLoaded',()=>{const title=document.querySelector('title');if(title)new MutationObserver(()=>host('title',{title:document.title})).observe(title,{childList:true,subtree:true,characterData:true});});
})();
