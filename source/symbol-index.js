'use strict';
// A small lexical reference scanner. All-file scans run in the search worker;
// no project index or language server is created at editor startup.
const referenceKeywords=new Set(('if else for while do switch case return throw catch try finally function def class new typeof instanceof void delete in of const let var import export from as async await yield true false null undefined this super and or not is lambda pass with assert break continue public private protected static final abstract interface extends implements package boolean byte char double float int long short void synchronized throws enum record function local then fi done esac').split(' '));
function referenceLex(text,mode){
  const tokens=[],identifier=['css','bash'].includes(mode)?/[\p{L}_$-][\p{L}\p{N}_$-]*/uy:/[\p{L}_$][\p{L}\p{N}_$]*/uy;
  for(let at=0;at<text.length;){
    const start=at,char=text[at],next=text[at+1];
    if(/\s/.test(char)){at++;continue;}
    if(char==='/'&&next==='*'){const end=text.indexOf('*/',at+2);at=end<0?text.length:end+2;continue;}
    if((char==='/'&&next==='/'&&mode!=='css')||(char==='#'&&['python','bash'].includes(mode))){const end=text.indexOf('\n',at+1);at=end<0?text.length:end+1;continue;}
    if(char==='"'||char==="'"||char==='`'){
      const triple=mode==='python'&&text.slice(at,at+3)===char.repeat(3),quote=triple?char.repeat(3):char;at+=quote.length;const valueStart=at;
      while(at<text.length&&!text.startsWith(quote,at)){if(text[at]==='\\')at++;at++;}
      const end=Math.min(at,text.length);tokens.push({type:'string',template:char==='`',value:text.slice(valueStart,end),start:valueStart,end});at=Math.min(text.length,at+quote.length);continue;
    }
    // Avoid treating words in JavaScript regex literals as references.
    if(char==='/'&&mode==='javascript'&&(!tokens.length||/^(?:[=(:,!&|?{;\[]|return|throw)$/.test(tokens.at(-1).value))){
      let end=at+1,inClass=false;for(;end<text.length&&text[end]!=='\n';end++){if(text[end]==='\\'){end++;continue;}if(text[end]==='[')inClass=true;else if(text[end]===']')inClass=false;else if(text[end]==='/'&&!inClass)break;}
      if(text[end]==='/'){at=end+1;while(/[a-z]/i.test(text[at]||''))at++;continue;}
    }
    identifier.lastIndex=at;const match=identifier.exec(text);
    if(match){at=identifier.lastIndex;tokens.push({type:'id',value:match[0],start,end:at});}
    else{at++;tokens.push({type:'punct',value:char,start,end:at});}
  }
  return tokens;
}
function referenceTokens(text,mode,base=0,wanted=null){
  const found=[];
  const add=(kind,name,start,end,role='reference')=>{if(name&&(!wanted||name===wanted))found.push({kind,name,start:base+start,end:base+end,role});};
  const words=(value,start,kind)=>{for(const word of value.matchAll(/[^\s]+/g))if(/^[\p{L}_$-][\p{L}\p{N}_$-]*$/u.test(word[0]))add(kind,word[0],start+word.index,start+word.index+word[0].length);};
  const selectors=(value,start)=>found.push(...referenceTokens(value+'{}','css',base+start,wanted));
  if(mode==='html'){
    const tag=/<!--[\s\S]*?(?:-->|$)|<([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
    let match;
    while((match=tag.exec(text))){
      if(!match[1])continue;
      const fragment=match[0],tagName=match[1].toLowerCase(),attrs=fragment.slice(match[1].length+1),attrBase=match.index+match[1].length+1;
      for(const attr of attrs.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
        const name=attr[1].toLowerCase(),value=attr[2]??attr[3]??attr[4]??'',equals=attr[0].indexOf('='),valueOffset=attr[0].slice(equals+1).search(/\S/),quote=attr[0][equals+1+valueOffset],start=attrBase+attr.index+equals+1+valueOffset+(quote==='"'||quote==="'"?1:0);
        if(name==='class'||name==='classname')words(value,start,'class');
        else if(['id','for','aria-labelledby','aria-describedby','aria-controls','aria-owns'].includes(name))words(value,start,'id');
        else if(['href','xlink:href'].includes(name)&&value[0]==='#')words(value.slice(1),start+1,'id');
        else if(name.startsWith('on'))found.push(...referenceTokens(value,'javascript',base+start,wanted));
        else if(name==='style')found.push(...referenceTokens('x{'+value+'}','css',base+start-2,wanted));
      }
      if(['script','style','textarea','title'].includes(tagName)){
        const close=new RegExp('</'+tagName+'\\s*>','ig');close.lastIndex=tag.lastIndex;const ending=close.exec(text),end=ending?.index??text.length;
        if(tagName==='style'||tagName==='script'&&!/\btype\s*=\s*(['"])(?:application\/(?:ld\+)?json|text\/plain)\1/i.test(fragment))found.push(...referenceTokens(text.slice(tag.lastIndex,end),tagName==='style'?'css':'javascript',base+tag.lastIndex,wanted));
        tag.lastIndex=ending?close.lastIndex:text.length;
      }
    }
  }else if(mode==='css'){
    const tokens=referenceLex(text,mode);
    // A selector ends in an opening brace. Declarations, including #fff and
    // decimal values, end in a semicolon/closing brace and are excluded.
    let from=0;
    for(let i=0;i<tokens.length;i++)if(['{','}',';'].includes(tokens[i].value)){
      if(tokens[i].value==='{')for(let j=from;j<i-1;j++){
        const token=tokens[j],name=tokens[j+1];
        if((token.value==='.'||token.value==='#')&&name.type==='id'&&name.start===token.end)add(token.value==='.'?'class':'id',name.value,name.start,name.end,'selector');
      }
      from=i+1;
    }
  }else if(['javascript','java','python','bash'].includes(mode)){
    const tokens=referenceLex(text,mode);
    for(let i=0;i<tokens.length;i++){
      const token=tokens[i],previous=tokens[i-1],next=tokens[i+1];
      if(token.type==='id'&&!referenceKeywords.has(token.value)){
        let role=next?.value==='('||['function','def'].includes(previous?.value)?'callable':'identifier';
        if(['class','interface','enum','record','new','extends','implements'].includes(previous?.value))role='type';
        if(['=',':'].includes(next?.value)){
          const tail=tokens.slice(i+2,i+32).map(item=>item.value).join(' ');
          if(/^(?:async\s+)?function\b|^(?:async\s+)?(?:[\w$]+|\([^;{}]*\))\s*=\s*>/.test(tail))role='callable';
        }
        if(mode==='bash'&&(previous?.value==='function'||next?.value==='('&&tokens[i+2]?.value===')'))role='callable';
        add('code',token.value,token.start,token.end,role);
      }else if(token.type==='string'){
        if(token.template)for(const expression of token.value.matchAll(/(?<!\\)\$\{([^{}]*)\}/g))found.push(...referenceTokens(expression[1],mode,base+token.start+expression.index+2,wanted));
        if(token.value.includes('\\'))continue; // Escaped offsets need a parser/source map.
        let open=i-1;while(open>=0&&i-open<40&&!['(',')',';','{','}'].includes(tokens[open].value))open--;
        const call=tokens[open]?.value==='('?tokens[open-1]?.value:'',receiver=tokens.slice(Math.max(0,open-5),open).map(item=>item.value).join('');
        if(['querySelector','querySelectorAll','matches','closest','$','jQuery'].includes(call)&&open===i-1)selectors(token.value,token.start);
        else if(call==='getElementById'&&open===i-1)words(token.value,token.start,'id');
        else if(call==='getElementsByClassName'&&open===i-1)words(token.value,token.start,'class');
        else if(/classList\.(?:add|remove|toggle|contains|replace)$/.test(receiver))words(token.value,token.start,'class');
        else if(['setAttribute','attr'].includes(call)&&tokens[open+1]?.type==='string'&&tokens[open+2]?.value===','&&i===open+3){const attr=tokens[open+1].value;if(['id','class'].includes(attr))words(token.value,token.start,attr);}
        else if(previous?.value==='='&&['id','className'].includes(tokens[i-2]?.value))words(token.value,token.start,tokens[i-2].value==='id'?'id':'class');
      }
    }
  }
  const unique=new Map();for(const item of found)unique.set(`${item.kind}:${item.start}:${item.end}`,item);
  return [...unique.values()].sort((a,b)=>a.start-b.start||a.end-b.end);
}
function resolveReferenceSymbol(candidate,sources,index){
  if(candidate.kind&&candidate.kind!=='auto')return {name:candidate.name,kind:candidate.kind};
  const tokens=index.get(candidate.sourceId)||[],at=tokens.find(item=>item.start<=candidate.offset&&item.end>candidate.offset);
  if(!at||at.name!==candidate.name)throw new Error('Choose a class, ID or function name in code. If the file changed, select the name again.');
  if(at.kind!=='code')return {name:at.name,kind:at.kind};
  let kind=null;
  for(const source of sources)for(const token of index.get(source.id)||[])if(token.kind==='code'&&token.name===at.name){if(token.role==='callable')kind||='function';if(token.role==='type')kind='type';}
  if(!kind)throw new Error('No function or class with this name was found in the open tabs.');
  return {name:at.name,kind};
}
