import os
import tempfile
import atexit
import shutil
os.environ['DATABASE_URL']='sqlite://'
os.environ['SECRET_KEY']='workflow-test-secret'
os.environ['UPLOAD_DIR']=tempfile.mkdtemp(prefix='workflow_uploads_', dir=os.path.dirname(__file__))
atexit.register(shutil.rmtree, os.environ['UPLOAD_DIR'], ignore_errors=True)
from datetime import date, datetime, timedelta
from unittest.mock import patch
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.core.database import Base, get_db
from app.main import app
from app.models.user import User
from app.models.doctor_profile import DoctorProfile
from app.models.patient_profile import PatientProfile
from app.models.scan import Scan
from app.models.report import Report
from app.models.notification import Notification
from app.models.enums import UserRole, ScreeningModule, ScanStatus, RiskLevel, ReportStatus
from app.core.security import create_access_token, hash_password, verify_password
from app.services.report_service import get_or_create_report_for_scan

@pytest.fixture()
def flow():
    engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session=sessionmaker(bind=engine,expire_on_commit=False); db=Session()
    users=[User(email=f'{role}{i}@workflow.example.com',role=UserRole(role),password_hash=hash_password('Correct@123'),is_active=True) for i,role in enumerate(['doctor','doctor','patient','patient','admin'])]
    db.add_all(users); db.flush()
    doctors=[DoctorProfile(user_id=users[i].id,full_name=f'Workflow Doctor {i}',registration_number=f'WF-{i}',is_approved=True) for i in [0,1]]
    db.add_all(doctors); db.flush()
    patients=[PatientProfile(user_id=users[i+2].id,full_name=f'Workflow Patient {i}',patient_code=f'WF-P{i}',created_by_doctor_id=doctors[0].id) for i in [0,1]]
    db.add_all(patients); db.flush()
    scan=Scan(patient_id=patients[0].id,doctor_id=doctors[0].id,module=ScreeningModule.breast,status=ScanStatus.analyzed,scan_date=date.today(),risk_level=RiskLevel.moderate,fusion_score=.5,formula_score=.4,image_model_score=.6,confidence_score=.8,clinical_inputs={'age':45})
    db.add(scan); db.commit()
    report=get_or_create_report_for_scan(db,scan,doctors[0])
    def database():
        request_db=Session()
        try: yield request_db
        finally: request_db.close()
    app.dependency_overrides[get_db]=database
    h=lambda i:{'Authorization':'Bearer '+create_access_token({'sub':str(users[i].id),'role':users[i].role.value})}
    with patch('app.api.routes.notifications.process_pending_notifications'):
        yield TestClient(app),db,doctors,patients,scan,report,h
    app.dependency_overrides.clear(); db.close(); engine.dispose()

def test_no_universal_demo_password():
    hashed=hash_password('Correct@123'); assert verify_password('Correct@123',hashed)
    for guess in ['123','1','admin','doctor','patient','Admin@123','Doctor@123','Patient@123']: assert not verify_password(guess,hashed)

def test_share_lock_recipients_and_patient_sync(flow):
    c,db,doctors,patients,scan,report,h=flow
    path=f'/api/doctor/reports/{report.id}'
    assert c.post(path+'/share',headers=h(0),json={}).status_code==409
    assert c.get(f'/api/patient/reports/{report.id}',headers=h(2)).status_code==403
    assert c.get(f'/api/patient/reports/{report.id}/pdf',headers=h(2)).status_code==403
    report.status=ReportStatus.signed; report.signed_at=datetime.utcnow(); report.signed_by=doctors[0].id; db.commit()
    r=c.post(path+'/share',headers=h(0),json={'share_with_patient':True,'share_with_physician':True,'physician_id':str(doctors[1].id),'message':'Please attend the planned follow-up.'})
    assert r.status_code==200,r.text
    db.refresh(report); assert report.status==ReportStatus.signed and report.shared_with_patient
    assert c.put(path,headers=h(0),json={'content':{}}).status_code==400
    assert c.delete(path,headers=h(0)).status_code==400
    assert c.get(path,headers=h(1)).status_code==200
    assert c.put(path,headers=h(1),json={'content':{}}).status_code==403
    assert c.get(f'/api/patient/reports/{report.id}',headers=h(3)).status_code==403
    r=c.get(f'/api/patient/reports/{report.id}',headers=h(2)); assert r.status_code==200,r.text
    data=r.json(); assert data['sharing_message']=='Please attend the planned follow-up.'
    assert isinstance(data['doctor_recommendations'],str)
    assert data['header']['result_badge']=='Monitor' and '1.4 cm' not in str(data)
    assert db.query(Notification).filter(Notification.related_resource_id==str(report.id)).count()==2
    assert c.get('/api/doctor/reports',headers=h(0)).json()['total']==1
    assert c.get('/api/doctor/reports',headers=h(1)).json()['total']==1
    assert c.get('/api/doctor/report-recipients',headers=h(0)).json()[0]['id']==str(doctors[1].id)

def test_draft_upsert_images_and_patient_isolation(flow):
    c,db,doctors,patients,scan,report,h=flow
    payload={'module':'pcos','patient_id':str(patients[0].id),'clinical_inputs':{'age':31}}
    r=c.post('/api/doctor/scans/draft',headers=h(0),json=payload); assert r.status_code==201,r.text
    sid=r.json()['scan_id'];payload.update(scan_id=sid,clinical_inputs={'age':32})
    assert c.post('/api/doctor/scans/draft',headers=h(0),json=payload).json()['scan_id']==sid
    assert c.get('/api/doctor/scans/'+sid,headers=h(0)).json()['clinical_inputs']['age']==32
    r=c.post(f'/api/doctor/scans/{sid}/draft-images',headers=h(0),files=[('images',('scan.png',b'image-fixture','image/png'))],data={'image_views':'["LCC"]'})
    assert r.status_code==200,r.text
    restored=c.get(f'/api/doctor/scans/{sid}/draft-images',headers=h(0)).json()
    assert restored[0]['name']=='scan.png' and restored[0]['view']=='LCC'
    assert c.get(f'/api/doctor/scans/{sid}/draft-images',headers=h(1)).status_code==403
    payload['patient_id']=str(patients[1].id)
    assert c.post('/api/doctor/scans/draft',headers=h(0),json=payload).status_code==409

def test_contact_preferences_timeline_and_admin_counts(flow):
    c,db,doctors,patients,scan,report,h=flow
    p={'phone':'+91 9000000000','emergency_contact':'+91 8000000000','address':'Workflow clinic','email_notifications':False,'sms_notifications':True}
    assert c.patch('/api/patient/profile',headers=h(2),json=p).status_code==200
    data=c.get('/api/patient/profile',headers=h(2)).json()
    assert data['phone']==p['phone'] and data['emergency_contact']==p['emergency_contact'] and data['email_notifications'] is False
    data=c.get('/api/patient/timeline',headers=h(2)).json()
    assert all(summary['status_badge']=='Not assessed' for summary in data['health_summary'])
    r=c.get('/api/admin/stats',headers=h(4));assert r.status_code==200,r.text
    assert r.json()['total_patients']==2 and r.json()['registered_doctors']==2
    assert c.get('/api/admin/doctors',headers=h(4)).json()['total']==2
    counts=c.get('/api/admin/pending-counts',headers=h(4)).json()
    assert counts['doctor_verifications']==0 and counts['data_deletion_requests']==0 and counts['system_notifications']==0
    with patch('app.ml.models.model_loader.ModelLoader.get_instance') as loader:
        loader.return_value.get_models_info.return_value={'breast':{'status':'not_loaded'},'cervical':{'status':'not_loaded'},'pcos':{'status':'not_loaded'}}
        health=c.get('/api/admin/system-status',headers=h(4)).json()
    assert health['ai_inference_engine']=='unavailable' and health['overall']=='degraded'
    assert all(service['latency']=='Not measured' for service in health['services'])


def test_patient_cancel_and_reschedule_request_confirm_across_roles(flow):
    from app.models.appointment import Appointment
    from app.models.appointment_change_request import AppointmentChangeRequest
    from app.models.enums import AppointmentStatus
    from datetime import timedelta, time
    c,db,doctors,patients,scan,report,h=flow
    original=date.today()+timedelta(days=3)
    appointment=Appointment(patient_id=patients[0].id,doctor_id=doctors[0].id,scheduled_date=original,scheduled_time=time(10),status=AppointmentStatus.scheduled)
    db.add(appointment);db.commit();path=f'/api/patient/appointments/{appointment.id}'
    desired=str(original+timedelta(days=2))
    assert c.patch(path+'/reschedule',headers=h(3),json={'preferred_date':desired,'preferred_time':'11:30'}).status_code==404
    response=c.patch(path+'/reschedule',headers=h(2),json={'preferred_date':desired,'preferred_time':'11:30'})
    assert response.status_code==200,response.text
    db.refresh(appointment);assert appointment.scheduled_date==original
    assert db.query(AppointmentChangeRequest).filter_by(appointment_id=appointment.id,status='pending').count()==1
    patient_data=c.get('/api/patient/appointments',headers=h(2)).json()
    assert patient_data['upcoming']['pending_request']['date']==desired
    doctor_data=c.get('/api/doctor/appointments',headers=h(0)).json()
    assert doctor_data['items'][0]['pending_request']['date']==desired
    response=c.patch(f'/api/doctor/appointments/{appointment.id}',headers=h(0),json={'scheduled_date':desired,'scheduled_time':'11:30'})
    assert response.status_code==200,response.text
    patient_data=c.get('/api/patient/appointments',headers=h(2)).json()
    assert patient_data['upcoming']['date_iso']==desired and not patient_data['upcoming']['pending_request']
    assert c.patch(path+'/cancel',headers=h(2),json={'reason':'Unavailable'}).status_code==200
    db.refresh(appointment);assert appointment.status==AppointmentStatus.cancelled
    assert c.get('/api/patient/appointments',headers=h(2)).json()['upcoming'] is None


def test_recipient_pdf_filters_optional_sections_without_changing_signed_original(flow):
    from copy import deepcopy
    from app.services.workflow import recipient_pdf_report
    from app.services.pdf_generator import _generate_with_reportlab
    c,db,doctors,patients,scan,report,h=flow
    report.status=ReportStatus.signed; report.signed_at=datetime.utcnow(); report.signed_by=doctors[0].id
    original=deepcopy(report.content)
    path=f'/api/doctor/reports/{report.id}'
    db.commit()
    response=c.post(path+'/share',headers=h(0),json={'share_with_patient':True,'share_with_physician':True,'physician_id':str(doctors[1].id),'sections':{'clinical_summary':False,'imaging_findings':False,'ai_results':False}})
    assert response.status_code==200,response.text
    db.refresh(report)
    story=[]
    with patch('app.services.pdf_generator.SimpleDocTemplate.build',side_effect=lambda flows,**kwargs: story.extend(flows)):
        _generate_with_reportlab(recipient_pdf_report(report),scan,patients[0],doctors[0])
    def text(flowable):
        if hasattr(flowable,'getPlainText'): return flowable.getPlainText()
        if hasattr(flowable,'_content'): return text(flowable._content)
        if hasattr(flowable,'_cellvalues'): return ' '.join(text(cell) for row in flowable._cellvalues for cell in row)
        if isinstance(flowable,(tuple,list)): return ' '.join(text(item) for item in flowable)
        return str(flowable)
    rendered=' '.join(text(item) for item in story).lower()
    assert '2. clinical summary' not in rendered and '3. imaging findings' not in rendered and '4. ai and clinical assessment' not in rendered
    assert 'risk assessment' in rendered and 'confidence and limitations' in rendered
    response=c.post(path+'/generate-pdf',headers=h(1))
    assert response.status_code==200,response.text
    assert response.content.startswith(b'%PDF')
    db.refresh(report)
    assert report.pdf_path is None
    for key,value in original.items(): assert report.content[key]==value


def test_report_date_filter_and_scan_scoped_followup_query(flow):
    from app.models.appointment import Appointment
    from datetime import time, timedelta
    c,db,doctors,patients,scan,report,h=flow
    assert c.get('/api/doctor/reports?date_range=today',headers=h(0)).json()['total']==1
    content=dict(report.content)
    content['patient_info']={**content['patient_info'],'report_date':str(date.today()-timedelta(days=40))}
    report.content=content
    db.add(Appointment(patient_id=patients[0].id,doctor_id=doctors[0].id,scan_id=scan.id,scheduled_date=date.today()+timedelta(days=2),scheduled_time=time(10)))
    db.add(Appointment(patient_id=patients[1].id,doctor_id=doctors[0].id,scheduled_date=date.today()+timedelta(days=2),scheduled_time=time(11)))
    db.commit()
    assert c.get('/api/doctor/reports?date_range=30days',headers=h(0)).json()['total']==0
    appointments=c.get('/api/doctor/appointments',headers=h(0),params={'scan_id':str(scan.id)}).json()['items']
    assert len(appointments)==1 and appointments[0]['scan_id']==str(scan.id)


def test_reminder_preferences_scheduler_and_provider_status(flow):
    from app.models.appointment import Appointment
    from app.services.notifications import check_and_schedule_appointment_reminders, process_pending_notifications
    c,db,doctors,patients,scan,report,h=flow
    patients[0].phone='+919000000000';db.commit()
    date_value=str(date.today()+timedelta(days=2))
    payload={'patient_id':str(patients[0].id),'scan_id':str(scan.id),'scheduled_date':date_value,'scheduled_time':'14:15','location':'Workflow clinic'}
    r=c.post('/api/doctor/appointments',headers=h(0),json=payload);assert r.status_code==201,r.text
    aid=r.json()['id'];path=f'/api/doctor/appointments/{aid}/reminders'
    assert c.put(path,headers=h(1),json={'channels':['sms'],'consent':True}).status_code==404
    assert c.put(path,headers=h(0),json={'channels':['sms']}).status_code==400
    r=c.put(path,headers=h(0),json={'channels':['in_app','sms','whatsapp'],'lead_days':2,'consent':True});assert r.status_code==200,r.text
    created=check_and_schedule_appointment_reminders(db=db)
    assert len(created)==3
    assert check_and_schedule_appointment_reminders(db=db)==[]
    assert c.put(path,headers=h(0),json={'channels':['in_app','sms','whatsapp'],'lead_days':2,'consent':True}).status_code==200
    assert check_and_schedule_appointment_reminders(db=db)==[]
    assert all(date_value in str(n.message) or '14:15' in n.message for n in created)
    with patch('app.services.sms.send_sms',return_value=('provider-test',False)) as sms, patch('app.services.sms.send_whatsapp',side_effect=RuntimeError('provider unavailable')) as whatsapp:
        process_pending_notifications(db=db)
        assert sms.call_count==1 and whatsapp.call_count==1
    db.expire_all()
    rows=db.query(Notification).filter(Notification.related_resource_id==aid,Notification.notification_type=='APPOINTMENT_REMINDER').all()
    assert {n.delivery_method:n.delivery_status for n in rows}=={'in_app':'sent','sms':'accepted','whatsapp':'failed'}
    r=c.patch(f'/api/doctor/appointments/{aid}',headers=h(0),json={'scheduled_date':str(date.today()+timedelta(days=8))});assert r.status_code==200,r.text
    assert not r.json()['reminders']['queued']
    assert check_and_schedule_appointment_reminders(db=db)==[]


def test_cancelled_appointment_never_delivers_pending_text(flow):
    from app.services.notifications import check_and_schedule_appointment_reminders, process_pending_notifications
    from app.models.appointment import Appointment
    from app.models.enums import AppointmentStatus
    c,db,doctors,patients,scan,report,h=flow
    patients[0].phone='+919000000000';db.commit()
    r=c.post('/api/doctor/appointments',headers=h(0),json={'patient_id':str(patients[0].id),'scheduled_date':str(date.today()+timedelta(days=1)),'reminders':{'channels':['sms'],'consent':True}})
    assert r.status_code==201,r.text
    check_and_schedule_appointment_reminders(db=db)
    appt=db.query(Appointment).first();appt.status=AppointmentStatus.cancelled;db.commit()
    with patch('app.services.sms.send_sms') as sms:
        process_pending_notifications(db=db);sms.assert_not_called()
    db.expire_all()
    assert db.query(Notification).filter(Notification.delivery_method=='sms').first().delivery_status=='cancelled'


def test_new_report_does_not_invent_missing_image_findings(flow):
    c,db,doctors,patients,scan,report,h=flow
    findings=report.content['imaging_findings']['findings_bullets']
    assert findings==['No detailed imaging findings were recorded. The reviewing physician should document findings before signing.']
    assert '38%' not in str(report.content)
    assert 'Parenchymal architecture' not in str(report.content)


def test_referral_preserves_exact_examination_and_ownership(flow):
    c, db, doctors, patients, scan, report, h = flow
    other = Scan(patient_id=patients[0].id, doctor_id=doctors[0].id, module=ScreeningModule.pcos, status=ScanStatus.draft, scan_date=date.today())
    db.add(other); db.commit()
    context = c.get(f'/api/doctor/referrals/patient-context/{patients[0].id}?scan_id={scan.id}', headers=h(0))
    assert context.status_code == 200, context.text
    assert context.json()['scan_id'] == str(scan.id)
    assert context.json()['report_id'] == str(report.id)
    assert context.json()['module'] == 'breast'
    assert c.get(f'/api/doctor/referrals/patient-context/{patients[0].id}?scan_id={scan.id}', headers=h(1)).status_code == 404
    payload = dict(patient_id=str(patients[0].id), scan_id=str(scan.id), specialty='Diagnostic Radiology', reason='Review requested', priority='routine', attachments={'report_id': str(report.id)})
    saved = c.post('/api/doctor/referrals', headers=h(0), json=payload)
    assert saved.status_code == 201, saved.text
    assert saved.json()['attachments']['scan_id'] == str(scan.id)
    payload['scan_id'] = str(other.id)
    assert c.post('/api/doctor/referrals', headers=h(0), json=payload).status_code == 422
    payload['patient_id'] = str(patients[1].id)
    assert c.post('/api/doctor/referrals', headers=h(0), json=payload).status_code == 404
