"""Audit staged blobs before the initial commit; never prints secret values."""
import argparse,json,re,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--private-env',type=Path);p.add_argument('--output',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parents[2]
def git(*args):return subprocess.check_output(['git','-C',str(root),*args])
paths=git('ls-files','--cached','-z').decode('utf-8').split('\0');paths=[p for p in paths if p]
secrets={}
if a.private_env:
 from dotenv import dotenv_values
 secrets={k:v for k,v in dotenv_values(a.private_env).items() if v and len(v)>=8 and re.search('KEY|SECRET|TOKEN',k) and not v.startswith('http')}
patterns={
 'aws_access_key':rb'AKIA[0-9A-Z]{16}',
 'github_token':rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})',
 'api_token':rb'\bsk-[A-Za-z0-9_-]{32,}',
 'slack_token':rb'xox[baprs]-[A-Za-z0-9-]{15,}',
 'private_key':rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
 'sqlite_header':rb'SQLite format 3\x00',
}
findings=[];total=0
for f in paths:
 parts=Path(f).parts;name=Path(f).name
 forbidden=((name=='.env' or name.startswith('.env.')) and name!='.env.example') or bool(re.search(r'\.(db(?:-wal|-shm)?|sqlite\w*|p12|pfx|pem|key|p8|jks|keystore|zip|7z|rar|log)$',f,re.I)) or any(x in parts for x in ['.venv','node_modules','__pycache__']) or name in ['project.private.config.json','API.docx']
 if forbidden:findings.append({'file':f,'rule':'forbidden_filename'})
 data=git('show',':'+f);total+=len(data)
 for rule,pattern in patterns.items():
  if re.search(pattern,data):findings.append({'file':f,'rule':rule})
 for key,value in secrets.items():
  if value.encode('utf-8') in data:findings.append({'file':f,'rule':'private_env_value','field':key})
report={'staged_files':len(paths),'staged_bytes':total,'known_private_fields_checked':len(secrets),'findings':findings,'result':'PASS' if not findings else 'FAIL'}
if a.output:a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(0 if not findings else 1)
