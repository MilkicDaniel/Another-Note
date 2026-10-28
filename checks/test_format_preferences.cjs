// Exercise the actual shipped worker and parsers, including behavior checks
// on fixed test programs. The editor never executes user code.
const assert=require('node:assert/strict'),vm=require('node:vm'),{createEditorWorker}=require('./editor_worker_harness.cjs');
const worker=createEditorWorker('format');
const format=(mode,text,preferences={})=>worker.call('format',{mode,text,preferences,tabSize:2,filename:'example.'+({javascript:'js',python:'py',bash:'sh'}[mode]||mode)});
async function stable(mode,text,preferences){const result=await format(mode,text,preferences);assert.equal(await format(mode,result,preferences),result,mode+' configured formatting is idempotent');return result;}
(async()=>{
  for(const mode of ['javascript','java']){
    const text=mode==='java'?'class X { int f(int x){if(x>0) return 1; else {return 2;}} }':'function f(x){if(x>0) return 1; else {return 2;}}';
    let result=await stable(mode,text,{bracePolicy:'always',ifLayout:'multiline',indentWidth:4});assert.match(result,/if \(x > 0\) \{\n\s+return 1;/);
    result=await stable(mode,text,{bracePolicy:'omit-simple',ifLayout:'compact'});assert.match(result,/if \(x > 0\) return 1;/);assert.doesNotMatch(result,/else \{/);
    result=await stable(mode,text,{bracePolicy:'always',bracePlacement:'next-line',elsePlacement:'next-line'});assert.match(result,/if \(x > 0\)\n\s+\{/);assert.match(result,/\}\n\s+else\n\s+\{/);
    result=await stable(mode,text,{bracePolicy:'always',ifLayout:'compact'});assert.match(result,/if \(x > 0\) \{ return 1; \}/);
    result=await stable(mode,text,{bracePolicy:'omit-simple',ifLayout:'multiline'});assert.match(result,/if \(x > 0\)\n\s+return 1;/);
  }
  const programs=[
    'function f(a,b){let out=[];if(a) if(b) out.push("both"); else out.push("first"); else out.push("none");return out.join(",");} JSON.stringify([f(true,true),f(true,false),f(false,true)])',
    'function f(){let count=0;for(let i=0;i<3;i++)if(i%2) count++;else count+=2;while(count<10) count++;do count--;while(count>8);return count;} JSON.stringify(f())',
    'function f(ok){if(ok){let scoped=2;return scoped;}else{return 4;}} JSON.stringify([f(true),f(false)])',
    'function f(ok){if(ok) { /* keep this comment */ return "if (x) { literal }"; } else {return /else\\s+if/.source;}} JSON.stringify([f(true),f(false)])',
    'function f(ok){if(ok){return\n{value:1};}return 2;} JSON.stringify([f(true),f(false)])',
    'function f(ok){if(ok) // do not join this comment\nreturn `text with } else {`; else return "fallback";} JSON.stringify([f(true),f(false)])'
  ];
  for(const source of programs)for(const preferences of [{bracePolicy:'always',bracePlacement:'next-line',elsePlacement:'next-line',ifLayout:'compact'},{bracePolicy:'omit-simple',ifLayout:'compact'},{bracePolicy:'omit-simple',ifLayout:'multiline'}]){
    const result=await stable('javascript',source,preferences);assert.equal(vm.runInNewContext(result),vm.runInNewContext(source),'Nested else ownership, scope, ASI, literals and control flow are unchanged');
    if(source.includes('keep this comment'))assert.match(result,/keep this comment/);
  }
  const java='class X { int f(boolean ok) { if(ok) { int local=1; return local; } else { /* keep */ return 2; } } String label="😀 if (x) { }"; }';
  const javaResult=await stable('java',java,{bracePolicy:'omit-simple',ifLayout:'compact',bracePlacement:'next-line'});assert.match(javaResult,/if \(ok\)\n\s+\{/);assert.match(javaResult,/else\n\s+\{/);assert.match(javaResult,/\/\* keep \*\//);assert.match(javaResult,/😀 if \(x\) \{ \}/);
  let result=await stable('javascript','const f=(value)=>{if(value) return "hello";return "ready";};',{quoteStyle:'single',semicolons:false,arrowParens:'avoid',bracePolicy:'always',indentStyle:'tabs'});assert.match(result,/const f = value =>/);assert.match(result,/'hello'/);assert.match(result,/\n\tif/);assert.doesNotMatch(result,/;\n/);
  result=await stable('javascript','// prettier-ignore\nif (ok) run();',{bracePolicy:'always'});assert.match(result,/if \(ok\) run\(\);/);
  result=await stable('html','<div class="card" id="first" aria-label="Welcome">Hello</div>',{singleAttributePerLine:true,printWidth:40});assert.match(result,/\n\s+class="card"\n\s+id="first"/);
  result=await stable('python','def f():\n    return "hello"',{quoteStyle:'single',indentStyle:'tabs',indentWidth:4});assert.match(result,/\n\treturn 'hello'/);
  result=await stable('bash','greet(){ echo ready; }\nif true;then\necho hi\nfi',{functionNextLine:true,indentWidth:4});assert.match(result,/greet\(\)\n\{/);assert.match(result,/\n {4}echo hi/);
  result=await stable('json','{"number":9007199254740993,"nested":{"name":"keep"}}',{indentWidth:8,indentStyle:'tabs'});assert.match(result,/9007199254740993/);assert.match(result,/\n\t"nested"/);
  console.log('Passed: real per-language formatter options, brace policies, line layout, tabs/quotes, idempotence, nested control flow, scope, ASI, comments, literals and large JSON numbers.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>worker.terminate());
