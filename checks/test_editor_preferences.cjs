const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),main=fs.readFileSync(path.join(root,'source/app.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'source/editor-style-config.js'),'utf8')+'\nglobalThis.style=EditorStyle;',context);
const style=context.style,plain=value=>JSON.parse(JSON.stringify(value));
const defaults=style.normalize();assert.equal(defaults.appearance.fontStyle,'regular');assert.equal(defaults.appearance.lineHeight,1.6);
for(const mode of style.modes){assert.equal(defaults.formatting[mode].indentWidth,'editor');assert.equal(style.profile(defaults,mode,8).indentWidth,8);}
const changed=style.normalize({appearance:{fontFamily:'Consolas\u0000',fontStyle:'bold-italic',lineHeight:9,colors:{dark:{keyword:'#C0FFEE',string:'url(https://example.invalid)'}}},formatting:{java:{indentWidth:4,bracePolicy:'always',printWidth:120},javascript:{printWidth:-1,bracePolicy:'raw-code'}}});
assert.equal(changed.appearance.fontFamily,'Consolas');assert.equal(changed.appearance.colors.dark.keyword,'#c0ffee');assert.equal(changed.appearance.colors.dark.string,defaults.appearance.colors.dark.string);assert.equal(changed.appearance.lineHeight,2.4);
assert.equal(changed.formatting.java.bracePolicy,'always');assert.equal(style.profile(changed,'java',2).indentWidth,4);assert.equal(changed.formatting.javascript.bracePolicy,'preserve');assert.equal(changed.formatting.javascript.printWidth,40);
changed.appearance.colors.light.keyword='#010203';assert.notEqual(style.normalize().appearance.colors.light.keyword,'#010203','Normalizing and editing a palette never changes the defaults');
assert.equal(style.font({fontFamily:'Name";color:red'}),'"Name\\";color:red","DejaVu Sans Mono","Liberation Mono",Consolas,monospace','Custom font names stay quoted inside a font-family value');
vm.runInContext(fs.readFileSync(path.join(root,'source/editor-preferences.js'),'utf8'),context);
const base=style.normalize(),draft=style.normalize(base),current=style.normalize(base);draft.appearance.fontStyle='italic';current.appearance.colors.dark.number='#123456';current.formatting.java.bracePolicy='always';
const merged=context.mergePreferenceDraft(base,draft,current);assert.equal(merged.appearance.fontStyle,'italic');assert.equal(merged.appearance.colors.dark.number,'#123456');assert.equal(merged.formatting.java.bracePolicy,'always','Applying an open dialog keeps other fields changed by another window');
function extract(name){const start=main.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m')),rest=main.slice(start),next=rest.slice(1).search(/^  (?:async )?function /m);assert.ok(start>=0);return rest.slice(0,next+1);}
vm.runInContext(extract('mergeRecentSettings'),context);
const latest={editorPreferences:plain(draft),editorPreferencesUpdatedAt:300},stale={editorPreferences:plain(base),editorPreferencesUpdatedAt:100};
assert.deepEqual(plain(context.mergeRecentSettings(stale,latest).editorPreferences),plain(draft));assert.deepEqual(plain(context.mergeRecentSettings(latest,stale).editorPreferences),plain(draft));
assert.deepEqual(plain(context.mergeRecentSettings(latest,{editorPreferences:{},editorPreferencesUpdatedAt:400}).editorPreferences),{},'Resetting defaults has a new timestamp and survives stale saves');
(async()=>{
  let applied=0,saved=0,closed=0;const elements=new Map();
  context.state={settings:{editorPreferences:current,fontSize:16}};context.clock=()=>500;context.applySettings=()=>applied++;context.save=()=>saved++;context.flush=async()=>{};
  context.$=id=>{if(!elements.has(id))elements.set(id,{reportValidity:()=>true,close:()=>closed++,disabled:false,textContent:''});return elements.get(id);};
  context.base=base;context.draft=draft;vm.runInContext('editorPreferencesBase=base;editorPreferencesDraft=draft;editorPreferencesBaseSize=16;editorPreferencesSize=18;',context);
  assert.equal(await context.applyEditorPreferences(),true);assert.equal(context.state.settings.fontSize,18);assert.equal(context.state.settings.editorPreferencesUpdatedAt,500);assert.equal(applied,1);assert.equal(saved,1);assert.equal(closed,1);
  context.flush=async()=>{throw Error('disk full');};assert.equal(await context.applyEditorPreferences(),false);assert.equal(closed,1);assert.match(context.$('preferencesMessage').textContent,/disk full/);assert.equal(context.$('preferencesApply').disabled,false);
  console.log('Passed: safe editor style normalization, independent palettes, language defaults, concurrent preference edits, reset persistence and save failure handling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
