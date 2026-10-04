"""Keep PCOS demo report wording aligned with the pipeline's own PCOS actions.
Only the isolated export DB and public fixture files are edited.
"""
import os, sys, json, uuid, copy
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'deploy' / '.demo-build'
OUT = ROOT / 'frontend' / 'public' / 'hosted-demo'
os.environ.update({'DATABASE_URL':'sqlite:///' + (BUILD / 'fixture.db').as_posix(), 'UPLOAD_DIR':(BUILD / 'uploads').as_posix(), 'SECRET_KEY':'isolated-public-fixture-build-not-a-live-secret'})
sys.path.insert(0,str(ROOT / 'backend'))
os.chdir(ROOT / 'backend')
from app.main import app  # Registers ORM relationships; no application lifespan is started.
from app.core.database import SessionLocal
from app.models.report import Report
from app.services.pdf_generator import generate_report_pdf
f = json.loads((OUT / 'fixtures.json').read_text(encoding='utf-8'))
def clarify_breast_score(content, module):
    if module == 'breast':
        imaging = content.get('imaging_findings', {})
        imaging['findings_bullets'] = [text.replace('Confidence:', 'Image risk score:') for text in imaging.get('findings_bullets', [])]
for case in f['cases']:
    rid = case['report_id']
    actions = case['analysis']['recommended_actions'] if case['module'] == 'pcos' else None
    weights = case['analysis']['fusion_result']
    fusion_label = f"Multimodal Fusion Weighted Average ({round(weights['image_weight'] * 100)}/{round(weights['formula_weight'] * 100)})"
    if actions: assert not any('oncology' in a.lower() or 'biopsy' in a.lower() for a in actions)
    result = f['responses']['doctor:/doctor/scans/' + case['scan_id'] + '/results']
    result['fusion_weights'] = {'image': weights['image_weight'], 'clinical': weights['formula_weight']}
    for report in [f['signed_reports'][rid], f['responses']['doctor:/doctor/reports/' + rid], f['responses']['doctor:/doctor/scans/' + case['scan_id'] + '/report']]:
        if actions:
            report['content']['recommendations']['recommendations_list'] = copy.deepcopy(actions)
            report['content']['risk_assessment']['recommendation_sentence'] = actions[0]
        report['content']['ai_assessment']['rows'][-1]['component'] = fusion_label
        clarify_breast_score(report['content'], case['module'])
    with SessionLocal() as db:
        report = db.get(Report, uuid.UUID(rid))
        content = copy.deepcopy(report.content)
        if actions:
            content['recommendations']['recommendations_list'] = actions
            content['risk_assessment']['recommendation_sentence'] = actions[0]
        content['ai_assessment']['rows'][-1]['component'] = fusion_label
        clarify_breast_score(content, case['module'])
        report.content = content
        db.commit()
        pdf = generate_report_pdf(report, report.scan, report.patient, report.doctor)
        (BUILD / (rid + '.pdf')).write_bytes(pdf)
    if not actions: continue
    patient = f['responses']['patient:/patient/reports/' + rid]
    patient['summary_tab']['highlight_box'] = {'headline':'Saved PCOS assessment example', 'message':'Review the ovarian morphology, hormone markers and cycle findings together with the sample clinical assessment.'}
    patient['summary_tab']['what_this_means'] = actions[0]
    patient['recommendations_tab']['doctor_advice'] = '\n'.join(actions)
    patient['next_steps_tab']['faq'][0] = {'q':'How were the PCOS criteria assessed?', 'a':patient['summary_tab']['diagnostic_criteria_assessment']['summary']}
    patient['previous_reports'] = [p for p in patient.get('previous_reports',[]) if p.get('module','pcos') == 'pcos' and 'pcos' in str(p.get('report_type',p.get('type','pcos'))).lower()]
(OUT / 'fixtures.json').write_text(json.dumps(f,ensure_ascii=False),encoding='utf-8')
print('All nine sample UI/PDF fusion weights aligned with pipeline; PCOS actions corrected. Scores unchanged.')
