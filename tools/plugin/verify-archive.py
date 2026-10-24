"""Validate exact private archive inventory before safe extraction for runtime tests."""
import hashlib
import json
import pathlib
import sys
import zipfile

archive_path = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
if destination.exists():
    raise ValueError('Use a new extraction directory')
with zipfile.ZipFile(archive_path) as archive:
    names = archive.namelist()
    if len(names) != len(set(names)):
        raise ValueError('Duplicate archive entries')
    for name in names:
        path = pathlib.PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name:
            raise ValueError('Unsafe archive member')
        if ((archive.getinfo(name).external_attr >> 16) & 0o170000) != 0o100000:
            raise ValueError('Non-regular archive member')
    inventory = json.loads(archive.read('FILES.sha256.json'))
    if set(names) != set(inventory) | {'FILES.sha256.json'}:
        raise ValueError('Inventory differs from archive')
    for name, digest in inventory.items():
        if hashlib.sha256(archive.read(name)).hexdigest() != digest:
            raise ValueError('File digest mismatch')
    manifest = json.loads(archive.read('plugin.json'))
    mcp = json.loads(archive.read('mcp.json'))
    assert manifest['extensions']['com.openai']['requires_local_executor'] is True
    assert mcp['mcpServers']['desktop-control']['type'] == 'stdio'
    assert mcp['mcpServers']['desktop-control']['args'] == ['${PLUGIN_ROOT}/start.mjs']
    assert not any(n.startswith(('packages/', 'tools/', 'test/', 'tests/')) for n in names)
    assert 'deps.grants ?? DENY_ALL_GRANTS' in archive.read('dist/packages/mcp-server/src/server.mjs').decode()
    provenance = json.loads(archive.read('PROVENANCE.json'))
    assert len(provenance['dependencies']) == 3
    for dep in provenance['dependencies']:
        assert any(n.startswith('node_modules/' + dep['name'] + '/') and pathlib.PurePosixPath(n).name.lower().startswith('license') for n in names)
    archive.extractall(destination)
print(json.dumps({'result': 'PASS', 'files': len(names), 'archive_sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(), 'version': manifest['version'], 'source_commit': provenance['source_commit'], 'dirty': provenance['dirty']}))
