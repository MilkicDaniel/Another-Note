  const openingEditorLinks=new Set();
  function decodeLinkEntities(value){
    return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,entity=>{
      const named={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'},lower=entity.toLowerCase();
      if(named[lower])return named[lower];
      const code=lower.startsWith('&#x')?parseInt(lower.slice(3,-1),16):parseInt(lower.slice(2,-1),10);
      return code>0&&code<=0x10ffff?String.fromCodePoint(code):entity;
    });
  }
  function editorLinkValue(value,mode){
    value=value.trim();if(mode==='html')value=decodeLinkEntities(value);
    if(!value||value.length>8192||/[\x00-\x1f\x7f]/.test(value)||value.includes('${'))return null;
    if(/^(?:https?:\/\/|www\.|\/\/)/i.test(value)){
      try{const url=new URL(/^www\./i.test(value)?'https://'+value:value.startsWith('//')?'https:'+value:value);return ['https:','http:'].includes(url.protocol)&&url.hostname&&!/\s/.test(value)?url.href:null;}catch(_){return null;}
    }
    if(/^[a-z][\w+.-]*:/i.test(value)&&!/^file:\/\//i.test(value)&&!(/^[a-z]:[\\/]/i.test(value)))return null;
    const path=value.split(/[?#]/,1)[0];if(!path)return null;
    if(/^(?:file:\/\/|\.{1,2}[\\/]|[\\/]|~[\\/]|[a-z]:[\\/])/i.test(path))return value;
    return /\.(?:css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|html?|json|xml|svg|py|java|sh|bash|md|txt|csv|ya?ml|toml|ini|conf|sql|vue|svelte|go|rs|rb|php|c|h|cpp|hpp|properties|env|vnotes|png|jpe?g|gif|webp|bmp|ico|avif|heic|heif|tiff?|jxl|jp2)$/i.test(path)?value:null;
  }
  function trimLinkPunctuation(value){
    value=value.replace(/[.,;:!?]+$/,'');
    for(const [left,right]of [['(',')'],['[',']'],['{','}']])while(value.endsWith(right)&&value.split(right).length>value.split(left).length)value=value.slice(0,-1);
    return value;
  }
  function editorLinkAt(text,offset,mode='text'){
    if(!Number.isInteger(offset)||offset<0||offset>=text.length)return null;
    const start=text.lastIndexOf('\n',offset-1)+1,end=text.indexOf('\n',offset),line=text.slice(start,end<0?text.length:end),at=offset-start;
    if(line.length>200000)return null;
    const candidate=(value,a,b)=>{const reference=editorLinkValue(value,mode);return reference&&at>=a&&at<b?{reference,start:start+a,end:start+b}:null;};
    // Quotes preserve spaces in local paths and parentheses in URLs.
    for(const match of line.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)){
      const value=match[1]??match[2]??match[3],a=match.index+1,b=a+value.length;
      if(at>=a&&at<b)return candidate(value,a,b);
    }
    if(mode==='markdown')for(const match of line.matchAll(/\[([^\]\n]+)\]\(<?([^\s<>]+?)>?(?:\s+["'][^"']*["'])?\)/g)){
      if(at>=match.index&&at<match.index+match[0].length){const link=candidate(match[2],match.index,match.index+match[0].length);if(link)return link;}
    }
    for(const match of line.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)){
      const value=trimLinkPunctuation(match[0]),link=candidate(value,match.index,match.index+value.length);if(link)return link;
    }
    // Covers unquoted HTML attributes, CSS url(), imports and plain file paths.
    for(const match of line.matchAll(/(?:file:\/\/|[a-z]:[\\/]|\.{1,2}[\\/]|[\\/])?[^\s<>"'`()=,;{}\[\]]+/gi)){
      const value=trimLinkPunctuation(match[0]),link=candidate(value,match.index,match.index+value.length);if(link)return link;
    }
    return null;
  }
  function localLinkPath(reference){
    const raw=reference.replace(/^file:\/\/(?:localhost)?/i,'').split(/[?#]/,1)[0];
    try{return decodeURIComponent(raw).replace(/\\/g,'/');}catch(_){throw new Error('The file link contains an invalid encoded path.');}
  }
  function linkPathParts(base,path){
    const parts=[...base];for(const part of path.split('/')){
      if(!part||part==='.')continue;if(part==='..'){if(!parts.length)return null;parts.pop();}else parts.push(part);
    }return parts;
  }
  function browserOpenLinkFile(source,path){
    const absolute=/^(?:\/|~\/|[a-z]:\/)/i.test(path),name=path.split('/').at(-1);
    if(absolute)return null;
    const full=source.folderPath?linkPathParts(source.folderPath.replace(/\\/g,'/').split('/'),path)?.join('/'):null;
    const matches=openFiles().filter(file=>full?file.folderPath&&file.folderPath.replace(/\\/g,'/')+'/'+file.title===full:!path.replace(/^\.\//,'').includes('/')&&file.title===name);
    return matches.length===1?matches[0]:null;
  }
  function isImageFileLink(name){return /\.(?:png|jpe?g|gif|webp|bmp|ico|avif|heic|heif|tiff?|jxl|jp2|svg)$/i.test(String(name).split(/[?#]/,1)[0]);}
  async function readBrowserLinkHandle(handle){
    if(!isImageFileLink(handle.name))return readBrowserFile(handle);
    return {imageFile:await handle.getFile(),name:handle.name};
  }
  async function presentBrowserLinkEntry(entry){
    if(entry.imageFile){
      const type=entry.imageFile.type||(entry.name.toLowerCase().endsWith('.svg')?'image/svg+xml':'application/octet-stream'),url=URL.createObjectURL(new Blob([entry.imageFile],{type})),link=document.createElement('a');
      const viewer=URL.createObjectURL(new Blob([`<!doctype html><meta http-equiv="Content-Security-Policy" content="sandbox; default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'"><title>${escape(entry.name)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#191e23}img{display:block;max-width:100%;max-height:100vh;object-fit:contain}</style><img src="${url}" alt="${escape(entry.name)}">`],{type:'text/html'}));
      link.href=viewer;link.target='_blank';link.rel='noopener noreferrer';document.body.append(link);link.click();link.remove();setTimeout(()=>{URL.revokeObjectURL(viewer);URL.revokeObjectURL(url);},60000);return;
    }
    revealOpenedFiles(await importEntries([entry],true));
  }
  async function readLinkedBrowserFile(folder,parts){
    if(!parts?.length)throw new Error('Choose a parent folder containing both this file and the linked file.');
    if(folder.queryPermission&&await folder.queryPermission({mode:'read'})!=='granted'&&(!folder.requestPermission||await folder.requestPermission({mode:'read'})!=='granted'))throw new Error('Read access was not granted.');
    let parent=folder;for(const part of parts.slice(0,-1))parent=await parent.getDirectoryHandle(part);
    return readBrowserLinkHandle(await parent.getFileHandle(parts.at(-1)));
  }
  async function openLinkedBrowserFile(reference,source){
    const path=localLinkPath(reference),existing=browserOpenLinkFile(source,path);
    if(existing&&!isImageFileLink(path)){trashView=false;selectNote(existing.id,true);return;}
    if(existing&&isImageFileLink(path)&&browserFileHandles.has(existing.id))return presentBrowserLinkEntry(await readBrowserLinkHandle(browserFileHandles.get(existing.id)));
    const absolute=/^(?:\/|~\/|[a-z]:\/)/i.test(path),sourceHandle=browserFileHandles.get(source.id);
    if(!absolute&&sourceHandle){
      for(const folder of browserFolderHandles.values()){
        let relative;try{relative=await folder.resolve(sourceHandle);}catch(_){continue;}
        if(!relative?.length)continue;const parts=linkPathParts(relative.slice(0,-1),path);if(!parts)continue;
        const entry=await readLinkedBrowserFile(folder,parts);await presentBrowserLinkEntry(entry);return;
      }
    }
    if(!absolute&&typeof window.showDirectoryPicker==='function'){
      toast('Choose the folder containing this file, or a parent folder, to open its linked file.');
      const folder=await window.showDirectoryPicker({id:'another-note-links',mode:'read'});
      const relative=sourceHandle?await folder.resolve(sourceHandle):[source.title];
      if(!relative?.length)throw new Error('Choose a folder containing the current file.');
      await rememberBrowserFolder(folder);
      const entry=await readLinkedBrowserFile(folder,linkPathParts(relative.slice(0,-1),path));await presentBrowserLinkEntry(entry);return;
    }
    if(typeof window.showOpenFilePicker==='function'){
      toast('Choose the linked file to open it in a tab.');
      const [handle]=await window.showOpenFilePicker({multiple:false});if(handle)await presentBrowserLinkEntry(await readBrowserLinkHandle(handle));return;
    }
    throw new Error('This browser requires you to open local files with File → Open Files first. Desktop versions open them directly.');
  }
  async function openEditorLink(link,source){
    if(!source||startupBlocked||activityBlocked())return;
    const key=source.id+'\n'+link.reference;if(openingEditorLinks.has(key))return;openingEditorLinks.add(key);closeCompletions();
    try{
      if(native){const result=await request('open_link',{reference:link.reference,fileKey:source.fileKey||null});if(result.file)revealOpenedFiles(await importEntries([result.file],true));}
      else if(/^https?:\/\//i.test(link.reference))window.open(link.reference,'_blank','noopener,noreferrer');
      else await openLinkedBrowserFile(link.reference,{...source});
    }catch(error){if(error.name!=='AbortError'&&error.message!=='Cancelled')toast(`Could not open link. ${error.message}`,6500);}
    finally{openingEditorLinks.delete(key);}
  }
  function wireEditorLinks(){
    let point=null,frame=0;
    function clear(){point=null;editor.classList.remove('link-pointer');}
    function hover(){frame=0;if(!point)return;const offset=editorOffsetAtPoint(point.x,point.y),link=offset===null?null:editorLinkAt(editor.value,offset,note()?.mode);editor.classList.toggle('link-pointer',Boolean(link));}
    function move(event){
      const scrollbar=editorScrollbarAtPoint(event.clientX,event.clientY);editor.classList.toggle('scrollbar-pointer',scrollbar);
      if(scrollbar||!(event.ctrlKey||event.metaKey)||event.buttons||activityBlocked()){clear();return;}
      point={x:event.clientX,y:event.clientY};if(!frame)frame=requestAnimationFrame(hover);
    }
    editor.addEventListener('pointermove',move);editor.addEventListener('pointerenter',move);editor.addEventListener('pointerdown',move);
    editor.addEventListener('pointerleave',()=>{clear();editor.classList.remove('scrollbar-pointer');});document.addEventListener('keyup',event=>{if(!event.ctrlKey&&!event.metaKey)clear();});window.addEventListener('blur',clear);
  }
  function editorScrollbarAtPoint(x,y){
    const r=editor.getBoundingClientRect();return x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom&&(x>=r.left+editor.clientWidth||y>=r.top+editor.clientHeight);
  }
