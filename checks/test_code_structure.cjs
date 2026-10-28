const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const c=vm.createContext({escape});vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/code-structure.js'),'utf8'),c);
const plain=value=>JSON.parse(JSON.stringify(value));
const html='<main data-label="a > b">\n  <div>\n    <div>Nested</div>\n    <img src="x.png">\n    <!-- <fake></fake> -->\n  </div>\n</main>';
let structure=c.sourceStructure(html,'html');assert.equal(structure.regions.filter(r=>r.type==='tag').length,2);assert.equal(structure.tags.length,7);
let open=html.indexOf('<div>'),close=html.lastIndexOf('</div>');assert.deepEqual(plain(c.matchingHtmlTagRanges(structure,open+3)),[{start:open+1,end:open+4},{start:close+2,end:close+5}],'Nested equal-name elements pair by structure');
assert.deepEqual(plain(c.matchingHtmlTagRanges(structure,close+3)),plain(c.matchingHtmlTagRanges(structure,open+3)),'Closing names find their opening partner');
assert.equal(c.matchingHtmlTagRanges(structure,html.indexOf('<img')+2).length,0);assert.equal(c.matchingHtmlTagRanges(structure,html.indexOf('fake')).length,0);
assert.equal(c.matchingHtmlTagRanges(structure,html.indexOf('Nested')).length,0);
const script='<div>\n<script>\nconst sample = "<div>unpaired";\nfunction run() {\n  return 1;\n}\n</script>\n</div>';
structure=c.sourceStructure(script,'html');assert.equal(structure.tags.length,4);assert.ok(structure.regions.some(r=>r.label.startsWith('function run')));assert.equal(structure.tags[0].partner,structure.tags.at(-1));
for(const mode of ['javascript','java','css','json']){
 const text=mode==='json'?'[\n  {"brace":"}","items":[\n    1,\n    2\n  ]}\n]':'function run() {\n  const text = "} {";\n  /* ignored {\n     ignored } */\n  if (ok) {\n    return 1;\n  }\n}';
 const result=c.sourceStructure(text,mode);assert.ok(result.regions.length>=2,mode+' has nested folds');assert.ok(result.regions.every(r=>r.to>r.from&&r.from>=0&&r.to<=text.length));
}
structure=c.sourceStructure('def outer():\n    value = ":"\n    def inner():\n        return 2\n    return inner()\n\nprint(outer())','python');
assert.equal(structure.regions.length,2);assert.equal(structure.regions[0].first,0);assert.equal(structure.regions[0].last,4);assert.equal(structure.regions[1].first,2);
structure=c.sourceStructure('def docs():\n    """Summary.\n    More documentation.\n    """\n\nprint(docs())','python');assert.equal(structure.regions.filter(r=>r.type==='indent').length,1);assert.equal(structure.regions[0].last,3);assert.ok(structure.regions.some(r=>r.label==='Docstring'));
assert.equal(c.sourceStructure('if true; then\n  for x in a b; do\n    echo "$x"\n  done\nfi','bash').regions.length,2);
assert.ok(c.sourceStructure('# Title\nbody\n## Child\ntext\n```js\nx()\n```\n','markdown').regions.length>=3);
structure=c.sourceStructure(html,'html');const outer=structure.regions[0],inner=structure.regions[1],projection=c.foldProjection(html,[inner,outer]);
assert.equal(projection.ranges.length,1);assert.equal(projection.text,html.slice(0,outer.from)+html.slice(outer.to));
for(let at=0;at<=html.length;at++)if(at<outer.from||at>=outer.to)assert.equal(c.foldSourceOffset(projection,c.foldDisplayOffset(projection,at)),at);
const decorated='<span class="tok-key">'+escape(html.slice(0,35))+'</span><span>'+escape(html.slice(35))+'</span>';
const projected=c.projectFoldedHTML(decorated,projection).replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[key]);assert.equal(projected,projection.text);
assert.equal(c.sourceStructure('plain\ntext\nwith { braces }','text').regions.length,0);
console.log('Passed: nested HTML pairs, attributes, comments, raw script content, braces/arrays, Python/Bash/Markdown sections, exact folded source mapping and escaped syntax projection.');
