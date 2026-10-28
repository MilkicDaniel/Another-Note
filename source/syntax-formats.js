  const codeKeywords={
    java:new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if goto implements import instanceof int interface long native new package private protected public record return sealed short static strictfp super switch synchronized this throw throws transient try var void volatile while yield true false null permits non-sealed'.split(' ')),
    javascript:new Set('async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield'.split(' ')),
    python:new Set('and as assert async await break case class continue def del elif else except False finally for from global if import in is lambda match None nonlocal not or pass raise return True try while with yield'.split(' '))
  };
  function colorCLike(code,mode){
    const expression=/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"""[\s\S]*?(?:"""|$)|"(?:\\[\s\S]|[^"\\\r\n])*(?:"|$)|'(?:\\[\s\S]|[^'\\\r\n])*(?:'|$)|`(?:\\[\s\S]|[^`\\])*(?:`|$)|@[\w.]+|\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?[\d_]+)?)[nNlLfFdD]?\b|[A-Za-z_$][\w$]*|[{}[\]();.,:+*/%<>=!&|?~^-]+/g;
    return tokenize(code,expression,(text,index)=>{
      if(text.startsWith('//')||text.startsWith('/*'))return 'comment';
      if(/^['"`]/.test(text))return 'string';
      if(text[0]==='@')return 'property';
      if(/^\d/.test(text))return 'number';
      if(codeKeywords[mode].has(text))return 'keyword';
      if(/^[A-Za-z_$]/.test(text))return /^\s*\(/.test(code.slice(index+text.length))?'command':'variable';
      return 'operator';
    });
  }
  function colorPython(code){
    const expression=/#[^\n]*|(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\[\s\S]|[^"\\\r\n])*(?:"|$)|'(?:\\[\s\S]|[^'\\\r\n])*(?:'|$))|@[\w.]+|\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?[\d_]+)?)[jJ]?\b|[A-Za-z_]\w*|[{}[\]();.,:+*/%<>=!&|~^@-]+/g;
    return tokenize(code,expression,(text,index)=>text[0]==='#'?'comment':/^(?:[rRuUbBfF]{0,2})['"]/.test(text)?'string':text[0]==='@'?'property':/^\d/.test(text)?'number':codeKeywords.python.has(text)?'keyword':/^[A-Za-z_]/.test(text)?(/^\s*\(/.test(code.slice(index+text.length))?'command':'variable'):'operator');
  }
  function colorCSS(code){
    const expression=/\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\\r\n])*(?:"|$)|'(?:\\[\s\S]|[^'\\\r\n])*(?:'|$)|@[\w-]+|#[\w-]+|--[\w-]+|\b\d+(?:\.\d+)?(?:[a-zA-Z]+|%)?|[a-zA-Z_-][\w-]*|[{}:;(),>+~*=![\]|.-]+/g;
    return tokenize(code,expression,(text,index)=>text.startsWith('/*')?'comment':/^['"]/.test(text)?'string':text[0]==='@'?'keyword':/^\d/.test(text)||/^#[\da-f]{3,8}$/i.test(text)?'number':text.startsWith('--')?'variable':/^\s*:/.test(code.slice(index+text.length))?'property':/^\s*\(/.test(code.slice(index+text.length))?'command':/^[\w#-]/.test(text)?'variable':'operator');
  }
  function colorHTMLTag(code){
    return tokenize(code,/<\/?[\w:-]+|"[^"]*"|'[^']*'|[\w:-]+|[<>=/!?]+/g,text=>text[0]==='<'?'keyword':/^['"]/.test(text)?'string':/^[\w:-]/.test(text)?'property':'operator');
  }
  function colorHTML(code){
    const expression=/<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<!DOCTYPE(?:[^>"']|"[^"]*"|'[^']*')*>|<\/?[a-zA-Z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
    let result='',last=0,match;
    const text=value=>tokenize(value,/&(?:#\d+|#x[\da-f]+|[a-z][\w]+);/gi,()=> 'variable');
    while((match=expression.exec(code))){
      result+=text(code.slice(last,match.index));const tag=match[0];
      result+=tag.startsWith('<!--')||tag.startsWith('<![CDATA[')?`<span class="tok-comment">${escape(tag)}</span>`:colorHTMLTag(tag);
      last=expression.lastIndex;
      const embedded=tag.match(/^<(script|style)\b/i);
      if(!embedded||tag.endsWith('/>'))continue;
      const closing=new RegExp(`</${embedded[1]}\\s*>`,'gi');closing.lastIndex=last;const end=closing.exec(code),until=end?end.index:code.length;
      const content=code.slice(last,until);
      result+=embedded[1].toLowerCase()==='style'?colorCSS(content):/\btype\s*=\s*(['"])application\/(?:ld\+)?json\1/i.test(tag)?colorJSON(content):colorCLike(content,'javascript');
      last=expression.lastIndex=until;
    }
    return result+text(code.slice(last));
  }
