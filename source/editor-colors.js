  let editorColorsFrame=0,colorMeasure=null,colorCanvas=null,colorContext=null,colorVisibleRanges=[],colorRenderStamp=null,colorVisibleSource=null,colorLiteralHitRects=[],colorPlaneDrag=null;
  const colorValidationCache=new Map();
  function clearEditorColorState(){colorVisibleRanges=[];colorLiteralHitRects=[];colorRenderStamp=null;colorVisibleSource=null;if(colorMeasure)colorMeasure.innerHTML='';}
  function isLiteralColor(value){
    value=String(value).trim();if(!value||/^(?:currentcolor|inherit|initial|unset|revert(?:-layer)?)$/i.test(value)||/\b(?:var|env)\s*\(/i.test(value))return false;
    if(!colorValidationCache.has(value)){if(colorValidationCache.size>=400)colorValidationCache.clear();colorValidationCache.set(value,CSS.supports('color',value));}
    return colorValidationCache.get(value);
  }
  function findColorLiterals(text,mode,valid=isLiteralColor,base=0,limit=200){
    const result=[],pattern=/#[\da-f]{3,8}(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]{1,160}\)|\b[a-z][a-z]+\b/gi;
    for(const match of text.matchAll(pattern)){
      const value=match[0],at=match.index,end=at+value.length;
      if(['css','html'].includes(mode)&&/\burl\s*\([^)]*$/i.test(text.slice(Math.max(0,at-1024),at)))continue;
      if(value[0]==='#'){
        if(!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)||/[\w#-]/.test(text[at-1]||''))continue;
        // A CSS selector that looks like a hex color is still an identifier.
        if(mode==='css'&&text.slice(end).match(/^\s*(?:[>,.:#[]|\{)/)){
          const before=text.slice(Math.max(0,at-2000),at),boundary=Math.max(before.lastIndexOf('{'),before.lastIndexOf('}'),before.lastIndexOf(';'));
          if(!/^\s*[\w-]+\s*:/.test(before.slice(boundary+1)))continue;
        }
      }else if(!value.includes('(')){
        if(/[\w.#@-]/.test(text[at-1]||'')||/[\w-]/.test(text[end]||''))continue;
        const quote=text[at-1],quoted=(quote==='"'||quote==="'")&&text[end]===quote;
        const before=text.slice(Math.max(0,at-300),at),colon=before.lastIndexOf(':'),boundary=Math.max(...[';','{','}','<','>','\n'].map(char=>before.lastIndexOf(char)));
        if(!(quoted&&!['text','markdown'].includes(mode))&&!(['css','html'].includes(mode)&&colon>boundary))continue;
      }
      if(valid(value))result.push({start:base+at,end:base+end,value});
      if(result.length>=limit)break;
    }
    return result;
  }
  function colorRGBA(value){
    if(!isLiteralColor(value))return null;
    if(/^#[\da-f]+$/i.test(value)){
      let digits=value.slice(1);if(digits.length<=4)digits=[...digits].map(char=>char+char).join('');
      if(digits.length===6)digits+='ff';return {r:parseInt(digits.slice(0,2),16),g:parseInt(digits.slice(2,4),16),b:parseInt(digits.slice(4,6),16),a:parseInt(digits.slice(6,8),16)/255};
    }
    if(/^rgba?\(/i.test(value)){
      const parts=value.slice(value.indexOf('(')+1,-1).replace(/[,/]/g,' ').trim().split(/\s+/);
      if(parts.length>=3&&parts.length<=4&&parts.every(part=>/^[+-]?(?:\d*\.)?\d+%?$/.test(part))){const unit=(part,maximum)=>Math.max(0,Math.min(maximum,parseFloat(part)*(part.endsWith('%')?maximum/100:1)));return {r:Math.round(unit(parts[0],255)),g:Math.round(unit(parts[1],255)),b:Math.round(unit(parts[2],255)),a:parts[3]===undefined?1:unit(parts[3],1)};}
    }
    if(/^hsla?\(/i.test(value)){
      const parts=value.slice(value.indexOf('(')+1,-1).replace(/[,/]/g,' ').trim().split(/\s+/),hue=parts[0]?.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(deg|grad|rad|turn)?$/i),percent=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/;
      if(hue&&parts.length>=3&&parts.length<=4&&percent.test(parts[1])&&percent.test(parts[2])&&(parts[3]===undefined||/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(parts[3]))){
        const unit=(hue[2]||'deg').toLowerCase(),h=Number(hue[1])*(unit==='turn'?360:unit==='grad'?0.9:unit==='rad'?180/Math.PI:1),s=Math.max(0,Math.min(1,parseFloat(parts[1])/100)),l=Math.max(0,Math.min(1,parseFloat(parts[2])/100)),v=l+s*Math.min(l,1-l),a=parts[3]===undefined?1:Math.max(0,Math.min(1,parseFloat(parts[3])/(parts[3].endsWith('%')?100:1)));
        return {...hsvToRGB(h,v?2*(1-l/v):0,v),a};
      }
    }
    if(!colorCanvas){colorCanvas=document.createElement('canvas');colorCanvas.width=colorCanvas.height=1;}
    const context=colorCanvas.getContext('2d',{willReadFrequently:true});context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);
    const rgba=[...context.getImageData(0,0,1,1).data];return {r:rgba[0],g:rgba[1],b:rgba[2],a:rgba[3]/255};
  }
  function rgbaHex(color,alpha=false){const hex=value=>Math.round(value).toString(16).padStart(2,'0');return '#'+hex(color.r)+hex(color.g)+hex(color.b)+(alpha?hex(color.a*255):'');}
  function rgbToHSV(color,fallbackHue=0){
    const r=color.r/255,g=color.g/255,b=color.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    let h=fallbackHue;if(delta){h=max===r?60*(((g-b)/delta)%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4);h=(h+360)%360;}
    return {h,s:max?delta/max:0,v:max};
  }
  function hsvToRGB(h,s,v){
    h=((h%360)+360)%360;s=Math.max(0,Math.min(1,s));v=Math.max(0,Math.min(1,v));
    const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
    const values=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return {r:Math.round((values[0]+m)*255),g:Math.round((values[1]+m)*255),b:Math.round((values[2]+m)*255)};
  }
  function rgbToHSL(color){
    const hsv=rgbToHSV(color),r=color.r/255,g=color.g/255,b=color.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,l=(max+min)/2;
    return {h:hsv.h,s:delta?delta/(1-Math.abs(2*l-1)):0,l};
  }
  function colorPickerValue(hex,alpha,original,format=null){
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16),a=Math.max(0,Math.min(1,alpha));
    format=format||(/^rgba?\(/i.test(original)?'rgb':/^hsla?\(/i.test(original)?'hsl':'hex');
    if(format==='rgb')return a<1||/^rgba\(/i.test(original)?`rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`:`rgb(${r}, ${g}, ${b})`;
    if(format==='hsl'){const hsl=rgbToHSL({r,g,b}),number=value=>Number(value.toFixed(2)),parts=`${number(hsl.h)}, ${number(hsl.s*100)}%, ${number(hsl.l*100)}%`;return a<1||/^hsla\(/i.test(original)?`hsla(${parts}, ${Number(a.toFixed(3))})`:`hsl(${parts})`;}
    return rgbaHex({r,g,b,a},a<1);
  }
  function scheduleColorSwatches(){
    if(editorColorsFrame)return;editorColorsFrame=requestAnimationFrame(()=>{editorColorsFrame=0;renderColorSwatches();});
  }
  function renderColorSwatches(){
    const layer=$('editorColorSwatches'),file=note();
    if(!ready||!file||$('notePane').hidden||editor.readOnly){layer.replaceChildren();colorVisibleRanges=[];colorLiteralHitRects=[];colorRenderStamp=null;return;}
    const starts=editorLineStarts(),styles=getComputedStyle(editor),lineHeight=editorLayout.lineHeight,rect=editor.getBoundingClientRect(),surface=$('codeSurface').getBoundingClientRect();
    const stamp=[file.id,editor.value,file.mode,editor.scrollTop,editor.scrollLeft,editor.clientWidth,editor.clientHeight,editorLayout.key,rect.top,rect.left];
    if(colorRenderStamp&&stamp.every((value,index)=>value===colorRenderStamp[index]))return;colorRenderStamp=stamp;
    const atY=y=>{let low=0,high=starts.length;while(low+1<high){const middle=(low+high)>>1;if(editorLayout.offsets[middle]<=y)low=middle;else high=middle;}return low;};
    let first=atY(editor.scrollTop),last=atY(editor.scrollTop+editor.clientHeight);
    first=Math.max(0,first-2);last=Math.min(starts.length-1,last+1);
    const from=starts[first],to=starts[last+1]??editor.value.length;
    // Avoid constructing a second huge DOM for minified one-line documents.
    if(to-from>200000){layer.replaceChildren();colorVisibleRanges=[];colorLiteralHitRects=[];return;}
    const block=editor.value.slice(from,to);
    colorVisibleRanges=findColorLiterals(block,file.mode,isLiteralColor,from).filter(range=>!editorLayout.hidden?.[editorLineAt(range.start)]);
    colorVisibleSource={id:file.id,text:editor.value,mode:file.mode};
    colorLiteralHitRects=[];if(!colorVisibleRanges.length){layer.replaceChildren();return;}
    if(!colorMeasure){colorMeasure=document.createElement('div');colorMeasure.className='line-measure';colorMeasure.setAttribute('aria-hidden','true');document.body.append(colorMeasure);}
    colorMeasure.style.width=`${Math.max(1,editor.clientWidth-(parseFloat(styles.paddingLeft)||0)-(parseFloat(styles.paddingRight)||0))}px`;colorMeasure.style.whiteSpace=state.settings.wrap?'pre-wrap':'pre';
    colorMeasure.innerHTML=starts.slice(first,last+1).map((start,index)=>`<div>${escape(typeof codeDisplayText==='function'?codeDisplayText(start,starts[first+index+1]!==undefined?starts[first+index+1]-1:editor.value.length):editor.value.slice(start,starts[first+index+1]!==undefined?starts[first+index+1]-1:editor.value.length))||'\u200b'}</div>`).join('');
    const rows=[...colorMeasure.children],occupied=[],buttons=[];
    const point=position=>{
      const line=editorLineAt(position),row=rows[line-first];if(!row?.firstChild)return null;
      const offset=typeof codeDisplayColumn==='function'?codeDisplayColumn(starts[line],position):position-starts[line],length=row.firstChild.length,range=document.createRange();range.setStart(row.firstChild,Math.min(offset,length));range.setEnd(row.firstChild,Math.min(offset+1,length));
      const box=range.getBoundingClientRect(),origin=row.getBoundingClientRect();
      return {x:rect.left+(parseFloat(styles.paddingLeft)||0)+box.left-origin.left-editor.scrollLeft,y:rect.top+(parseFloat(styles.paddingTop)||0)+(editorLayout.offsets[line]||0)+box.top-origin.top-editor.scrollTop,width:box.width,height:box.height,line};
    };
    const free=box=>box.hit.x>=rect.left&&box.hit.x+box.hit.width<=rect.left+editor.clientWidth&&box.hit.y>=rect.top&&box.hit.y+box.hit.height<=rect.top+editor.clientHeight&&!occupied.some(other=>box.hit.x<other.x+other.width&&box.hit.x+box.hit.width>other.x&&box.hit.y<other.y+other.height&&box.hit.y+box.hit.height>other.y);
    const add=(index,box,group=null)=>{occupied.push(box.hit);buttons.push({index,...box,group});};
    const hitBox=(x,y,width=22)=>({x,y:y-Math.min(24,lineHeight)/2,width,height:Math.min(24,lineHeight)});
    for(let index=0;index<colorVisibleRanges.length;index++){
      const color=colorVisibleRanges[index],anchor=point(color.start);if(!anchor||anchor.y+anchor.height<rect.top||anchor.y>rect.bottom)continue;
      for(let line=editorLineAt(color.start);line<=editorLineAt(color.end-1);line++){
        const row=rows[line-first];if(!row?.firstChild)continue;
        const range=document.createRange(),start=Math.max(0,typeof codeDisplayColumn==='function'?codeDisplayColumn(starts[line],color.start):color.start-starts[line]),end=Math.min(row.firstChild.length,typeof codeDisplayColumn==='function'?codeDisplayColumn(starts[line],color.end):color.end-starts[line]);range.setStart(row.firstChild,start);range.setEnd(row.firstChild,end);
        const origin=row.getBoundingClientRect();for(const box of range.getClientRects())colorLiteralHitRects.push({index,left:rect.left+(parseFloat(styles.paddingLeft)||0)+box.left-origin.left-editor.scrollLeft,top:rect.top+(parseFloat(styles.paddingTop)||0)+(editorLayout.offsets[line]||0)+box.top-origin.top-editor.scrollTop,width:box.width,height:box.height});
      }
      let start=color.start,end=color.end;const quote=editor.value[start-1];if((quote==='"'||quote==="'")&&editor.value[end]===quote){start--;end++;}
      const projection=typeof codeProjectionForCurrent==='function'?codeProjectionForCurrent():null,pad=projection?.pads?.find(pad=>pad.colorStart===color.start);
      if(pad){
        const line=editorLineAt(start),row=rows[line-first],node=row?.firstChild;
        if(node){
          const range=document.createRange(),origin=row.getBoundingClientRect();range.setStart(node,codeDisplayColumn(starts[line],pad.at,'left'));range.setEnd(node,codeDisplayColumn(starts[line],pad.at));
          for(const space of range.getClientRects()){
            const size=Math.min(11,lineHeight-4,space.width-8);if(size<3)continue;
            const x=rect.left+(parseFloat(styles.paddingLeft)||0)+space.left-origin.left-editor.scrollLeft,y=rect.top+(parseFloat(styles.paddingTop)||0)+(editorLayout.offsets[line]||0)+space.top-origin.top-editor.scrollTop;
            const hit=hitBox(x,y+space.height/2,space.width),box={x:x+(space.width-size)/2,y:y+(space.height-size)/2,size,hit};
            if(free(box)){add(index,box);break;}
          }
        }
        continue;
      }
      // Keep the preview in the whitespace immediately adjoining this value.
      // Leave two pixels of clear space on either side of the square.
      let placed=false;
      for(const position of [start-1,end]){
        if(!/[ \t]/.test(editor.value[position]||''))continue;
        let a=position,b=position;while(a>0&&/[ \t]/.test(editor.value[a-1]))a--;while(/[ \t]/.test(editor.value[b+1]||''))b++;
        const left=point(a),right=point(b);if(!left||!right||Math.abs(left.y-anchor.y)>2||Math.abs(right.y-anchor.y)>2)continue;
        const available=right.x+right.width-left.x,size=Math.min(11,lineHeight-4,available-4);if(size<5)continue;
        const width=Math.min(22,available),x=position<start?right.x+right.width-width:left.x,hit=hitBox(x,anchor.y+anchor.height/2,width);
        const box={x:hit.x+(hit.width-size)/2,y:anchor.y+(anchor.height-size)/2,size,hit};
        if(free(box)){add(index,box);placed=true;break;}
      }
      if(placed)continue;
      // Dense gradients and JSON still get an individual square at the value's
      // trailing edge, in the gap between text rows. Never cover source glyphs
      // or collect unrelated values in a distant margin button.
      const last=colorLiteralHitRects.filter(box=>box.index===index).at(-1);
      if(last){
        const gap=lineHeight-last.height,size=Math.min(8,gap-1);
        if(size>=3){
          const hit={x:last.left+last.width+1,y:last.top+last.height,width:Math.max(16,size+10),height:gap};
          const box={x:last.left+last.width+3,y:hit.y+(gap-size)/2,size,hit};
          if(free(box))add(index,box);
        }
      }
    }
    layer.replaceChildren(...buttons.map(item=>{
      const color=colorVisibleRanges[item.index],button=document.createElement('button');button.type='button';button.className='editor-color-chip';button.dataset.colorIndex=String(item.index);
      const fill=document.createElement('span');fill.className='color-chip-fill';fill.setAttribute('aria-hidden','true');
      if(item.group){button.dataset.colorGroup=JSON.stringify(item.group);fill.textContent='+';button.classList.add('color-chip-group');}
      const label=item.group?`Choose from ${item.group.length} colors`:`Change color ${color.value}`;button.setAttribute('aria-label',label);
      button.style.left=`${item.hit.x-surface.left}px`;button.style.top=`${item.hit.y-surface.top}px`;button.style.width=`${item.hit.width}px`;button.style.height=`${item.hit.height}px`;button.style.setProperty('--swatch-color',color.value);
      fill.style.left=`${item.x-item.hit.x}px`;fill.style.top=`${item.y-item.hit.y}px`;fill.style.width=fill.style.height=`${item.size}px`;button.append(fill);return button;
    }));
  }
