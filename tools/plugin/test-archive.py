"""Negative validator regressions, including Python's optimized mode."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile

validator = pathlib.Path(__file__).with_name('verify-archive.py')
with tempfile.TemporaryDirectory(prefix='desktop-control-archive-test-') as temporary:
    root = pathlib.Path(temporary)
    cases = ['valid', 'remote', 'no-local', 'fixture', 'missing-license', 'zero-dependencies', 'tamper', 'traversal', 'alias', 'case-alias', 'windows-device', 'oversize', 'long-component', 'backslash', 'space-suffix', 'dirty-provenance', 'wrong-commit', 'version-drift', 'metadata-name', 'mcp-drift']
    for case in cases:
        manifest = {'name': 'desktop-control-private', 'version': '0.0.1-test', 'extensions': {'com.openai': {'requires_local_executor': case != 'no-local'}}}
        mcp = {'mcpServers': {'desktop-control': {'type': 'http' if case == 'remote' else 'stdio', 'args': ['${PLUGIN_ROOT}/start.mjs']}}}
        files = {'plugin.json': json.dumps(manifest).encode(), 'mcp.json': json.dumps(mcp).encode(),
                 '.codex-plugin/plugin.json': json.dumps({'name': 'desktop-control-private', 'version': '0.0.1-test', 'requires_local_executor': True}).encode(),
                 '.mcp.json': json.dumps({'mcpServers': mcp['mcpServers']}).encode(),
                 'dist/packages/mcp-server/src/server.mjs': b'deps.grants ?? DENY_ALL_GRANTS',
                 'PROVENANCE.json': json.dumps({'source_commit': 'a' * 40, 'plugin_version': '0.0.1-test', 'dirty': False, 'dependencies': [] if case == 'zero-dependencies' else [{'name': n} for n in ['a', 'b', 'c']]}).encode()}
        for name in ['a', 'b', 'c']:
            if case != 'missing-license' or name != 'c':
                files[f'node_modules/{name}/LICENSE'] = b'test-only synthetic license'
        if case == 'fixture':
            files['test/grant.mjs'] = b'test-only marker'
        if case == 'traversal':
            files['../escape'] = b'test-only marker'
        extras = {
            'alias': {'data.txt': b'good', './data.txt': b'evil'},
            'case-alias': {'README.txt': b'A', 'readme.txt': b'B'},
            'windows-device': {'CON.txt': b'X'},
            'oversize': {'large.dat': b'z' * (32 * 1024 * 1024 + 1)},
            'long-component': {'x' * 256 + '.txt': b'x'},
            'backslash': {'escape\\foo': b'x'},
            'space-suffix': {'safe .txt ': b'y'},
        }
        files.update(extras.get(case, {}))
        if case in ('dirty-provenance', 'wrong-commit', 'version-drift'):
            source = json.loads(files['PROVENANCE.json'])
            if case == 'dirty-provenance': source['dirty'] = True
            elif case == 'wrong-commit': source['source_commit'] = 'not-a-git-sha'
            else: source['plugin_version'] = '0.0.0-stale'
            files['PROVENANCE.json'] = json.dumps(source).encode()
        if case == 'metadata-name':
            metadata = json.loads(files['.codex-plugin/plugin.json'])
            metadata['name'] = 'unexpected-plugin'
            files['.codex-plugin/plugin.json'] = json.dumps(metadata).encode()
        if case == 'mcp-drift':
            files['.mcp.json'] = json.dumps({'mcpServers': {'desktop-control': {'type': 'http'}}}).encode()
        inventory = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
        if case == 'tamper':
            files['plugin.json'] += b' '
        files['FILES.sha256.json'] = json.dumps(inventory).encode()
        archive = root / (case + '.zip')
        with zipfile.ZipFile(archive, 'w') as out:
            for name, data in files.items():
                info = zipfile.ZipInfo(name)
                info.external_attr = 0o100644 << 16
                out.writestr(info, data)
        for optimized in [False, True]:
            destination = root / (case + ('-opt' if optimized else '-normal'))
            result = subprocess.run([sys.executable] + (['-O'] if optimized else []) + [str(validator), str(archive), str(destination)], capture_output=True)
            passed = result.returncode == 0
            if passed != (case == 'valid') or (case != 'valid' and destination.exists()):
                raise RuntimeError(f'Validator regression: {case}, optimized={optimized}')
    print(json.dumps({'checks': len(cases) * 2, 'result': 'PASS', 'optimized_and_normal': True, 'rejected_before_extraction': True}))
