"""Synthetic archive validator regressions, including Python's optimized mode."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile

validator = pathlib.Path(__file__).with_name('verify-archive.py')
runtime = ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod', 'pdf-lib', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'pako', 'tslib', 'playwright-core']
worker = ['pdf-lib', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'pako', 'tslib']
cases = ['valid', 'remote', 'no-local', 'fixture', 'missing-license', 'zero-dependencies', 'tamper', 'traversal',
         'extra-dependency', 'private-evidence', 'wrong-platform', 'missing-notice', 'bad-sbom', 'bad-license-hash', 'symlink', 'duplicate', 'noncanonical-path',
         'case-collision', 'missing-runtime', 'wrong-compat', 'worker-version', 'unlisted-transitive', 'sbom-version']
cases += ['alias', 'case-alias', 'windows-device', 'oversize', 'long-component', 'backslash', 'space-suffix', 'dirty-provenance', 'wrong-commit', 'version-drift', 'metadata-name', 'mcp-drift']
cases += ['windows-question-alias', 'windows-quote', 'windows-angle', 'windows-pipe', 'windows-star', 'windows-superscript-device', 'windows-console-device']
with tempfile.TemporaryDirectory(prefix='desktop-control-archive-test-') as temporary:
    root = pathlib.Path(temporary)
    for case in cases:
        manifest = {'name': 'desktop-control-private', 'version': '0.0.1-test', 'extensions': {'com.openai': {'requires_local_executor': case != 'no-local'}}}
        mcp = {'mcpServers': {'desktop-control': {'type': 'http' if case == 'remote' else 'stdio', 'command': 'node', 'cwd': '${PLUGIN_ROOT}', 'args': ['${PLUGIN_ROOT}/start.mjs']}}}
        dependencies = [{'name': name, 'version': '1.0.0', 'integrity': 'sha512-test-only', 'resolved': 'https://registry.npmjs.org/test-only'} for name in runtime]
        files = {'plugin.json': json.dumps(manifest).encode(), 'mcp.json': json.dumps(mcp).encode(),
                 'dist/packages/mcp-server/src/server.mjs': b'deps.grants ?? DENY_ALL_GRANTS',
                 'dist/private-workspace-runtime/terminal.mjs': b'// synthetic fixture; never executed',
                 'PROVENANCE.json': json.dumps({'source_commit': 'a' * 40, 'platform': 'invalid' if case == 'wrong-platform' else 'linux',
                    'plugin_version': '0.0.1-test', 'dirty': False, 'dependencies': [] if case == 'zero-dependencies' else dependencies,
                    'worker_dependencies': {name: '1.0.0' for name in worker}}).encode()}
        for name in ['start.mjs', 'grant.mjs', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'source/WindowsToken.cs', 'source/WindowsPrivatePolicy.cs',
                     'packages/mcp-server/scripts/private-grant.mjs', 'packages/private-desktop/native/DesktopController.cs', 'packages/private-settings/native/PrivateSettings.cs',
                     'packages/private-browser/runtime.mjs', 'packages/private-browser/indicator.mjs',
                     'dist/packages/mcp-server/src/private.mjs', 'dist/packages/mcp-server/src/index.mjs',
                     'dist/private-workspace-runtime/operations.mjs', 'dist/private-workspace-runtime/worker.mjs', 'dist/private-workspace-runtime/package.json']:
            files[name] = b'test-only structural fixture'
        files['.codex-plugin/plugin.json'] = json.dumps({'name': manifest['name'], 'version': 'wrong' if case == 'wrong-compat' else manifest['version'], 'requires_local_executor': True}).encode()
        files['.mcp.json'] = json.dumps(mcp).encode()
        files['dist/private-workspace-runtime/runtime-inventory.json'] = json.dumps({'dependencies': {name: '1.0.0' for name in worker}}).encode()
        for package in ['private-browser', 'private-desktop', 'private-settings']:
            for name in ['controller.mjs', 'package.json']:
                files[f'packages/{package}/{name}'] = b'test-only structural fixture'
        for name in worker:
            files[f'dist/private-workspace-runtime/node_modules/{name}/package.json'] = json.dumps({'name': name, 'version': '2.0.0' if case == 'worker-version' else '1.0.0'}).encode()
            files[f'dist/private-workspace-runtime/node_modules/{name}/LICENSE'] = b'test-only synthetic worker license'
        licenses = []
        for name in runtime:
            license_path = f'node_modules/{name}/LICENSE'
            license_bytes = b'test-only synthetic license'
            if case != 'missing-license' or name != 'zod':
                files[license_path] = license_bytes
            files[f'node_modules/{name}/package.json'] = json.dumps({'name': name, 'version': '1.0.0', 'dependencies': {'unlisted': '1.0.0'} if case == 'unlisted-transitive' else {}}).encode()
            licenses.append({'name': name, 'licenses': [{'path': license_path, 'sha256': '0' * 64 if case == 'bad-license-hash' else hashlib.sha256(license_bytes).hexdigest()}]})
        for name in ['node_modules/playwright-core/NOTICE', 'node_modules/playwright-core/ThirdPartyNotices.txt', 'node_modules/tslib/CopyrightNotice.txt']:
            if case != 'missing-notice' or not name.endswith('/NOTICE'):
                files[name] = b'test-only synthetic notice'
        files['RUNTIME-LICENSES.json'] = json.dumps({'runtime': licenses}).encode()
        files['SBOM.cdx.json'] = json.dumps({'bomFormat': 'CycloneDX', 'specVersion': '1.6',
            'components': [] if case == 'bad-sbom' else [{'name': name, 'version': '2.0.0' if case == 'sbom-version' else '1.0.0'} for name in runtime]}).encode()
        if case == 'fixture':
            files['test/grant.mjs'] = b'test-only marker'
        if case == 'extra-dependency':
            files['node_modules/unapproved/package.json'] = b'{}'
        if case == 'private-evidence':
            files['.cache/private-builds/private.json'] = b'{}'
        if case == 'traversal':
            files['../escape'] = b'test-only marker'
        if case == 'symlink':
            files['skills/symlink.md'] = b'test-only target'
        if case == 'noncanonical-path':
            files['skills//unexpected.md'] = b'test-only marker'
        if case == 'case-collision':
            files['skills/Case.md'] = b'test-only marker'
            files['skills/case.md'] = b'test-only marker'
        if case == 'missing-runtime':
            del files['dist/private-workspace-runtime/worker.mjs']
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
        portable_aliases = {
            'windows-question-alias': {'node_modules/zod/a?b.txt': b'A', 'node_modules/zod/a_b.txt': b'B'},
            'windows-quote': {'node_modules/zod/a"b.txt': b'A'},
            'windows-angle': {'node_modules/zod/a<b.txt': b'A'},
            'windows-pipe': {'node_modules/zod/a|b.txt': b'A'},
            'windows-star': {'node_modules/zod/a*b.txt': b'A'},
            'windows-superscript-device': {'node_modules/zod/COM\u00b9.txt': b'A'},
            'windows-console-device': {'node_modules/zod/CONOUT$.txt': b'A'},
        }
        files.update(portable_aliases.get(case, {}))
        inventory = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
        if case == 'tamper':
            files['plugin.json'] += b' '
        files['FILES.sha256.json'] = json.dumps(inventory).encode()
        archive = root / (case + '.zip')
        with zipfile.ZipFile(archive, 'w') as out:
            for name, data in files.items():
                info = zipfile.ZipInfo(name)
                info.external_attr = (0o120777 if case == 'symlink' and name == 'skills/symlink.md' else 0o100644) << 16
                out.writestr(info, data)
            if case == 'duplicate':
                out.writestr('plugin.json', files['plugin.json'])
        for optimized in [False, True]:
            destination = root / (case + ('-opt' if optimized else '-normal'))
            result = subprocess.run([sys.executable] + (['-O'] if optimized else []) + [str(validator), str(archive), str(destination)], capture_output=True)
            passed = result.returncode == 0
            if passed != (case == 'valid') or (case != 'valid' and destination.exists()):
                raise RuntimeError(f'Validator regression: {case}, optimized={optimized}; {result.stderr.decode(errors="replace")}')
    print(json.dumps({'checks': len(cases) * 2, 'result': 'PASS', 'optimized_and_normal': True, 'rejected_before_extraction': True}))
