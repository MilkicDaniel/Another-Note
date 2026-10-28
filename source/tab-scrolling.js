  function syncTabScroll(){
    const tabs=$('fileTabs'),maximum=Math.max(0,(tabs.scrollWidth||0)-(tabs.clientWidth||0));
    $('scrollTabsLeft').disabled=tabs.scrollLeft<=1;$('scrollTabsRight').disabled=tabs.scrollLeft>=maximum-1;
    tabs.classList.toggle('more-tabs-left',maximum>1&&tabs.scrollLeft>1);
    tabs.classList.toggle('more-tabs-right',maximum>1&&tabs.scrollLeft<maximum-1);
  }
  function scrollTabs(direction){const tabs=$('fileTabs');tabs.scrollBy({left:direction*Math.max(160,tabs.clientWidth*.7),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}
  function wireTabScrolling(){
    const tabs=$('fileTabs');
    (tabs.closest('.tabbar')||tabs).addEventListener('wheel',event=>{
      if(event.ctrlKey||event.metaKey||event.target?.closest('.menu-popover'))return;
      const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY,scale=event.deltaMode===1?32:event.deltaMode===2?tabs.clientWidth:1;
      if(tabs.scrollWidth<=tabs.clientWidth)return;
      event.preventDefault();tabs.scrollLeft+=delta*scale;syncTabScroll();
    },{passive:false});
    tabs.addEventListener('scroll',syncTabScroll);window.addEventListener('resize',syncTabScroll);syncTabScroll();
  }
