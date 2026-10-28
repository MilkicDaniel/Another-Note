  // Small offline completion tables. Nothing indexes a file until hints are used.
  const htmlVoidTags=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const htmlTags={
    a:'Link to a URL',abbr:'Abbreviation',address:'Contact information',article:'Independent article',aside:'Related content',audio:'Audio player',b:'Bring attention to text',blockquote:'Quoted block',body:'Document body',br:'Line break',button:'Clickable button',canvas:'Drawing surface',caption:'Table caption',code:'Code fragment',col:'Table column',colgroup:'Table column group',data:'Machine-readable value',datalist:'Suggested input values',dd:'Description details',del:'Deleted text',details:'Expandable disclosure',dialog:'Dialog window',div:'Generic block container',dl:'Description list',dt:'Description term',em:'Emphasized text',embed:'Embedded resource',fieldset:'Group of form controls',figcaption:'Figure caption',figure:'Self-contained figure',footer:'Section footer',form:'Form controls',h1:'Heading level 1',h2:'Heading level 2',h3:'Heading level 3',h4:'Heading level 4',h5:'Heading level 5',h6:'Heading level 6',head:'Document metadata',header:'Section header',hr:'Thematic break',html:'HTML document root',i:'Alternate voice',iframe:'Embedded document',img:'Image',input:'Form input',ins:'Inserted text',kbd:'Keyboard input',label:'Label for a form control',legend:'Fieldset caption',li:'List item',link:'External resource link',main:'Main document content',map:'Image map',mark:'Highlighted text',menu:'List of commands',meta:'Document metadata',meter:'Scalar measurement',nav:'Navigation links',noscript:'Fallback without scripting',object:'Embedded object',ol:'Ordered list',optgroup:'Group of options',option:'Select option',output:'Calculation result',p:'Paragraph',picture:'Responsive image sources',pre:'Preformatted text',progress:'Task progress',q:'Inline quotation',s:'No longer accurate text',samp:'Sample output',script:'Embedded script',search:'Search region',section:'Document section',select:'Selection control',slot:'Web component slot',small:'Side comment',source:'Media source',span:'Generic inline container',strong:'Strong importance',style:'Embedded CSS',sub:'Subscript',summary:'Disclosure heading',sup:'Superscript',svg:'SVG graphic',table:'Table',tbody:'Table body',td:'Table data cell',template:'Inert HTML template',textarea:'Multiline text input',tfoot:'Table footer',th:'Table heading cell',thead:'Table header',time:'Date or time',title:'Document title',tr:'Table row',track:'Timed media text',u:'Non-textual annotation',ul:'Unordered list',var:'Variable',video:'Video player',wbr:'Optional line break',area:'Image-map area',base:'Base document URL'
  };
  const htmlGlobalAttributes='id class style title lang dir hidden tabindex role contenteditable draggable spellcheck translate slot part accesskey data- aria-label aria-labelledby aria-describedby aria-hidden aria-expanded aria-controls aria-live aria-current'.split(' ');
  const htmlAttributes={
    a:'href target rel download hreflang type',img:'src alt width height loading decoding srcset sizes crossorigin',input:'type name value placeholder required disabled readonly checked min max step minlength maxlength pattern autocomplete autofocus multiple accept form',button:'type name value disabled form',form:'action method enctype autocomplete novalidate target',label:'for',textarea:'name rows cols placeholder required disabled readonly minlength maxlength wrap autocomplete',select:'name multiple required disabled size',option:'value selected disabled label',script:'src type defer async crossorigin integrity nomodule',link:'rel href type media crossorigin integrity',meta:'charset name content http-equiv',html:'xmlns',style:'type media',audio:'src controls autoplay loop muted preload',video:'src controls autoplay loop muted preload poster width height playsinline',source:'src srcset type media sizes',iframe:'src title width height loading sandbox allow referrerpolicy',td:'colspan rowspan headers',th:'colspan rowspan scope headers',table:'',ol:'start reversed type',li:'value',time:'datetime',details:'open name',dialog:'open',progress:'value max',meter:'value min max low high optimum',svg:'viewBox width height fill stroke xmlns',path:'d fill stroke',circle:'cx cy r fill stroke',use:'href',track:'src kind srclang label default'
  };
  const booleanHTMLAttributes=new Set('hidden required disabled readonly checked autofocus multiple novalidate defer async nomodule controls autoplay loop muted playsinline selected reversed open default'.split(' '));
  const htmlAttributeValues={
    type:'text password email number checkbox radio button submit reset search tel url date datetime-local time month week color range file hidden',target:'_blank _self _parent _top',method:'get post dialog',rel:'stylesheet icon alternate canonical preload preconnect modulepreload noopener noreferrer',loading:'lazy eager',decoding:'async sync auto',dir:'ltr rtl auto',lang:'en en-US en-GB',role:'button link navigation main search dialog alert status tab tablist tabpanel list listitem img presentation',autocomplete:'on off name email username current-password new-password',contenteditable:'true false plaintext-only',draggable:'true false',spellcheck:'true false',translate:'yes no',wrap:'soft hard off',preload:'auto metadata none','aria-hidden':'true false','aria-expanded':'true false','aria-live':'off polite assertive',name:'viewport description author theme-color',charset:'utf-8',enctype:'application/x-www-form-urlencoded multipart/form-data text/plain'
  };
  const cssPropertyGroups={
    'Layout':'display position top right bottom left inset z-index float clear box-sizing overflow overflow-x overflow-y visibility isolation contain container-type',
    'Size':'width min-width max-width height min-height max-height aspect-ratio',
    'Spacing':'margin margin-top margin-right margin-bottom margin-left margin-inline margin-block padding padding-top padding-right padding-bottom padding-left padding-inline padding-block gap row-gap column-gap',
    'Flex':'flex flex-direction flex-wrap flex-flow flex-grow flex-shrink flex-basis justify-content align-items align-self align-content order',
    'Grid':'grid grid-template-columns grid-template-rows grid-template-areas grid-auto-columns grid-auto-rows grid-auto-flow grid-column grid-row grid-area justify-items justify-self place-items place-content',
    'Text':'color font font-family font-size font-weight font-style font-variant line-height letter-spacing word-spacing text-align text-decoration text-transform text-indent text-overflow text-shadow white-space word-break overflow-wrap vertical-align',
    'Appearance':'background background-color background-image background-size background-position background-repeat background-clip border border-width border-style border-color border-radius border-top border-right border-bottom border-left box-shadow outline outline-offset opacity filter backdrop-filter cursor pointer-events user-select resize appearance accent-color caret-color',
    'Animation':'transition transition-property transition-duration transition-delay transition-timing-function transform transform-origin translate rotate scale animation animation-name animation-duration animation-delay animation-timing-function animation-iteration-count animation-direction animation-fill-mode animation-play-state',
    'Content':'content list-style list-style-type list-style-position list-style-image object-fit object-position fill stroke stroke-width src font-display scroll-behavior scroll-snap-type scroll-snap-align scrollbar-width scrollbar-color overscroll-behavior will-change clip-path'
  };
  const cssValues={
    display:'block inline inline-block flex inline-flex grid inline-grid none contents flow-root table list-item',position:'static relative absolute fixed sticky',overflow:'visible hidden clip scroll auto','box-sizing':'border-box content-box',visibility:'visible hidden collapse','flex-direction':'row column row-reverse column-reverse','flex-wrap':'nowrap wrap wrap-reverse','justify-content':'normal start end center flex-start flex-end space-between space-around space-evenly stretch','align-items':'normal stretch start end center flex-start flex-end baseline','align-self':'auto stretch start end center flex-start flex-end baseline','align-content':'normal stretch start end center flex-start flex-end space-between space-around space-evenly','text-align':'left right center justify start end','font-weight':'normal bold bolder lighter 100 200 300 400 500 600 700 800 900','font-style':'normal italic oblique','font-family':'sans-serif serif monospace system-ui cursive fantasy','white-space':'normal nowrap pre pre-wrap pre-line break-spaces','word-break':'normal break-all keep-all','overflow-wrap':'normal anywhere break-word',cursor:'auto default pointer text move grab grabbing crosshair not-allowed wait help none','pointer-events':'auto none','user-select':'auto text none all','object-fit':'fill contain cover none scale-down','background-size':'auto cover contain','background-repeat':'repeat no-repeat repeat-x repeat-y round space','border-style':'none solid dashed dotted double groove ridge inset outset','list-style-type':'none disc circle square decimal lower-alpha upper-alpha','animation-fill-mode':'none forwards backwards both','animation-direction':'normal reverse alternate alternate-reverse','animation-play-state':'running paused','animation-iteration-count':'infinite','transition-timing-function':'ease linear ease-in ease-out ease-in-out step-start step-end','font-display':'auto block swap fallback optional',src:'url() local() format()',content:'none normal open-quote close-quote attr()','scroll-behavior':'auto smooth','text-decoration':'none underline overline line-through','text-transform':'none capitalize uppercase lowercase','resize':'none both horizontal vertical'
  };
  const cssColors='transparent currentColor inherit black white red green blue yellow orange purple pink gray grey rebeccapurple'.split(' ');
  const cssFunctions={rgb:'rgb(red green blue)',rgba:'rgba(red, green, blue, alpha)',hsl:'hsl(hue saturation lightness)',hsla:'hsla(hue, saturation, lightness, alpha)',oklch:'oklch(lightness chroma hue)',var:'var(--custom-property)',calc:'calc(expression)',min:'min(value, value)',max:'max(value, value)',clamp:'clamp(minimum, preferred, maximum)',url:'url(resource)',linearGradient:'linear-gradient(direction, color, color)',repeat:'repeat(count, tracks)',minmax:'minmax(minimum, maximum)',translate:'translate(x, y)',translateX:'translateX(x)',translateY:'translateY(y)',scale:'scale(value)',rotate:'rotate(angle)','cubic-bezier':'cubic-bezier(x1, y1, x2, y2)',format:'format(font-format)',local:'local(font-name)'};
  const codeFunctions={
    javascript:{'console.log':'log(value, …)','console.warn':'warn(value, …)','console.error':'error(value, …)','console.table':'table(data)','document.querySelector':'querySelector(selector)','document.querySelectorAll':'querySelectorAll(selector)','document.getElementById':'getElementById(id)','document.createElement':'createElement(tagName)','document.addEventListener':'addEventListener(type, listener)','window.addEventListener':'addEventListener(type, listener)','window.setTimeout':'setTimeout(callback, delay)','JSON.parse':'parse(text)','JSON.stringify':'stringify(value, replacer, space)','Math.abs':'abs(value)','Math.round':'round(value)','Math.floor':'floor(value)','Math.ceil':'ceil(value)','Math.max':'max(value, …)','Math.min':'min(value, …)','Math.random':'random()','Math.pow':'pow(base, exponent)','Math.sqrt':'sqrt(value)','Array.from':'from(iterable)','Array.isArray':'isArray(value)','Object.keys':'keys(object)','Object.values':'values(object)','Object.entries':'entries(object)','Object.assign':'assign(target, …sources)','Object.freeze':'freeze(object)','Object.hasOwn':'hasOwn(object, property)','Promise.resolve':'resolve(value)','Promise.reject':'reject(reason)','Promise.all':'all(iterable)','Promise.allSettled':'allSettled(iterable)','Date.now':'now()','Number.isNaN':'isNaN(value)','Number.isFinite':'isFinite(value)','String.raw':'raw(template)',fetch:'fetch(url, options)',setTimeout:'setTimeout(callback, delay)',setInterval:'setInterval(callback, delay)',clearTimeout:'clearTimeout(id)',clearInterval:'clearInterval(id)',requestAnimationFrame:'requestAnimationFrame(callback)',parseInt:'parseInt(text, radix)',parseFloat:'parseFloat(text)',alert:'alert(message)',addEventListener:'addEventListener(type, listener)',encodeURIComponent:'encodeURIComponent(value)',decodeURIComponent:'decodeURIComponent(value)'},
    python:{print:'print(*objects, sep=" ", end="\\n")',len:'len(object)',range:'range(start, stop, step)',enumerate:'enumerate(iterable, start=0)',zip:'zip(*iterables)',open:'open(file, mode="r")',input:'input(prompt)',isinstance:'isinstance(object, classinfo)',sorted:'sorted(iterable, key=None, reverse=False)',sum:'sum(iterable, start=0)',min:'min(iterable)',max:'max(iterable)',abs:'abs(number)',round:'round(number, ndigits=None)',str:'str(object)',int:'int(value, base=10)',float:'float(value)',list:'list(iterable)',dict:'dict(mapping)',set:'set(iterable)',tuple:'tuple(iterable)','json.loads':'loads(text)','json.dumps':'dumps(object, indent=None)','os.path.join':'join(path, *paths)','os.path.exists':'exists(path)','math.sqrt':'sqrt(value)'},
    java:{'System.out.println':'println(value)','System.out.print':'print(value)','String.valueOf':'valueOf(value)','Integer.parseInt':'parseInt(text)','Double.parseDouble':'parseDouble(text)','Math.max':'max(a, b)','Math.min':'min(a, b)','Math.abs':'abs(value)','Math.sqrt':'sqrt(value)','Arrays.sort':'sort(array)','Arrays.toString':'toString(array)','Collections.sort':'sort(list)'},
    bash:{printf:'printf format [arguments]',echo:'echo [arguments]',cd:'cd [directory]',pwd:'pwd',ls:'ls [options] [path]',cat:'cat [file]',grep:'grep pattern [file]',sed:'sed script [file]',awk:'awk program [file]',find:'find path [expression]',mkdir:'mkdir [directory]',cp:'cp source destination',mv:'mv source destination',rm:'rm [file]',read:'read variable',test:'test expression',export:'export NAME=value'}
  };
  const commonJSMembers={map:'map(callback)',filter:'filter(callback)',forEach:'forEach(callback)',reduce:'reduce(callback, initialValue)',find:'find(callback)',findIndex:'findIndex(callback)',some:'some(callback)',every:'every(callback)',includes:'includes(value)',indexOf:'indexOf(value)',push:'push(value)',pop:'pop()',slice:'slice(start, end)',splice:'splice(start, deleteCount, …items)',join:'join(separator)',split:'split(separator)',trim:'trim()',replace:'replace(search, replacement)',replaceAll:'replaceAll(search, replacement)',toLowerCase:'toLowerCase()',toUpperCase:'toUpperCase()',startsWith:'startsWith(text)',endsWith:'endsWith(text)',addEventListener:'addEventListener(type, listener)',appendChild:'appendChild(node)',setAttribute:'setAttribute(name, value)',getAttribute:'getAttribute(name)',then:'then(onFulfilled, onRejected)',catch:'catch(onRejected)',finally:'finally(callback)'};
  const completionKeywords={javascript:'async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield',java:'abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public record return short static super switch synchronized this throw throws true false try var void while',python:'and as assert async await break case class continue def del elif else except False finally for from global if import in is lambda match None nonlocal not or pass raise return True try while with yield',bash:'if then else elif fi for in do done while until case esac function local readonly return exit source set unset true false'};

  function htmlCodeContext(text,offset,onTag=null){
    if(offset>500000)return null;
    const stack=[];let at=0,raw=null;
    while(at<offset){
      if(raw){const closing=new RegExp('</'+raw.name+'\\s*>','ig');closing.lastIndex=at;const found=closing.exec(text);if(!found||found.index>=offset){const partial=text.slice(at,offset).match(/<\/[\w:-]*$/);if(partial&&raw.name.startsWith(partial[0].slice(2).toLowerCase()))return {kind:'tag',start:offset-partial[0].length,fragment:partial[0],stack,quote:''};return {kind:'raw',...raw,stack};}at=found.index;raw=null;}
      const start=text.indexOf('<',at);if(start<0||start>=offset)return {kind:'text',stack};
      if(text.startsWith('<!--',start)||text.startsWith('<![CDATA[',start)){const ending=text.startsWith('<!--',start)?'-->':']]>',end=text.indexOf(ending,start+4);if(end<0||end+ending.length>offset)return {kind:'comment',stack};at=end+ending.length;continue;}
      if(!/[a-zA-Z/!?\s]/.test(text[start+1]||' ')&&start+1<offset){at=start+1;continue;}
      let quote='',end=start+1;
      for(;end<offset;end++){const char=text[end];if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='>')break;else if(char==='<')break;}
      if(end===offset)return {kind:'tag',start,fragment:text.slice(start,offset),stack,quote};
      if(text[end]==='<'){at=end;continue;}
      const fragment=text.slice(start,end+1),match=/^<\s*(\/?)\s*([\w:-]+)/.exec(fragment);
      if(match){const name=match[2].toLowerCase(),selfClosing=htmlVoidTags.has(name)||/\/\s*>$/.test(fragment);onTag?.(name,Boolean(match[1]),selfClosing);if(match[1]){const index=stack.lastIndexOf(name);if(index>=0)stack.splice(index);}else if(!selfClosing){stack.push(name);if(['script','style','textarea','title'].includes(name))raw={name,start:end+1,mode:name==='style'?'css':name==='script'?/\btype\s*=\s*(['"])application\/(?:ld\+)?json\1/i.test(fragment)?'json':'javascript':'text'};}}
      at=end+1;
    }
    return {kind:'text',stack};
  }
  function htmlClosingEdit(text,offset,mode){
    if(mode!=='html'||text[offset-1]!=='>'||offset>500000)return null;
    const context=htmlCodeContext(text,offset-1);if(context?.kind!=='tag'||context.quote)return null;
    const tag=text.slice(context.start,offset),match=/^<([a-zA-Z][\w:-]*)\b/.exec(tag);
    if(!match||/\/\s*>$/.test(tag)||htmlVoidTags.has(match[1].toLowerCase()))return null;
    const name=match[1],lower=name.toLowerCase(),after=text.slice(offset,offset+500000),parents=context.stack.filter(item=>item===lower).length;let balance=0,available=0;
    // Keep an existing pair even when it contains text/children, while leaving
    // enough closing tags for same-name parents. Ignore markup inside comments,
    // script strings and other raw-text elements.
    htmlCodeContext(after,after.length,(tag,closing,selfClosing)=>{if(tag!==lower||selfClosing&&!closing)return;balance+=closing?1:-1;available=Math.max(available,balance);});
    if(available>parents)return null;
    return {from:offset,to:offset,insert:`</${name}>`,caret:offset};
  }
  function codeLexicalState(text,offset,mode){
    let state='code',quote='';
    for(let i=0;i<offset;i++){
      const char=text[i],next=text[i+1];
      if(state==='line'){if(char==='\n')state='code';continue;}
      if(state==='comment'){if(char==='*'&&next==='/'){state='code';i++;}continue;}
      if(state==='string'){if(char==='\\'){i++;continue;}if(char===quote)state='code';continue;}
      if((mode==='python'||mode==='bash')&&char==='#'){state='line';continue;}
      if(['javascript','java'].includes(mode)&&char==='/'&&next==='/'){state='line';i++;continue;}
      if(['javascript','java','css'].includes(mode)&&char==='/'&&next==='*'){state='comment';i++;continue;}
      if(char==='"'||char==="'"||char==='`'){state='string';quote=char;}
    }
    return {state,quote};
  }
  function completionItem(label,detail,insert=label,caret=insert.length,kind='word'){return {label,detail,insert,caret,kind};}
  function jsonContainerAt(text){
    const stack=[];let quoted=false;
    for(let i=0;i<text.length;i++){const char=text[i];if(quoted){if(char==='\\')i++;else if(char==='"')quoted=false;}else if(char==='"')quoted=true;else if(char==='{'||char==='[')stack.push(char);else if(char==='}'||char===']')stack.pop();}
    return stack.at(-1);
  }
  function callableCompletion(name,signature,following,kind='function'){
    if(/^\s*\(/.test(following))return completionItem(name,signature,name,name.length,kind);
    const hasArguments=!signature.endsWith('()'),insert=name+'()';return completionItem(name,signature,insert,hasArguments?insert.length-1:insert.length,kind);
  }
  function completionWords(text,mode){
    // Limit tokenization and result size for large files; this is a word index,
    // not a background language service or execution of the user's code.
    const sample=text.slice(0,200000),items=new Map();
    for(const match of sample.matchAll(/\b(?:function|def)\s+([a-zA-Z_$][\w$]*)\s*\(([^)\r\n]{0,160})\)/g)){const label=match[1],signature=`${label}(${match[2]})`;items.set(label,{...completionItem(label,signature,label,label.length,'local'),signature});if(items.size>=400)break;}
    const declarations=mode==='python'?/\b(?:def|class)\s+([a-zA-Z_]\w*)|\b([a-zA-Z_]\w*)\s*=/g:/\b(?:function|class|const|let|var|int|double|float|String|boolean)\s+([a-zA-Z_$][\w$]*)/g;
    for(const match of sample.matchAll(declarations)){const label=match[1]||match[2];if(!items.has(label))items.set(label,completionItem(label,'Defined in this file',label,label.length,'local'));if(items.size>=400)break;}
    for(const match of sample.matchAll(/[a-zA-Z_$][\w$-]{1,79}/g)){const label=match[0];if(!items.has(label))items.set(label,completionItem(label,'Word in this file',label,label.length,'local'));if(items.size>=600)break;}
    return [...items.values()];
  }
  function completeCode(text,offset,mode,explicit=false,localWords=null){
    if(offset<0||offset>text.length||offset>500000)return null;
    let base=0,html=null,attribute=null,tagName='',range=null,candidates=[],language=mode,preferred=[];
    const before=text.slice(0,offset);
    if(mode==='html'){
      html=htmlCodeContext(text,offset);if(!html||html.kind==='comment')return null;
      if(html.kind==='raw'){if(html.mode==='text')return null;language=html.mode;base=html.start;}
      else if(html.kind==='tag'){
        const tag=html.fragment;
        const name=tag.match(/^<\s*(\/?)\s*([\w:-]*)$/);
        if(name){
          const prefix=name[2];range={from:offset-prefix.length,to:offset+(text.slice(offset).match(/^[\w:-]*/)?.[0].length||0),prefix,kind:name[1]?'closing-tag':'tag'};
          const opened=[...html.stack].reverse();preferred=name[1]?opened:[];
          const used=[...text.slice(0,200000).matchAll(/<([a-zA-Z][\w:-]*)(?=[\s/>])/g)].filter(match=>match.index!==html.start).map(match=>match[1]);
          const names=[...new Set([...(name[1]?opened:[]),...Object.keys(htmlTags),...used])];
          candidates=names.map(label=>completionItem(label,name[1]?`Close <${label}>`:htmlTags[label]||'Tag in this file',label,label.length,'tag'));
        }else{
          tagName=tag.match(/^<\s*([\w:-]+)/)?.[1].toLowerCase()||'';
          if(!tagName||/^<\s*[!/]/.test(tag))return null;
          if(html.quote){
            const value=tag.match(/([\w:-]+)\s*=\s*(["'])([^"']*)$/);if(!value)return null;
            attribute=value[1].toLowerCase();
            if(attribute==='style'){language='css';base=offset-value[3].length;}
            else if(attribute.startsWith('on')){language='javascript';base=offset-value[3].length;}
            else{
              const prefix=value[3].match(/[\w-]*$/)[0];range={from:offset-prefix.length,to:offset+(text.slice(offset).match(/^[\w-]*/)?.[0].length||0),prefix,kind:'attribute-value'};
              let values=(htmlAttributeValues[attribute]||'').split(' ').filter(Boolean);
              if(attribute==='type'&&['script','style','link','source'].includes(tagName))values=tagName==='script'?['module','text/javascript','application/json','application/ld+json']:tagName==='style'||tagName==='link'?['text/css']:['image/webp','image/png','audio/mpeg','video/mp4'];
              if(attribute==='class'||attribute==='id'){values=[...new Set([...text.slice(0,200000).matchAll(new RegExp('\\b'+attribute+'\\s*=\\s*["\']([^"\']*)["\']','gi'))].flatMap(match=>match[1].split(/\s+/)))].filter(Boolean);}
              candidates=values.map(value=>completionItem(value,`${attribute} value`,value,value.length,'value'));
            }
          }else{
            const prefix=tag.match(/[\w:-]*$/)[0];
            if(!/\s/.test(tag[ tag.length-prefix.length-1 ]||''))return null;
            range={from:offset-prefix.length,to:offset+(text.slice(offset).match(/^[\w:-]*/)?.[0].length||0),prefix,kind:'attribute'};
            const existing=new Set([...tag.matchAll(/\s([\w:-]+)(?=\s|=|$)/g)].map(match=>match[1].toLowerCase()));
            candidates=[...new Set([...(htmlAttributes[tagName]||'').split(' ').filter(Boolean),...htmlGlobalAttributes])].filter(label=>!existing.has(label.toLowerCase())||label===prefix).map(label=>{
              const insert=booleanHTMLAttributes.has(label)||label==='data-'?label:label+'=""';return completionItem(label,booleanHTMLAttributes.has(label)?'Boolean attribute':`${tagName} attribute`,insert,insert.endsWith('""')?insert.length-1:insert.length,'attribute');
            });
          }
        }
      }else return null;
    }
    if(!range){
      const code=before.slice(base),lexical=codeLexicalState(code,code.length,language);
      if(lexical.state==='comment'||lexical.state==='line')return null;
      if(language==='json'){
        if(lexical.state==='string'){
          const match=code.match(/"((?:\\.|[^"\\])*)$/);if(!match)return null;
          const start=offset-match[1].length,prior=before.slice(base,start-1).trimEnd().at(-1);if(!['{',','].includes(prior))return null;
          const suffix=text.slice(offset),end=suffix.match(/^[^"\\\r\n]*/)?.[0].length||0;range={from:start,to:offset+end,prefix:match[1],kind:'json-key'};
          candidates=[...new Set([...text.slice(0,200000).matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(item=>item[1]))].map(label=>completionItem(label,'Property in this file',label,label.length,'property'));
        }else{
          const prefix=code.match(/[A-Za-z]*$/)[0],prior=code.slice(0,code.length-prefix.length).trimEnd().at(-1);if(![':', '[', ','].includes(prior)||prior===','&&jsonContainerAt(code)==='{')return null;
          range={from:offset-prefix.length,to:offset+(text.slice(offset).match(/^[a-z]*/i)?.[0].length||0),prefix,kind:'value'};candidates=['true','false','null'].map(label=>completionItem(label,'JSON value',label,label.length,'value'));
        }
      }else if(language==='css'){
        if(lexical.state==='string')return null;
        const prefix=code.match(/[\w@-]*$/)[0],from=offset-prefix.length,to=offset+(text.slice(offset).match(/^[\w-]*/)?.[0].length||0),tail=code.slice(Math.max(code.lastIndexOf('{'),code.lastIndexOf(';'),code.lastIndexOf('}'))+1),colon=tail.indexOf(':');
        range={from,to,prefix,kind:'css'};
        if(prefix.startsWith('@'))candidates=['media','supports','keyframes','font-face','import','layer','container','property','charset','namespace','page'].map(label=>completionItem('@'+label,'CSS at-rule','@'+label,label.length+1,'keyword'));
        else if(attribute!=='style'&&code.lastIndexOf('{')<=code.lastIndexOf('}')){
          if(!explicit&&!prefix)return null;
          const names=[...text.slice(0,200000).matchAll(/[.#]([\w-]+)/g)].map(item=>item[1]);candidates=[...new Set(names)].map(label=>completionItem(label,'Selector in this file',label,label.length,'local'));
        }else if(colon<0){
          range.kind='css-property';candidates=Object.entries(cssPropertyGroups).flatMap(([group,properties])=>properties.split(' ').map(label=>completionItem(label,`${group} property`,label+': ',label.length+2,'property')));
          for(const match of text.slice(0,200000).matchAll(/(--[\w-]+)\s*:/g))candidates.push(completionItem(match[1],'Custom property',match[1]+': ',match[1].length+2,'property'));
        }else{
          range.kind='css-value';const property=tail.slice(0,colon).trim().toLowerCase(),values=cssValues[property]||(/(?:color|background|fill|stroke|border|shadow)/.test(property)?cssColors:[]).join(' ');
          candidates=[...new Set([...values.split(' '),'inherit','initial','unset','revert','auto','none'])].filter(Boolean).map(label=>completionItem(label,`${property} value`,label,label.length,'value'));
          for(const [key,signature]of Object.entries(cssFunctions)){const label=key==='linearGradient'?'linear-gradient':key;candidates.push(callableCompletion(label,signature,text.slice(to)));}
          if(prefix.startsWith('--'))for(const match of text.slice(0,200000).matchAll(/(--[\w-]+)\s*:/g))candidates.push(completionItem(match[1],'Custom property',match[1],match[1].length,'variable'));
        }
      }else if(Object.hasOwn(completionKeywords,language)){
        if(lexical.state!=='code')return null;
        const prefix=code.match(/[\w$]*$/)[0],from=offset-prefix.length,to=offset+(text.slice(offset).match(/^[\w$]*/)?.[0].length||0),member=code.slice(0,code.length-prefix.length).match(/([\w$.]+)\s*(?:\?\.)?\.\s*$/);
        range={from,to,prefix,kind:member?'member':'identifier'};
        if(member){
          const object=member[1];
          candidates=Object.entries(codeFunctions[language]||{}).filter(([key])=>key.startsWith(object+'.')&&!key.slice(object.length+1).includes('.')).map(([key,signature])=>callableCompletion(key.slice(object.length+1),`${object}.${signature}`,text.slice(to)));
          if(language==='javascript'&&!candidates.length){candidates=Object.entries(commonJSMembers).map(([label,signature])=>callableCompletion(label,signature,text.slice(to),'method'));candidates.push(completionItem('length','Number of items or characters','length',6,'property'),completionItem('textContent','Text inside a node','textContent',11,'property'),completionItem('value','Current value','value',5,'property'),completionItem('style','Inline CSS styles','style',5,'property'),completionItem('classList','Element class names','classList',9,'property'));}
          // Members explicitly used with this receiver elsewhere in the file.
          const escaped=object.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(const item of text.slice(0,200000).matchAll(new RegExp('\\b'+escaped+'\\.([\\w$]+)','g')))candidates.push(completionItem(item[1],`Member of ${object} in this file`,item[1],item[1].length,'local'));
        }else{
          candidates=(completionKeywords[language]||'').split(' ').map(label=>completionItem(label,`${language} keyword`,label,label.length,'keyword'));
          candidates.push(...Object.entries(codeFunctions[language]||{}).filter(([key])=>!key.includes('.')).map(([label,signature])=>language==='bash'?completionItem(label,signature,label,label.length,'function'):callableCompletion(label,signature,text.slice(to))));
          if(language==='javascript')candidates.push(...'console document window JSON Math Array Object Promise Date Number String Boolean Map Set URL RegExp Error localStorage navigator'.split(' ').map(label=>completionItem(label,'JavaScript built-in',label,label.length,'variable')));
          candidates.push(...(localWords||completionWords(text,language)).map(item=>item.signature?callableCompletion(item.label,item.signature,text.slice(to)):item));
        }
      }else return null;
    }
    if(!range||!explicit&&!range.prefix&&!['tag','closing-tag','attribute','attribute-value','css-property','css-value','member'].includes(range.kind))return null;
    const prefix=range.prefix.toLowerCase(),unique=new Map();
    for(const item of candidates){const key=item.label.toLowerCase();if(!key.startsWith(prefix)||unique.has(key))continue;if(key===prefix&&(item.kind==='local'||!explicit&&(range.kind==='identifier'||item.insert===range.prefix&&range.to===offset&&!['tag','closing-tag'].includes(range.kind))))continue;unique.set(key,item);}
    const items=[...unique.values()].sort((a,b)=>{const ap=preferred.indexOf(a.label),bp=preferred.indexOf(b.label);if(ap>=0||bp>=0)return (ap<0?999:ap)-(bp<0?999:bp);return Number(b.kind==='local')-Number(a.kind==='local')||a.label.length-b.label.length||a.label.localeCompare(b.label);}).slice(0,60);
    return items.length?{...range,items,language,offset}:null;
  }
  function completionEdit(text,result,item){
    let insert=item.insert,caret=item.caret,to=result.to;
    const after=text.slice(to);
    if(result.kind==='tag'){
      // Keep existing attributes or a closing delimiter. A fresh tag gets its
      // matching close in the same undo step, with the caret in its content.
      if(!/^\s+[\w:-]+\s*=|^\s*\/?\s*>/.test(after)){
        const name=item.label;insert=name+'>';caret=insert.length;
        const updated=text.slice(0,result.from)+insert+after,closing=htmlClosingEdit(updated,result.from+insert.length,'html');
        if(closing)insert+=closing.insert;
      }
    }else if(result.kind==='closing-tag'){
      if(!/^\s*>/.test(after))insert+='>';caret=insert.length;
    }else if(result.kind==='attribute'&&/^\s*=/.test(after)){insert=item.label;caret=insert.length;}
    else if(result.kind==='css-property'&&/^\s*:/.test(after)){insert=item.label;caret=insert.length;}
    return {from:result.from,to,insert,caret:result.from+caret};
  }
