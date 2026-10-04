"""Install the versioned runtime weights with SHA-256 verification."""
import hashlib, json
from pathlib import Path
from urllib.request import Request, urlopen
WEIGHTS = Path(__file__).resolve().parents[1] / 'backend/app/ml/weights'
def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()
def main():
    manifest = json.loads((WEIGHTS/'release-manifest.json').read_text(encoding='utf-8'))
    for m in manifest['models']:
        dest = WEIGHTS/m['filename']
        if dest.exists():
            if digest(dest)==m['sha256']:
                print('Verified existing',dest.name)
                continue
            raise SystemExit(f'Existing {dest} differs. Move it aside before downloading.')
        tmp = dest.with_suffix('.pth.download')
        print('Downloading',dest.name)
        try:
            req=Request(m['url'],headers={'User-Agent':'AuraMed-model-downloader'})
            with urlopen(req,timeout=120) as response, tmp.open('wb') as f:
                for chunk in iter(lambda:response.read(1024*1024),b''):f.write(chunk)
            if tmp.stat().st_size!=m['bytes'] or digest(tmp)!=m['sha256']:
                raise RuntimeError('Downloaded model failed size/checksum validation')
            tmp.replace(dest)
        finally:
            tmp.unlink(missing_ok=True)
if __name__=='__main__':main()
