"""HTTP contract, shared by baseline / modified / rollback evidence."""
import argparse,json,sys
import httpx
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8001');a=p.parse_args()
r=httpx.get(a.url+'/healthz',timeout=10);j=r.json()
result={'http':r.status_code,'database':j.get('database'),'ready':j.get('database_ready',False),'sqlite_path_exposed':bool(j.get('db_path'))}
ok=r.status_code==200 and result['database']=='mysql' and result['ready'] and not result['sqlite_path_exposed']
print('DATABASE_CONTRACT '+json.dumps(result,ensure_ascii=False,sort_keys=True))
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
