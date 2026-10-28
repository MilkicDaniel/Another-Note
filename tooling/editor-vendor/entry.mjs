import * as prettier from 'prettier/standalone';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import * as html from 'prettier/plugins/html';
import * as postcss from 'prettier/plugins/postcss';
import java from './generated/java-inline.mjs';
import {initSync, format as formatPython} from '@wasm-fmt/ruff_fmt/web';
import './generated/go-runtime.cjs';
import {getProcessor} from './node_modules/sh-syntax/lib/processor.js';
import {shapeControls,layoutControls} from './format-style.mjs';
const plugins=[babel,estree,html,postcss,java];
let shell;
export async function formatCode(text,mode,filename,tabSize,preferences){
 const width=[2,4,8].includes(Number(tabSize))?Number(tabSize):['java','python'].includes(mode)?4:2;
 const options=preferences||{indentWidth:width,indentStyle:'spaces',printWidth:mode==='java'?100:88,bracePolicy:'preserve',ifLayout:'default',bracePlacement:'same-line',elsePlacement:'same-line',quoteStyle:mode==='python'?'preserve':'double',semicolons:true,trailingComma:'all',arrowParens:'always',objectWrap:'preserve',magicTrailingComma:true,binaryNextLine:true,switchCaseIndent:true,spaceRedirects:true};
 if(mode==='python'){initSync(globalThis.editorAssetBytes('ruff'));return formatPython(text,filename,{indent_width:options.indentWidth,indent_style:options.indentStyle==='tabs'?'tab':'space',line_width:options.printWidth,line_ending:'lf',quote_style:options.quoteStyle,magic_trailing_comma:options.magicTrailingComma?'respect':'ignore'});}
 if(mode==='bash'){shell??=getProcessor(()=>globalThis.editorAssetBytes('shell'));return shell(text,{print:true,filepath:filename,keepComments:true,variant:/\.zsh$/i.test(filename)?16:1,indent:options.indentStyle==='tabs'?0:options.indentWidth,simplify:false,binaryNextLine:options.binaryNextLine,switchCaseIndent:options.switchCaseIndent,spaceRedirects:options.spaceRedirects,functionNextLine:options.functionNextLine});}
 if(mode==='json')JSON.parse(text);
 const parser={javascript:'babel',java:'java',html:'html',css:'css',json:'json-stringify'}[mode];
 if(!parser)throw new Error('Choose a programming file type before formatting.');
 const parse=mode==='java'?value=>java.parsers.java.parse(value):value=>babel.parsers.babel.parse(value,{});
 if(['java','javascript'].includes(mode))text=await shapeControls(text,mode,parse,options);
 let result=await prettier.format(text,{parser,plugins,tabWidth:options.indentWidth,useTabs:options.indentStyle==='tabs',printWidth:options.printWidth,endOfLine:'lf',singleQuote:options.quoteStyle==='single',semi:options.semicolons,trailingComma:options.trailingComma,arrowParens:options.arrowParens,objectWrap:options.objectWrap,singleAttributePerLine:options.singleAttributePerLine,bracketSameLine:options.bracketSameLine,htmlWhitespaceSensitivity:options.htmlWhitespaceSensitivity});
 if(['java','javascript'].includes(mode))result=await layoutControls(result,mode,parse,options);
 return result;
}
