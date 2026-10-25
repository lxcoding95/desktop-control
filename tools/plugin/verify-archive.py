"""Validate exact private archive inventory before safe extraction for runtime tests."""
import hashlib
import json
import pathlib
import sys
import zipfile
import re
import unicodedata

archive_path = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
if destination.exists():
    raise ValueError('Use a new extraction directory')
with zipfile.ZipFile(archive_path) as archive:
    infos = archive.infolist()
    names = [item.filename for item in infos]
    # Bound extraction before reading any untrusted compressed bytes; this is an
    # upload validator, not an installer with an unlimited decompression budget.
    if (len(infos) > 12000 or archive_path.stat().st_size > 128 * 1024 * 1024 or
            sum(item.file_size for item in infos) > 128 * 1024 * 1024):
        raise ValueError('Archive budget exceeded')
    if len(names) != len(set(names)):
        raise ValueError('Duplicate archive entries')
    canonical = set()
    for item in infos:
        name = item.filename
        path = pathlib.PurePosixPath(name)
        segments = name.split('/')
        if (not name or name.startswith('/') or name.endswith('/') or
                len(name) > 4096 or path.is_absolute() or
                any(part in ('', '.', '..') or len(part) > 255 or
                    part.endswith((' ', '.')) or
                    re.fullmatch(r'(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part)
                    for part in segments) or
                '\\' in name or ':' in name or any(ord(c) < 32 or ord(c) == 127 for c in name)):
            raise ValueError('Unsafe archive member')
        folded = unicodedata.normalize('NFKC', name).casefold()
        if folded in canonical:
            raise ValueError('Cross-platform member alias')
        canonical.add(folded)
        if ((item.external_attr >> 16) & 0o170000) != 0o100000:
            raise ValueError('Non-regular archive member')
        if (item.file_size > 32 * 1024 * 1024 or item.flag_bits & 1 or
                (item.compress_size and item.file_size / item.compress_size > 1000)):
            raise ValueError('Oversized, encrypted or overcompressed archive member')
    inventory = json.loads(archive.read('FILES.sha256.json'))
    if set(names) != set(inventory) | {'FILES.sha256.json'}:
        raise ValueError('Inventory differs from archive')
    for name, digest in inventory.items():
        if hashlib.sha256(archive.read(name)).hexdigest() != digest:
            raise ValueError('File digest mismatch')
    manifest = json.loads(archive.read('plugin.json'))
    mcp = json.loads(archive.read('mcp.json'))
    if manifest['extensions']['com.openai']['requires_local_executor'] is not True:
        raise ValueError('Local executor required')
    if mcp['mcpServers']['desktop-control']['type'] != 'stdio':
        raise ValueError('Only local stdio is permitted')
    if mcp['mcpServers']['desktop-control']['args'] != ['${PLUGIN_ROOT}/start.mjs']:
        raise ValueError('Unexpected launch arguments')
    if any(n.startswith(('packages/', 'tools/', 'test/', 'tests/')) for n in names):
        raise ValueError('Development files forbidden')
    if 'deps.grants ?? DENY_ALL_GRANTS' not in archive.read('dist/packages/mcp-server/src/server.mjs').decode():
        raise ValueError('Production default-deny entry required')
    provenance = json.loads(archive.read('PROVENANCE.json'))
    if len(provenance['dependencies']) != 3:
        raise ValueError('Unexpected dependency count')
    for dep in provenance['dependencies']:
        if not any(n.startswith('node_modules/' + dep['name'] + '/') and pathlib.PurePosixPath(n).name.lower().startswith('license') for n in names):
            raise ValueError('Original dependency license missing')
    archive.extractall(destination)
print(json.dumps({'result': 'PASS', 'files': len(names), 'archive_sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(), 'version': manifest['version'], 'source_commit': provenance['source_commit'], 'dirty': provenance['dirty']}))
