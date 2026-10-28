'use strict';
const RESULT_LIMIT=100000;
function patternFor(query,regex,matchCase){return new RegExp(regex?query:query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gmu'+(matchCase?'':'i'));}
function lineStarts(text){const result=[0];for(let i=text.indexOf('\n');i!==-1;i=text.indexOf('\n',i+1))result.push(i+1);return result;}
function lineAt(starts,offset){let low=0,high=starts.length;while(low+1<high){const mid=(low+high)>>1;if(starts[mid]<=offset)low=mid;else high=mid;}return low;}
function run(data){
  if(data.op==='references'){
    const index=new Map();for(const source of data.sources)index.set(source.id,referenceTokens(source.content,source.mode,0,data.reference.name));
    const symbol=resolveReferenceSymbol(data.reference,data.sources,index),result={symbol,sources:data.sources,groups:[],results:[],total:0,truncated:false};
    for(let i=0;i<data.sources.length;i++){
      const source=data.sources[i],group={source,matches:[],total:0};
      for(const token of index.get(source.id)){
        if(token.name!==symbol.name||(symbol.kind==='function'||symbol.kind==='type'?token.kind!=='code':token.kind!==symbol.kind))continue;
        group.total++;result.total++;
        if(result.results.length>=RESULT_LIMIT){result.truncated=true;continue;}
        source.lineStarts ||= lineStarts(source.content);const lineIndex=lineAt(source.lineStarts,token.start);
        const item={index:result.results.length,source,start:token.start,end:token.end,line:lineIndex+1,column:token.start-source.lineStarts[lineIndex]+1};group.matches.push(item);result.results.push(item);
      }
      if(group.total)result.groups.push(group);self.postMessage({progress:{files:i+1,totalFiles:data.sources.length,matches:result.total}});
    }
    return result;
  }
  const pattern=patternFor(data.query,data.regex,data.matchCase);
  if(data.op==='all'){
    const result={sources:data.sources,groups:[],results:[],total:0,truncated:false};
    for(let i=0;i<data.sources.length;i++){
      const source=data.sources[i],from=data.range?.start||0,to=data.range?.end??source.content.length,group={source,matches:[],total:0};
      for(const match of source.content.slice(from,to).matchAll(pattern)){
        group.total++;result.total++;
        if(result.results.length<RESULT_LIMIT){
          source.lineStarts ||= lineStarts(source.content);
          const start=from+match.index,lineIndex=lineAt(source.lineStarts,start);
          const item={index:result.results.length,source,start,end:start+match[0].length,line:lineIndex+1,column:start-source.lineStarts[lineIndex]+1};
          group.matches.push(item);result.results.push(item);
        }else result.truncated=true;
      }
      if(group.total)result.groups.push(group);
      self.postMessage({progress:{files:i+1,totalFiles:data.sources.length,matches:result.total}});
    }
    return result;
  }
  const text=data.text,offset=data.offset||0;
  if(data.op==='matches'||data.op==='occurrences'){
    const matches=[];let total=0;
    const wordStart=/^[\p{L}\p{N}_$]/u.test(data.query),wordEnd=/[\p{L}\p{N}_$]$/u.test(data.query);
    for(const match of text.matchAll(pattern)){
      const start=match.index,end=start+match[0].length;
      if(data.op==='occurrences'&&(wordStart&&/[\p{L}\p{N}_$]$/u.test(text.slice(Math.max(0,start-2),start))||wordEnd&&/^[\p{L}\p{N}_$]/u.test(text.slice(end,end+2))))continue;
      total++;if(matches.length<RESULT_LIMIT)matches.push({start:offset+start,end:offset+end});
    }
    return {matches,total,truncated:total>matches.length};
  }
  const substitute=data.regex?data.replacement:()=>data.replacement;
  if(data.op==='replaceAll'){
    let count=0;for(const _ of text.matchAll(pattern))count++;
    return {body:text.replace(pattern,substitute),count};
  }
  if(data.op==='replaceOne'){
    let first=null,target=null;
    for(const match of text.matchAll(pattern)){
      const item={start:match.index,end:match.index+match[0].length};first ||= item;
      if(item.start>=data.cursor){target=item;break;}
    }
    target ||= first;if(!target)return {count:0};
    const sticky=new RegExp(pattern.source,pattern.flags.replace('g','y'));sticky.lastIndex=target.start;
    const body=text.replace(sticky,substitute),length=body.length-text.length+target.end-target.start;
    const inserted=body.slice(target.start,target.start+length),end=target.start+inserted.length;
    let resume=end;if(target.start===target.end)resume+=(body.codePointAt(end)||0)>65535?2:1;
    return {count:1,target:{start:target.start+offset,end:target.end+offset},inserted,resume:resume+offset};
  }
  throw new Error('Unsupported search operation.');
}
self.onmessage=event=>{try{self.postMessage({result:run(event.data)});}catch(error){self.postMessage({error:error.message});}};
