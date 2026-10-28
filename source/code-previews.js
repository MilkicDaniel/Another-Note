  const previewSyntaxCache=new Map();
  function decodeSyntaxText(text){return text.replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[name]);}
  function syntaxRuns(html,base=0){
    const runs=[],classes=[];let offset=base;
    for(const token of html.matchAll(/<[^>]*>|[^<]+/g)){
      const piece=token[0];
      if(piece[0]==='<'){
        if(/^<span\b/.test(piece))classes.push(piece.match(/class="([^"]*)"/)?.[1]||'');
        else if(piece==='</span>')classes.pop();
      }else{const text=decodeSyntaxText(piece);runs.push({start:offset,end:offset+text.length,text,kind:classes.findLast(name=>name.startsWith('tok-'))||''});offset+=text.length;}
    }
    return runs;
  }
  function previewRuns(source,from=0,to=source.content.length){
    const text=source.content,key=source.id||'preview';let entry=previewSyntaxCache.get(key);
    if(!entry||entry.text!==text||entry.mode!==source.mode||from<entry.from||to>entry.to){
      // Small files share a cached syntax snapshot; large files only color a
      // bounded neighborhood, keeping previews independent of document size.
      const full=text.length<=250000,start=full?0:Math.max(0,from-4000),end=full?text.length:Math.min(text.length,to+1000);
      const cached=typeof editorSyntax!=='undefined'&&editorSyntax.text===text&&editorSyntax.mode===source.mode&&full?editorSyntax.html:null;
      entry={text,mode:source.mode,from:start,to:end,runs:syntaxRuns(cached??colorCode(text.slice(start,end),source.mode),start)};
      previewSyntaxCache.delete(key);previewSyntaxCache.set(key,entry);if(previewSyntaxCache.size>4)previewSyntaxCache.delete(previewSyntaxCache.keys().next().value);
    }
    let low=0,high=entry.runs.length;while(low<high){const mid=(low+high)>>1;if(entry.runs[mid].end<=from)low=mid+1;else high=mid;}
    const result=[];
    for(let i=low;i<entry.runs.length&&entry.runs[i].start<to;i++){const run=entry.runs[i],start=Math.max(from,run.start),end=Math.min(to,run.end);if(end>start)result.push({...run,start,end,text:text.slice(start,end)});}
    return result;
  }
  function previewCodeHTML(source,from,to,match=null){
    let html='';
    for(const run of previewRuns(source,from,to)){
      const cuts=[run.start,run.end];if(match){if(match.start>run.start&&match.start<run.end)cuts.push(match.start);if(match.end>run.start&&match.end<run.end)cuts.push(match.end);}cuts.sort((a,b)=>a-b);
      for(let i=0;i<cuts.length-1;i++){
        const start=cuts[i],end=cuts[i+1];let piece=escape(source.content.slice(start,end));
        if(run.kind)piece=`<span class="${run.kind}">${piece}</span>`;
        if(match&&start<match.end&&end>match.start)piece=`<mark>${piece}</mark>`;html+=piece;
      }
    }
    if(match&&match.start===match.end&&match.start>=from&&match.start<=to){
      const before=previewCodeHTML(source,from,match.start),after=previewCodeHTML(source,match.start,to);return before+'<mark>│</mark>'+after;
    }
    return html;
  }
