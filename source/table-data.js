  const TableData=(()=>{
    const limits={rows:200,columns:40,cells:4000,characters:2*1024*1024};
    const clean=value=>String(value??'').replace(/\r\n?/g,'\n');
    const html=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    function size(rows,columns){
      if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||columns<1||rows>limits.rows||columns>limits.columns||rows*columns>limits.cells)throw new Error(`Use 1–${limits.rows} rows, 1–${limits.columns} columns, and at most ${limits.cells.toLocaleString('en')} cells.`);
    }
    function model(rows,extra={}){
      if(!Array.isArray(rows)||!rows.length||rows.some(row=>!Array.isArray(row)))throw new Error('No table cells were found.');
      if(rows.length>limits.rows)size(rows.length,1);
      const columns=Math.max(1,...rows.map(row=>row.length));size(rows.length,columns);let characters=0;
      const normalized=rows.map(row=>Array.from({length:columns},(_,i)=>{const value=clean(row[i]);characters+=value.length;return value;}));
      if(characters>limits.characters)throw new Error('This table is too large to edit as a grid. Paste it as text instead.');
      const align=Array.from({length:columns},(_,i)=>['left','center','right'].includes(extra.align?.[i])?extra.align[i]:'none');
      return {...extra,rows:normalized,header:extra.header!==false,align,originalAlign:Array.from({length:columns},(_,i)=>extra.originalAlign?.[i]||align[i]),originals:normalized.map((row,r)=>row.map((_,c)=>extra.originals?.[r]?.[c]||null)),rowMeta:normalized.map((_,r)=>extra.rowMeta?.[r]||{})};
    }
    function blank(rows=3,columns=3){size(rows,columns);return model(Array.from({length:rows},(_,r)=>Array.from({length:columns},(_,c)=>r===0?'Column '+(c+1):'')));}
    function bounded(text){text=clean(text);if(text.length>limits.characters)throw new Error('This table is too large to edit as a grid. Paste it as text instead.');return text;}
    function delimited(text,separator='\t'){
      text=bounded(text).replace(/^\ufeff/,'');if(!text)return null;
      const rows=[];let row=[],value='',quoted=false,closed=false;
      const field=()=>{row.push(value);value='';closed=false;if(row.length>limits.columns)size(1,row.length);};
      const record=()=>{field();rows.push(row);row=[];if(rows.length>limits.rows)size(rows.length,1);};
      for(let i=0;i<text.length;i++){
        const char=text[i];
        if(quoted){if(char==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=char;continue;}
        if(char===separator){field();continue;}if(char==='\n'){record();continue;}
        if(closed){if(char===' '||char==='\t'&&separator!=='\t')continue;throw new Error('Unexpected text after a quoted table cell. Check the separator.');}
        if(char==='"'&&!value){quoted=true;continue;}value+=char;
      }
      if(quoted)throw new Error('A quoted table cell is missing its closing quote.');
      if(value||row.length||!text.endsWith('\n'))record();
      return model(rows,{format:separator==='\t'?'tsv':'csv'});
    }
    function splitRow(line){
      line=line.trim();let values=[],value='',slashes=0,hadPipe=false;
      for(const char of line){
        if(char==='|'&&slashes%2===0){values.push(value.trim());value='';hadPipe=true;}else value+=char;
        slashes=char==='\\'?slashes+1:0;
      }
      values.push(value.trim());
      if(line.startsWith('|'))values.shift();
      if(line.endsWith('|')&&slashes===0){let before=0;for(let i=line.length-2;i>=0&&line[i]==='\\';i--)before++;if(before%2===0)values.pop();}
      return {values,hadPipe};
    }
    function entities(value){
      return value.replace(/&(?:#(x[\da-f]+|\d+)|(amp|lt|gt|quot|apos|nbsp|vert));/gi,(all,number,name)=>{
        if(!number)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0',vert:'|'}[name.toLowerCase()];
        const code=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):Number(number);return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):all;
      });
    }
    function markdownValue(source){return entities(source.replace(/<br\s*\/?\s*>/gi,'\n').replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,'$1'));}
    function markdown(text){
      text=bounded(text).trim();const lines=text.split('\n');if(lines.length<2)return null;
      const header=splitRow(lines[0]),divider=splitRow(lines[1]);
      if(!header.hadPipe||!header.values.length||divider.values.length!==header.values.length||!divider.values.every(value=>/^:?-{3,}:?$/.test(value)))return null;
      const raw=[header.values];
      for(const line of lines.slice(2)){if(!line.trim())break;const row=splitRow(line);if(!row.hadPipe)return null;raw.push(row.values);if(raw.length>limits.rows+1)size(raw.length,1);}
      let hasHeader=true;
      if(header.values.every(value=>!value)){hasHeader=false;raw.shift();if(!raw.length)raw.push(header.values);}
      const originals=raw.map(row=>row.map(source=>({value:markdownValue(source),markdown:source})));
      return model(originals.map(row=>row.map(cell=>cell.value)),{format:'markdown',header:hasHeader,align:divider.values.map(value=>value.startsWith(':')&&value.endsWith(':')?'center':value.endsWith(':')?'right':value.startsWith(':')?'left':'none'),originals});
    }
    function textOfCell(cell){
      const blocks=new Set(['P','DIV','LI','UL','OL','BLOCKQUOTE','PRE','TABLE','TR','TD','TH']);let result='',trailingBlockBreak=false;
      function append(value,preserve){if(!preserve){value=value.replace(/[\t\r\n\f ]+/g,' ');if(!result||/[\n ]$/.test(result))value=value.replace(/^ +/,'');}result+=value;if(value)trailingBlockBreak=false;}
      function walk(node,preserve=false){
        if(node.nodeType===3){append(node.nodeValue,preserve);return;}
        if(node.nodeType!==1||['SCRIPT','STYLE','TEMPLATE','NOSCRIPT'].includes(node.tagName)||node.hasAttribute('hidden')||node.style.display==='none')return;
        if(node.tagName==='BR'){result+='\n';trailingBlockBreak=false;return;}
        if(node.tagName==='IMG'){append(node.getAttribute('alt')||'',preserve);return;}
        preserve=preserve||node.tagName==='PRE'||['pre','pre-wrap','break-spaces'].includes(node.style.whiteSpace);
        const block=blocks.has(node.tagName);if(block&&result&&!result.endsWith('\n'))result=result.replace(/ +$/,'')+'\n';
        for(const child of node.childNodes)walk(child,preserve);
        if(block&&result&&!result.endsWith('\n')){if(!preserve)result=result.replace(/ +$/,'');result+='\n';trailingBlockBreak=true;}
      }
      const preserve=['pre','pre-wrap','break-spaces'].includes(cell.style.whiteSpace);for(const node of cell.childNodes)walk(node,preserve);
      return clean(trailingBlockBreak?result.slice(0,-1):result).replace(preserve?/$^/:/^ +| +$/g,'');
    }
    const attributes=node=>[...node.attributes].map(attribute=>[attribute.name,attribute.value]);
    function fromHTML(source,preserve=false){
      source=bounded(source);if(!/<table(?:\s|>)/i.test(source))return null;
      const template=document.createElement('template');template.innerHTML=source;
      const table=template.content.querySelector('table');if(!table)return null;
      const htmlRows=[...table.querySelectorAll('tr')].filter(row=>row.closest('table')===table);
      if(!htmlRows.length)return null;
      const rows=[],originals=[],rowMeta=[];let merged=false;
      for(let r=0;r<htmlRows.length;r++){
        if(r>=limits.rows)size(r+1,1);rows[r]??=[];originals[r]??=[];let column=0;
        const row=htmlRows[r];rowMeta[r]=preserve?{attributes:attributes(row)}:{};
        for(const cell of [...row.children].filter(node=>['TD','TH'].includes(node.tagName))){
          while(rows[r][column]!==undefined)column++;
          const spanColumns=Math.max(1,Number(cell.getAttribute('colspan'))||1),rawRows=cell.getAttribute('rowspan'),requestedRows=Math.max(1,Number(rawRows)||1),remaining=htmlRows.slice(r).filter(candidate=>candidate.parentElement===row.parentElement).length,spanRows=rawRows==='0'?remaining:Math.min(requestedRows,remaining);
          if(!Number.isInteger(spanColumns)||!Number.isInteger(requestedRows))throw new Error('This table has an invalid merged cell.');
          size(Math.max(htmlRows.length,r+spanRows),column+spanColumns);merged||=spanColumns>1||spanRows>1;
          for(let rr=r;rr<r+spanRows;rr++){rows[rr]??=[];originals[rr]??=[];for(let c=column;c<column+spanColumns;c++){if(rows[rr][c]!==undefined)throw new Error('This table has overlapping merged cells.');rows[rr][c]='';}}
          const value=textOfCell(cell);rows[r][column]=value;
          if(preserve)originals[r][column]={value,html:cell.innerHTML,attributes:attributes(cell).filter(([name])=>!['rowspan','colspan'].includes(name.toLowerCase())),tag:cell.tagName.toLowerCase()};
          column+=spanColumns;
        }
      }
      const firstCells=[...htmlRows[0].children].filter(cell=>['TH','TD'].includes(cell.tagName)),head=firstCells.some(cell=>cell.tagName==='TH')||htmlRows[0].parentElement.tagName==='THEAD';
      const extra=preserve?{tableAttributes:attributes(table),caption:[...table.children].filter(node=>node.tagName==='CAPTION').map(node=>node.outerHTML).join(''),headAttributes:table.querySelector('thead')?attributes(table.querySelector('thead')):[],bodyAttributes:table.querySelector('tbody')?attributes(table.querySelector('tbody')):[]}:{};
      const align=Array.from({length:Math.max(...rows.map(row=>row.length))},(_,c)=>{const cell=firstCells[c],value=(cell?.getAttribute('align')||cell?.style.textAlign||'').toLowerCase();return ['left','center','right'].includes(value)?value:'none';});
      const tableCount=[...template.content.querySelectorAll('table')].filter(node=>!node.parentElement?.closest('table')).length;
      return model(rows,{format:'html',header:head,originals,rowMeta,merged,align,tableCount,...extra});
    }
    function fromText(text,separator='auto'){
      text=bounded(text);if(!text)return null;
      const md=separator==='auto'?markdown(text):null;if(md)return md;
      if(separator==='auto'&&/<table(?:\s|>)/i.test(text))return fromHTML(text);
      if(separator!=='auto')return delimited(text,separator);
      let lastError=null;
      for(const delimiter of ['\t',',',';'])if(text.includes(delimiter)){
        try{const data=delimited(text,delimiter);if(data&&data.rows[0].length>1)return data;}catch(error){lastError=error;}
      }
      if(lastError)throw lastError;
      return delimited(text,'\t');
    }
    function clipboard(plain,rich,{csv=false}={}){
      if(rich&&/<table(?:\s|>)/i.test(rich)){
        const data=fromHTML(rich);
        if(data&&plain&&data.tableCount===1){try{const exact=delimited(plain,'\t');if(exact&&exact.rows.length===data.rows.length&&exact.rows[0].length===data.rows[0].length&&(plain.includes('\t')||exact.rows.every((row,r)=>row.every((value,c)=>value.trim()===data.rows[r][c].trim()))))data.rows=exact.rows;}catch(_){}}
        return data;
      }
      if(plain.includes('\t')){const data=delimited(plain,'\t');if(data?.rows[0].length>1)return data;}
      return csv?fromText(plain):null;
    }
    function encodeCell(value){
      return clean(value).replace(/[&<>]/g,html).replace(/[\\|`*_\[\]~]/g,'\\$&').replace(/\t/g,'&#9;').replace(/^ +| +$/g,spaces=>'&#32;'.repeat(spaces.length)).replace(/\n/g,'<br>');
    }
    function cellWidth(value){let width=0;for(let i=0;i<value.length&&width<48;i++,width++)if(value.charCodeAt(i)>=0xd800&&value.charCodeAt(i)<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff)i++;return width;}
    function toMarkdown(data){
      const values=data.rows.map((row,r)=>row.map((value,c)=>data.originals?.[r]?.[c]?.markdown!==undefined&&data.originals[r][c].value===value?data.originals[r][c].markdown:encodeCell(value)));
      const header=data.header?values[0]:Array(values[0].length).fill(''),body=data.header?values.slice(1):values;
      const widths=header.map((_,c)=>Math.max(data.align[c]==='center'?5:data.align[c]==='none'?3:4,...values.map(row=>cellWidth(row[c])))),line=row=>'| '+row.map((value,c)=>value+' '.repeat(Math.max(0,widths[c]-cellWidth(value)))).join(' | ')+' |';
      const divider=widths.map((width,c)=>{const align=data.align[c],count=Math.max(3,width-(align==='center'?2:align==='none'?0:1));return (['left','center'].includes(align)?':':'')+'-'.repeat(count)+(['right','center'].includes(align)?':':'');});
      return [line(header),line(divider),...body.map(line)].join('\n');
    }
    function attrs(values){return (values||[]).map(([name,value])=>' '+name+'="'+html(value)+'"').join('');}
    function toHTML(data){
      const lines=['<table'+attrs(data.tableAttributes)+'>'];if(data.caption)lines.push('  '+data.caption);
      const section=(rows,offset,tag,attributes)=>{
        if(!rows.length)return;lines.push('  <'+tag+attrs(attributes)+'>');
        rows.forEach((row,index)=>{const r=index+offset;lines.push('    <tr'+attrs(data.rowMeta?.[r]?.attributes)+'>');
          row.forEach((value,c)=>{const old=data.originals?.[r]?.[c],cellTag=r===0?(data.header?'th':'td'):old?.tag||'td',contents=old?.html!==undefined&&old.value===value?old.html:html(value).replace(/\n/g,'<br>');
            let attributes=[...(old?.attributes||[])];
            if(!old||data.align[c]!==data.originalAlign[c]){
              const originalStyle=attributes.find(([name])=>name.toLowerCase()==='style');attributes=attributes.filter(([name])=>name.toLowerCase()!=='align'&&name.toLowerCase()!=='style');
              if(originalStyle){const template=document.createElement('template'),style=template.content.ownerDocument.createElement('td');style.setAttribute('style',originalStyle[1]);style.style.removeProperty('text-align');if(data.align[c]!=='none')style.style.setProperty('text-align',data.align[c]);if(style.getAttribute('style'))attributes.push(['style',style.getAttribute('style')]);}
              else if(data.align[c]!=='none')attributes.push(['align',data.align[c]]);
            }
            lines.push('      <'+cellTag+attrs(attributes)+'>'+contents+'</'+cellTag+'>');});lines.push('    </tr>');});lines.push('  </'+tag+'>');
      };
      if(data.header)section(data.rows.slice(0,1),0,'thead',data.headAttributes);section(data.header?data.rows.slice(1):data.rows,data.header?1:0,'tbody',data.bodyAttributes);lines.push('</table>');return lines.join('\n');
    }
    function toDelimited(data,separator='\t'){return data.rows.map(row=>row.map(value=>value.includes(separator)||/["\n\r]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value).join(separator)).join('\n');}
    function serialize(data,format='markdown'){size(data.rows.length,data.rows[0].length);return format==='html'?toHTML(data):format==='csv'?toDelimited(data,','):format==='tsv'?toDelimited(data):toMarkdown(data);}
    function inFence(text,offset){
      let fence=null;for(const line of text.slice(0,offset).split('\n')){const match=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);if(!match)continue;const mark=match[1];if(!fence){if(mark[0]!=='`'||!match[2].includes('`'))fence=mark;}else if(mark[0]===fence[0]&&mark.length>=fence.length&&!match[2].trim())fence=null;}
      return Boolean(fence);
    }
    function markdownAt(text,from,to=from){
      let begin=text.lastIndexOf('\n',Math.max(0,from-1))+1,finish=text.indexOf('\n',to);if(finish<0)finish=text.length;
      for(let i=0;i<limits.rows+2&&begin>0;i++){const previous=text.lastIndexOf('\n',begin-2)+1;if(!text.slice(previous,begin-1).includes('|'))break;begin=previous;}
      for(let i=0;i<limits.rows+2&&finish<text.length;i++){const next=text.indexOf('\n',finish+1),end=next<0?text.length:next;if(!text.slice(finish+1,end).includes('|'))break;finish=end;}
      const lines=text.slice(begin,finish).split('\n');let offset=begin;
      for(let i=0;i<lines.length-1;i++){
        const rest=lines.slice(i),raw=[];for(const line of rest){if(!line.includes('|'))break;raw.push(line);}
        if(raw.length>=2){let data;try{data=markdown(raw.join('\n'));}catch(error){if(from>=offset&&from<=offset+raw.join('\n').length)throw error;}
          if(data&&from>=offset&&to<=offset+raw.join('\n').length)return {from:offset,to:offset+raw.join('\n').length,format:'markdown',data,indent:lines[i].match(/^[\t ]*/)[0]};}
        offset+=lines[i].length+1;
      }
      return null;
    }
    function htmlAt(text,from,to=from){
      const tokens=/<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<table\b(?:[^>"']|"[^"]*"|'[^']*')*>|<\/table\s*>/gi,stack=[];let found=null;
      for(const match of text.matchAll(tokens)){const token=match[0];if(/^<table\b/i.test(token)){stack.push(match.index);if(stack.length>100)throw new Error('This table is nested too deeply to edit.');}else if(/^<\/table/i.test(token)&&stack.length){const start=stack.pop(),end=match.index+token.length;if(start<=from&&to<=end&&(!found||end-start<found.to-found.from))found={from:start,to:end,format:'html'};}}
      if(!found)return null;found.data=fromHTML(text.slice(found.from,found.to),true);found.indent=text.slice(text.lastIndexOf('\n',found.from-1)+1,found.from).match(/^[\t ]*$/)?.[0]||'';return found.data?found:null;
    }
    return {limits,size,model,blank,delimited,markdown,fromHTML,fromText,clipboard,serialize,inFence,markdownAt,htmlAt,html};
  })();
