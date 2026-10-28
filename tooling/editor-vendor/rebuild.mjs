// npm ci --ignore-scripts, then node rebuild.mjs. No dependency is needed at runtime.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const here=path.dirname(fileURLToPath(import.meta.url)),modules=path.join(here,'node_modules');
const vendor=path.resolve(here,'../../source/vendor'),generated=path.join(here,'generated');
await mkdir(generated,{recursive:true});await mkdir(vendor,{recursive:true});
const read=(file,encoding='utf8')=>readFile(path.join(modules,file),encoding);
let java=await read('prettier-plugin-java/dist/index.mjs');
const original=java.match(/const parser = \(async \(\) => \{[\s\S]*?\n\}\)\(\);/)?.[0];
if(!original||!java.includes('(await parser).parse(text)'))throw new Error('The pinned Java plugin source changed. Review the inline WASM adaptation.');
const adapted=original.replace('const parser = (async () => {','let parser;\nfunction javaParser(){return parser??=(async () => {')
 .replace('await Parser.init();','await Parser.init({wasmBinary:globalThis.editorAssetBytes("treeSitter"),locateFile:file=>"inline:"+file});')
 .replace('new URL("./tree-sitter-java_orchard.wasm", import.meta.url)','globalThis.editorAssetBytes("java")')
 .replace('})();','})(); }');
java=java.replace(original,adapted).replace('(await parser).parse(text)','(await javaParser()).parse(text)');
await writeFile(path.join(generated,'java-inline.mjs'),java);
// The upstream CommonJS runtime installs `require` when it is present. esbuild's
// dynamic-require proxy is not a Node host: installing it recursively calls its
// own getter in browser workers. Keep the upstream browser runtime branch.
const goRuntime=(await read('sh-syntax/vendors/wasm_exec.cjs')).replace(/\n\tif \(!global\.require && typeof require !== "undefined"\) \{[\s\S]*?\n\t\}/,'').replace(/\n\tif \(!global\.fs && global\.require\) \{[\s\S]*?\n\t\}/,'');
await writeFile(path.join(generated,'go-runtime.cjs'),'// Browser worker runtime adaptation: disable CommonJS host detection.\nconst require = undefined;\n'+goRuntime);
const assets={};
for(const [key,file]of Object.entries({ruff:'@wasm-fmt/ruff_fmt/ruff_fmt_bg.wasm',shell:'sh-syntax/main.wasm',treeSitter:'web-tree-sitter/web-tree-sitter.wasm',java:'prettier-plugin-java/dist/tree-sitter-java_orchard.wasm'}))assets[key]=(await read(file,null)).toString('base64');
for(const [key,file]of Object.entries({enAff:'dictionary-en/index.aff',enDic:'dictionary-en/index.dic',gbAff:'dictionary-en-gb/index.aff',gbDic:'dictionary-en-gb/index.dic'}))assets[key]=await read(file);
await writeFile(path.join(vendor,'editor-assets.json'),JSON.stringify(assets));
for(const [entry,output,globalName]of [['entry.mjs','format-vendor.js','EditorVendor'],['spelling.mjs','spelling-vendor.js','EditorVendor'],['worker-loader.mjs','worker-loader.js',undefined]])await build({entryPoints:[path.join(here,entry)],bundle:true,minify:true,platform:'browser',format:'iife',globalName,outfile:path.join(vendor,output),external:['node:*'],logLevel:'warning'});
const notices=['Another Note — third-party notices\n\nAll editor tools run locally. The libraries below are included with the application.\n\nAdaptations: the Java plugin loads its WASM parsers lazily from embedded bytes; the Go/TinyGo browser runtime disables CommonJS host detection. The parsers and formatters are otherwise bundled from the pinned packages.'];
for(const [name,file]of Object.entries({prettier:'prettier/LICENSE','prettier-plugin-java':'prettier-plugin-java/LICENSE','web-tree-sitter':'web-tree-sitter/LICENSE','@wasm-fmt/ruff_fmt':'@wasm-fmt/ruff_fmt/LICENSE','sh-syntax':'sh-syntax/LICENSE',nspell:'nspell/license','is-buffer':'is-buffer/LICENSE','dictionary-en':'dictionary-en/license','dictionary-en-gb':'dictionary-en-gb/license',fflate:'fflate/LICENSE'})){
 const pkg=JSON.parse(await read(name+'/package.json'));notices.push(`${name} ${pkg.version}\n${'='.repeat(72)}\n${await read(file)}`);
}
for(const name of (await readdir(path.join(here,'upstream-licenses'))).sort())notices.push(name+'\n'+'='.repeat(72)+'\n'+await readFile(path.join(here,'upstream-licenses',name),'utf8'));
const noticeText=notices.join('\n\n')+'\n';
await writeFile(path.join(vendor,'THIRD_PARTY_LICENSES.txt'),noticeText);
await copyFile(path.join(vendor,'THIRD_PARTY_LICENSES.txt'),path.resolve(here,'../../fedora/THIRD_PARTY_LICENSES.txt'));
console.log('Rebuilt the pinned offline editor bundle and notices. Run python3 build.py next.');
