  const editorScrollbarViews=new Map();
  function editorScrollbarGeometry(viewport,content,length,position){
    const max=Math.max(0,content-viewport),thumb=Math.min(length,Math.max(28,length*viewport/Math.max(1,content))),travel=Math.max(0,length-thumb);
    return {max,thumb,travel,position:Math.max(0,Math.min(max,position)),offset:max?Math.max(0,Math.min(max,position))/max*travel:0};
  }
  function syncEditorScrollbars(){
    if(!state||!editor.clientWidth||!editor.clientHeight)return;
    const vertical=editor.scrollHeight>editor.clientHeight+1,horizontal=editor.scrollWidth>editor.clientWidth+1;
    const surface=$('codeSurface');surface.classList.toggle('has-vertical-scrollbar',vertical);surface.classList.toggle('has-horizontal-scrollbar',horizontal);$('editorScrollbarCorner').hidden=!(vertical&&horizontal);
    for(const [axis,id,shown]of [['y','editorVerticalScrollbar',vertical],['x','editorHorizontalScrollbar',horizontal]]){
      const track=$(id);track.hidden=!shown;if(!shown){editorScrollbarViews.delete(axis);continue;}
      const y=axis==='y',viewport=y?editor.clientHeight:editor.clientWidth,content=y?editor.scrollHeight:editor.scrollWidth,length=Math.max(1,viewport-((y?horizontal:vertical)?12:0)),position=y?editor.scrollTop:editor.scrollLeft;
      const view=editorScrollbarGeometry(viewport,content,length,position);editorScrollbarViews.set(axis,view);
      const thumb=track.firstElementChild;thumb.style[y?'height':'width']=`${view.thumb}px`;thumb.style.transform=y?`translateY(${view.offset}px)`:`translateX(${view.offset}px)`;
      track.setAttribute('aria-valuemax',String(Math.round(view.max)));track.setAttribute('aria-valuenow',String(Math.round(view.position)));
    }
  }
  function wireEditorScrollbars(){
    for(const [axis,id]of [['y','editorVerticalScrollbar'],['x','editorHorizontalScrollbar']]){
      const track=$(id),y=axis==='y',coordinate=event=>y?event.clientY:event.clientX;let drag=null;
      function move(event){
        if(!drag||drag.id!==event.pointerId)return;const view=editorScrollbarViews.get(axis);if(!view)return;
        const value=view.travel?(coordinate(event)-drag.origin-drag.grab)/view.travel*view.max:0;editor[y?'scrollTop':'scrollLeft']=Math.max(0,Math.min(view.max,value));syncScroll();
      }
      track.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;const view=editorScrollbarViews.get(axis);if(!view)return;
        event.preventDefault();const rect=track.getBoundingClientRect(),origin=y?rect.top:rect.left,at=coordinate(event)-origin;
        drag={id:event.pointerId,origin,grab:at>=view.offset&&at<=view.offset+view.thumb?at-view.offset:view.thumb/2};
        track.setPointerCapture(event.pointerId);track.classList.add('scrolling');move(event);
      });
      track.addEventListener('pointermove',move);
      const finish=event=>{if(drag?.id!==event.pointerId)return;drag=null;track.classList.remove('scrolling');if(track.hasPointerCapture(event.pointerId))track.releasePointerCapture(event.pointerId);};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(event,finish);
      track.addEventListener('wheel',event=>{
        if(event.ctrlKey||event.metaKey)return;const delta=(y?event.deltaY:event.deltaX||event.deltaY)*(event.deltaMode===1?editorLayout.lineHeight:event.deltaMode===2?(y?editor.clientHeight:editor.clientWidth):1);if(!delta)return;
        event.preventDefault();editor[y?'scrollTop':'scrollLeft']+=delta;syncScroll();
      },{passive:false});
      track.addEventListener('keydown',event=>{
        const view=editorScrollbarViews.get(axis);if(!view||event.ctrlKey||event.metaKey||event.altKey)return;
        const page=y?editor.clientHeight:editor.clientWidth,step=y?editorLayout.lineHeight:40,values={ArrowUp:-step,ArrowDown:step,ArrowLeft:-step,ArrowRight:step,PageUp:-page,PageDown:page};
        const next=event.key==='Home'?0:event.key==='End'?view.max:values[event.key]!==undefined?view.position+values[event.key]:null;if(next===null)return;
        event.preventDefault();editor[y?'scrollTop':'scrollLeft']=Math.max(0,Math.min(view.max,next));syncScroll();
      });
    }
  }
