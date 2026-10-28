#!/usr/bin/env python3
"""Build versioned downloads; optionally include an already-built Windows pair."""
import argparse,hashlib,shutil,subprocess,sys,zipfile
from pathlib import Path
from release_config import ROOT,read_version,release_names

FEDORA_FILES=['README.md','Another-Note.html','install.py','launcher.py','notebook_store.py','file_store.py','another-note.png','THIRD_PARTY_LICENSES.txt','spelling-worker.js.gz','format-worker.js.gz']

def source_paths(root=ROOT):
    root=Path(root)
    for path in sorted(root.rglob('*')):
        relative=path.relative_to(root)
        if not path.is_file() or any(part in {'.git','.openai','__pycache__','artifacts','dist'} for part in relative.parts):continue
        if path.suffix in {'.pyc','.pyo'} or path.name=='.DS_Store':continue
        yield path

def copy_file(source,destination):
    if source.resolve()!=destination.resolve():shutil.copyfile(source,destination)

def package(output,include_windows=False):
    output=Path(output).resolve();output.mkdir(parents=True,exist_ok=True)
    if output==ROOT or ROOT in output.parents and 'dist' not in output.relative_to(ROOT).parts:
        raise ValueError('Place release files in dist or outside the source tree.')
    version=read_version();names=release_names(version)
    subprocess.run([sys.executable,str(ROOT/'build.py')],check=True)
    files=[]
    html=output/names['html'];copy_file(ROOT/'dist'/names['html'],html);files.append(html)
    fedora=output/names['fedora']
    with zipfile.ZipFile(fedora,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name in FEDORA_FILES:archive.write(ROOT/'fedora'/name,'another-note-fedora/'+name)
    with zipfile.ZipFile(fedora) as archive:
        assert archive.testzip() is None
        for name in FEDORA_FILES:assert archive.read('another-note-fedora/'+name)==(ROOT/'fedora'/name).read_bytes()
    files.append(fedora)
    if include_windows:
        from windows.build_windows import check_installer
        installer,portable=[ROOT/'dist'/names[key] for key in ['installer','windows']]
        if not installer.is_file() or not portable.is_file():raise FileNotFoundError('Build the current version with windows/build_windows.py before including Windows downloads.')
        check_installer(installer,portable,version)
        bridge=(ROOT/'windows/bridge.js').read_text(encoding='utf-8')
        with zipfile.ZipFile(portable) as archive:
            native=archive.read('another-note-windows/Another-Note.html').decode('utf-8').replace('<script id="windowsBridge">'+bridge+'</script>\n  ','',1)
            if native!=(ROOT/'fedora/Another-Note.html').read_text(encoding='utf-8'):raise ValueError('The prebuilt Windows editor is stale. Rebuild Windows from the current source.')
        for path in [installer,portable]:
            target=output/path.name;copy_file(path,target);files.append(target)
    source=output/names['source']
    with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for path in source_paths():archive.write(path,'another-note-source/'+path.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(source) as archive:
        assert archive.testzip() is None
        for path in source_paths():assert archive.read('another-note-source/'+path.relative_to(ROOT).as_posix())==path.read_bytes()
    files.append(source)
    checksums=output/names['checksums']
    checksums.write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.name+'\n' for path in files),encoding='utf-8')
    return files+[checksums]

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'dist');parser.add_argument('--include-windows',action='store_true');args=parser.parse_args()
    for path in package(args.output,args.include_windows):print(path.name)
