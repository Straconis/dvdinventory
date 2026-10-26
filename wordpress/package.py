"""Build an installable plugin ZIP using only the Python standard library."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

repo = Path(__file__).resolve().parent.parent
source = repo / 'wordpress' / 'dvd-inventory'
target = repo / 'dist' / 'dvd-inventory.zip'
target.parent.mkdir(exist_ok=True)
with ZipFile(target, 'w', compression=ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(source.parent))
print(target)
