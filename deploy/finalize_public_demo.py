"""Export sample reports from the isolated fixture DB and fix static media URLs."""
import os, sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'deploy' / '.demo-build'
OUT = ROOT / 'frontend' / 'public' / 'hosted-demo'
os.environ.update({'DATABASE_URL': 'sqlite:///' + (BUILD / 'fixture.db').as_posix(), 'SECRET_KEY': 'isolated-public-fixture-build-not-a-live-secret', 'UPLOAD_DIR': (BUILD / 'uploads').as_posix(), 'REQUIRE_TRAINED_MODELS': 'true', 'SMTP_HOST': '', 'SMTP_USERNAME': '', 'SMTP_PASSWORD': '', 'TWILIO_ACCOUNT_SID': '', 'TWILIO_AUTH_TOKEN': '', 'TWILIO_API_KEY_SID': '', 'TWILIO_API_KEY_SECRET': ''})
sys.path.insert(0, str(ROOT / 'backend'))
os.chdir(ROOT / 'backend')
from fastapi.testclient import TestClient
import app.services.notifications as notifications
notifications.start_notification_scheduler = lambda: None
notifications.stop_notification_scheduler = lambda: None
from app.main import app
from app.core.database import SessionLocal
from app.models.scan import Scan

fixtures = json.loads((OUT / 'fixtures.json').read_text(encoding='utf-8'))
fixtures['signed_reports'] = {}
media = {}
with TestClient(app) as client:
    headers = {}
    for role, email, password in [('doctor', 'testdr1@auramed.com', 'Doctor@123'), ('patient', 'testpatient1@auramed.com', 'Patient@123')]:
        auth = client.post('/api/auth/login', json={'email':email,'password':password})
        assert auth.status_code == 200, auth.text
        headers[role] = {'Authorization':'Bearer ' + auth.json()['access_token']}
    for case in fixtures['cases']:
        rid = case['report_id']
        with SessionLocal() as db:
            import uuid
            scan = db.get(Scan, uuid.UUID(case['scan_id']))
            assert scan.image_model_score is not None
            assert 'temporarily unavailable' not in str(scan.reasoning).lower()
            for index, image in enumerate((scan.clinical_inputs or {}).get('_workflow_images', [])):
                source = case['sources'][min(index,len(case['sources'])-1)]['src']
                media[image['path']] = source
                media['/' + image['path']] = source
            media[scan.image_path] = case['sources'][0]['src']
            media['/' + scan.image_path] = case['sources'][0]['src']
        signed = client.post('/api/doctor/reports/' + rid + '/sign', headers=headers['doctor'])
        assert signed.status_code == 200, signed.text
        report = client.get('/api/doctor/reports/' + rid, headers=headers['doctor'])
        assert report.status_code == 200, report.text
        fixtures['signed_reports'][rid] = report.json()
        pdf = client.post('/api/doctor/reports/' + rid + '/generate-pdf', headers=headers['doctor'])
        assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF'), pdf.text[:200]
        (BUILD / (rid + '.pdf')).write_bytes(pdf.content)
        shared = client.post('/api/doctor/reports/' + rid + '/share', json={'share_with_patient':True,'delivery_method':'portal','share_with_physician':False}, headers=headers['doctor'])
        assert shared.status_code == 200, shared.text
        for suffix in ['', '/pdf']:
            if suffix == '/pdf': continue
            path = '/patient/reports/' + rid + suffix
            response = client.get('/api' + path, headers=headers['patient'])
            assert response.status_code == 200, response.text
            fixtures['responses']['patient:' + path] = response.json()
        case['pdf_url'] = '/hosted-demo/' + rid + '.pdf'
    for path in ['/patient/dashboard','/patient/reports','/patient/timeline','/patients/me/reports']:
        response=client.get('/api'+path,headers=headers['patient'])
        if response.status_code==200:fixtures['responses']['patient:'+path]=response.json()

def normalize(value):
    if isinstance(value, dict): return {key:normalize(item) for key,item in value.items()}
    if isinstance(value, list): return [normalize(item) for item in value]
    if isinstance(value, str):
        if value in media: return media[value]
        # No host-local filesystem paths may escape into the public export.
        if BUILD.as_posix() in value: return None
    return value
fixtures = normalize(fixtures)
for case in fixtures['cases']:
    for key in ['doctor:/doctor/scans/' + case['scan_id'] + '/report', 'doctor:/doctor/reports/' + case['report_id']]:
        fixtures['responses'][key]['pdf_path'] = case['pdf_url']
    fixtures['signed_reports'][case['report_id']]['pdf_path'] = case['pdf_url']
(OUT / 'fixtures.json').write_text(json.dumps(fixtures,ensure_ascii=False),encoding='utf-8')
print('Saved patient report views and nine raw PDFs; static media URLs normalized.')
