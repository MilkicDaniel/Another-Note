  // Shared by the editor and offline formatting worker. Only known values
  // reach CSS or a formatter; old workspaces retain the current defaults.
  const EditorStyle=(()=>{
    const tokens=[['text','Plain text'],['keyword','Keywords'],['string','Strings'],['number','Numbers'],['comment','Comments'],['variable','Variables'],['command','Functions / commands'],['property','Properties / attributes'],['operator','Operators / punctuation'],['heading','Markdown headings'],['code','Inline code'],['fence','Code fences'],['emphasis','Emphasis']];
    const palettes={
      light:{text:'#101820',keyword:'#15518a',string:'#1b6036',number:'#8c4218',comment:'#4c5965',variable:'#79420d',command:'#703584',property:'#703584',operator:'#3e4b55',heading:'#15518a',code:'#1b6036',fence:'#4c5965',emphasis:'#703584'},
      dark:{text:'#e1e8ef',keyword:'#80bcec',string:'#a4ce8d',number:'#e5b178',comment:'#8793a1',variable:'#e3c384',command:'#c5a7ec',property:'#c5a7ec',operator:'#929fa9',heading:'#80bcec',code:'#a4ce8d',fence:'#8793a1',emphasis:'#c5a7ec'}
    };
    const surfaceTokens=[['paper','Editor background'],['panel','Panels / menus'],['raised','Inputs / buttons'],['text','Interface text'],['muted','Secondary text'],['accent','Accent / links'],['selection','Text selection'],['active-line','Current line'],['gutter','Line numbers'],['line','Borders'],['line-soft','Subtle borders'],['hover','Hover background'],['selected','Selected items'],['tabs','Tab bar'],['active-tab','Active tab'],['inactive-tab','Inactive tabs'],['code','Code blocks'],['chrome','Menu bar'],['chrome-text','Menu bar text'],['status','Status bar'],['status-text','Status bar text'],['danger','Errors'],['good','Success']];
    const surfaces={
      light:{paper:'#fcfcfc',panel:'#f2f2f2',raised:'#ffffff',text:'#101820',muted:'#3e4b55',line:'#9da8af','line-soft':'#d2d9de',accent:'#086caf',hover:'#d7eafd',selected:'#e5f2fc',tabs:'#e0e4e7','active-tab':'#fcfcfc','inactive-tab':'#e8e8e8',gutter:'#3e4b55','active-line':'#e5f2fc',code:'#f1f5f8',danger:'#b43939',good:'#367e62',chrome:'#f2f2f2','chrome-text':'#101820',status:'#f2f2f2','status-text':'#3e4b55',selection:'#cedde7'},
      dark:{paper:'#191e23',panel:'#24282c',raised:'#30373d',text:'#e1e8ef',muted:'#929fa9',line:'#4e5d68','line-soft':'#323d46',accent:'#72beed',hover:'#27485f',selected:'#203b50',tabs:'#1c2024','active-tab':'#343d46','inactive-tab':'#191e23',gutter:'#929fa9','active-line':'#203b50',code:'#14191f',danger:'#ef9393',good:'#7ccaa2',chrome:'#24282c','chrome-text':'#e1e8ef',status:'#24282c','status-text':'#929fa9',selection:'#303f4f'}
    };
    const presets=typeof EditorThemePresets==='undefined'?[]:EditorThemePresets;
    const validColor=value=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value);
    const cleanColors=(value,fields,fallback)=>Object.fromEntries(fields.map(([key])=>[key,validColor(value?.[key])?value[key].toLowerCase():fallback[key]]));
    const themeName=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,64):'';
    function availableThemes(value,mode){
      return [{id:'default-'+mode,name:'Another Note '+(mode==='dark'?'Dark':'Light'),mode,colors:palettes[mode],surfaces:surfaces[mode]},...presets.filter(theme=>theme.mode===mode),...Object.entries(value?.customThemes||{}).filter(([,theme])=>theme&&theme.mode===mode).map(([id,theme])=>({id,...theme}))];
    }
    function sameTheme(appearance,mode,theme){return tokens.every(([key])=>appearance.colors[mode][key]===theme.colors[key])&&surfaceTokens.every(([key])=>appearance.surfaces[mode][key]===theme.surfaces[key]);}
    function selectedTheme(value,mode){return availableThemes(value,mode).find(theme=>theme.id===value.appearance.selectedThemes[mode]&&sameTheme(value.appearance,mode,theme))||null;}
    function useTheme(value,mode,id){
      const result=normalize(value),theme=availableThemes(result,mode).find(theme=>theme.id===id);if(!theme)return result;
      result.appearance.colors[mode]={...theme.colors};result.appearance.surfaces[mode]={...theme.surfaces};result.appearance.selectedThemes[mode]=id;return result;
    }
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
      const source=value&&typeof value==='object'?value:{},appearance=source.appearance||{},colors={},surfaceColors={},selectedThemes={},formatting={},customThemes={};
      for(const [id,theme]of Object.entries(source.customThemes||{}).slice(0,100)){
        if(!/^custom-[a-z\d-]{1,100}$/i.test(id)||!themeName(theme?.name)||!['light','dark'].includes(theme?.mode))continue;
        customThemes[id]={name:themeName(theme.name),mode:theme.mode,colors:cleanColors(theme.colors,tokens,palettes[theme.mode]),surfaces:cleanColors(theme.surfaces,surfaceTokens,surfaces[theme.mode])};
      }
      for(const mode of ['light','dark']){
        colors[mode]=cleanColors(appearance.colors?.[mode],tokens,palettes[mode]);surfaceColors[mode]=cleanColors(appearance.surfaces?.[mode],surfaceTokens,surfaces[mode]);
        const id=appearance.selectedThemes?.[mode],theme=availableThemes({customThemes},mode).find(theme=>theme.id===id);
        selectedThemes[mode]=theme&&sameTheme({colors,surfaces:surfaceColors},mode,theme)?id:sameTheme({colors,surfaces:surfaceColors},mode,{colors:palettes[mode],surfaces:surfaces[mode]})?'default-'+mode:'custom';
      }
      for(const mode of modes){const profile=source.formatting?.[mode];formatting[mode]=format(profile,mode);formatting[mode].indentWidth=[2,4,8].includes(Number(profile?.indentWidth))?Number(profile.indentWidth):'editor';}
      const fontFamily=typeof appearance.fontFamily==='string'?appearance.fontFamily.trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,100):'';
      const lineHeight=Number(appearance.lineHeight);
      return {appearance:{fontFamily,fontStyle:choice(appearance.fontStyle,['regular','bold','italic','bold-italic'],'regular'),lineHeight:Number.isFinite(lineHeight)?Math.max(1.2,Math.min(2.4,lineHeight)):1.6,colors,surfaces:surfaceColors,selectedThemes},customThemes,formatting};
    }
    function profile(value,mode,tabSize=2){return format(normalize(value).formatting[mode],mode,tabSize);}
    function font(appearance){const name=appearance.fontFamily,base='"DejaVu Sans Mono","Liberation Mono",Consolas,monospace';return name?JSON.stringify(name)+','+base:base;}
    return {tokens,palettes,surfaceTokens,surfaces,presets,modes,format,normalize,profile,font,themeName,availableThemes,selectedTheme,useTheme};
  })();
