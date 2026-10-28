"""Shared version and download names for Another Note releases."""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parent

def read_version(root=ROOT):
    version=(Path(root)/'VERSION').read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'\d{4}\.\d{2}\.\d{2}-r\d+',version):
        raise ValueError('VERSION must contain a build such as 2026.10.27-r6.')
    return version

def release_names(version):
    if not re.fullmatch(r'\d{4}\.\d{2}\.\d{2}-r\d+',version):raise ValueError('Invalid release version.')
    return {kind:'Another-Note-'+label+version+suffix for kind,label,suffix in [
        ('html','','.html'),('fedora','Fedora-','.zip'),('source','Source-','.zip'),
        ('installer','Setup-','.exe'),('windows','Windows-','.zip'),('checksums','SHA256SUMS-','.txt'),
    ]}
