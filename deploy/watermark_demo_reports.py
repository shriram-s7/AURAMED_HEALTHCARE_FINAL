import io, json
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'deploy' / '.demo-build'
OUT = ROOT / 'frontend' / 'public' / 'hosted-demo'
fixtures=json.loads((OUT/'fixtures.json').read_text(encoding='utf-8'))
for case in fixtures['cases']:
    reader=PdfReader(BUILD/(case['report_id']+'.pdf'))
    writer=PdfWriter()
    for page in reader.pages:
        width,height=float(page.mediabox.width),float(page.mediabox.height)
        buffer=io.BytesIO()
        layer=canvas.Canvas(buffer,pagesize=(width,height))
        layer.saveState()
        layer.translate(width/2,height/2)
        layer.rotate(35)
        layer.setFillColorRGB(0.75,0.3,0.05)
        layer.setFillAlpha(0.14)
        layer.setFont('Helvetica-Bold',64)
        layer.drawCentredString(0,0,'DEMO SAMPLE')
        layer.restoreState()
        layer.setFillColorRGB(1,0.94,0.75)
        layer.rect(0,height-22,width,22,fill=1,stroke=0)
        layer.setFillColorRGB(0.15,0.12,0.08)
        layer.setFont('Helvetica-Bold',8)
        layer.drawCentredString(width/2,height-14,'DEMONSTRATION ONLY - PRECOMPUTED SAMPLE - NOT A CLINICAL REPORT')
        layer.save()
        page.merge_page(PdfReader(io.BytesIO(buffer.getvalue())).pages[0])
        writer.add_page(page)
    target=OUT/(case['report_id']+'.pdf')
    with target.open('wb') as stream:writer.write(stream)
    check=PdfReader(target)
    assert all('DEMONSTRATION ONLY' in page.extract_text() for page in check.pages)
print('Nine sample PDFs visibly labeled; all pages checked for demonstration text.')
