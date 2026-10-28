// Structural brace edits use parser ranges, never a regexp over source code.
// Layout edits touch only whitespace between known syntax nodes. Strings,
// template literals, comments, declarations and dangling-else ownership stay intact.
const simpleJS=new Set(['ExpressionStatement','ReturnStatement','ThrowStatement','BreakStatement','ContinueStatement','DebuggerStatement']);
const simpleJava=new Set(['expression_statement','return_statement','throw_statement','break_statement','continue_statement']);
const start=node=>typeof node.start==='number'?node.start:node.start.index;
const end=node=>typeof node.end==='number'?node.end:node.end.index;
const block=node=>node?.type==='BlockStatement'||node?.type==='block';
function children(node,mode){
  if(mode==='java')return node.children||[];
  const result=[];
  for(const [key,value]of Object.entries(node)){
    if(['loc','extra','tokens','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;
    if(Array.isArray(value)){for(const child of value)if(child&&typeof child.type==='string')result.push(child);}
    else if(value&&typeof value.type==='string')result.push(value);
  }
  return result;
}
function controls(root,mode,text){
  const result=[],stack=[root];
  while(stack.length){
    const node=stack.pop();stack.push(...children(node,mode));
    const isIf=node.type===(mode==='java'?'if_statement':'IfStatement');
    const isLoop=(mode==='java'?['for_statement','enhanced_for_statement','while_statement','do_statement']:['ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoWhileStatement']).includes(node.type);
    if(!isIf&&!isLoop)continue;
    const body=mode==='java'?(isIf?node.consequenceNode:node.bodyNode):(isIf?node.consequent:node.body);
    if(!body)continue;
    const prefix=text.slice(start(node),start(body)),header=prefix.match(/(?:\)|\bdo)(\s*)$/);
    result.push({node,body,isIf,headerEnd:header?start(body)-header[1].length:null});
    const alternate=mode==='java'?node.alternativeNode:node.alternate;
    if(isIf&&alternate){
      const gap=text.slice(end(body),start(alternate)),match=gap.match(/^(\s*)else(\s*)$/);
      result.push({node,body:alternate,isIf:true,isElse:true,elseIf:alternate.type===(mode==='java'?'if_statement':'IfStatement'),headerEnd:match?start(alternate)-match[2].length:null,elseStart:match?end(body)+match[1].length:null,previousEnd:end(body)});
    }
  }
  return result;
}
function singleStatement(node,mode,text){
  if(!block(node))return null;
  const statements=mode==='java'?node.namedChildren:node.body;
  if(statements?.length!==1||!(mode==='java'?simpleJava:simpleJS).has(statements[0].type))return null;
  const statement=statements[0];
  if(text.slice(start(node)+1,start(statement)).trim()||text.slice(end(statement),end(node)-1).trim())return null;
  return statement;
}
function applyEdits(text,edits){
  const ordered=edits.sort((a,b)=>b.from-a.from||b.to-a.to);let last=text.length;
  for(const edit of ordered){
    if(edit.to>last||edit.from<0||edit.to<edit.from)throw new Error('The selected formatting rules overlap. The original file was kept.');
    text=text.slice(0,edit.from)+edit.text+text.slice(edit.to);last=edit.from;
  }
  return text;
}
const ignored=text=>/prettier-ignore|@formatter\s*:\s*off/.test(text);
function hasFunctionDeclaration(node,mode){const stack=[node];while(stack.length){const current=stack.pop();if(current.type==='FunctionDeclaration')return true;stack.push(...children(current,mode));}return false;}
export async function shapeControls(text,mode,parse,options){
  if(options.bracePolicy==='preserve'||ignored(text))return text;
  const edits=[];
  for(const {body,elseIf}of controls(await parse(text),mode,text)){
    if(elseIf)continue;
    if(options.bracePolicy==='always'&&!block(body)&&!['EmptyStatement','empty_statement'].includes(body.type)&&!hasFunctionDeclaration(body,mode)){
      edits.push({from:start(body),to:start(body),text:'{\n'},{from:end(body),to:end(body),text:'\n}'});
    }else if(options.bracePolicy==='omit-simple'&&singleStatement(body,mode,text))edits.push({from:start(body),to:start(body)+1,text:' '},{from:end(body)-1,to:end(body),text:' '});
  }
  return applyEdits(text,edits);
}
export async function layoutControls(text,mode,parse,options){
  if(ignored(text)||options.ifLayout==='default'&&options.bracePlacement==='same-line'&&options.elsePlacement==='same-line')return text;
  const edits=[],unit=options.indentStyle==='tabs'?'\t':' '.repeat(options.indentWidth);
  for(const record of controls(await parse(text),mode,text)){
    const {node,body,isIf,isElse,elseIf,headerEnd,elseStart,previousEnd}=record;
    if(headerEnd===null)continue;
    const lineStart=text.lastIndexOf('\n',start(node)-1)+1,indent=text.slice(lineStart).match(/^[\t ]*/)[0];
    if(isElse&&elseStart!==null)edits.push({from:previousEnd,to:elseStart,text:options.elsePlacement==='next-line'?'\n'+indent:block(mode==='java'?node.consequenceNode:node.consequent)?' ':'\n'+indent});
    if(elseIf)continue;
    const statement=block(body)?singleStatement(body,mode,text):body;
    const simple=statement&&(mode==='java'?simpleJava:simpleJS).has(statement.type),value=statement?text.slice(start(statement),end(statement)):'';
    const fits=simple&&!/[\r\n]/.test(value)&&indent.length+text.slice(lineStart,headerEnd).trim().length+value.length+(block(body)?5:1)<=options.printWidth;
    if(block(body)){
      if(options.bracePlacement==='next-line')edits.push({from:headerEnd,to:start(body),text:'\n'+indent});
      if(isIf&&options.ifLayout==='compact'&&fits)edits.push({from:start(body)+1,to:end(body)-1,text:' '+value+' '});
    }else if(isIf&&options.ifLayout==='multiline')edits.push({from:headerEnd,to:start(body),text:'\n'+indent+unit});
    else if(isIf&&options.ifLayout==='compact'&&fits)edits.push({from:headerEnd,to:start(body),text:' '});
  }
  const result=applyEdits(text,edits);
  if(result!==text)await parse(result);
  return result;
}
