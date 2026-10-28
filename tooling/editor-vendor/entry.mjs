import * as prettier from 'prettier/standalone';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import * as html from 'prettier/plugins/html';
import * as postcss from 'prettier/plugins/postcss';
import java from './generated/java-inline.mjs';
import {initSync, format as formatPython} from '@wasm-fmt/ruff_fmt/web';
import './generated/go-runtime.cjs';
import {getProcessor} from './node_modules/sh-syntax/lib/processor.js';
const plugins=[babel,estree,html,postcss,java];
let shell;
export async function formatCode(text,mode,filename,tabSize){
 const width=[2,4,8].includes(Number(tabSize))?Number(tabSize):['java','python'].includes(mode)?4:2;
 if(mode==='python'){initSync(globalThis.editorAssetBytes('ruff'));return formatPython(text,filename,{indent_width:width,line_width:88,line_ending:'lf',quote_style:'preserve'});}
 if(mode==='bash'){shell??=getProcessor(()=>globalThis.editorAssetBytes('shell'));return shell(text,{print:true,filepath:filename,keepComments:true,variant:/\.zsh$/i.test(filename)?16:1,indent:width,simplify:false});}
 if(mode==='json')JSON.parse(text);
 const parser={javascript:'babel',java:'java',html:'html',css:'css',json:'json-stringify'}[mode];
 if(!parser)throw new Error('Choose a programming file type before formatting.');
 return prettier.format(text,{parser,plugins,tabWidth:width,printWidth:mode==='java'?100:88,endOfLine:'lf'});
}
