  let editorPreferencesDraft=null,editorPreferencesBase=null,editorPreferencesSize=15,editorPreferencesBaseSize=15,preferencesSection='themes',preferencesPreviewSequence=0,preferencesPreviewTimer=null,preferencesPaintFrame=0,preferencesSelectedColor=null,preferencesPicker=null;
  const preferenceSections=[['themes','preferencesThemes','preferencesThemesTab'],['colors','preferencesColorsPanel','preferencesColorsTab'],['font','preferencesFont','preferencesFontTab'],['formatting','preferencesFormatting','preferencesFormattingTab']];
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
    for(const [key]of EditorStyle.surfaceTokens)document.body.style.setProperty('--'+key,appearance.surfaces[theme][key]);
    for(const [key]of EditorStyle.tokens)document.body.style.setProperty('--syntax-'+key,appearance.colors[theme][key]);
    for(const [key,token]of [['comment','comment'],['string','string'],['key','property'],['number','number'],['keyword','keyword'],['variable','variable']])document.body.style.setProperty('--'+key,appearance.colors[theme][token]);
    document.documentElement.style.backgroundColor=appearance.surfaces[theme].paper;
    if(typeof minimapPaintKey!=='undefined')minimapPaintKey=null;
    return appearance.lineHeight;
  }
  function mergePreferenceDraft(base,draft,current){
    if(JSON.stringify(base)===JSON.stringify(draft))return current;
    if(!draft||typeof draft!=='object'||Array.isArray(draft))return draft;
    const result={...current};for(const key of Object.keys(base||{}))if(!Object.hasOwn(draft,key))delete result[key];
    for(const key of Object.keys(draft))result[key]=mergePreferenceDraft(base?.[key],draft[key],current?.[key]);return result;
  }
  function preferenceOptions(values,selected){return values.map(([value,label])=>`<option value="${escape(value)}"${String(value)===String(selected)?' selected':''}>${escape(label)}</option>`).join('');}
  // Colors are grouped by where they appear. Each key is "syntax:token" or "surface:token", matching data-pref in the preview.
  const preferenceColorGroups=[
    ['Syntax','syntax',['text','keyword','string','number','comment','variable','command','property','operator']],
    ['Markdown','syntax',['heading','emphasis','code','fence'],'Markdown files'],
    ['Editor','surface',['paper','active-line','selection','caret','find-match','gutter','code']],
    ['Tabs','surface',['tabs','active-tab','inactive-tab','tab-text','tab-divider']],
    ['Menu & status bars','surface',['chrome','chrome-text','status','status-text']],
    ['Panels & controls','surface',['panel','raised','hover','selected','line','line-soft']],
    ['Text & accents','surface',['text','muted','accent','good','danger']]
  ];
  // Short examples for syntax colors that the chosen sample language does not use.
  const previewExtraSamples={keyword:'return',string:'"text"',number:'42',comment:'// note',variable:'value',command:'echo',property:'class=',operator:'=>',heading:'# Heading',code:'`code`',fence:'```',emphasis:'**bold**'};
  function preferenceColorLabel(pref){
    const [kind,key]=pref.split(':'),label=(kind==='syntax'?EditorStyle.tokens:EditorStyle.surfaceTokens).find(([token])=>token===key)?.[1]||key;
    return kind==='syntax'&&key==='text'?'Code text':kind==='syntax'&&key==='code'?'Markdown inline code':label;
  }
  function preferenceColorValue(pref){const [kind,key]=pref.split(':');return editorPreferencesDraft.appearance[kind==='syntax'?'colors':'surfaces'][$('preferencesPalette').value][key];}
  function renderPreferenceColors(){
    const target=$('preferencesColorGroups'),scroll=$('preferencesColorsPanel').closest('.preferences-controls')?.scrollTop;
    const grouped=new Set(preferenceColorGroups.flatMap(([,kind,keys])=>keys.map(key=>kind+':'+key)));
    const extra=[...EditorStyle.tokens.map(([key])=>'syntax:'+key),...EditorStyle.surfaceTokens.map(([key])=>'surface:'+key)].filter(pref=>!grouped.has(pref));
    const groups=[...preferenceColorGroups.map(([title,kind,keys,note])=>[title,keys.map(key=>kind+':'+key),note]),...(extra.length?[['Other',extra]]:[])];
    target.innerHTML=groups.map(([title,prefs,note])=>`<div class="preference-color-group"><h3>${escape(title)}${note?` <small>${escape(note)}</small>`:''}</h3>${prefs.map(pref=>{
      const [kind,key]=pref.split(':'),value=preferenceColorValue(pref),label=escape(preferenceColorLabel(pref)),id=`preferenceColor-${kind}-${key}`;
      return `<div class="preference-color-row${pref===preferencesSelectedColor?' selected':''}" data-pref-row="${pref}"><label for="${id}">${label}</label><button type="button" class="preference-swatch" data-pref-swatch="${pref}" aria-expanded="false" aria-label="Choose ${label} color" title="Choose a color" style="--swatch-color:${value}"></button><input id="${id}" type="text" value="${value}" data-${kind}-hex="${key}" aria-label="${label} hex color" pattern="#[0-9a-fA-F]{6}" maxlength="7" spellcheck="false" required></div>`;
    }).join('')}</div>`).join('');
    if(preferencesPicker)openPreferencePicker(preferencesPicker.pref,false);
    if(scroll!==undefined)$('preferencesColorsPanel').closest('.preferences-controls').scrollTop=scroll;
    renderPreferenceThemes();
  }
  function setPreferenceColor(pref,value,source=''){
    if(!editorPreferencesDraft||!/^#[\da-f]{6}$/i.test(value))return;
    const [kind,key]=pref.split(':'),mode=$('preferencesPalette').value,row=document.querySelector(`[data-pref-row="${pref}"]`);value=value.toLowerCase();
    editorPreferencesDraft.appearance[kind==='syntax'?'colors':'surfaces'][mode][key]=value;
    if(row){row.querySelector('[data-pref-swatch]').style.setProperty('--swatch-color',value);if(source!=='text')row.querySelector('input').value=value;}
    if(source!=='picker'&&preferencesPicker?.pref===pref)syncPreferencePicker(value);
    queuePreferencePaint();
  }
  function queuePreferencePaint(){
    if(preferencesPaintFrame)return;
    preferencesPaintFrame=requestAnimationFrame(()=>{preferencesPaintFrame=0;if(!editorPreferencesDraft)return;paintPreferencesPreview();renderPreferenceThemes();});
  }
  function hexRGB(value){return {r:parseInt(value.slice(1,3),16),g:parseInt(value.slice(3,5),16),b:parseInt(value.slice(5,7),16)};}
  function preferencePickerElement(){
    let picker=$('preferencesPicker');if(picker)return picker;
    picker=document.createElement('div');picker.id='preferencesPicker';picker.className='preference-picker';
    picker.innerHTML='<div class="preference-picker-plane" role="slider" tabindex="0" aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="preference-picker-thumb"></span></div><input type="range" class="preference-picker-hue" min="0" max="360" step="1" value="0" aria-label="Hue"><div><p class="preference-picker-label">Colors in this theme</p><div class="preference-picker-swatches" role="group" aria-label="Colors in this theme"></div></div><div class="preference-picker-actions"><button type="button" data-picker-action="revert"></button><button type="button" data-picker-action="done">Done</button></div>';
    const plane=picker.querySelector('.preference-picker-plane');let drag=null;
    const move=event=>{if(!drag||event.pointerId!==drag.id)return;const {s,v}=colorPlanePosition(event.clientX,event.clientY,drag.rect);setPreferencePickerHSV({...preferencesPicker.hsv,s,v});};
    plane.addEventListener('pointerdown',event=>{if(event.button!==0||!preferencesPicker)return;event.preventDefault();plane.focus({preventScroll:true});drag={id:event.pointerId,rect:plane.getBoundingClientRect()};try{plane.setPointerCapture(event.pointerId);}catch(_){}move(event);});
    plane.addEventListener('pointermove',move);
    plane.addEventListener('pointerup',event=>{move(event);drag=null;});
    for(const name of ['pointercancel','lostpointercapture'])plane.addEventListener(name,()=>drag=null);
    plane.addEventListener('keydown',event=>{
      if(!preferencesPicker)return;const step=event.shiftKey?.1:.02,{s,v}=preferencesPicker.hsv;
      const next={ArrowLeft:[s-step,v],ArrowRight:[s+step,v],ArrowUp:[s,v+step],ArrowDown:[s,v-step]}[event.key];
      if(next){event.preventDefault();setPreferencePickerHSV({...preferencesPicker.hsv,s:Math.max(0,Math.min(1,next[0])),v:Math.max(0,Math.min(1,next[1]))});}
    });
    picker.querySelector('.preference-picker-hue').addEventListener('input',event=>{if(preferencesPicker)setPreferencePickerHSV({...preferencesPicker.hsv,h:Number(event.target.value)});});
    picker.addEventListener('click',event=>{
      const swatch=event.target.closest('[data-picker-color]'),action=event.target.closest('[data-picker-action]')?.dataset.pickerAction;if(!preferencesPicker)return;
      if(swatch)setPreferenceColor(preferencesPicker.pref,swatch.dataset.pickerColor);
      else if(action==='revert')setPreferenceColor(preferencesPicker.pref,preferencesPicker.original);
      else if(action==='done'){const pref=preferencesPicker.pref;closePreferencePicker();document.querySelector(`[data-pref-swatch="${pref}"]`)?.focus();}
    });
    picker.addEventListener('keydown',event=>{if(event.key==='Escape'&&preferencesPicker){event.preventDefault();event.stopPropagation();const pref=preferencesPicker.pref;closePreferencePicker();document.querySelector(`[data-pref-swatch="${pref}"]`)?.focus();}});
    return picker;
  }
  function setPreferencePickerHSV(hsv){
    preferencesPicker.hsv=hsv;const value=rgbaHex(hsvToRGB(hsv.h,hsv.s,hsv.v));
    setPreferenceColor(preferencesPicker.pref,value,'picker');paintPreferencePicker(value);
  }
  function syncPreferencePicker(value){if(!preferencesPicker)return;preferencesPicker.hsv=rgbToHSV(hexRGB(value),preferencesPicker.hsv.h);paintPreferencePicker(value);}
  function paintPreferencePicker(value){
    const picker=preferencePickerElement(),{hsv,original}=preferencesPicker,plane=picker.querySelector('.preference-picker-plane'),thumb=picker.querySelector('.preference-picker-thumb');
    plane.style.setProperty('--picker-hue',`hsl(${hsv.h}, 100%, 50%)`);thumb.style.left=hsv.s*100+'%';thumb.style.top=(1-hsv.v)*100+'%';thumb.style.background=value;
    plane.setAttribute('aria-valuenow',String(Math.round(hsv.s*100)));plane.setAttribute('aria-valuetext',`${value}, ${Math.round(hsv.s*100)}% saturation, ${Math.round(hsv.v*100)}% brightness`);
    if(document.activeElement!==picker.querySelector('.preference-picker-hue'))picker.querySelector('.preference-picker-hue').value=String(Math.round(hsv.h));
    const revert=picker.querySelector('[data-picker-action="revert"]');revert.textContent='Revert to '+original;revert.disabled=value===original;
    for(const button of picker.querySelectorAll('[data-picker-color]'))button.setAttribute('aria-pressed',String(button.dataset.pickerColor===value));
  }
  function openPreferencePicker(pref,fresh=true){
    const row=document.querySelector(`[data-pref-row="${pref}"]`);if(!row)return null;
    const value=preferenceColorValue(pref),picker=preferencePickerElement(),mode=$('preferencesPalette').value,appearance=editorPreferencesDraft.appearance;
    if(fresh||preferencesPicker?.pref!==pref)preferencesPicker={pref,original:value,hsv:rgbToHSV(hexRGB(value))};
    const colors=[...new Set([...Object.values(appearance.colors[mode]),...Object.values(appearance.surfaces[mode])])].slice(0,32);
    picker.querySelector('.preference-picker-swatches').innerHTML=colors.map(color=>`<button type="button" data-picker-color="${color}" aria-label="Use ${color}" title="${color}" aria-pressed="false" style="--swatch-color:${color}"></button>`).join('');
    picker.setAttribute('aria-label',preferenceColorLabel(pref)+' color');
    for(const swatch of document.querySelectorAll('[data-pref-swatch]'))swatch.setAttribute('aria-expanded',String(swatch.dataset.prefSwatch===pref));
    row.after(picker);paintPreferencePicker(value);return picker;
  }
  function closePreferencePicker(){
    preferencesPicker=null;$('preferencesPicker')?.remove();
    for(const swatch of document.querySelectorAll('[data-pref-swatch]'))swatch.setAttribute('aria-expanded','false');
  }
  function selectPreferenceColor(pref,{picker=true,focus=true}={}){
    if(!editorPreferencesDraft)return;
    preferencesSelectedColor=pref;
    if(preferencesSection!=='colors'){preferencesSection='colors';renderEditorPreferences();}
    for(const item of document.querySelectorAll('[data-pref-row]'))item.classList.toggle('selected',item.dataset.prefRow===pref);
    if(preferencesSection!=='formatting')$('preferencesPreviewStatus').textContent=previewStatusText();
    const row=document.querySelector(`[data-pref-row="${pref}"]`);if(!row)return;
    const panel=picker?openPreferencePicker(pref):null;
    panel?.scrollIntoView({block:'nearest'});row.scrollIntoView({block:'nearest'});
    if(focus)row.querySelector('[data-pref-swatch]').focus({preventScroll:true});
    markPreviewSelection();
  }
  // Common monospace fonts, listed only when installed. Metric-compatible aliases come after the fonts they resolve to.
  const preferenceFontCandidates=['Cascadia Mono','Cascadia Code','Consolas','Lucida Console','Adwaita Mono','DejaVu Sans Mono','Liberation Mono','Cousine','Noto Sans Mono','Source Code Pro','Red Hat Mono','Ubuntu Mono','Fira Mono','Fira Code','JetBrains Mono','Hack','Inconsolata','Roboto Mono','IBM Plex Mono','Iosevka','Victor Mono','SF Mono','Menlo','Monaco','Nimbus Mono PS','Courier New'];
  let preferenceFonts=null;
  function installedPreferenceFonts(){
    if(preferenceFonts)return preferenceFonts;
    const context=document.createElement('canvas').getContext('2d');if(!context)return preferenceFonts=[];
    const signature=family=>{context.font='72px '+family;const metrics=context.measureText('mmMWil10O@{}gjpqy_&');return [metrics.width,metrics.actualBoundingBoxAscent,metrics.actualBoundingBoxDescent,metrics.actualBoundingBoxLeft,metrics.actualBoundingBoxRight].map(value=>Math.round(value*10)).join();};
    const fallback=signature('serif'),seen=new Set();
    return preferenceFonts=preferenceFontCandidates.filter(name=>{const value=signature(JSON.stringify(name)+',serif');if(value===fallback||seen.has(value))return false;seen.add(value);return true;});
  }
  function renderPreferenceFonts(){
    const current=editorPreferencesDraft.appearance.fontFamily,fonts=installedPreferenceFonts(),known=!current||fonts.some(name=>name.toLowerCase()===current.toLowerCase());
    $('preferencesFontFamily').innerHTML=preferenceOptions([['','System monospace (default)'],...(known?[]:[[current,current+' (not installed)']]),...fonts.map(name=>[name,name])],fonts.find(name=>name.toLowerCase()===current.toLowerCase())||current);
  }
  function renderPreferenceThemes(){
    const draft=editorPreferencesDraft,mode=$('preferencesPalette').value;
    for(const [key,id]of [['dark','preferencesThemeDark'],['light','preferencesThemeLight']]){
      const themes=EditorStyle.availableThemes(draft,key),selected=draft.appearance.selectedThemes[key],found=themes.find(theme=>theme.id===selected),unchanged=EditorStyle.selectedTheme(draft,key);
      const options=items=>preferenceOptions(items.map(theme=>[theme.id,theme.name+(theme.id===selected&&!unchanged?' (modified)':'')]),selected);
      $(id).innerHTML=(!found?'<option value="custom" selected>Custom colors (unsaved theme)</option>':'')+'<optgroup label="Built-in themes">'+options(themes.filter(theme=>!theme.id.startsWith('custom-')))+'</optgroup>'+(themes.some(theme=>theme.id.startsWith('custom-'))?'<optgroup label="My themes">'+options(themes.filter(theme=>theme.id.startsWith('custom-')))+'</optgroup>':'');
    }
    const id=draft.appearance.selectedThemes[mode],saved=draft.customThemes[id],preset=EditorStyle.presets.find(theme=>theme.id===id);
    $('preferencesSaveHeading').textContent='My '+mode+' mode themes';
    $('preferencesUpdateTheme').disabled=!saved;$('preferencesDeleteTheme').disabled=!saved;
    syncSelectControls();
    $('preferencesThemeSource').textContent=preset?preset.name+' · '+(typeof preset.author==='object'?preset.author.name:preset.author||preset.extension):saved?'Saved theme for '+mode+' mode.':'Customize the colors below, then save a named theme to use again.';
  }
  function setPreferenceTheme(mode,id){
    editorPreferencesDraft=EditorStyle.useTheme(editorPreferencesDraft,mode,id);$('preferencesPalette').value=mode;syncSelectControls();
    $('preferencesThemeName').value=editorPreferencesDraft.customThemes[id]?.name||'';$('preferencesThemeStatus').textContent='';
    renderPreferenceColors();schedulePreferencesPreview(false);
  }
  function savePreferenceTheme(update=false){
    if(!editorPreferencesDraft||!$('editorPreferencesForm').reportValidity())return false;
    const name=EditorStyle.themeName($('preferencesThemeName').value),mode=$('preferencesPalette').value,draft=editorPreferencesDraft;
    if(!name){$('preferencesThemeStatus').textContent='Enter a name for your theme.';$('preferencesThemeName').focus();return false;}
    const previous=draft.appearance.selectedThemes[mode],id=update?previous:'custom-'+uid();
    if(update&&!draft.customThemes[id])return false;
    if(Object.entries(draft.customThemes).some(([key,theme])=>key!==id&&theme.mode===mode&&theme.name.toLowerCase()===name.toLowerCase())){$('preferencesThemeStatus').textContent='A theme with this name already exists for '+mode+' mode. Choose another name, or select it and use Update saved theme.';return false;}
    if(!update&&Object.keys(draft.customThemes).length>=100){$('preferencesThemeStatus').textContent='You have 100 saved themes. Delete a saved theme before adding another.';return false;}
    draft.customThemes[id]={name,mode,colors:{...draft.appearance.colors[mode]},surfaces:{...draft.appearance.surfaces[mode]}};draft.appearance.selectedThemes[mode]=id;
    $('preferencesThemeName').value=name;renderPreferenceThemes();$('preferencesThemeStatus').textContent='Theme '+(update?'updated':'saved')+' in this preview. Apply to keep it.';return true;
  }
  function deletePreferenceTheme(){
    const mode=$('preferencesPalette').value,id=editorPreferencesDraft.appearance.selectedThemes[mode];if(!editorPreferencesDraft.customThemes[id])return;
    delete editorPreferencesDraft.customThemes[id];editorPreferencesDraft.appearance.selectedThemes[mode]='custom';$('preferencesThemeName').value='';renderPreferenceThemes();$('preferencesThemeStatus').textContent='Removed from My themes. Apply to keep this change; the current colors are retained.';
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
    $('preferencesFormatFields').innerHTML=fields;$('preferencesFormatFields').querySelectorAll('select').forEach(enhanceSelect);syncSelectControls();
    $('preferencesFormatHint').textContent=['java','javascript'].includes(mode)?'Brace removal is limited to simple statements. Declarations, comments and nested if blocks keep their braces. Brace placement applies to if and loop blocks.':mode==='python'?'Python uses indentation for blocks. Quotes and line width are formatting preferences; braces are not valid for if statements.':mode==='html'?'Changing HTML whitespace can affect how inline content displays. The default respects element display rules.':mode==='json'?'JSON keeps double quotes and valid JSON punctuation. Line width is a preference rather than a hard limit.':'Line width is a preference. The formatter keeps language syntax, comments and literal contents intact.';
  }
  function renderEditorPreferences(){
    const appearance=editorPreferencesDraft.appearance;
    renderPreferenceFonts();$('preferencesFontStyle').value=appearance.fontStyle;$('preferencesFontSize').value=String(editorPreferencesSize);$('preferencesLineHeight').value=String(appearance.lineHeight);
    for(const [section,id]of preferenceSections)$(id).hidden=preferencesSection!==section;
    for(const tab of document.querySelectorAll('[data-preferences-section]')){const selected=tab.dataset.preferencesSection===preferencesSection;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    const language=$('preferencesLanguage'),modes=preferencesSection==='formatting'?EditorStyle.modes:Object.keys(MODES),current=language.value;
    language.innerHTML=preferenceOptions(modes.map(mode=>[mode,MODES[mode]]),modes.includes(current)?current:'javascript');
    if(preferencesSection!=='colors')closePreferencePicker();
    renderPreferenceColors();renderFormatPreferences();syncSelectControls();schedulePreferencesPreview();
  }
  function showPreferenceSection(section,focus=false){
    preferencesSection=section;renderEditorPreferences();
    if(focus)$(preferenceSections.find(([name])=>name===section)[2]).focus();
  }
  function showEditorPreferences(section='themes'){
    if(!ready||startupBlocked)return;
    closeMenus();preferencesSection=preferenceSections.some(([name])=>name===section)?section:'themes';editorPreferencesBase=EditorStyle.normalize(state.settings.editorPreferences);editorPreferencesDraft=EditorStyle.normalize(editorPreferencesBase);editorPreferencesSize=editorPreferencesBaseSize=state.settings.fontSize;
    preferencesSelectedColor=null;preferencesPicker=null;$('preferencesPicker')?.remove();
    $('preferencesPalette').value=document.body.dataset.theme||'dark';$('preferencesLanguage').value=note()?.mode||'javascript';$('preferencesMessage').textContent='';
    $('preferencesThemeName').value=editorPreferencesDraft.customThemes[editorPreferencesDraft.appearance.selectedThemes[$('preferencesPalette').value]]?.name||'';$('preferencesThemeStatus').textContent='';
    renderEditorPreferences();$('editorPreferencesDialog').showModal();$(preferenceSections.find(([name])=>name===preferencesSection)[2]).focus();
  }
  function previewPreferenceCode(text){
    const code=$('preferencesPreviewCode');code.innerHTML=colorCode(text,$('preferencesLanguage').value);
    const missing=EditorStyle.tokens.map(([key])=>key).filter(key=>previewExtraSamples[key]&&!code.querySelector('.tok-'+key));
    $('preferencesPreviewExtra').hidden=!missing.length;
    $('preferencesPreviewExtra').innerHTML=missing.length?'<span data-pref="surface:muted">Other files</span>'+missing.map(key=>`<span class="tok-${key}" data-pref="syntax:${key}">${escape(previewExtraSamples[key])}</span>`).join(''):'';
  }
  function paintPreferencesPreview(){
    const theme=$('preferencesPalette').value,appearance=editorPreferencesDraft.appearance,frame=$('preferencesThemePreview');
    frame.dataset.previewTheme=theme;frame.style.colorScheme=theme;
    for(const [key]of EditorStyle.surfaceTokens)frame.style.setProperty('--'+key,appearance.surfaces[theme][key]);
    for(const [key]of EditorStyle.tokens)frame.style.setProperty('--syntax-'+key,appearance.colors[theme][key]);
    frame.style.setProperty('--pv-outline',appearance.surfaces[theme].accent);
  }
  function previewMarkRanges(text){
    const lines=text.split('\n'),starts=[];let offset=0;for(const line of lines){starts.push(offset);offset+=line.length+1;}
    const filled=lines.map((line,index)=>index).filter(index=>lines[index].trim());if(!filled.length)return {lines,marks:[],current:0,column:1};
    const indent=index=>lines[index].match(/^\s*/)[0].length;
    const selected=filled[Math.min(1,filled.length-1)],current=filled[Math.min(2,filled.length-1)];
    const selectStart=starts[selected]+indent(selected),caretColumn=indent(current)+Math.min(6,lines[current].length-indent(current));
    const marks=[{pref:'surface:selection',start:selectStart,end:starts[selected]+lines[selected].length,newline:true}];
    const word=['Hello','count','name','card','font'].find(item=>text.includes(item));
    for(let index=word?text.indexOf(word):-1,found=0;index>=0&&found<6;index=text.indexOf(word,index+word.length),found++)marks.push({pref:'surface:find-match',start:index,end:index+word.length});
    marks.push({pref:'surface:caret',start:starts[current]+caretColumn,end:starts[current]+caretColumn});
    return {lines,marks,current,column:caretColumn+1};
  }
  function previewTextRange(root,start,end){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),range=document.createRange();let offset=0,node,started=false;
    while((node=walker.nextNode())){
      const length=node.data.length;
      if(!started&&start<=offset+length){range.setStart(node,start-offset);started=true;}
      if(started&&end<=offset+length){range.setEnd(node,end-offset);return range;}
      offset+=length;
    }
    return started?range:null;
  }
  function layoutPreferenceMarks(){
    const preview=$('preferencesPreview'),code=$('preferencesPreviewCode'),layer=$('preferencesPreviewMarks');if(!preview||!editorPreferencesDraft)return;
    const {lines,marks,current,column}=previewMarkRanges(code.textContent),lineHeight=parseFloat(preview.style.lineHeight)||20,top=parseFloat(getComputedStyle(preview).paddingTop)||0,box=preview.getBoundingClientRect();
    const x=value=>value-box.left-preview.clientLeft+preview.scrollLeft,parts=[];
    const lineOf=offset=>code.textContent.slice(0,offset).split('\n').length-1;
    parts.push(`<span class="pv-mark-line" data-pref="surface:active-line" style="left:0;top:${top+current*lineHeight}px;width:${Math.max(preview.scrollWidth,preview.clientWidth)}px;height:${lineHeight}px"></span>`);
    for(const mark of marks){
      const caret=mark.start===mark.end,range=previewTextRange(code,caret?Math.max(0,mark.start-1):mark.start,caret?mark.start:mark.end);if(!range)continue;
      const rect=range.getBoundingClientRect(),left=caret&&mark.start>0&&code.textContent[mark.start-1]!=='\n'?x(rect.right):x(rect.left);
      const width=caret?2:Math.max(2,rect.width)+(mark.newline?Math.round(lineHeight*.6):0);
      parts.push(`<span class="${caret?'pv-mark-caret':mark.pref==='surface:selection'?'pv-mark-selection':'pv-mark-find'}" data-pref="${mark.pref}" style="left:${left-(caret?1:0)}px;top:${top+lineOf(mark.start)*lineHeight}px;width:${width}px;height:${lineHeight}px"></span>`);
    }
    layer.innerHTML=parts.join('');
    $('preferencesPreviewGutter').innerHTML=lines.map((line,index)=>index===current?`<b>${index+1}</b>`:String(index+1)).join('\n');
    $('preferencesThemePreview').querySelector('.pv-status [data-pref]').textContent=`Ln ${current+1}, Col ${column}`;
    markPreviewSelection();
  }
  function schedulePreferencesPreview(resetScroll=true){
    if(!editorPreferencesDraft)return;
    clearTimeout(preferencesPreviewTimer);const sequence=++preferencesPreviewSequence,mode=$('preferencesLanguage').value,theme=$('preferencesPalette').value,appearance=editorPreferencesDraft.appearance,preview=$('preferencesPreview'),gutter=$('preferencesPreviewGutter');
    $('preferencesPreviewExtra').style.fontFamily=EditorStyle.font(appearance);
    for(const target of [preview,gutter]){target.style.fontFamily=EditorStyle.font(appearance);target.style.fontSize=editorPreferencesSize+'px';target.style.lineHeight=Math.round(editorPreferencesSize*appearance.lineHeight)+'px';target.style.fontWeight=appearance.fontStyle.includes('bold')?'700':'400';target.style.fontStyle=appearance.fontStyle.includes('italic')?'italic':'normal';}
    preview.style.tabSize=String(editorTabSize());preview.dataset.previewTheme=theme;if(resetScroll){preview.scrollTop=0;preview.scrollLeft=0;}
    paintPreferencesPreview();
    $('preferencesPreviewTab').textContent='sample.'+({javascript:'js',python:'py',bash:'sh',markdown:'md',text:'txt'}[mode]||mode);
    $('preferencesPreviewMode').textContent='UTF-8 · '+(MODES[mode]||mode);
    const source=preferenceSamples[mode];previewPreferenceCode(source);requestAnimationFrame(layoutPreferenceMarks);
    $('preferencesPreviewStatus').textContent=preferencesSection==='formatting'?'Updating preview…':previewStatusText();
    if(preferencesSection!=='formatting')return;
    const preferences=EditorStyle.profile(editorPreferencesDraft,mode,editorTabSize());
    preferencesPreviewTimer=setTimeout(async()=>{
      preferencesPreviewTimer=null;
      try{const result=await editorJob('format',{mode,text:source,filename:'preview.'+({javascript:'js',python:'py',bash:'sh'}[mode]||mode),tabSize:editorTabSize(),preferences});if(sequence===preferencesPreviewSequence&&editorPreferencesDraft){previewPreferenceCode(result);layoutPreferenceMarks();preview.scrollTop=0;preview.scrollLeft=0;$('preferencesPreviewStatus').textContent='Formatted sample · your file is unchanged';}}
      catch(error){if(sequence===preferencesPreviewSequence&&editorPreferencesDraft)$('preferencesPreviewStatus').textContent='Preview unavailable: '+error.message;}
    },180);
  }
  function previewStatusText(){return preferencesSelectedColor&&preferencesSection==='colors'?'Editing '+preferenceColorLabel(preferencesSelectedColor)+' · click another part of the preview to change it':'Click any part of the preview to edit its color';}
  // Marks and borders are hit-tested by position because they sit under the text or are only one pixel wide.
  function previewPrefAt(event){
    const frame=$('preferencesThemePreview'),preview=$('preferencesPreview'),inside=(rect,pad=0)=>event.clientX>=rect.left-pad&&event.clientX<=rect.right+pad&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
    if(preview.contains(event.target)){
      // Caret and search matches are small, so they win; tokens win inside the selection and current line.
      const marks=[...$('preferencesPreviewMarks').children],markAt=(...prefs)=>marks.find(mark=>prefs.includes(mark.dataset.pref)&&inside(mark.getBoundingClientRect(),mark.classList.contains('pv-mark-caret')?3:0));
      let hit=markAt('surface:caret')||markAt('surface:find-match');if(hit)return {pref:hit.dataset.pref,element:hit};
      const token=event.target.closest?.('[class*="tok-"]'),kind=token?.className.match(/\btok-([a-z]+)/)?.[1];
      if(kind&&EditorStyle.tokens.some(([key])=>key===kind))return {pref:'syntax:'+kind,element:token};
      hit=markAt('surface:selection')||markAt('surface:active-line');if(hit)return {pref:hit.dataset.pref,element:hit};
      return event.target===preview?{pref:'surface:paper',element:preview.parentElement}:{pref:'syntax:text',element:null};
    }
    for(let element=event.target;element&&element!==frame.parentElement;element=element.parentElement){
      if(element.dataset?.prefBorder){
        const rect=element.getBoundingClientRect(),style=getComputedStyle(element),edge=4;
        if((parseFloat(style.borderTopWidth)&&event.clientY-rect.top<=edge)||(parseFloat(style.borderBottomWidth)&&rect.bottom-event.clientY<=edge)||(parseFloat(style.borderLeftWidth)&&event.clientX-rect.left<=edge)||(parseFloat(style.borderRightWidth)&&rect.right-event.clientX<=edge))return {pref:element.dataset.prefBorder,element};
      }
      if(element.dataset?.pref)return {pref:element.dataset.pref,element};
    }
    return null;
  }
  function markPreviewSelection(){
    const frame=$('preferencesThemePreview');for(const element of frame.querySelectorAll('.pv-picked'))element.classList.remove('pv-picked');
    const pref=preferencesSelectedColor;if(!pref||!editorPreferencesDraft||preferencesSection!=='colors')return;const [kind,key]=pref.split(':');
    const elements=kind==='syntax'?key==='text'?[]:frame.querySelectorAll(`.tok-${key}`):frame.querySelectorAll(`[data-pref="${pref}"],[data-pref-border="${pref}"]`);
    for(const element of elements)element.classList.add('pv-picked');
  }
  function wirePreferencePreview(){
    const frame=$('preferencesThemePreview');let hot=null;
    const clearHot=()=>{hot?.classList.remove('pv-hot');hot=null;};
    frame.addEventListener('pointermove',event=>{
      if(!editorPreferencesDraft)return;const found=previewPrefAt(event);
      if(found?.element!==hot){clearHot();if(found?.element&&found.element!==frame){hot=found.element;hot.classList.add('pv-hot');}}
      $('preferencesPreviewStatus').textContent=found?preferenceColorLabel(found.pref)+' · '+preferenceColorValue(found.pref)+' · click to edit':previewStatusText();
    });
    frame.addEventListener('pointerleave',()=>{clearHot();if(editorPreferencesDraft&&preferencesSection!=='formatting')$('preferencesPreviewStatus').textContent=previewStatusText();});
    frame.addEventListener('click',event=>{const found=previewPrefAt(event);if(found){event.preventDefault();selectPreferenceColor(found.pref);}});
    $('preferencesPreviewMenu').addEventListener('click',event=>{const shown=event.currentTarget.getAttribute('aria-pressed')!=='true';event.currentTarget.setAttribute('aria-pressed',String(shown));frame.classList.toggle('pv-menu-hidden',!shown);});
    $('preferencesPreview').addEventListener('scroll',()=>{$('preferencesPreviewGutter').scrollTop=$('preferencesPreview').scrollTop;});
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
    dialog.addEventListener('close',()=>{if(dialog.open)return;closeMenus();clearTimeout(preferencesPreviewTimer);cancelAnimationFrame(preferencesPaintFrame);preferencesPaintFrame=0;preferencesPreviewSequence++;closePreferencePicker();editorPreferencesDraft=null;editorPreferencesBase=null;editor.focus();});
    dialog.addEventListener('click',event=>{const tab=event.target.closest('[data-preferences-section]');if(tab)showPreferenceSection(tab.dataset.preferencesSection);});
    $('preferencesTabs').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
      const index=preferenceSections.findIndex(([name])=>name===preferencesSection),count=preferenceSections.length;
      const next=event.key==='Home'?0:event.key==='End'?count-1:(index+(event.key==='ArrowRight'?1:-1)+count)%count;
      showPreferenceSection(preferenceSections[next][0],true);
    });
    $('preferencesLanguage').addEventListener('change',()=>{renderFormatPreferences();schedulePreferencesPreview();});
    $('preferencesPalette').addEventListener('change',()=>{const mode=$('preferencesPalette').value;$('preferencesThemeName').value=editorPreferencesDraft.customThemes[editorPreferencesDraft.appearance.selectedThemes[mode]]?.name||'';$('preferencesThemeStatus').textContent='';renderPreferenceColors();schedulePreferencesPreview(false);});
    for(const [mode,id]of [['light','preferencesThemeLight'],['dark','preferencesThemeDark']])$(id).addEventListener('change',event=>setPreferenceTheme(mode,event.target.value));
    $('preferencesSaveTheme').addEventListener('click',()=>savePreferenceTheme());$('preferencesUpdateTheme').addEventListener('click',()=>savePreferenceTheme(true));$('preferencesDeleteTheme').addEventListener('click',deletePreferenceTheme);
    const colors=$('preferencesColorGroups');
    colors.addEventListener('input',event=>{
      const input=event.target,kind=input.dataset.syntaxHex!==undefined?'syntax':input.dataset.surfaceHex!==undefined?'surface':'';if(!kind)return;
      setPreferenceColor(kind+':'+input.dataset[kind+'Hex'],input.value,'text');
    });
    colors.addEventListener('click',event=>{
      const swatch=event.target.closest('[data-pref-swatch]');if(!swatch)return;const pref=swatch.dataset.prefSwatch;
      if(preferencesPicker?.pref===pref){closePreferencePicker();return;}
      selectPreferenceColor(pref);
    });
    colors.addEventListener('focusin',event=>{
      const row=event.target.closest('[data-pref-row]');if(!row||row.dataset.prefRow===preferencesSelectedColor)return;
      preferencesSelectedColor=row.dataset.prefRow;for(const item of colors.querySelectorAll('[data-pref-row]'))item.classList.toggle('selected',item===row);markPreviewSelection();
      if(preferencesSection!=='formatting')$('preferencesPreviewStatus').textContent=previewStatusText();
    });
    wirePreferencePreview();
    $('preferencesResetPalette').addEventListener('click',()=>setPreferenceTheme($('preferencesPalette').value,'default-'+$('preferencesPalette').value));
    $('preferencesResetFormat').addEventListener('click',()=>{const mode=$('preferencesLanguage').value;editorPreferencesDraft.formatting[mode]=EditorStyle.normalize().formatting[mode];renderFormatPreferences();schedulePreferencesPreview();});
    $('preferencesResetAll').addEventListener('click',()=>{const customThemes=editorPreferencesDraft.customThemes;editorPreferencesDraft=EditorStyle.normalize({customThemes});editorPreferencesSize=15;closePreferencePicker();$('preferencesThemeName').value='';$('preferencesThemeStatus').textContent='Default appearance and formatting restored. My themes are kept. Apply to keep these changes.';renderEditorPreferences();});
    $('preferencesFontFamily').addEventListener('change',event=>{editorPreferencesDraft.appearance.fontFamily=event.target.value;schedulePreferencesPreview(false);});
    $('preferencesFontStyle').addEventListener('change',event=>{editorPreferencesDraft.appearance.fontStyle=event.target.value;schedulePreferencesPreview(false);});
    $('preferencesFontSize').addEventListener('input',event=>{if(event.target.validity.valid){editorPreferencesSize=Number(event.target.value);schedulePreferencesPreview(false);}});
    $('preferencesLineHeight').addEventListener('input',event=>{if(event.target.validity.valid){editorPreferencesDraft.appearance.lineHeight=Number(event.target.value);schedulePreferencesPreview(false);}});
    $('preferencesFormatFields').addEventListener('change',event=>{
      const key=event.target.dataset.formatPreference;if(!key)return;const value=event.target.value;
      editorPreferencesDraft.formatting[$('preferencesLanguage').value][key]=event.target.type==='number'?Number(value):value==='true'?true:value==='false'?false:value;schedulePreferencesPreview();
    });
  }
