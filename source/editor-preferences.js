  let editorPreferencesDraft=null,editorPreferencesBase=null,editorPreferencesSize=15,editorPreferencesBaseSize=15,preferencesSection='appearance',preferencesPreviewSequence=0,preferencesPreviewTimer=null;
  const preferenceSamples={
    javascript:'// Colors and formatting preview\nfunction greet(name) {\n  if (name) return "Hello";\n  else { console.log("Ready"); }\n}\nconst options = {enabled:true, count:3};\n',
    java:'// Colors and formatting preview\nclass Example {\n  String greet(String name) {\n    if (name != null) return "Hello";\n    else { return "Ready"; }\n  }\n}\n',
    python:'# Colors and formatting preview\ndef greet(name):\n    if name:\n        return {"message": "Hello", "count": 3}\n    else:\n        return "Ready"\n',
    html:'<!-- Colors and formatting preview -->\n<section class="card" id="welcome" aria-label="Welcome"><h1>Hello</h1><p>Ready &amp; waiting.</p></section>\n',
    css:'/* Colors and formatting preview */\n@media (min-width: 600px) {\n  .card {\n    color: #80bcec;\n    padding: 12px 24px;\n    background: transparent;\n  }\n}\n',
    json:'{"message":"Hello","count":3,"enabled":true,"items":[1,2,3],"options":{"wrap":true}}\n',
    bash:'#!/bin/bash\n# Colors and formatting preview\ngreet() {\nif [ -n "$1" ]; then\necho "Hello, $1"\nelse\necho "Ready"\nfi\n}\n',
    markdown:'# A heading\n\nSome **emphasis** and `inline code`.\n\n```javascript\nconst count = 3; // a comment\n```\n',
    text:'A local editor for text and code.\nChoose a font and a comfortable line height.\nColors and fonts change the display of your files.\n'
  };
  function editorPreferenceAppearance(){return EditorStyle.normalize(state?.settings.editorPreferences).appearance;}
  function applyEditorAppearance(theme){
    const appearance=editorPreferenceAppearance(),style=document.documentElement.style;
    style.setProperty('--editor-font',EditorStyle.font(appearance));style.setProperty('--editor-font-weight',appearance.fontStyle.includes('bold')?'700':'400');style.setProperty('--editor-font-style',appearance.fontStyle.includes('italic')?'italic':'normal');
    for(const [key]of EditorStyle.tokens)document.body.style.setProperty('--syntax-'+key,appearance.colors[theme][key]);
    if(typeof minimapPaintKey!=='undefined')minimapPaintKey=null;
    return appearance.lineHeight;
  }
  function mergePreferenceDraft(base,draft,current){
    if(JSON.stringify(base)===JSON.stringify(draft))return current;
    if(!draft||typeof draft!=='object'||Array.isArray(draft))return draft;
    const result={...current};for(const key of Object.keys(draft))result[key]=mergePreferenceDraft(base?.[key],draft[key],current?.[key]);return result;
  }
  function preferenceOptions(values,selected){return values.map(([value,label])=>`<option value="${escape(value)}"${String(value)===String(selected)?' selected':''}>${escape(label)}</option>`).join('');}
  function renderPreferenceColors(){
    const theme=$('preferencesPalette').value,colors=editorPreferencesDraft.appearance.colors[theme];
    $('preferencesColors').innerHTML=EditorStyle.tokens.map(([key,label])=>`<div class="preference-color-row"><label for="preferenceColor-${key}">${label}</label><input id="preferenceColor-${key}" type="color" value="${colors[key]}" data-syntax-color="${key}" aria-label="${label} color"><input type="text" value="${colors[key]}" data-syntax-hex="${key}" aria-label="${label} hex color" pattern="#[0-9a-fA-F]{6}" maxlength="7" spellcheck="false" required></div>`).join('');
  }
  function formatPreferenceField(key,label,values){
    const value=editorPreferencesDraft.formatting[$('preferencesLanguage').value][key];
    return `<label class="preference-field"><span>${label}</span><select data-format-preference="${key}" aria-label="${label}">${preferenceOptions(values,value)}</select></label>`;
  }
  function renderFormatPreferences(){
    const mode=$('preferencesLanguage').value,profile=editorPreferencesDraft.formatting[mode];if(!profile)return;
    const select=formatPreferenceField,toggle=[[true,'Yes'],[false,'No']];let fields='';
    fields+=select('indentWidth','Indentation size',[['editor','Follow editor tab size'],[2,'2 columns'],[4,'4 columns'],[8,'8 columns']]);
    fields+=select('indentStyle','Indent with',[['spaces','Spaces'],['tabs','Tabs']]);
    fields+=`<label class="preference-field"><span>Preferred line width</span><input type="number" data-format-preference="printWidth" aria-label="Preferred line width" min="40" max="240" step="1" value="${profile.printWidth}" required></label>`;
    if(['java','javascript'].includes(mode)){
      fields+='<h3>Control statements</h3>';
      fields+=select('bracePolicy','Braces for if / loops',[['preserve','Keep existing braces'],['always','Always use braces'],['omit-simple','Omit for safe single statements']]);
      fields+=select('ifLayout','Single-statement if bodies',[['default','Formatter default'],['multiline','Separate lines'],['compact','Compact when they fit']]);
      fields+=select('bracePlacement','Opening control braces',[['same-line','Same line'],['next-line','Next line']]);
      fields+=select('elsePlacement','Else placement',[['same-line','With preceding closing brace'],['next-line','On its own line']]);
    }
    if(mode==='javascript'){
      fields+='<h3>JavaScript</h3>';
      fields+=select('quoteStyle','Preferred quotes',[['double','Double quotes'],['single','Single quotes']]);
      fields+=select('semicolons','Use semicolons',toggle);
      fields+=select('trailingComma','Trailing commas',[['all','Where supported'],['es5','Objects and arrays'],['none','None']]);
      fields+=select('arrowParens','Arrow function parameters',[['always','Always use parentheses'],['avoid','Omit for one parameter']]);
      fields+=select('objectWrap','Short object literals',[['preserve','Keep existing multiline objects'],['collapse','Fit on one line when possible']]);
    }else if(mode==='python'){
      fields+=select('quoteStyle','Preferred quotes',[['preserve','Keep existing quotes'],['double','Double quotes'],['single','Single quotes']]);
      fields+=select('magicTrailingComma','Trailing comma keeps lists multiline',toggle);
    }else if(mode==='html'){
      fields+=select('singleAttributePerLine','One attribute per line',toggle);
      fields+=select('bracketSameLine','Closing angle bracket on last attribute line',toggle);
      fields+=select('htmlWhitespaceSensitivity','HTML whitespace',[['css','Respect element display rules'],['strict','Preserve significant whitespace'],['ignore','Allow whitespace changes']]);
    }else if(mode==='bash'){
      fields+=select('binaryNextLine','Put a continued operator on the next line',toggle);
      fields+=select('functionNextLine','Put function opening brace on the next line',toggle);
      fields+=select('switchCaseIndent','Indent case branches',toggle);
      fields+=select('spaceRedirects','Space after redirection operators',toggle);
    }
    $('preferencesFormatFields').innerHTML=fields;
    $('preferencesFormatHint').textContent=['java','javascript'].includes(mode)?'Brace removal is limited to simple statements. Declarations, comments and nested if blocks keep their braces. Brace placement applies to if and loop blocks.':mode==='python'?'Python uses indentation for blocks. Quotes and line width are formatting preferences; braces are not valid for if statements.':mode==='html'?'Changing HTML whitespace can affect how inline content displays. The default respects element display rules.':mode==='json'?'JSON keeps double quotes and valid JSON punctuation. Line width is a preference rather than a hard limit.':'Line width is a preference. The formatter keeps language syntax, comments and literal contents intact.';
  }
  function renderEditorPreferences(){
    const appearance=editorPreferencesDraft.appearance;
    $('preferencesFontFamily').value=appearance.fontFamily;$('preferencesFontStyle').value=appearance.fontStyle;$('preferencesFontSize').value=String(editorPreferencesSize);$('preferencesLineHeight').value=String(appearance.lineHeight);
    $('preferencesAppearance').hidden=preferencesSection!=='appearance';$('preferencesFormatting').hidden=preferencesSection!=='formatting';
    for(const tab of document.querySelectorAll('[data-preferences-section]')){const selected=tab.dataset.preferencesSection===preferencesSection;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    const language=$('preferencesLanguage'),modes=preferencesSection==='formatting'?EditorStyle.modes:Object.keys(MODES),current=language.value;
    language.innerHTML=preferenceOptions(modes.map(mode=>[mode,MODES[mode]]),modes.includes(current)?current:'javascript');
    renderPreferenceColors();renderFormatPreferences();schedulePreferencesPreview();
  }
  function showEditorPreferences(section='appearance'){
    if(!ready||startupBlocked)return;
    closeMenus();preferencesSection=section;editorPreferencesBase=EditorStyle.normalize(state.settings.editorPreferences);editorPreferencesDraft=EditorStyle.normalize(editorPreferencesBase);editorPreferencesSize=editorPreferencesBaseSize=state.settings.fontSize;
    $('preferencesPalette').value=document.body.dataset.theme||'dark';$('preferencesLanguage').value=note()?.mode||'javascript';$('preferencesMessage').textContent='';
    renderEditorPreferences();$('editorPreferencesDialog').showModal();$('preferencesAppearanceTab').focus();
  }
  function previewPreferenceCode(text){$('preferencesPreviewCode').innerHTML=colorCode(text,$('preferencesLanguage').value);}
  function schedulePreferencesPreview(){
    if(!editorPreferencesDraft)return;
    clearTimeout(preferencesPreviewTimer);const sequence=++preferencesPreviewSequence,mode=$('preferencesLanguage').value,theme=$('preferencesPalette').value,appearance=editorPreferencesDraft.appearance,preview=$('preferencesPreview');
    preview.style.fontFamily=EditorStyle.font(appearance);preview.style.fontSize=editorPreferencesSize+'px';preview.style.lineHeight=Math.round(editorPreferencesSize*appearance.lineHeight)+'px';preview.style.fontWeight=appearance.fontStyle.includes('bold')?'700':'400';preview.style.fontStyle=appearance.fontStyle.includes('italic')?'italic':'normal';preview.style.tabSize=String(editorTabSize());preview.dataset.previewTheme=theme;preview.scrollTop=0;preview.scrollLeft=0;
    for(const [key]of EditorStyle.tokens)preview.style.setProperty('--syntax-'+key,appearance.colors[theme][key]);
    const source=preferenceSamples[mode];previewPreferenceCode(source);$('preferencesPreviewStatus').textContent=preferencesSection==='formatting'?'Updating preview…':'Sample preview';
    if(preferencesSection!=='formatting')return;
    const preferences=EditorStyle.profile(editorPreferencesDraft,mode,editorTabSize());
    preferencesPreviewTimer=setTimeout(async()=>{
      preferencesPreviewTimer=null;
      try{const result=await editorJob('format',{mode,text:source,filename:'preview.'+({javascript:'js',python:'py',bash:'sh'}[mode]||mode),tabSize:editorTabSize(),preferences});if(sequence===preferencesPreviewSequence&&editorPreferencesDraft){previewPreferenceCode(result);preview.scrollTop=0;preview.scrollLeft=0;$('preferencesPreviewStatus').textContent='Formatted sample · your file is unchanged';}}
      catch(error){if(sequence===preferencesPreviewSequence&&editorPreferencesDraft)$('preferencesPreviewStatus').textContent='Preview unavailable: '+error.message;}
    },180);
  }
  async function applyEditorPreferences(){
    if(!editorPreferencesDraft||!$('editorPreferencesForm').reportValidity())return false;
    const current=EditorStyle.normalize(state.settings.editorPreferences);
    state.settings.editorPreferences=EditorStyle.normalize(mergePreferenceDraft(editorPreferencesBase,editorPreferencesDraft,current));state.settings.editorPreferencesUpdatedAt=clock();
    if(editorPreferencesSize!==editorPreferencesBaseSize)state.settings.fontSize=editorPreferencesSize;
    applySettings();save();$('preferencesApply').disabled=true;
    try{await flush();$('editorPreferencesDialog').close();return true;}
    catch(error){$('preferencesMessage').textContent='Could not save preferences: '+error.message;return false;}
    finally{$('preferencesApply').disabled=false;}
  }
  function wireEditorPreferences(){
    const dialog=$('editorPreferencesDialog');
    $('editorPreferencesForm').addEventListener('submit',event=>{event.preventDefault();applyEditorPreferences().catch(error=>$('preferencesMessage').textContent=error.message);});
    for(const id of ['preferencesCancel','preferencesClose'])$(id).addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{clearTimeout(preferencesPreviewTimer);preferencesPreviewSequence++;editorPreferencesDraft=null;editorPreferencesBase=null;editor.focus();});
    dialog.addEventListener('click',event=>{
      const tab=event.target.closest('[data-preferences-section]');if(tab){preferencesSection=tab.dataset.preferencesSection;renderEditorPreferences();}
    });
    $('preferencesTabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();preferencesSection=event.key==='Home'?'appearance':event.key==='End'?'formatting':preferencesSection==='appearance'?'formatting':'appearance';renderEditorPreferences();$(preferencesSection==='appearance'?'preferencesAppearanceTab':'preferencesFormattingTab').focus();});
    $('preferencesLanguage').addEventListener('change',()=>{renderFormatPreferences();schedulePreferencesPreview();});
    $('preferencesPalette').addEventListener('change',()=>{renderPreferenceColors();schedulePreferencesPreview();});
    $('preferencesColors').addEventListener('input',event=>{
      const key=event.target.dataset.syntaxColor||event.target.dataset.syntaxHex;if(!key||!/^#[\da-f]{6}$/i.test(event.target.value))return;
      const value=event.target.value.toLowerCase();editorPreferencesDraft.appearance.colors[$('preferencesPalette').value][key]=value;
      $('preferencesColors').querySelector(`[data-syntax-color="${key}"]`).value=value;$('preferencesColors').querySelector(`[data-syntax-hex="${key}"]`).value=value;schedulePreferencesPreview();
    });
    $('preferencesResetPalette').addEventListener('click',()=>{const theme=$('preferencesPalette').value;editorPreferencesDraft.appearance.colors[theme]={...EditorStyle.palettes[theme]};renderPreferenceColors();schedulePreferencesPreview();});
    $('preferencesResetFormat').addEventListener('click',()=>{const mode=$('preferencesLanguage').value;editorPreferencesDraft.formatting[mode]=EditorStyle.normalize().formatting[mode];renderFormatPreferences();schedulePreferencesPreview();});
    $('preferencesResetAll').addEventListener('click',()=>{editorPreferencesDraft=EditorStyle.normalize();editorPreferencesSize=15;renderEditorPreferences();});
    $('preferencesFontFamily').addEventListener('input',event=>{editorPreferencesDraft.appearance.fontFamily=event.target.value.trim().slice(0,100);schedulePreferencesPreview();});
    $('preferencesFontStyle').addEventListener('change',event=>{editorPreferencesDraft.appearance.fontStyle=event.target.value;schedulePreferencesPreview();});
    $('preferencesFontSize').addEventListener('input',event=>{if(event.target.validity.valid){editorPreferencesSize=Number(event.target.value);schedulePreferencesPreview();}});
    $('preferencesLineHeight').addEventListener('input',event=>{if(event.target.validity.valid){editorPreferencesDraft.appearance.lineHeight=Number(event.target.value);schedulePreferencesPreview();}});
    $('preferencesFormatFields').addEventListener('change',event=>{
      const key=event.target.dataset.formatPreference;if(!key)return;const value=event.target.value;
      editorPreferencesDraft.formatting[$('preferencesLanguage').value][key]=event.target.type==='number'?Number(value):value==='true'?true:value==='false'?false:value;schedulePreferencesPreview();
    });
  }
