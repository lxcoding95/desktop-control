"""Validate exact private archive inventory before safe extraction for runtime tests."""
import hashlib
import json
import pathlib
import re
import sys
import zipfile
import unicodedata

archive_path = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
if destination.exists() or destination.is_symlink():
    raise ValueError('Use a new extraction directory')
with zipfile.ZipFile(archive_path) as archive:
    runtime_names = {'@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod', 'pdf-lib', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'pako', 'tslib', 'playwright-core'}
    worker_names = {'pdf-lib', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'pako', 'tslib'}
    root_files = {'plugin.json', 'mcp.json', '.codex-plugin/plugin.json', '.mcp.json', 'start.mjs', 'grant.mjs', 'README.md',
                  'LICENSE', 'THIRD-PARTY-NOTICES.md', 'PROVENANCE.json', 'FILES.sha256.json', 'RUNTIME-LICENSES.json', 'SBOM.cdx.json'}
    native_files = {'dist/native/windows-token.exe', 'dist/native/windows-private-policy.exe', 'dist/private-desktop/desktop-controller.exe', 'dist/private-settings/private-settings.exe'}
    package_files = {'packages/mcp-server/scripts/private-grant.mjs', 'packages/private-desktop/native/DesktopController.cs', 'packages/private-settings/native/PrivateSettings.cs'}
    package_files |= {'packages/private-browser/runtime.mjs', 'packages/private-browser/indicator.mjs', 'packages/private-settings/management.mjs',
                      'assets/desktop-control.svg', 'assets/desktop-control.png'}
    package_files |= {f'packages/{package}/{file}' for package in ['private-browser', 'private-desktop', 'private-settings'] for file in ['controller.mjs', 'package.json']}
    def package_member(name, prefix, allowed):
        return any(name.startswith(prefix + dependency + '/') for dependency in allowed)
    def permitted(name):
        if name in root_files or name in native_files or name in package_files or name in {'source/WindowsToken.cs', 'source/WindowsPrivatePolicy.cs'}:
            return True
        if name.startswith('dist/packages/mcp-server/src/') and name.endswith(('.mjs', '.d.mts')):
            return True
        if name.startswith('skills/') and name.endswith(('.md', '.mjs', '.json', '.ps1', '.py')):
            return True
        if name in {'dist/private-workspace-runtime/operations.mjs', 'dist/private-workspace-runtime/worker.mjs', 'dist/private-workspace-runtime/terminal.mjs',
                    'dist/private-workspace-runtime/package.json', 'dist/private-workspace-runtime/runtime-inventory.json'}:
            return True
        return package_member(name, 'node_modules/', runtime_names) or package_member(name, 'dist/private-workspace-runtime/node_modules/', worker_names)
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
                any(unicodedata.normalize('NFKC', part) in ('', '.', '..') or len(part) > 255 or
                    unicodedata.normalize('NFKC', part).endswith((' ', '.')) or
                    any(c in unicodedata.normalize('NFKC', part) for c in '<>"|?*') or
                    re.fullmatch(r'(?i)(CON|CONIN\$|CONOUT\$|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', unicodedata.normalize('NFKC', part))
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
        if not permitted(name):
            raise ValueError('Unapproved package member')
    required_files = root_files | package_files | {'source/WindowsToken.cs', 'source/WindowsPrivatePolicy.cs',
        'dist/packages/mcp-server/src/server.mjs', 'dist/packages/mcp-server/src/private.mjs', 'dist/packages/mcp-server/src/index.mjs',
        'dist/private-workspace-runtime/operations.mjs', 'dist/private-workspace-runtime/worker.mjs', 'dist/private-workspace-runtime/terminal.mjs',
        'dist/private-workspace-runtime/package.json', 'dist/private-workspace-runtime/runtime-inventory.json'}
    if not required_files.issubset(names):
        raise ValueError('Required private runtime component missing')
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
    server_config = mcp['mcpServers']['desktop-control']
    if set(mcp['mcpServers']) != {'desktop-control'} or set(server_config) != {'type', 'command', 'args', 'cwd'} or server_config['command'] != 'node' or server_config['cwd'] != '${PLUGIN_ROOT}':
        raise ValueError('Unexpected stdio executor configuration')
    compatibility = json.loads(archive.read('.codex-plugin/plugin.json'))
    if compatibility.get('version') != manifest['version'] or compatibility.get('name') != manifest.get('name') or compatibility.get('requires_local_executor') is not True:
        raise ValueError('Compatibility identity/version/local executor mismatch')
    if json.loads(archive.read('.mcp.json')).get('mcpServers') != mcp['mcpServers']:
        raise ValueError('Compatibility stdio configuration mismatch')
    if 'deps.grants ?? DENY_ALL_GRANTS' not in archive.read('dist/packages/mcp-server/src/server.mjs').decode():
        raise ValueError('Production default-deny entry required')
    provenance = json.loads(archive.read('PROVENANCE.json'))
    # Cross-check every user-visible metadata source before untrusted ZIP extraction.
    # A checksum inventory proves consistency only within that ZIP, not authenticity.
    codex_manifest = json.loads(archive.read('.codex-plugin/plugin.json'))
    private_mcp = json.loads(archive.read('.mcp.json'))
    if (manifest.get('name') != 'desktop-control-private' or
            codex_manifest.get('name') != manifest['name'] or
            codex_manifest.get('version') != manifest.get('version') or
            codex_manifest.get('requires_local_executor') is not True or
            private_mcp.get('mcpServers') != mcp.get('mcpServers') or
            set(mcp['mcpServers']) != {'desktop-control'} or
            mcp['mcpServers']['desktop-control'].get('command') != 'node' or
            mcp['mcpServers']['desktop-control'].get('cwd') != '${PLUGIN_ROOT}'):
        raise ValueError('Inconsistent plugin or MCP metadata')
    if (not isinstance(provenance, dict) or provenance.get('dirty') is not False or
            not isinstance(provenance.get('source_commit'), str) or
            not re.fullmatch(r'[0-9a-f]{40}', provenance['source_commit']) or
            provenance.get('plugin_version') != manifest.get('version')):
        raise ValueError('Unverifiable package provenance')
    if {dep['name'] for dep in provenance['dependencies']} != runtime_names or len(provenance['dependencies']) != len(runtime_names):
        raise ValueError('Unexpected runtime dependency closure')
    if set(provenance.get('worker_dependencies', {})) != worker_names:
        raise ValueError('Unexpected isolated worker dependency closure')
    for dep in provenance['dependencies']:
        if not dep.get('resolved', '').startswith('https://registry.npmjs.org/') or not dep.get('integrity', '').startswith('sha512-'):
            raise ValueError('Locked registry integrity required')
        if not any(n.startswith('node_modules/' + dep['name'] + '/') and pathlib.PurePosixPath(n).name.lower().startswith('license') for n in names):
            raise ValueError('Original dependency license missing')
        installed = json.loads(archive.read('node_modules/' + dep['name'] + '/package.json'))
        if installed['name'] != dep['name'] or installed['version'] != dep['version']:
            raise ValueError('Installed runtime provenance mismatch')
        for child in installed.get('dependencies', {}):
            if child not in runtime_names:
                raise ValueError('Uninventoried transitive runtime dependency')
    for name in worker_names:
        worker_manifest = json.loads(archive.read('dist/private-workspace-runtime/node_modules/' + name + '/package.json'))
        if worker_manifest['name'] != name or worker_manifest['version'] != provenance['worker_dependencies'][name]:
            raise ValueError('Worker dependency provenance mismatch')
        if not any(n.startswith('dist/private-workspace-runtime/node_modules/' + name + '/') and pathlib.PurePosixPath(n).name.lower().startswith('license') for n in names):
            raise ValueError('Original isolated worker dependency license missing')
    for required in ['node_modules/playwright-core/NOTICE', 'node_modules/playwright-core/ThirdPartyNotices.txt', 'node_modules/tslib/CopyrightNotice.txt',
                     'dist/private-workspace-runtime/terminal.mjs', 'RUNTIME-LICENSES.json', 'SBOM.cdx.json']:
        if required not in names:
            raise ValueError('Required runtime component or original notice missing')
    if provenance.get('platform') not in {'win32', 'linux'}:
        raise ValueError('Unsupported package platform')
    if provenance['platform'] == 'win32' and not native_files.issubset(names):
        raise ValueError('Windows native helper missing')
    if provenance['platform'] == 'linux' and native_files.intersection(names):
        raise ValueError('Unexpected Windows helper in Linux package')
    license_inventory = json.loads(archive.read('RUNTIME-LICENSES.json'))
    if {dep['name'] for dep in license_inventory['runtime']} != runtime_names or len(license_inventory['runtime']) != len(runtime_names):
        raise ValueError('Runtime license inventory differs from shipped closure')
    for dep in license_inventory['runtime']:
        if not dep['licenses']:
            raise ValueError('Empty original license inventory')
        for record in dep['licenses']:
            if record['path'] not in inventory or hashlib.sha256(archive.read(record['path'])).hexdigest() != record['sha256']:
                raise ValueError('Original license inventory hash mismatch')
    sbom = json.loads(archive.read('SBOM.cdx.json'))
    if sbom.get('bomFormat') != 'CycloneDX' or sbom.get('specVersion') != '1.6' or {c['name'] for c in sbom['components']} != runtime_names or len(sbom['components']) != len(runtime_names):
        raise ValueError('Runtime SBOM differs from shipped closure')
    versions = {dep['name']: dep['version'] for dep in provenance['dependencies']}
    if any(c['version'] != versions[c['name']] for c in sbom['components']):
        raise ValueError('Runtime SBOM version mismatch')
    archive.extractall(destination)
print(json.dumps({'result': 'PASS', 'files': len(names), 'archive_sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(), 'version': manifest['version'], 'source_commit': provenance['source_commit'], 'dirty': provenance['dirty']}))
