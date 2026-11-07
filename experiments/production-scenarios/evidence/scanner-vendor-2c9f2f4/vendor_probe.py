import json,time
from datetime import datetime,timezone
from pathlib import Path
from worker import process_document
from test_worker import text_pdf
cases=[('clean-txt',b'Pilot vendor-signature check: revenue 123.45 USD.','text/plain','clean'),('clean-pdf',text_pdf(),'application/pdf','clean'),('clamav-harmless-detection',b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*','text/plain','detected'),('yara-harmless-detection',b'PILOT_DOCUMENT_DETECTION_73261','text/plain','detected')]
report={'scope':'Local scanner component with official frozen ClamAV databases and pilot YARA rule. No Azure or full pipeline claim.','startedAt':datetime.now(timezone.utc).isoformat(),'results':[]}
for name,content,kind,expected in cases:
 start=time.monotonic();result=process_document(content,kind,Path('/var/lib/clamav'),Path('/app/rules.yar'))
 report['results'].append({'case':name,'expected':expected,'durationMs':round((time.monotonic()-start)*1000),'result':result})
 print(name,result['status'],flush=True)
report['completedAt']=datetime.now(timezone.utc).isoformat()
Path('/evidence/vendor-probe.json').write_text(json.dumps(report,indent=2)+'\n')
