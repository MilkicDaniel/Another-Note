  // Shared by the editor and offline formatting worker. Only known values
  // reach CSS or a formatter; old workspaces retain the current defaults.
  const EditorStyle=(()=>{
    const tokens=[['text','Plain text'],['keyword','Keywords'],['string','Strings'],['number','Numbers'],['comment','Comments'],['variable','Variables'],['command','Functions / commands'],['property','Properties / attributes'],['operator','Operators / punctuation'],['heading','Markdown headings'],['code','Inline code'],['fence','Code fences'],['emphasis','Emphasis']];
    const palettes={
      light:{text:'#101820',keyword:'#15518a',string:'#1b6036',number:'#8c4218',comment:'#4c5965',variable:'#79420d',command:'#703584',property:'#703584',operator:'#3e4b55',heading:'#15518a',code:'#1b6036',fence:'#4c5965',emphasis:'#703584'},
      dark:{text:'#e1e8ef',keyword:'#80bcec',string:'#a4ce8d',number:'#e5b178',comment:'#8793a1',variable:'#e3c384',command:'#c5a7ec',property:'#c5a7ec',operator:'#929fa9',heading:'#80bcec',code:'#a4ce8d',fence:'#8793a1',emphasis:'#c5a7ec'}
    };
    const modes=['javascript','java','python','html','css','json','bash'];
    const choice=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
    const number=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Math.round(Number(value)))):fallback;
    function format(value,mode,tabSize=2){
      const source=value&&typeof value==='object'?value:{};
      return {
        indentWidth:choice(Number(source.indentWidth),[2,4,8],choice(Number(tabSize),[2,4,8],['java','python'].includes(mode)?4:2)),
        indentStyle:choice(source.indentStyle,['spaces','tabs'],'spaces'),printWidth:number(source.printWidth,40,240,mode==='java'?100:88),
        bracePolicy:choice(source.bracePolicy,['preserve','always','omit-simple'],'preserve'),ifLayout:choice(source.ifLayout,['default','multiline','compact'],'default'),
        bracePlacement:choice(source.bracePlacement,['same-line','next-line'],'same-line'),elsePlacement:choice(source.elsePlacement,['same-line','next-line'],'same-line'),
        quoteStyle:choice(source.quoteStyle,mode==='python'?['preserve','single','double']:['single','double'],mode==='python'?'preserve':'double'),
        semicolons:source.semicolons!==false,trailingComma:choice(source.trailingComma,['all','es5','none'],'all'),arrowParens:choice(source.arrowParens,['always','avoid'],'always'),
        objectWrap:choice(source.objectWrap,['preserve','collapse'],'preserve'),singleAttributePerLine:source.singleAttributePerLine===true,bracketSameLine:source.bracketSameLine===true,
        htmlWhitespaceSensitivity:choice(source.htmlWhitespaceSensitivity,['css','strict','ignore'],'css'),magicTrailingComma:source.magicTrailingComma!==false,
        binaryNextLine:source.binaryNextLine!==false,switchCaseIndent:source.switchCaseIndent!==false,spaceRedirects:source.spaceRedirects!==false,functionNextLine:source.functionNextLine===true
      };
    }
    function normalize(value){
      const source=value&&typeof value==='object'?value:{},appearance=source.appearance||{},colors={light:{},dark:{}},formatting={};
      for(const theme of ['light','dark'])for(const [key]of tokens){const color=appearance.colors?.[theme]?.[key];colors[theme][key]=typeof color==='string'&&/^#[\da-f]{6}$/i.test(color)?color.toLowerCase():palettes[theme][key];}
      for(const mode of modes){const profile=source.formatting?.[mode];formatting[mode]=format(profile,mode);formatting[mode].indentWidth=[2,4,8].includes(Number(profile?.indentWidth))?Number(profile.indentWidth):'editor';}
      const fontFamily=typeof appearance.fontFamily==='string'?appearance.fontFamily.trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,100):'';
      const lineHeight=Number(appearance.lineHeight);
      return {appearance:{fontFamily,fontStyle:choice(appearance.fontStyle,['regular','bold','italic','bold-italic'],'regular'),lineHeight:Number.isFinite(lineHeight)?Math.max(1.2,Math.min(2.4,lineHeight)):1.6,colors},formatting};
    }
    function profile(value,mode,tabSize=2){return format(normalize(value).formatting[mode],mode,tabSize);}
    function font(appearance){const name=appearance.fontFamily,base='"DejaVu Sans Mono","Liberation Mono",Consolas,monospace';return name?JSON.stringify(name)+','+base:base;}
    return {tokens,palettes,modes,format,normalize,profile,font};
  })();
