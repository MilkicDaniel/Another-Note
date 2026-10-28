  const htmlVoidNames=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  function sourceLineStarts(text){const starts=[0];for(let at=text.indexOf('\n');at>=0;at=text.indexOf('\n',at+1))starts.push(at+1);return starts;}
  function sourceLineAt(starts,at){let low=0,high=starts.length;while(low+1<high){const mid=(low+high)>>1;if(starts[mid]<=at)low=mid;else high=mid;}return low;}
  function sourceStructure(text,mode){
    if(mode==='text')return {text,mode,starts:[0],tags:[],regions:[]};
    const starts=sourceLineStarts(text),tags=[],regions=[];
    const region=(start,end,label,type='block',includeEnd=false)=>{
      const first=sourceLineAt(starts,start),last=sourceLineAt(starts,Math.max(start,end));
      const from=starts[first+1],to=includeEnd?(starts[last+1]??text.length):starts[last];
      if(from!==undefined&&to>from&&regions.length<20000)regions.push({key:`${type}:${start}:${end}`,start,end,from,to,first,last,label,type});
    };
    const quotedEnd=(at,quote,limit=text.length)=>{for(let i=at+1;i<limit;i++){if(text[i]==='\\'){i++;continue;}if(text[i]===quote)return i+1;}return limit;};
    function braces(from=0,to=text.length,language=mode){
      const stack=[];let previous='';
      for(let i=from;i<to;i++){
        const c=text[i],next=text[i+1];
        if(c==='"'||c==="'"||c==='`'){i=quotedEnd(i,c,to)-1;previous='v';continue;}
        if(c==='/'&&next==='/'&&language!=='json'){const end=text.indexOf('\n',i+2);i=end<0?to:end;continue;}
        if(c==='/'&&next==='*'){
          const found=text.indexOf('*/',i+2),end=found<0?to:Math.min(to,found+2);region(i,end-1,'Comment','comment',true);i=end-1;continue;
        }
        if(language==='javascript'&&c==='/'&&previous!== 'v'&&previous!==')'&&previous!==']'&&previous!=='}'){
          let j=i+1,group=false,closed=false;
          for(;j<to&&text[j]!=='\n';j++){if(text[j]==='\\'){j++;continue;}if(text[j]==='[')group=true;else if(text[j]===']')group=false;else if(text[j]==='/'&&!group){closed=true;break;}}
          if(closed){i=j;previous='v';continue;}
        }
        if(c==='{'||c==='[')stack.push({at:i,char:c});
        else if(c==='}'||c===']'){
          const expected=c==='}'?'{':'[',open=stack.at(-1);
          if(open?.char===expected){stack.pop();const lineStart=starts[sourceLineAt(starts,open.at)],label=text.slice(lineStart,open.at+1).trim().slice(0,90)||'Block';region(open.at,i,label,c==='}'?'block':'array');}
        }
        if(!/\s/.test(c))previous=/[\w$]/.test(c)?'v':c;
      }
    }
    function html(){
      const stack=[],byName=new Map();let i=0;
      while(i<text.length){
        const at=text.indexOf('<',i);if(at<0)break;
        if(text.startsWith('<!--',at)){const found=text.indexOf('-->',at+4),end=found<0?text.length:found+3;region(at,end-1,'HTML comment','comment',true);i=end;continue;}
        if(text.startsWith('<![CDATA[',at)){const found=text.indexOf(']]>',at+9);i=found<0?text.length:found+3;continue;}
        const match=/^<\s*(\/?)\s*([A-Za-z][\w:.-]*)\b/.exec(text.slice(at,at+256));
        if(!match){i=at+1;continue;}
        let end=at+match[0].length;for(;end<text.length;end++){if(text[end]==='"'||text[end]==="'")end=quotedEnd(end,text[end])-1;else if(text[end]==='>'){end++;break;}}
        if(text[end-1]!=='>')break;
        const name=match[2].toLowerCase(),nameStart=at+match[0].lastIndexOf(match[2]);
        const tag={start:at,end,nameStart,nameEnd:nameStart+match[2].length,name,closing:Boolean(match[1]),single:htmlVoidNames.has(name)||/\/\s*>$/.test(text.slice(at,end)),partner:null};tags.push(tag);
        if(tag.closing){
          const entry=byName.get(name);
          if(entry){while(stack.length>entry.index){const popped=stack.pop();if(popped.prior)byName.set(popped.tag.name,popped.prior);else byName.delete(popped.tag.name);}const open=entry.tag;open.partner=tag;tag.partner=open;region(open.start,tag.start,`<${name}>`,'tag');}
        }else if(!tag.single){
          const entry={tag,index:stack.length,prior:byName.get(name)};stack.push(entry);byName.set(name,entry);
          if(['script','style','textarea','title'].includes(name)){
            const pattern=new RegExp('</\\s*'+name+'\\s*>','ig');pattern.lastIndex=end;const close=pattern.exec(text);
            if(close){if(name==='script'||name==='style')braces(end,close.index,name==='script'?'javascript':'css');i=close.index;continue;}
            i=text.length;continue;
          }
        }
        i=end;
      }
    }
    function python(){
      const stack=[];let last=0,triple=null,tripleStart=0,depth=0;
      const finish=(entry,end)=>region(starts[entry.line],Math.max(starts[entry.line],(starts[end+1]??text.length)-1),entry.label,'indent',true);
      for(let line=0;line<starts.length;line++){
        const start=starts[line],raw=text.slice(start,starts[line+1]??text.length),indent=raw.match(/^[ \t]*/)[0].replace(/\t/g,'        ').length;
        let clean='',inTriple=Boolean(triple);
        for(let i=0;i<raw.length;i++){
          if(triple){const end=raw.indexOf(triple,i);if(end<0)break;region(tripleStart,start+end+2,'Docstring','comment',true);i=end+2;triple=null;clean+='v';continue;}
          const c=raw[i];if(c==='#')break;
          if(c==='"'||c==="'"){
            if(raw.slice(i,i+3)===c.repeat(3)){triple=c.repeat(3);tripleStart=start+i;inTriple=true;clean+='v';i+=2;continue;}
            const quote=c;for(i++;i<raw.length;i++){if(raw[i]==='\\')i++;else if(raw[i]===quote)break;}clean+='v';continue;
          }
          clean+=c;
        }
        if(!clean.trim()){if(inTriple)last=line;continue;}
        if(depth===0){while(stack.length&&indent<=stack.at(-1).indent)finish(stack.pop(),last);if(/:\s*$/.test(clean))stack.push({line,indent,label:raw.trim().slice(0,90)});}
        for(const c of clean){if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth=Math.max(0,depth-1);}
        last=line;
      }
      while(stack.length)finish(stack.pop(),last);
    }
    function bash(){
      const stack=[];let quote=null;
      for(let line=0;line<starts.length;line++){
        const start=starts[line],raw=text.slice(start,starts[line+1]??text.length);let clean='';
        for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='\\'){i++;clean+=' ';continue;}if(quote){if(c===quote)quote=null;continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='#'&&(i===0||/\s/.test(raw[i-1])))break;clean+=c;}
        const tokens=clean.match(/\b(?:if|fi|for|while|until|select|do|done|case|esac)\b|[{}]/g)||[];
        for(const token of tokens){
          const type=token==='if'?'fi':token==='case'?'esac':token==='do'?'done':token==='{'?'}':null;
          if(type){stack.push({type,at:start,label:raw.trim().slice(0,90)});continue;}
          if(['fi','esac','done','}'].includes(token)){const open=stack.at(-1);if(open?.type===token){stack.pop();region(open.at,start,open.label,'shell');}}
        }
      }
    }
    function markdown(){
      const headings=[];let fence=null;
      for(let line=0;line<starts.length;line++){
        const raw=text.slice(starts[line],starts[line+1]??text.length),code=/^\s{0,3}(`{3,}|~{3,})/.exec(raw);
        if(code){if(!fence)fence={line,mark:code[1][0],width:code[1].length};else if(code[1][0]===fence.mark&&code[1].length>=fence.width){region(starts[fence.line],starts[line],'Code block','fence');fence=null;}continue;}
        if(fence)continue;const heading=/^\s{0,3}(#{1,6})\s+(.+)/.exec(raw);if(!heading)continue;
        while(headings.length&&headings.at(-1).level>=heading[1].length){const open=headings.pop();region(starts[open.line],Math.max(0,starts[line]-1),open.label,'heading',true);}
        headings.push({line,level:heading[1].length,label:heading[2].trim().slice(0,90)});
      }
      while(headings.length){const open=headings.pop();region(starts[open.line],Math.max(0,text.length-1),open.label,'heading',true);}
    }
    if(mode==='html')html();else if(['javascript','java','json','css'].includes(mode))braces();else if(mode==='python')python();else if(mode==='bash')bash();else if(mode==='markdown')markdown();
    regions.sort((a,b)=>a.start-b.start||b.end-a.end);
    return {text,mode,starts,tags,regions};
  }
  function matchingHtmlTagRanges(structure,offset){
    if(structure.mode!=='html')return [];
    const tag=structure.tags.find(tag=>offset>=tag.start&&offset<tag.end);
    return tag?.partner?[tag,tag.partner].sort((a,b)=>a.nameStart-b.nameStart).map(item=>({start:item.nameStart,end:item.nameEnd})):[];
  }
  function foldProjection(text,ranges){
    const visible=[];let end=-1;
    for(const range of [...ranges].sort((a,b)=>a.from-b.from||b.to-a.to))if(range.from>=end&&range.to>range.from){visible.push(range);end=range.to;}
    let projected='',cursor=0;for(const range of visible){projected+=text.slice(cursor,range.from);cursor=range.to;}projected+=text.slice(cursor);
    return {text:projected,ranges:visible};
  }
  function foldSourceOffset(projection,offset,bias='right'){
    const pads=projection.pads||[];let low=0,high=pads.length;while(low<high){const mid=(low+high)>>1;if(pads[mid].displayAt<=offset)low=mid+1;else high=mid;}
    if(low){const pad=pads[low-1];offset=offset<=pad.displayAt+pad.length?pad.baseAt:offset-(pad.displayAt+pad.length-pad.baseAt);}
    let removed=0;for(const range of projection.ranges){const at=range.from-removed;if(offset<at||offset===at&&bias==='left')break;removed+=range.to-range.from;}return offset+removed;
  }
  function foldDisplayOffset(projection,offset,bias='right'){
    let removed=0;for(const range of projection.ranges){if(offset<range.from)break;if(offset<range.to){offset=range.from;break;}removed+=range.to-range.from;}offset-=removed;
    const pads=projection.pads||[];let low=0,high=pads.length;while(low<high){const mid=(low+high)>>1;if(pads[mid].baseAt<offset||pads[mid].baseAt===offset&&bias!=='left')low=mid+1;else high=mid;}
    if(low){const pad=pads[low-1];offset+=pad.displayAt+pad.length-pad.baseAt;}return offset;
  }
  function projectFoldedHTML(html,projection){
    if(!projection.ranges.length)return typeof colorSpacingHTML==='function'?colorSpacingHTML(html,projection.pads):html;let at=0,index=0,result='';
    for(const token of html.matchAll(/<[^>]*>|[^<]+/g)){
      const piece=token[0];if(piece[0]==='<'){result+=piece;continue;}
      const text=piece.replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[key]);
      let cursor=0;while(index<projection.ranges.length){const range=projection.ranges[index];if(range.to<=at){index++;continue;}if(range.from>=at+text.length)break;
        const from=Math.max(0,range.from-at),to=Math.min(text.length,range.to-at);result+=escape(text.slice(cursor,from));cursor=to;if(range.to<=at+text.length)index++;else break;
      }
      result+=escape(text.slice(cursor));at+=text.length;
    }
    return typeof colorSpacingHTML==='function'?colorSpacingHTML(result,projection.pads):result;
  }
