const codeFileExtensions=new Set('txt text log md markdown rst adoc vnotes sh bash zsh fish bat cmd ps1 java class jar war js mjs cjs jsx ts tsx mts cts json jsonc json5 jsonl ndjson html htm xhtml css scss sass less py pyw pyc pyi ipynb rb php go rs c h cc cpp cxx hpp cs fs vb swift kt kts scala groovy sql graphql gql xml xsd xsl xslt yaml yml toml ini conf config cfg env properties lock gitignore gitattributes gitmodules editorconfig npmrc nvmrc dockerignore map wasm vue svelte astro ejs hbs mustache jinja jinja2 tex csv tsv db sqlite sqlite3 bak tmp zip gz tar tgz bz2 xz zst 7z rar pdf doc docx odt rtf xls xlsx ppt pptx png jpg jpeg gif webp avif bmp ico svg tif tiff mp3 mp4 m4a m4v ogg wav flac webm mov avi ttf otf woff woff2 eot exe dll so dylib rpm deb AppImage'.toLowerCase().split(' '));
function* spellingWords(text,program=false){
  const exclusions=text.matchAll(program?/\b(?:https?|ftp):\/\/[^\s<>"']+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}|#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{4}\b|#[\da-f]{3}\b/gi:/\b(?:https?|ftp):\/\/[^\s<>"']+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi);let blocked=exclusions.next().value;
  for(const token of text.matchAll(/[\p{L}_][\p{L}\p{M}\p{N}_'’\-]*/gu)){
    while(blocked&&blocked.index+blocked[0].length<=token.index)blocked=exclusions.next().value;
    if(blocked&&blocked.index<=token.index&&token.index<blocked.index+blocked[0].length)continue;
    if(program&&text[token.index-1]==='.'&&codeFileExtensions.has(token[0].toLowerCase()))continue;
    if(program&&/\d/.test(text[token.index-1]||'')&&/^(?:px|r?em|ex|ch|lh|rlh|(?:s|l|d)?v(?:w|h|i|b|min|max)|cqw|cqh|cqi|cqb|cqmin|cqmax|cm|mm|in|pt|pc|q|deg|grad|rad|turn|ms|s|hz|khz|dpi|dpcm|dppx|fr)$/i.test(token[0]))continue;
    for(const match of token[0].matchAll(/[A-Z]?[a-z]+(?:['’][a-z]+)?|[A-Z]+(?![a-z])|[\p{L}\p{M}]+/gu)){
      const word=match[0];if(word.length<2||word.length>64||program&&/^[A-Z]{2,}$/.test(word))continue;
      yield {word,start:token.index+match.index,end:token.index+match.index+word.length,identifier:token[0]};
    }
  }
}
