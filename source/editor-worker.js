let spellEngine=null,latestSpell=0;
const ignoredCodeWords=new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public record return sealed short static super switch synchronized this throw throws transient try var void volatile while yield true false null permits async await debugger delete export from function get in let of set typeof undefined with and as def del elif except False global is lambda match None nonlocal not or pass raise True self cls str bool dict tuple list args kwargs foo bar baz ctx js jsx json html css py http https url uri utf api cli npm src href div span init println printf echo cd pwd ls cat mkdir rm cp mv grep sed awk chmod sudo dnf git curl wget node jq source fi then elif esac readonly local done'.split(' '));
// Common markup attributes and programming terms are not prose errors.
for(const word of (
  'doctype charset viewport utf8 utf16 xmlns lang hreflang srcset crossorigin referrerpolicy tabindex contenteditable spellcheck autocomplete autofocus autocapitalize autocorrect ' +
  'maxlength minlength dirname readonly textarea datalist optgroup fieldset figcaption iframe noscript template stylesheet javascript onclick onload onerror keydown ' +
  'keyup keypress pointerdown pointerup pointermove mousedown mouseup mousemove dblclick focusin focusout beforeinput preventdefault stoppropagation getelementbyid queryselector queryselectorall dataset ' +
  'textcontent innerhtml classname classlist nodetype localstorage sessionstorage indexeddb stringify parseint parsefloat isfinite isnan parseurl charcodeat svg viewbox preserveaspectratio ' +
  'xlink srcdoc rowspan colspan cellpadding cellspacing enctype formmethod formaction inputmode spellchecking aria ariahidden arialabel ariaexpanded describedby labelledby htmlfor ' +
  'fontfamily fontsize fontweight lineheight letterspacing overflowwrap textdecoration codepoints regex regexp param params argv argc stdin stdout stderr env ' +
  'pid uid eof todo fixme nullish bigint namespace struct typedef sizeof endif ifdef elif pragma constexpr noexcept std ' +
  'uint uint8 uint16 uint32 uint64 int8 int16 int32 int64 size_t nullptr typeof keyof enum export declaration npm npx ' +
  'esm cjs jsx tsx eslint prettier ruff mvdan shfmt pyproject venv virtualenv __init__ __name__ __main__ __file__ kwargs dataclass ' +
  'isinstance issubclass setattr getattr hasattr idempotent posix http localhost websocket filename filepath basename mimetype mime config ' +
  'img tbody thead tfoot colgroup hgroup optgroup textarea blockquote figcaption noscript iframe srcset nbsp quot apos lt gt ' +
  'rgb rgba hsl hsla hwb lab lch oklab oklch srgb calc minmax keyframes webkit moz fontface truetype opentype woff woff2 ttf otf eot ' +
  'px rem em vh vw vmin vmax svh svw lvh lvw dvh dvw ch ex fr deg rad dppx dpi flex inlineflex grid inlinegrid nowrap prewrap breakword easein easeout easeinout ' +
  'antialiased grayscale cubic bezier translatex translatey translatez translate3d rotatex rotatey rotatez rgba url var env attr clippath borderbox contentbox'
).split(' '))ignoredCodeWords.add(word);
// These dictionaries use different affix flags. Keep their engines separate;
// combining the .dic files under one .aff file can accept arbitrary words.
function dictionary(){return spellEngine??=[EditorVendor.nspell({aff:EDITOR_ASSETS.enAff,dic:EDITOR_ASSETS.enDic}),EditorVendor.nspell({aff:EDITOR_ASSETS.gbAff,dic:EDITOR_ASSETS.gbDic})];}
function spellKey(word){return String(word).replace(/’/g,"'").toLocaleLowerCase('en');}
async function checkSpelling(job){
  const engine=dictionary(),personal=new Set(job.personal.map(spellKey)),cache=new Map(),matches=[];
  const words=spellingWords(job.text,job.mode!=='text'&&job.mode!=='markdown');let index=0;
  for(const item of words){
    if(index++%600===0){await new Promise(resolve=>setTimeout(resolve,0));if(latestSpell!==job.id)return {cancelled:true};}
    const key=spellKey(item.word);
    if(personal.has(key)||personal.has(spellKey(item.identifier))||job.mode!=='text'&&job.mode!=='markdown'&&ignoredCodeWords.has(key))continue;
    if(!cache.has(key))cache.set(key,engine.some(language=>language.correct(item.word.replace(/’/g,"'"))||language.correct(key)));
    if(!cache.get(key))matches.push({word:item.word,start:item.start,end:item.end});
    if(matches.length>=2000)return {matches,truncated:true};
  }
  return {matches,truncated:false};
}
self.onmessage=async event=>{
  const job=event.data;if(job.type==='spell')latestSpell=job.id;
  try{
    let result;
    if(job.type==='spell')result=await checkSpelling(job);
    else if(job.type==='suggest')result=job.word.length>32?[]:[...new Set(dictionary().flatMap(language=>language.suggest(job.word.replace(/’/g,"'"))))].slice(0,8);
    else throw new Error('Unknown editor operation.');
    self.postMessage({id:job.id,result});
  }catch(error){self.postMessage({id:job.id,error:error.message||String(error)});}
};
