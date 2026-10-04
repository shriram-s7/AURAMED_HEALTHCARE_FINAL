"""Export synthetic fixtures in an isolated database; never connect to local records."""
import os
import sys
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'deploy' / '.demo-build'
BUILD.mkdir(exist_ok=True)
DATABASE = BUILD / 'fixture.db'
os.environ.update({
    'DATABASE_URL': 'sqlite:///' + DATABASE.as_posix(),
    'SECRET_KEY': 'isolated-public-fixture-build-not-a-live-secret',
    'UPLOAD_DIR': (BUILD / 'uploads').as_posix(),
    'REQUIRE_TRAINED_MODELS': 'true',
    'SMTP_HOST': '', 'SMTP_USERNAME': '', 'SMTP_PASSWORD': '',
    'TWILIO_ACCOUNT_SID': '', 'TWILIO_AUTH_TOKEN': '',
    'TWILIO_API_KEY_SID': '', 'TWILIO_API_KEY_SECRET': '',
})
sys.path.insert(0, str(ROOT / 'backend'))
os.chdir(ROOT / 'backend')

from fastapi.testclient import TestClient
import app.services.notifications as notifications
notifications.start_notification_scheduler = lambda: None
notifications.stop_notification_scheduler = lambda: None
from seed_db import wipe_and_reseed
wipe_and_reseed()
from app.main import app
from app.core.database import SessionLocal
from app.models.scan import Scan
from app.models.report import Report
from app.models.patient_profile import PatientProfile
from app.models.audit_log import AuditLog

# Remove historical fabricated analyses from the fixture database only.
with SessionLocal() as db:
    db.query(Report).delete()
    db.query(Scan).delete()
    db.query(AuditLog).delete()
    db.commit()

SOURCE = json.loads((BUILD / 'presets.json').read_text(encoding='utf-8'))
OUT = ROOT / 'frontend' / 'public' / 'hosted-demo'
OUT.mkdir(exist_ok=True)
fixtures = {'generated_at': datetime.now(timezone.utc).isoformat(), 'responses': {}, 'cases': [], 'accounts': {}}

def record(client, path, headers, role):
    response = client.get('/api' + path, headers=headers)
    if response.status_code == 200 and 'application/json' in response.headers.get('content-type', ''):
        fixtures['responses'][role + ':' + path] = response.json()
    return response

with TestClient(app) as client:
    tokens = {}
    for role, email, password in [('doctor', 'testdr1@auramed.com', 'Doctor@123'), ('patient', 'testpatient1@auramed.com', 'Patient@123'), ('admin', 'testadmin1@auramed.com', 'Admin@123')]:
        response = client.post('/api/auth/login', json={'email': email, 'password': password})
        assert response.status_code == 200, response.text
        tokens[role] = {'Authorization': 'Bearer ' + response.json()['access_token']}
        me = client.get('/api/auth/me', headers=tokens[role])
        assert me.status_code == 200, me.text
        fixtures['accounts'][role] = me.json()
    with SessionLocal() as db:
        from app.models.user import User
        user = db.query(User).filter(User.email == 'testpatient1@auramed.com').one()
        patient = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).one()
        patient_id = str(patient.id)

    for module, tiers in SOURCE['inputs'].items():
        for tier, raw_inputs in tiers.items():
            inputs = dict(raw_inputs)
            if module == 'pcos':
                aliases = {'amh_ng_ml': 'amh_ng_mL', 'lh_miu_ml': 'lh_mIU_mL', 'fsh_miu_ml': 'fsh_mIU_mL', 'total_testosterone_ng_dl': 'testosterone_ng_dL', 'prolactin_ng_ml': 'prolactin_ng_mL', 'left_ovary_volume_ml': 'left_ovarian_volume_mL', 'right_ovary_volume_ml': 'right_ovarian_volume_mL', 'menstrual_regularity': 'menstrual_cycle_regularity'}
                inputs.update({alt: inputs[key] for key, alt in aliases.items() if key in inputs})
            sources = SOURCE['breast_pairs'][tier] if module == 'breast' else [{'src': SOURCE['images'][module][tier], 'view': ''}]
            upload_files, hashes = [], []
            for index, source in enumerate(sources):
                file_path = ROOT / 'frontend' / 'public' / source['src'].lstrip('/')
                content = file_path.read_bytes()
                hashes.append(hashlib.sha256(content).hexdigest())
                upload_files.append(('image' if index == 0 else 'additional_images', (file_path.name, content, 'image/' + ('bmp' if file_path.suffix == '.bmp' else 'png' if file_path.suffix == '.png' else 'jpeg'))))
            views = [source['view'] or '' for source in sources]
            data = {'module': module, 'image_views': json.dumps(views)}
            quality = client.post('/api/doctor/scans/quality-check', data=data, files=upload_files, headers=tokens['doctor'])
            assert quality.status_code == 200, quality.text
            if quality.json()['quality'] == 'poor':
                raise RuntimeError(f'{module}/{tier} sample rejected by real quality checks: {quality.text}')
            inputs['image_quality'] = 'adequate'
            if module == 'breast': inputs['mammogram_views'] = views
            data.update({'patient_id': patient_id, 'clinical_inputs': json.dumps(inputs), 'image_quality': 'adequate'})
            analysis = client.post('/api/doctor/scans/analyze', data=data, files=upload_files, headers=tokens['doctor'])
            assert analysis.status_code == 200, f'{module}/{tier}: {analysis.text}'
            scan_id = analysis.json()['scan_id']
            results = record(client, '/doctor/scans/' + scan_id + '/results', tokens['doctor'], 'doctor')
            assert results.status_code == 200, results.text
            result_data = results.json()
            assert result_data.get('model_inference_success', True) is not False, 'Inference fallback cannot be published'
            report = record(client, '/doctor/scans/' + scan_id + '/report', tokens['doctor'], 'doctor')
            assert report.status_code == 200, report.text
            report_id = report.json()['id']
            record(client, '/doctor/reports/' + report_id, tokens['doctor'], 'doctor')
            record(client, '/doctor/scans/' + scan_id + '/audit-log', tokens['doctor'], 'doctor')
            fixtures['cases'].append({'module': module, 'tier': tier, 'scan_id': scan_id, 'report_id': report_id, 'patient_id': patient_id, 'inputs': inputs, 'sources': sources, 'sha256': hashes, 'quality': quality.json(), 'analysis': analysis.json()})
            print(f'Exported real saved inference: {module}/{tier}', flush=True)

    # Capture every concrete GET route without arbitrary route guessing.
    paths = [route.path.removeprefix('/api') for route in app.routes if getattr(route, 'methods', set()) and 'GET' in route.methods and route.path.startswith('/api/') and '{' not in route.path]
    for role, headers in tokens.items():
        for path in paths:
            if path.startswith('/auth') and path != '/auth/me': continue
            if any(word in path for word in ['download-backup', 'export', '/pdf']): continue
            record(client, path, headers, role)
    for role in ['doctor', 'admin']:
        for path in ['/doctor/patients', '/admin/patients']:
            value = fixtures['responses'].get(role + ':' + path, {})
            for item in value.get('items', []) if isinstance(value, dict) else []:
                record(client, '/doctor/patients/' + item['id'], tokens[role], role)

    # An offline fixture contains no live backend credentials or private DB exports.
    serialized = json.dumps(fixtures, ensure_ascii=False)
    for token in tokens.values():
        assert token['Authorization'].removeprefix('Bearer ') not in serialized
    (OUT / 'fixtures.json').write_text(serialized, encoding='utf-8')
    print(f'Fixture export complete: {len(fixtures["cases"])} cases, {len(fixtures["responses"])} saved responses.', flush=True)
