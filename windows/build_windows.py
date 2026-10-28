#!/usr/bin/env python3
"""Cross-build a portable Windows app and a single EXE installer from pinned inputs."""
import argparse,base64,hashlib,io,json,shutil,struct,subprocess,sys,tempfile,zipfile
from pathlib import Path
from urllib.request import urlopen
if __package__:
    from .windows_release import build_from_html,write_editor_bundle
else:
    from windows_release import build_from_html,write_editor_bundle

ROOT=Path(__file__).resolve().parent;REPO=ROOT.parent
MAGIC=b'ANOTEPAYLOADv1'.ljust(16,b'\0')

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def fetch(cache,name,url,sha):
    target=cache/name
    if not target.exists() or digest(target)!=sha:
        if not url:raise ValueError('Missing vendored dependency: '+name)
        with urlopen(url,timeout=60) as response:target.write_bytes(response.read())
    if digest(target)!=sha:raise ValueError('Download checksum mismatch: '+name)
    return target

def extract(archive,destination):
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            relative=Path(item.filename)
            if relative.is_absolute() or '..' in relative.parts:raise ValueError('Unsafe archive path.')
        z.extractall(destination)

def wheel_entries(path):
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if name.endswith('/'):continue
            relative=Path(name)
            if relative.is_absolute() or '..' in relative.parts:raise ValueError('Unsafe wheel path.')
            if '.data/' in name:
                parts=name.split('/')
                if parts[1] not in ('purelib','platlib'):continue
                relative=Path(*parts[2:])
            yield relative,z.read(name)

def build(cache,output,zig):
    from PIL import Image
    cache=Path(cache);output=Path(output);cache.mkdir(parents=True,exist_ok=True);output.mkdir(parents=True,exist_ok=True)
    lock=json.loads((ROOT/'runtime-lock.json').read_text());python=lock['python'];python_zip=fetch(cache,'python-'+python['version']+'-embed-amd64.zip',python['url'],python['sha256'])
    wheels=[]
    for item in lock['wheels']:
        if item['url'] is None:
            vendored=ROOT/'vendor'/item['filename'];assert digest(vendored)==item['sha256'];wheels.append(vendored)
        else:wheels.append(fetch(cache,item['filename'],item['url'],item['sha256']))
    subprocess.run([sys.executable,str(REPO/'build.py')],check=True)
    with tempfile.TemporaryDirectory(prefix='stage-',dir=cache) as temporary:
        stage=Path(temporary);app=stage/'another-note-windows';app.mkdir();runtime=app/'runtime';runtime.mkdir();extract(python_zip,runtime)
        (runtime/'python313._pth').write_text('python313.zip\n.\n..\nLib/site-packages\nimport site\n',encoding='utf-8')
        packages=runtime/'Lib/site-packages';packages.mkdir(parents=True)
        notices=[(ROOT/'vendor/proxy_tools-LICENSE.txt').read_text(),(REPO/'fedora/THIRD_PARTY_LICENSES.txt').read_text(),'\nWindows runtime dependencies\n'+json.dumps(lock,indent=2)]
        for wheel in wheels:
            for relative,data in wheel_entries(wheel):
                target=packages/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
                if any(word in relative.name.lower() for word in ('license','copying')):
                    try:notices.append('\n'+wheel.name+' / '+str(relative)+'\n'+data.decode('utf-8'))
                    except UnicodeError:pass
        for filename in ['launcher.py','windows_host.py','windows_release.py','win32_support.py','README.txt']:
            shutil.copyfile(ROOT/filename,app/filename)
        for filename in ['notebook_store.py','file_store.py','spelling-worker.js.gz','format-worker.js.gz']:
            shutil.copyfile(REPO/'fedora'/filename,app/filename)
        html=(REPO/'fedora/Another-Note.html').read_text();bridge=(ROOT/'bridge.js').read_text()
        html=html.replace('<script id="startupTheme">','<script id="windowsBridge">'+bridge+'</script>\n  <script id="startupTheme">',1)
        assert '<script id="windowsBridge">' in html
        release=write_editor_bundle(app,html);(app/'THIRD_PARTY_LICENSES.txt').write_text('\n\n'.join(notices),encoding='utf-8')
        Image.open(REPO/'source/app-icon.png').save(app/'another-note.ico',format='ICO',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
        resource=stage/'app.rc';resource.write_text('1 ICON "'+(app/'another-note.ico').as_posix()+'"\n',encoding='utf-8')
        resource_obj=stage/'app.res';subprocess.run([zig,'rc','/fo',str(resource_obj),str(resource)],check=True)
        def compile(source,target,extra=()):
            subprocess.run([zig,'cc','-target','x86_64-windows-gnu','-O2','-municode','-Wl,--subsystem,windows','-s','-I',str(stage),str(ROOT/source),str(resource_obj),'-o',str(target),'-luser32',*extra],check=True)
            data=target.read_bytes();pe=struct.unpack_from('<I',data,0x3c)[0];assert data[:2]==b'MZ' and data[pe:pe+4]==b'PE\0\0' and struct.unpack_from('<H',data,pe+4)[0]==0x8664 and struct.unpack_from('<H',data,pe+24+68)[0]==2
        compile('bootstrap.c',app/'Another-Note.exe')
        manifest={str(p.relative_to(app)).replace('\\','/'):digest(p) for p in sorted(app.rglob('*')) if p.is_file()}
        (app/'SHA256SUMS.json').write_text(json.dumps(manifest,indent=2)+'\n')
        portable=output/('Another-Note-Windows-'+release['build']+'.zip')
        with zipfile.ZipFile(portable,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for path in sorted(app.rglob('*')):
                if path.is_file():z.write(path,path.relative_to(stage))
        ps=(ROOT/'install.ps1').read_text();encoded=base64.b64encode(ps.encode('utf-16-le')).decode('ascii');command='powershell.exe -NoLogo -NoProfile -NonInteractive -STA -EncodedCommand '+encoded
        assert len(command)<32760
        (stage/'setup_command.h').write_text('static wchar_t setup_command[]=L"'+command+'";\n')
        installer=output/('Another-Note-Setup-'+release['build']+'.exe');compile('setup.c',installer)
        payload=portable.read_bytes()
        with installer.open('ab') as destination:destination.write(payload);destination.write(struct.pack('<16sQ32s',MAGIC,len(payload),hashlib.sha256(payload).digest()))
        check_installer(installer,portable,release['build'])
        return [installer,portable]

def check_installer(installer,portable,expected_build=None):
    data=Path(installer).read_bytes();magic,length,sha=struct.unpack('<16sQ32s',data[-56:]);assert magic==MAGIC
    payload=data[-56-length:-56];assert payload==Path(portable).read_bytes() and hashlib.sha256(payload).digest()==sha
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        assert z.testzip() is None
        manifest=json.loads(z.read('another-note-windows/SHA256SUMS.json'))
        for name,expected in manifest.items():assert hashlib.sha256(z.read('another-note-windows/'+name)).hexdigest()==expected,name
        if expected_build:
            assert Path(installer).name=='Another-Note-Setup-'+expected_build+'.exe'
            assert Path(portable).name=='Another-Note-Windows-'+expected_build+'.zip'
            release=json.loads(z.read('another-note-windows/release.json'));assert release['build']==expected_build
            assert release['editor']=='Another-Note-'+expected_build+'.html'
            html=z.read('another-note-windows/'+release['editor']);assert hashlib.sha256(html).hexdigest()==release['sha256']
            assert build_from_html(html.decode('utf-8'))==expected_build
            assert html==z.read('another-note-windows/Another-Note.html')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,default=REPO/'artifacts/windows-cache');parser.add_argument('--output',type=Path,default=REPO/'dist');parser.add_argument('--zig',default='zig');args=parser.parse_args()
    for path in build(args.cache,args.output,args.zig):print(path.name,path.stat().st_size,digest(path))
