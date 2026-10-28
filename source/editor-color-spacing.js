  function planColorSpacing(text,mode){
    if(typeof findColorLiterals!=='function'||typeof CSS==='undefined')return [];
    const seen=new Set();return findColorLiterals(text,mode,isLiteralColor,0,10000).map(color=>{
      const quote=text[color.start-1],at=(quote==='"'||quote==="'")&&text[color.end]===quote?color.start-1:color.start;
      return {at,colorStart:color.start,text:'   '};
    }).filter(gap=>!seen.has(gap.at)&&seen.add(gap.at));
  }
  function addColorSpacing(projection,gaps){
    if(!gaps.length)return projection;
    let result='',cursor=0,added=0;const pads=[];
    for(const gap of gaps){
      if(projection.ranges.some(range=>gap.at>=range.from&&gap.at<range.to))continue;
      const baseAt=foldDisplayOffset(projection,gap.at);
      result+=projection.text.slice(cursor,baseAt)+gap.text;
      pads.push({...gap,baseAt,displayAt:baseAt+added,length:gap.text.length});added+=gap.text.length;cursor=baseAt;
    }
    return {...projection,text:result+projection.text.slice(cursor),pads};
  }
  function colorSpacingHTML(html,pads){
    if(!pads?.length)return html;
    let result='',at=0,index=0;
    for(const token of html.matchAll(/<[^>]*>|[^<]+/g)){
      if(token[0][0]==='<'){result+=token[0];continue;}
      const text=token[0].replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[key]);let cursor=0;
      while(index<pads.length&&pads[index].baseAt<=at+text.length){const pad=pads[index++],offset=Math.max(0,pad.baseAt-at);result+=escape(text.slice(cursor,offset))+pad.text;cursor=offset;}
      result+=escape(text.slice(cursor));at+=text.length;
    }
    while(index<pads.length)result+=pads[index++].text;
    return result;
  }
  function codeDisplayText(from,to){
    const projection=codeProjectionForCurrent();return projection.text.slice(foldDisplayOffset(projection,from,'left'),foldDisplayOffset(projection,to,'left'));
  }
  function codeDisplayColumn(lineStart,offset,bias='right'){
    const projection=codeProjectionForCurrent();return foldDisplayOffset(projection,offset,bias)-foldDisplayOffset(projection,lineStart,'left');
  }
