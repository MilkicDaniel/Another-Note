#!/usr/bin/env python3
"""Measure native GTK/WebKit time to a populated, painted editor.

Runs a separate app identity with synthetic notes and temporary XDG data,
config and cache directories. Does not read or modify the user's notebook.
OS disk caches are not cleared. --profile adds diagnostic JS wrappers and
should not be used for final timings. The default reports uninstrumented
app timings and starts each run with a fresh application cache directory.
"""
import argparse, json, os, pathlib, subprocess, sys, tempfile, time

START=time.perf_counter()
parser=argparse.ArgumentParser()
parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1])
parser.add_argument('--scenario',choices=['empty','session','linked-session'],default='session')
parser.add_argument('--child',action='store_true')
parser.add_argument('--profile',action='store_true')
parser.add_argument('--verify-scroll',action='store_true',help='Also verify native highlight/gutter geometry after distant scrolling')
parser.add_argument('--compare',type=pathlib.Path)
parser.add_argument('--runs',type=int,default=3)
args=parser.parse_args()
args.root=args.root.resolve()
if args.compare:args.compare=args.compare.resolve()
if args.runs<1:parser.error('--runs must be positive')

if not args.child:
 import statistics
 groups={}
 for _ in range(args.runs):
  for label,root in ([('baseline',args.compare),('current',args.root)] if args.compare else [('current',args.root)]):
   command=[sys.executable,__file__,'--child','--root',str(root),'--scenario',args.scenario]
   if args.profile:command.append('--profile')
   if args.verify_scroll:command.append('--verify-scroll')
   result=subprocess.run(command,capture_output=True,text=True,timeout=45)
   if result.returncode:
    print(result.stdout,file=sys.stderr);print(result.stderr[-7000:],file=sys.stderr);raise SystemExit(result.returncode)
   record=json.loads(result.stdout.strip().splitlines()[-1]);record['label']=label
   if record.get('timeout') or record.get('errors') or record.get('editor_width',0)<=0 or abs(record.get('alignment_delta') or 0)>1 or any(not c['aligned'] for c in record.get('scroll_checks',[])) or label=='current' and record.get('closed_files_verified') is False:
    raise SystemExit('The probe did not reach a usable editor: '+json.dumps(record))
   groups.setdefault(label,[]).append(record);print(json.dumps(record),flush=True)
 summary={label:{key:round(statistics.median(r['events_ms'][key] for r in records),2) for key in ['present','page_ready','painted']} for label,records in groups.items()}
 print(json.dumps({'scenario':args.scenario,'runs_per_version':args.runs,'median_ms':summary,'profiled':args.profile}),flush=True)
 raise SystemExit()

events={}
def mark(name):events[name]=round((time.perf_counter()-START)*1000,2)
with tempfile.TemporaryDirectory(prefix='another-note-startup-') as tmp:
 directory=pathlib.Path(tmp);os.environ['XDG_DATA_HOME']=str(directory/'data');os.environ['XDG_CACHE_HOME']=str(directory/'cache');os.environ['XDG_CONFIG_HOME']=str(directory/'config')
 if args.scenario!='empty':
  notes=[]
  for index in range(105):
   content=('<section class="example">\n  <h2>Example</h2>\n  <p>A local document and its contents.</p>\n</section>\n'*(1050 if index==0 else 65))
   notes.append({'id':'sample-'+str(index),'title':'sample-'+str(index)+'.html','content':content,'mode':'html','createdAt':1,'updatedAt':100,'removedAt':0,'trashedAt':0,'savedState':{'title':'sample-'+str(index)+'.html','content':content,'mode':'html','lineEnding':'lf','bom':False}})
  fixture={'format':'vista-notes','version':1,'updatedAt':100,'activeId':'sample-0','settings':{'theme':'dark','openIds':['sample-'+str(i) for i in range(8)]},'notes':notes}
  folder=directory/'data/vista-notes/notebook';folder.mkdir(parents=True);(folder/'notes.json').write_text(json.dumps(fixture))
  if args.scenario=='linked-session':
   disk=directory/'documents';disk.mkdir();links={}
   for note in notes:
    path=disk/note['title'];path.write_text(note['content'])
    key='fixture-'+note['id'];links[key]={'path':str(path),'lineEnding':'lf','bom':False}
    note.update(fileKey=key,diskPath=str(path),tags=['Retain open tags'],tagsUpdatedAt=90)
   (folder/'notes.json').write_text(json.dumps(fixture));(folder/'file-links.json').write_text(json.dumps(links))
 mark('fixture_ready')
 sys.path.insert(0,str(args.root/'fedora'))
 import launcher
 mark('python_imported')
 launcher.APP_ID='org.vistanotes.StartupProbe'
 app_dir=directory/'app';app_dir.mkdir();launcher.APP_DIR=app_dir
 html=(args.root/'fedora/Another-Note.html').read_text()
 if args.scenario=='linked-session':
  html=html.replace('  initialize().catch(error=>{','  globalThis.__flushStartupProbe=flush;\n  initialize().catch(error=>{')
 if args.profile:
  # Wrap actual app functions to attribute main-thread startup costs.
  names=['paintEditor','updateLineNumbers','colorCode','validateWorkspace','renderTabs','renderAll','selectNote','save','syncCodeView','codeRecord','codeProjection','sourceStructure','renderFoldControls','planColorSpacing','decorateCodeStructure','projectFoldedHTML','syncScroll','refreshSpellcheck','renderMinimap','updatePosition','applySettings','syncEditorScrollbars','updateActiveLine','editorCaretRowOffset']
  wrappers=[]
  for name in names:
   marker='function '+name+'('
   if marker not in html:continue
   html=html.replace(marker,'function startupOriginal_'+name+'(',1)
   wrappers.append('function '+name+'(...a){const t=performance.now();try{return startupOriginal_'+name+'(...a);}finally{const s=globalThis.__startupStats||(globalThis.__startupStats={}),r=s.'+name+'||(s.'+name+'={ms:0,calls:0});r.ms+=performance.now()-t;r.calls++;}}')
  html=html.replace('  initialize().catch(error=>{','\n'.join(wrappers)+'\n  initialize().catch(error=>{')
  html=html.replace("if(editorSyntax.rendered!==html){","if(editorSyntax.rendered!==html){const s=globalThis.__startupStats||(globalThis.__startupStats={}),w=s.highlightSnapshots||(s.highlightSnapshots={ms:0,calls:0});w.calls++;")
 (app_dir/'Another-Note.html').write_text(html)
 for name in ['spelling-worker.js.gz','format-worker.js.gz']:(app_dir/name).symlink_to(args.root/'fedora'/name)
 original_load=launcher.load_toolkit
 data={}
 def load_toolkit():
  mark('toolkit_start');Gtk,WebKit,Gio,GLib,Gdk,Pango=original_load();mark('toolkit_loaded')
  original_run=Gtk.Application.run;original_uri=WebKit.WebView.load_uri;original_present=Gtk.ApplicationWindow.present
  original_read=launcher.NotebookStore.read;original_hub_load=launcher.WorkspaceHub.load
  def read(self):
   mark('read_start');result=original_read(self);mark('read_end');return result
  def hub_load(self,*a,**kw):
   phase='remaining_hub_load' if 'hub_load_start' in events else 'hub_load'
   mark(phase+'_start');result=original_hub_load(self,*a,**kw);mark(phase+'_end');return result
  launcher.NotebookStore.read=read;launcher.WorkspaceHub.load=hub_load
  def present(window,*a,**kw):
   mark('present');return original_present(window,*a,**kw)
  Gtk.ApplicationWindow.present=present
  def load_uri(view,uri):
   mark('load_uri')
   manager=view.get_user_content_manager();manager.register_script_message_handler('startupProbe',None)
   def completed(_m,value):
    result=json.loads(value.to_string());data.update(result)
    if result.get('phase')!='scrolled':mark('painted')
    if not args.verify_scroll or result.get('phase')=='scrolled':GLib.idle_add(data['application'].quit)
   manager.connect('script-message-received::startupProbe',completed)
   def message(_m,value):
    command=json.loads(value.to_string()).get('command')
    if command=='load':mark('page_load_request')
    if command=='ready':
     mark('page_ready')
     probe="""requestAnimationFrame(()=>requestAnimationFrame(()=>{
       const editor=document.getElementById('editor'),code=document.getElementById('highlightCode'),row=document.getElementById('lineNumbers').firstElementChild;
       const first=document.createTreeWalker(code,NodeFilter.SHOW_TEXT).nextNode();let alignment=null;
       if(first&&row){const a=document.createRange(),b=document.createRange();a.setStart(first,0);a.setEnd(first,Math.min(1,first.length));b.selectNodeContents(row);alignment=a.getBoundingClientRect().top-b.getBoundingClientRect().top;}
       window.webkit.messageHandlers.startupProbe.postMessage(JSON.stringify({functions:globalThis.__startupStats||{},page_ms:performance.now(),editor_width:editor.clientWidth,source_chars:editor.value.length,highlight_nodes:code.querySelectorAll('*').length,fold_controls:document.getElementById('foldControls').children.length,alignment_delta:alignment,errors:document.getElementById('errorBanner').textContent}));
     }));"""
     if args.scenario=='linked-session':
      probe=probe.replace('requestAnimationFrame(()=>requestAnimationFrame(()=>{','requestAnimationFrame(()=>requestAnimationFrame(async()=>{await globalThis.__flushStartupProbe();')
     if args.verify_scroll:
      scroll_probe="""      (async()=>{
        const editor=document.getElementById('editor'),code=document.getElementById('highlightCode'),checks=[];
        for(const fraction of [.5,1]){
          editor.scrollTop=(editor.scrollHeight-editor.clientHeight)*fraction;
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const line=parseFloat(getComputedStyle(editor).lineHeight),index=Math.round((parseFloat(code.style.paddingTop)||0)/line),row=document.getElementById('lineNumbers').children[index],first=document.createTreeWalker(code,NodeFilter.SHOW_TEXT).nextNode();
          let delta=0;if(first&&row){const a=document.createRange(),b=document.createRange();a.setStart(first,0);a.setEnd(first,Math.min(first.length,1));b.selectNodeContents(row);delta=a.getBoundingClientRect().top-b.getBoundingClientRect().top;}
          const scrollDelta=Math.abs(editor.scrollTop-document.getElementById('highlight').scrollTop);
          checks.push({fraction,delta,scroll_delta:scrollDelta,aligned:Math.abs(delta)<1&&scrollDelta<1});
        }
        window.webkit.messageHandlers.startupProbe.postMessage(JSON.stringify({phase:'scrolled',scroll_checks:checks}));
      })();"""
      probe=probe.replace("\n     }));", "\n"+scroll_probe+"\n     }));")
     view.evaluate_javascript(probe,-1,None,None,None,None)
   manager.connect('script-message-received::vistaNotes',message)
   view.connect('load-changed',lambda _view,event:mark('webkit_'+event.value_nick))
   return original_uri(view,uri)
  WebKit.WebView.load_uri=load_uri
  def run(application,argv):
   data['application']=application;mark('application_run')
   application.connect_after('activate',lambda *_a:mark('activate_complete'))
   GLib.timeout_add_seconds(30,lambda:(data.update({'timeout':True}),application.quit(),False)[-1])
   return original_run(application,argv)
  Gtk.Application.run=run
  return Gtk,WebKit,Gio,GLib,Gdk,Pango
 launcher.load_toolkit=load_toolkit
 sys.argv=['another-note-startup-probe']
 launcher.run();data.pop('application',None)
 if args.scenario=='linked-session':
  saved=json.loads((folder/'notes.json').read_text());by_id={note['id']:note for note in saved['notes']};opened=set(fixture['settings']['openIds'])
  data['closed_files_verified']=all(by_id[note['id']].get('content')==note['content'] and by_id[note['id']].get('tags')==note['tags'] if note['id'] in opened else by_id[note['id']].get('fileLink') is True and not any(key in by_id[note['id']] for key in ('content','savedState','tags','versions')) for note in notes)
  data['closed_links']=sum(bool(note.get('fileLink')) for note in saved['notes'])
 print(json.dumps({'scenario':args.scenario,'profiled':args.profile,'events_ms':events,**data}),flush=True)
