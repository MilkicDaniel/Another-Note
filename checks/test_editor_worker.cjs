// Run the actual embedded offline bundle, including its WebAssembly parsers.
const assert=require('node:assert/strict'),{createEditorWorker}=require('./editor_worker_harness.cjs');
const formatWorker=createEditorWorker('format'),spellingWorker=createEditorWorker('spelling');
const call=(type,data)=>(type==='format'?formatWorker:spellingWorker).call(type,data);
const format=(mode,text)=>call('format',{mode,text,filename:'example.'+({python:'py',bash:'sh',javascript:'js'}[mode]||mode)});
const spell=(text,personal=[],mode='javascript')=>call('spell',{text,personal,mode});
(async()=>{
  const samples={
    javascript:'// Preserve comment\nfunction hello( a,b){return {literal:"</script> untouched  string",a:a,b:b}}',
    json:'{"number":9007199254740993,"text":"unchanged  text","b":[2,3]}',
    html:'<!-- Preserve comment --><div><p>Hello</p><p>World</p></div>',
    css:'/* Preserve comment */.a{color:red;margin:0  2px;content:"untouched  string"}',
    java:'// Preserve comment\nclass Example{public static void main(String[] args){System.out.println("untouched  string");}}',
    python:'# Preserve comment\ndef hello( a,b ):\n  return {"text":"untouched  string","b":b}',
    bash:'#!/bin/bash\n# Preserve comment\nif true;then\necho "untouched  string"\ncat <<\'EOF\'\n  keep  this\nEOF\nfi'
  };
  for(const [mode,text]of Object.entries(samples)){
    const result=await format(mode,text);assert.equal(typeof result,'string');assert.notEqual(result,text,mode+' is formatted');
    assert.equal(await format(mode,result),result,mode+' is idempotent');
    if(mode==='json')assert.match(result,/9007199254740993/,'Large JSON integers are preserved');
    else assert.match(result,/Preserve comment/,mode+' keeps comments');
    if(text.includes('untouched  string'))assert.match(result,/untouched  string/,mode+' keeps string contents');
    if(mode==='bash')assert.match(result,/\n  keep  this\nEOF\n/,'Heredoc contents are preserved');
  }
  for(const tabSize of [2,4,8])for(const [mode,text]of Object.entries({javascript:'function x(){return 1;}',json:'{"key":{"value":1}}',html:'<div>\n<p>Hello</p>\n</div>',css:'.x{color:red;}',java:'class X{void x(){return;}}',python:'def x():\n    return 1',bash:'if true;then\necho hi\nfi'})){
    const data={mode,text,tabSize,filename:'example.'+({python:'py',bash:'sh',javascript:'js'}[mode]||mode)},result=await call('format',data);
    assert.ok(result.split('\n').some(line=>line.startsWith(' '.repeat(tabSize))&&line[tabSize]!==' '),mode+' honors tab size '+tabSize);
    assert.equal(await call('format',{...data,text:result}),result,mode+' configured indentation is idempotent');
  }
  for(const [mode,text]of Object.entries({javascript:'const = ;',json:'{"broken":}',html:'<div><span></div>',css:'.x { color: "broken }',java:'class {',python:'def broken(:',bash:'if; then'}))await assert.rejects(()=>format(mode,text),undefined,mode+' invalid input is rejected');
  await assert.rejects(()=>format('text','hello'));
  let result=await spell('The camelCase snake_case HTTPServer works with colour and color. Teh wrngWord has a misspeling_field. https://exmple.invalid/wrng user@exmple.invalid');
  assert.deepEqual(result.matches.map(match=>match.word),['Teh','wrng','misspeling']);
  const source='Teh wrngWord misspeling_field';result=await spell(source);
  for(const range of result.matches)assert.equal(source.slice(range.start,range.end),range.word);
  result=await spell(source,['teh','wrngWord','misspeling']);assert.deepEqual(result.matches,[],'Personal entries accept words and complete identifiers');
  result=await spell(source);assert.equal(result.matches.length,3,'Removing personal entries restores spelling checks');
  const suggestions=await call('suggest',{word:'speling'});assert.ok(suggestions.includes('spelling'));
  const markup='<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width">\n<link rel="stylesheet" href="site.css">\n<img src="photo.avif">\nconst file = "document.docx"; const config = "settings.toml"; wrng.py; object.speling;';
  const codeSpelling=await spell(markup,[],'html');assert.deepEqual(codeSpelling.matches.map(match=>match.word),['wrng','speling'],'Markup attributes and file extensions are accepted while misspelled stems and properties are checked');
  const proseSpelling=await spell('doctype charset',[],'text');assert.ok(proseSpelling.matches.length>0,'Programming exceptions do not disable ordinary prose spelling');
  const style='body { color: #fff; background: #abcdef; border-color: #a1b2c3dd; outline-color: #1234; box-shadow: 0 2px 1.25rem rgba(0,0,0,.5); font-size: 12px; width: 90dvw; } @font-face { src: url("font.ttf") format("truetype"); } @keyframes fade { from { opacity: 0; } to { opacity: 1; } } /* speling wrngWord */';
  for(const mode of ['css','html','javascript','json'])assert.deepEqual((await spell(style,[],mode)).matches.map(match=>match.word),['speling','wrng'],mode+' skips CSS colors, units, functions and font formats while retaining prose checks');
  assert.deepEqual(await call('suggest',{word:'x'.repeat(64)}),[],'Long generated identifiers cannot monopolize suggestions');
  const [stale,current]=await Promise.all([spell('wrng '.repeat(10000)),spell('Correct words')]);assert.equal(stale.cancelled,true);assert.deepEqual(current.matches,[]);
  console.log('PASS: seven offline formatters, syntax errors, idempotence, literal preservation, compound spelling, personal dictionary and cancellation');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>Promise.all([formatWorker.terminate(),spellingWorker.terminate()]));
