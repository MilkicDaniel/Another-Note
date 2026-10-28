  const colorPresets=[['Red','#ef4444'],['Orange','#f97316'],['Amber','#f59e0b'],['Yellow','#eab308'],['Lime','#84cc16'],['Green','#22c55e'],['Teal','#14b8a6'],['Cyan','#06b6d4'],['Blue','#3b82f6'],['Indigo','#6366f1'],['Violet','#a855f7'],['Pink','#ec4899'],['Black','#000000'],['Slate','#64748b'],['White','#ffffff'],['Transparent','#00000000']];
  function pickerFormat(value){return /^rgba?\(/i.test(value)?'rgb':/^hsla?\(/i.test(value)?'hsl':'hex';}
  function colorPlanePosition(x,y,rect){return {s:Math.max(0,Math.min(1,(x-rect.left)/Math.max(1,rect.width))),v:Math.max(0,Math.min(1,1-(y-rect.top)/Math.max(1,rect.height)))};}
  function paintColorPicker(){
    const context=colorContext;if(!context?.color||!context.hsv)return;
    const {color,hsv,alpha}=context,percent=Number((alpha*100).toFixed(1)),hex=rgbaHex({...color,a:alpha},alpha<1);
    $('colorPlane').style.setProperty('--picker-hue',`hsl(${hsv.h}, 100%, 50%)`);
    $('colorPlane').setAttribute('aria-valuenow',String(Math.round(hsv.s*100)));
    $('colorPlane').setAttribute('aria-valuetext',`${Math.round(hsv.s*100)}% saturation, ${Math.round(hsv.v*100)}% brightness`);
    $('colorPlaneThumb').style.left=`${hsv.s*100}%`;$('colorPlaneThumb').style.top=`${(1-hsv.v)*100}%`;
    $('colorHue').value=String(Number(hsv.h.toFixed(1)));$('colorHueValue').textContent=`${Math.round(hsv.h)}°`;
    $('colorAlpha').value=String(percent);$('colorAlphaValue').textContent=`${percent}%`;
    $('colorAlpha').style.setProperty('--color-rgb',`${color.r},${color.g},${color.b}`);
    $('colorFormat').value=context.format;
    syncSelectControls();
    for(const [id,value]of [['colorR',color.r],['colorG',color.g],['colorB',color.b],['colorA',percent]])if(document.activeElement!==$(id))$(id).value=String(value);
    $('colorPreview').style.setProperty('--swatch-color',context.previewValue);
    $('colorNewText').textContent=hex;
    $('colorOriginalSwatch').style.setProperty('--swatch-color',context.range.value);
    $('colorOriginalText').textContent=context.range.value;
    $('colorPresets').querySelectorAll('[data-preset-color]').forEach(button=>button.setAttribute('aria-pressed',String(rgbaHex({...color,a:alpha},true).toLowerCase()===rgbaHex(colorRGBA(button.dataset.presetColor),true).toLowerCase())));
  }
  function syncColorPicker(value,fromText=false){
    const color=colorRGBA(value),valid=Boolean(color);$('colorValue').setCustomValidity(valid?'':'Enter a valid hex, RGB, HSL or named color.');$('colorError').hidden=valid;
    if(!valid){$('colorError').textContent='Enter a valid hex, RGB, HSL or named color.';return false;}
    if(colorContext){
      colorContext.previewValue=value;
      if(fromText){colorContext.color={r:color.r,g:color.g,b:color.b};colorContext.alpha=color.a;colorContext.hsv=rgbToHSV(color,colorContext.hsv?.h||0);colorContext.format=pickerFormat(value);}
      paintColorPicker();
    }
    return true;
  }
  function writePickerValue(){
    const context=colorContext;if(!context?.color)return;
    const value=colorPickerValue(rgbaHex(context.color),context.alpha,context.range.value,context.format);
    context.previewValue=value;$('colorValue').value=value;$('colorValue').setCustomValidity('');$('colorError').hidden=true;paintColorPicker();
  }
  function setPickerRGB(color,alpha=colorContext?.alpha??1){
    if(!colorContext)return;colorContext.color={r:color.r,g:color.g,b:color.b};colorContext.alpha=alpha;colorContext.hsv=rgbToHSV(color,colorContext.hsv?.h||0);writePickerValue();
  }
  function setPickerSV(s,v){
    if(!colorContext?.hsv)return;colorContext.hsv.s=Math.max(0,Math.min(1,s));colorContext.hsv.v=Math.max(0,Math.min(1,v));colorContext.color=hsvToRGB(colorContext.hsv.h,colorContext.hsv.s,colorContext.hsv.v);writePickerValue();
  }
  function colorPlaneKey(event){
    if(!colorContext?.hsv)return;const amount=event.shiftKey?0.1:0.01,{s,v}=colorContext.hsv;
    const positions={ArrowLeft:[s-amount,v],ArrowRight:[s+amount,v],ArrowUp:[s,v+amount],ArrowDown:[s,v-amount],PageUp:[s,v+.1],PageDown:[s,v-.1],Home:[0,v],End:[1,v]};
    if(!positions[event.key])return;event.preventDefault();setPickerSV(...positions[event.key]);
  }
  function selectColorOccurrence(index){
    const item=colorContext?.choices[index];if(!item)return;
    colorContext.range=item;$('colorValue').value=item.value;syncColorPicker(item.value,true);
  }
  function openColorPicker(ranges){
    const file=note();if(!file||file.trashedAt||editor.readOnly||activityBlocked()||!ranges.length)return;
    if(!colorVisibleSource||colorVisibleSource.id!==file.id||colorVisibleSource.text!==editor.value||colorVisibleSource.mode!==file.mode||ranges.some(range=>editor.value.slice(range.start,range.end)!==range.value)){scheduleColorSwatches();return;}
    closeCompletions();closeMenus();
    colorContext={id:file.id,text:editor.value,range:ranges[0],choices:ranges,start:editor.selectionStart,end:editor.selectionEnd,applied:false};
    $('colorOccurrenceRow').hidden=ranges.length<2;$('colorOccurrence').innerHTML=ranges.map((item,index)=>`<option value="${index}">${escape(item.value)} · Column ${item.start-editorLineStarts()[editorLineAt(item.start)]+1}</option>`).join('');
    $('colorOccurrence').value='0';selectColorOccurrence(0);syncSelectControls();$('colorDialog').showModal();$('colorForm').scrollTop=0;$('colorPlane').focus({preventScroll:true});
  }
  function applyPickedColor(){
    const context=colorContext,file=note(),value=$('colorValue').value.trim();if(!context||!syncColorPicker(value))return false;
    if(!file||file.id!==context.id||file.content!==context.text||editor.value!==context.text||editor.value.slice(context.range.start,context.range.end)!==context.range.value||file.trashedAt||editor.readOnly){$('colorError').hidden=false;$('colorError').textContent='This file changed. Close the picker and open the color again.';return false;}
    const {range}=context;context.applied=true;
    if(value!==range.value)replaceText(range.start,range.end,value,range.start,range.start+value.length);
    $('colorDialog').close('applied');return true;
  }
  function wireEditorColors(){
    const layer=$('editorColorSwatches');layer.addEventListener('pointerdown',event=>event.preventDefault());
    layer.addEventListener('click',event=>{const button=event.target.closest('[data-color-index]');if(!button)return;const indices=button.dataset.colorGroup?JSON.parse(button.dataset.colorGroup):[Number(button.dataset.colorIndex)];openColorPicker(indices.map(index=>colorVisibleRanges[index]).filter(Boolean));});
    editor.addEventListener('pointerdown',event=>{
      if(!(event.ctrlKey||event.metaKey)||event.button!==0||editor.readOnly)return;renderColorSwatches();
      const hit=colorLiteralHitRects.find(box=>event.clientX>=box.left&&event.clientX<=box.left+box.width&&event.clientY>=box.top-2&&event.clientY<=box.top+box.height+2);
      if(hit){event.preventDefault();event.stopImmediatePropagation();openColorPicker([colorVisibleRanges[hit.index]]);}
    },true);
    $('colorValue').addEventListener('input',()=>syncColorPicker($('colorValue').value.trim(),true));
    const plane=$('colorPlane'),move=event=>{if(!colorPlaneDrag||event.pointerId!==colorPlaneDrag.id)return;const position=colorPlanePosition(event.clientX,event.clientY,colorPlaneDrag.rect);setPickerSV(position.s,position.v);};
    plane.addEventListener('pointerdown',event=>{
      if(event.button!==0||!colorContext)return;event.preventDefault();plane.focus({preventScroll:true});colorPlaneDrag={id:event.pointerId,rect:plane.getBoundingClientRect()};
      try{plane.setPointerCapture(event.pointerId);}catch(_){}move(event);
    });
    plane.addEventListener('pointermove',move);
    plane.addEventListener('pointerup',event=>{if(colorPlaneDrag?.id!==event.pointerId)return;move(event);colorPlaneDrag=null;if(plane.hasPointerCapture(event.pointerId))plane.releasePointerCapture(event.pointerId);});
    for(const name of ['pointercancel','lostpointercapture'])plane.addEventListener(name,()=>colorPlaneDrag=null);
    plane.addEventListener('keydown',colorPlaneKey);
    $('colorHue').addEventListener('input',()=>{if(!colorContext?.hsv)return;colorContext.hsv.h=Number($('colorHue').value);colorContext.color=hsvToRGB(colorContext.hsv.h,colorContext.hsv.s,colorContext.hsv.v);writePickerValue();});
    $('colorAlpha').addEventListener('input',()=>{if(colorContext){colorContext.alpha=Number($('colorAlpha').value)/100;writePickerValue();}});
    for(const id of ['colorR','colorG','colorB','colorA'])$(id).addEventListener('input',()=>{
      if(!colorContext||['colorR','colorG','colorB','colorA'].some(name=>!$(name).value||!$(name).validity.valid))return;
      setPickerRGB({r:Number($('colorR').value),g:Number($('colorG').value),b:Number($('colorB').value)},Number($('colorA').value)/100);
    });
    $('colorFormat').addEventListener('change',()=>{if(!colorContext)return;colorContext.format=$('colorFormat').value;writePickerValue();});
    $('colorPresets').innerHTML=colorPresets.map(([label,value])=>`<button type="button" class="color-preset" data-preset-color="${value}" aria-label="${label}" aria-pressed="false" style="--swatch-color:${value}"></button>`).join('');
    $('colorPresets').addEventListener('click',event=>{const button=event.target.closest('[data-preset-color]');if(button){const color=colorRGBA(button.dataset.presetColor);setPickerRGB(color,color.a);}});
    $('colorOriginal').addEventListener('click',()=>{if(colorContext){$('colorValue').value=colorContext.range.value;syncColorPicker(colorContext.range.value,true);}});
    $('colorOccurrence').addEventListener('change',()=>selectColorOccurrence(Number($('colorOccurrence').value)));
    $('colorForm').addEventListener('submit',event=>{event.preventDefault();applyPickedColor();});
    for(const id of ['cancelColorButton','closeColorButton'])$(id).addEventListener('click',()=>$('colorDialog').close('cancel'));
    $('colorDialog').addEventListener('close',()=>{closeMenus();colorPlaneDrag=null;const context=colorContext;colorContext=null;if(context&&note()?.id===context.id){if(!context.applied&&editor.value===context.text)editor.setSelectionRange(context.start,context.end);editor.focus();}});
  }
