const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../source/editor-links.js'),'utf8'),calls=[];
const files=[{id:'js',title:'app.js',folderPath:'Project/scripts',content:'unsaved edits'}];
const c=vm.createContext({URL,openFiles:()=>files,native:true,startupBlocked:false,activityBlocked:()=>false,closeCompletions(){},
  request:async(command,args)=>{calls.push({command,args});return args.reference.startsWith('http')?{external:true}:{file:{name:'app.js',text:'disk contents',fileKey:'js-key'}};},
  importEntries:async(entries,trusted)=>{calls.push({entries,trusted});return ['js'];},revealOpenedFiles:ids=>calls.push({reveal:ids}),toast:message=>calls.push({error:message})});
vm.runInContext(code,c);
c.editor={getBoundingClientRect:()=>({left:20,top:30,right:320,bottom:430}),clientWidth:288,clientHeight:388};
assert.equal(c.editorScrollbarAtPoint(310,80),true);assert.equal(c.editorScrollbarAtPoint(80,420),true);assert.equal(c.editorScrollbarAtPoint(300,80),false);assert.equal(c.editorScrollbarAtPoint(330,80),false);
function link(text,needle,mode='text'){const at=text.indexOf(needle);assert.ok(at>=0);return c.editorLinkAt(text,at+Math.min(2,needle.length-1),mode)?.reference;}
for(const [text,needle,expected,mode]of [
 ['Read https://example.com/docs?a=1&b=2.', 'example', 'https://example.com/docs?a=1&b=2'],
 ['Go (https://example.com/wiki/Thing_(test)).', 'example', 'https://example.com/wiki/Thing_(test)'],
 ['www.example.com/path', 'example', 'https://www.example.com/path'],
 ['<script src="//cdn.example.com/app.js"></script>', 'example', 'https://cdn.example.com/app.js','html'],
 ['<link href="../styles/main.css?v=2&amp;dark=1">','main.css','../styles/main.css?v=2&dark=1','html'],
 ['<script src=scripts/app.js></script>','app.js','scripts/app.js','html'],
 ['<a href="./Images/icon.png">Icon</a>','icon.png','./Images/icon.png','html'],
 ["import { start } from './app.js';", 'app.js', './app.js','javascript'],
 ["@import '../base.css'; .x { background: url(./theme.css); }",'theme.css','./theme.css','css'],
 ['<link href="John\'s folder/theme.css">',"John's", "John's folder/theme.css",'html'],
 ['[Styles](../styles/main.css)', 'Styles','../styles/main.css','markdown'],
 ['Open file:///home/user/My%20Files/app.py#L5','app.py','file:///home/user/My%20Files/app.py#L5'],
 ['Open C:\\Project\\app.js','app.js','C:\\Project\\app.js'],
 ['second line\n<code src="./main.js">', 'main.js','./main.js','html'],
])assert.equal(link(text,needle,mode),expected,text);
for(const text of ['"javascript:alert(1)"','"data:text/html,x"','"shell:run.js"','"./${name}.js"','color: #fff;','const answer = "hello";'])assert.equal(c.editorLinkAt(text,Math.floor(text.length/2),'javascript'),null,text);
assert.equal(c.editorLinkAt('https://example.com   ',20),null,'Whitespace beside a link is not clickable');
assert.equal(c.editorLinkAt('x'.repeat(200001)+'.js',30),null,'Minified lines keep hit testing bounded');
assert.deepEqual(Array.from(c.linkPathParts(['Project','html'],'../styles/main.css')),['Project','styles','main.css']);assert.equal(c.linkPathParts([],'../outside.css'),null);
assert.equal(c.localLinkPath('./My%20Files/a.css?v=1#section'),'./My Files/a.css');
assert.equal(c.browserOpenLinkFile({folderPath:'Project/html'},'../scripts/app.js').id,'js');
assert.equal(c.browserOpenLinkFile({folderPath:'Other'},'app.js'),null,'An unrelated same-name file is not a match');
assert.equal(c.browserOpenLinkFile({},'/Other/app.js'),null);
(async()=>{
 const source={id:'html',fileKey:'html-key'};await c.openEditorLink({reference:'../scripts/app.js'},source);
 assert.equal(calls[0].command,'open_link');assert.equal(calls[0].args.fileKey,'html-key');assert.equal(calls[0].args.reference,'../scripts/app.js');assert.equal(calls[1].trusted,true);assert.equal(calls[2].reveal[0],'js');
 calls.length=0;await c.openEditorLink({reference:'https://example.com/'},source);assert.equal(calls.length,1,'Website clicks do not import or replace editor content');
 c.native=false;c.window={open:(...args)=>calls.push({browser:args})};calls.length=0;
 await c.openEditorLink({reference:'https://example.com/'},source);assert.equal(calls[0].browser[0],'https://example.com/');assert.equal(calls[0].browser[2],'noopener,noreferrer');
 c.selectNote=id=>calls.push({selected:id});calls.length=0;
 await c.openLinkedBrowserFile('../scripts/app.js',{id:'html',folderPath:'Project/pages'});assert.equal(calls[0].selected,'js');assert.equal(files[0].content,'unsaved edits');
 const sourceHandle={name:'index.html'},utils={name:'utils.js'},folder={
   resolve:async handle=>handle===sourceHandle?['pages','index.html']:null,queryPermission:async()=> 'granted',
   getDirectoryHandle:async name=>{assert.equal(name,'scripts');return {getFileHandle:async name=>{assert.equal(name,'utils.js');return utils;}};},
 };
 c.browserFileHandles=new Map([['html',sourceHandle]]);c.browserFolderHandles=new Map([['root',folder]]);c.readBrowserFile=async handle=>{assert.equal(handle,utils);return {name:'utils.js',handle,text:'// utils'};};calls.length=0;
 await c.openLinkedBrowserFile('../scripts/utils.js',{id:'html',title:'index.html',folderPath:'Project/pages'});assert.equal(calls[0].entries[0].name,'utils.js');assert.equal(calls[0].trusted,true);assert.equal(calls[1].reveal[0],'js');
 assert.equal(c.isImageFileLink('picture.png'),true);assert.equal(link('<img src="picture.png">','picture.png','html'),'picture.png');
 const imageFile=new Blob(['not decoded as text'],{type:'image/png'}),blobs=[],clicked=[];c.Blob=Blob;c.escape=x=>String(x).replaceAll('<','&lt;').replaceAll('"','&quot;');
 c.URL=class extends URL{static createObjectURL(blob){blobs.push(blob);return 'blob:preview-'+blobs.length;}static revokeObjectURL(){}};
 c.document={body:{append(){}},createElement:()=>({click(){clicked.push(this.href);},remove(){}})};c.setTimeout=()=>1;calls.length=0;
 const image=await c.readBrowserLinkHandle({name:'picture.png',getFile:async()=>imageFile});await c.presentBrowserLinkEntry(image);
 assert.equal(calls.length,0,'Image bytes never pass through text import');assert.deepEqual(clicked,['blob:preview-2']);assert.match(await blobs[1].text(),/sandbox; default-src 'none'/);assert.match(await blobs[1].text(),/<img src="blob:preview-1"/);
 console.log('Passed: Ctrl+click link detection, HTML/CSS/JS/Markdown and native paths, exact hit ranges, safe schemes, relative folder resolution and native routing.');
})().catch(error=>{console.error(error);process.exitCode=1;});
