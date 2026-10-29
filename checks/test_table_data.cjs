const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/table-data.js'),'utf8')+'\nglobalThis.tables=TableData;',context);
const tables=context.tables,plain=value=>JSON.parse(JSON.stringify(value)),rows=value=>plain(value.rows);
assert.deepEqual(rows(tables.delimited('Name\tCount\r\nAda\t2\r\nLee\t7\r\n')),[['Name','Count'],['Ada','2'],['Lee','7']]);
assert.deepEqual(rows(tables.delimited('a\tb\nc\n\t')),[['a','b'],['c',''],['','']],'Ragged rows and trailing empty fields are kept');
assert.deepEqual(rows(tables.delimited('a\tb\n\n')),[['a','b'],['','']],'An intentional blank final record is kept');
const cells=[['Name','Note','Value'],['Ada','two\nlines','a,"quote"'],[' leading ','<br> & \\ | *bold* `code`','😀'],['','tab\there','']];
for(const format of ['markdown','tsv','csv']){
  const data=tables.model(cells),text=tables.serialize(data,format),parsed=format==='markdown'?tables.markdown(text):tables.delimited(text,format==='tsv'?'\t':',');assert.deepEqual(rows(parsed),cells,format+' round-trips cell characters and embedded newlines');
}
const noHeader=tables.model([['A','1'],['B','2']],{header:false,align:['left','right']});const parsed=tables.markdown(tables.serialize(noHeader));assert.equal(parsed.header,false);assert.deepEqual(rows(parsed),rows(noHeader));assert.deepEqual(plain(parsed.align),['left','right']);
const aligned=tables.model([['A','B','C'],['x','y','z']],{align:['left','center','right']});const alignedText=tables.serialize(aligned);assert.match(alignedText,/:---/);assert.deepEqual(plain(tables.markdown(alignedText).align),['left','center','right']);
const original='| Name | Note |\n| --- | --- |\n| **Ada** | a \\| b<br>next |';const md=tables.markdown(original);assert.equal(md.rows[1][1],'a | b\nnext');md.rows[1][0]='Lee';const edited=tables.serialize(md);assert.match(edited,/a \\\| b<br>next/,'Unchanged Markdown cell source is retained');assert.doesNotMatch(edited,/\*\*Ada\*\*/);
const doc='Before\n\n'+original+'\n\nAfter\n',at=doc.indexOf('Ada'),range=tables.markdownAt(doc,at);assert.equal(doc.slice(range.from,range.to),original);assert.equal(doc.slice(0,range.from),'Before\n\n');assert.equal(doc.slice(range.to),'\n\nAfter\n');assert.equal(tables.markdownAt('Nothing | here\njust prose',2),null);
assert.deepEqual(rows(tables.fromText('Name;Count\nAda;2')),[['Name','Count'],['Ada','2']]);assert.deepEqual(rows(tables.fromText('Name,Note\nAda,"a,b"')),[['Name','Note'],['Ada','a,b']]);
assert.deepEqual(rows(tables.fromText('one\ntwo')),[['one'],['two']]);assert.deepEqual(rows(tables.delimited('"a\tb"\tc\n"x\nline"\ty')),[['a\tb','c'],['x\nline','y']]);
assert.equal(tables.clipboard('just text',''),null);assert.equal(tables.clipboard('first\nsecond',''),null);assert.equal(tables.clipboard('a\tb','').rows[0].length,2);
assert.equal(tables.inFence('Before\n```js\na\tb\n',20),true);assert.equal(tables.inFence('~~~\na\tb\n~~~\nAfter',100),false);assert.equal(tables.inFence('````\n```\ninside',100),true);
const html=tables.serialize(tables.model([['<script>','A & B'],['"quoted"','one\ntwo']]),'html');assert.match(html,/&lt;script&gt;/);assert.match(html,/A &amp; B/);assert.match(html,/one<br>two/);assert.doesNotMatch(html,/<script>/);
for(const text of ['a,b\n"missing', '"quoted"x,b'])assert.throws(()=>tables.delimited(text,','),/quoted/);
for(const [r,c]of [[0,2],[1,0],[201,1],[1,41],[200,40],[1.5,2]])assert.throws(()=>tables.size(r,c),/rows/);
assert.throws(()=>tables.delimited('x'.repeat(tables.limits.characters+1)),/too large/);assert.throws(()=>tables.model([['x'.repeat(tables.limits.characters+1)]]),/too large/);
console.log('Passed: table text parsing, quoted CSV/TSV, ragged/blank cells, multiline and Unicode values, Markdown source preservation, header/alignment, document ranges, escaping and bounded grids.');
