"""Deterministic ZIP encoding for already verified private plugin files (Python 3)."""
import pathlib
import sys
import zipfile

root = pathlib.Path(sys.argv[1]).resolve()
target = pathlib.Path(sys.argv[2]).resolve()
if target == root or root in target.parents:
    raise ValueError('Archive must be outside package directory')
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(root.rglob('*')):
        if file.is_symlink():
            raise ValueError('Symlinks forbidden')
        if not file.is_file():
            continue
        info = zipfile.ZipInfo(file.relative_to(root).as_posix(), (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:
        raise ValueError('Archive CRC verification failed')
