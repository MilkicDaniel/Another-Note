// Formatting must preserve source text and keep HTML/code inert in the editor.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),main=fs.readFileSync(path.join(root,'source/app.js'),'utf8');
function extract(name){const start=main.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=main.slice(start),next=rest.slice(1).search(/^  (?:async )?function /m);return rest.slice(0,next+1);}
const context=vm.createContext({MODES:{java:'Java',javascript:'JavaScript',html:'HTML',css:'CSS',python:'Python',text:'Text',bash:'Bash',json:'JSON',markdown:'Markdown'},escape:text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
vm.runInContext(fs.readFileSync(path.join(root,'source/syntax-formats.js'),'utf8')+'\n'+['fileLabel','tokenize','colorJSON','colorBash','colorMarkdown','normalizeLanguage','modeForFilename','exportName','colorCode'].map(extract).join('\n'),context);
const decode=html=>html.replace(/<span class="tok-[a-z]+">|<\/span>/g,'').replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[key]);
const examples={
  java:'/* first\nsecond */\npublic class Example {\n  String text = "<img onerror=boom()>";\n  int count = 42; // done\n}',
  javascript:'// title\nconst template = `hello ${name}`;\nasync function greet(value) { return value + 42; }\nconst safe = "</script><script>boom()</script>";',
  python:'# title\n@decorator\ndef greet(name):\n    message = f"Hello {name}"\n    text = """a\nb"""\n    return 42 if name else None',
  css:'/* title\ncontinued */\n@media (min-width: 600px) {\n  .card { color: #00ffcc; --gap: 2rem; margin: var(--gap); content: "<safe>"; }\n}',
  html:'<!DOCTYPE html>\n<!-- <comment> -->\n<div class="card" data-value="a>b">Hello &amp; welcome</div>\n<style>.card { color: #ff00aa; }</style>\n<script>const value = 42; // safe\n</script>\n<script type="application/json">{"ok": true}</script>'
};
for(const [mode,code] of Object.entries(examples)){
  const html=context.colorCode(code,mode);assert.equal(decode(html),code,mode+' preserves every character');assert.match(html,/tok-string/);assert.match(html,/tok-comment/);
  assert.match(html,/tok-number/);assert.doesNotMatch(html,/<(?:script|style|img|div)\b/i,mode+' escapes executable markup');
  assert.equal(context.modeForFilename('file.'+({javascript:'js',python:'py'}[mode]||mode)),mode);assert.equal(context.modeForFilename('FILE.'+({javascript:'MJS',python:'PYW'}[mode]||mode.toUpperCase())),mode);
  assert.equal(context.exportName({title:'Untitled',content:'',mode}),'Untitled.'+({javascript:'js',python:'py'}[mode]||mode));
  assert.equal(context.modeForFilename('renamed',mode),mode,'Unknown extensions preserve the selected syntax');
}
assert.equal(context.modeForFilename('script.cjs'),'javascript');assert.equal(context.modeForFilename('page.htm'),'html');
assert.match(context.colorCode('```py\nreturn True\n```','markdown'),/tok-keyword/);assert.match(context.colorCode('```js\nconst count = 42\n```','markdown'),/tok-number/);
assert.match(context.colorCode('<script>const count = 42;</script>','html'),/tok-keyword">const/);
assert.match(context.colorCode('<style>.card { color: red; }</style>','html'),/tok-property">color/);
for(const mode of Object.keys(examples))for(const code of ['','"unterminated <tag>','/* unfinished\ncomment','<!-- never ends','\u0000\t😀\n\r\n<>&"\''])assert.equal(decode(context.colorCode(code,mode)),code,mode+' handles partial and unusual text');
console.log('Passed: five language highlighters, multiline tokens, HTML embedded code, escaping, source fidelity, filename detection and Save As extensions.');
