import os,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
os.environ['CORS_ORIGINS']='http://127.0.0.1:5174'
import test_workflow as fixture
from sqlalchemy import create_engine
folder=tempfile.TemporaryDirectory(prefix='auramed-preview-')
fixture.create_engine=lambda *args,**kwargs:create_engine('sqlite:///'+str(Path(folder.name)/'preview.db'),connect_args={'check_same_thread':False})
generator=fixture.flow.__wrapped__()
client,db,doctors,patients,scan,report,headers=next(generator)
from datetime import datetime
from app.models.enums import ReportStatus
report.status=ReportStatus.signed
report.signed_at=datetime.utcnow()
report.signed_by=doctors[0].id
report.shared_with_patient=True
doctors[0].hospital='Workflow Preview Clinic'
db.commit()
print('PREVIEW_SCAN='+str(scan.id), flush=True)
import uvicorn
try:uvicorn.run(fixture.app,host='127.0.0.1',port=8001,lifespan='off')
finally:
    try:next(generator)
    except StopIteration:pass
    folder.cleanup()
