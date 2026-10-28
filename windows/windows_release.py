"""Identify and verify the editor page shipped with a Windows release."""
import hashlib,json,re
from pathlib import Path

BUILD_PATTERN=r'\d{4}\.\d{2}\.\d{2}-r\d+'

def build_from_html(html):
    match=re.search(r'<meta name="another-note-build" content="('+BUILD_PATTERN+r')">',html)
    if not match:raise ValueError('The editor build identifier is missing or invalid.')
    return match.group(1)

def write_editor_bundle(folder,html):
    folder=Path(folder);build=build_from_html(html);data=html.encode('utf-8')
    filename='Another-Note-'+build+'.html'
    release={'build':build,'editor':filename,'sha256':hashlib.sha256(data).hexdigest()}
    (folder/'Another-Note.html').write_bytes(data)
    (folder/filename).write_bytes(data)
    (folder/'release.json').write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
    return release

def load_release(folder):
    folder=Path(folder);manifest=folder/'release.json'
    if manifest.exists():
        release=json.loads(manifest.read_text(encoding='utf-8'))
        if not isinstance(release,dict):raise ValueError('The installed editor release is invalid. Reinstall the complete current package.')
        build=release.get('build','')
        if not isinstance(build,str) or not re.fullmatch(BUILD_PATTERN,build) or release.get('editor')!='Another-Note-'+build+'.html':
            raise ValueError('The installed editor release is invalid. Reinstall the complete current package.')
        data=(folder/release['editor']).read_bytes()
        if hashlib.sha256(data).hexdigest()!=release.get('sha256') or build_from_html(data.decode('utf-8'))!=build:
            raise ValueError('The installed editor does not match this release. Reinstall the complete current package.')
        return release
    # Source/development pages predate the packaged release manifest.
    data=(folder/'Another-Note.html').read_bytes()
    return {'build':build_from_html(data.decode('utf-8')),'editor':'Another-Note.html','sha256':hashlib.sha256(data).hexdigest()}
