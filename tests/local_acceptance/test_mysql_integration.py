"""Real MySQL (isolated QA database only), HTTP and transaction regressions."""
import concurrent.futures,json,os,sys,unittest,uuid
from pathlib import Path
from unittest.mock import patch
import httpx
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'backend'))
from app.database import conn,connection_settings,initialize_schema
from app.services.ai_gateway import _log

class MySQLIntegration(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  assert 'qa_' in connection_settings()['database'], 'Use an isolated QA schema'
  initialize_schema()
  cls.out=Path(os.environ['YX_EVIDENCE_DIR']);cls.f=json.loads((cls.out/'ui_fixtures.json').read_text(encoding='utf-8'))
  cls.h={'Authorization':'Bearer '+cls.f['长辈']['token']};cls.base='http://127.0.0.1:8001'
 def request(self,method,path,**kw):
  r=httpx.request(method,self.base+path,headers=self.h,timeout=20,**kw);self.assertEqual(r.status_code,200,r.status_code);return r.json()
 def test_01_all_tables_innodb_utf8mb4(self):
  with conn() as c:
   rows=c.execute('SELECT ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()').fetchall()
   self.assertEqual(len(rows),35)
   self.assertTrue(all(r['ENGINE']=='InnoDB' and r['TABLE_COLLATION'].startswith('utf8mb4') for r in rows))
 def test_02_ai_logs_same_database(self):
  tag='mysql-log-'+uuid.uuid4().hex
  _log('local','test',tag,'synthetic audit input','synthetic output')
  with conn() as c:
   row=c.execute('SELECT scene,created_at FROM llm_call_logs WHERE scene=?',(tag,)).fetchone()
   self.assertEqual(row['scene'],tag);self.assertIn('+08:00',row['created_at'])
 def test_03_exception_rolls_back(self):
  tag='rollback-'+uuid.uuid4().hex
  with self.assertRaises(ValueError):
   with conn() as c:
    c.execute('INSERT INTO llm_call_logs(scene,created_at) VALUES(?,?)',(tag,'2026-11-17T00:00:00'))
    raise ValueError('synthetic interruption')
  with conn() as c:self.assertEqual(c.execute('SELECT COUNT(*) AS n FROM llm_call_logs WHERE scene=?',(tag,)).fetchone()['n'],0)
 def test_04_literal_question_mark_percent_and_injection(self):
  with conn() as c:
   self.assertEqual(c.execute("SELECT 'literal?100%' AS v,? AS p",("x'); DROP TABLE users; -- 🌱",)).fetchone()['v'],'literal?100%')
   self.assertEqual(c.execute('SELECT ? AS v',('小享🌱 ? 100%',)).fetchone()['v'],'小享🌱 ? 100%')
   self.assertGreater(c.execute('SELECT COUNT(*) AS n FROM users').fetchone()['n'],0)
 def test_05_duplicate_import_is_transactional(self):
  imp=self.request('POST','/ledger/import/wechat-text',json={'text':'2026-11-17 支出 买菜 12.50元\n2026-11-17 收入 养老金 3000元'})
  before=self.request('GET','/ledger/summary')['records'];ids={r['id'] for r in before}
  payload={'import_id':imp['import_id'],'items':imp['items']}
  with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:self.request('POST','/ledger/import/confirm',json=payload),range(8)))
  self.assertEqual(sum(not r.get('already_imported',False) for r in results),1)
  after=self.request('GET','/ledger/summary')['records'];self.assertEqual(len([r for r in after if r['id'] not in ids]),len(imp['items']))
 def test_06_profile_update_preserves_children(self):
  before={r['id'] for r in self.request('GET','/ledger/summary')['records']}
  self.request('POST','/profile/update',json={'data':{'nickname':'数据库验收🌱'}})
  after={r['id'] for r in self.request('GET','/ledger/summary')['records']};self.assertEqual(before,after)
 def test_07_decimal_and_dates_contract(self):
  j=self.request('POST','/ledger/records',json={'title':'小享🌱 金额验收','type':'支出','amount':0.1+0.2})
  row=j['record'];self.assertEqual(row['amount'],0.3);self.assertIsInstance(row['amount'],(int,float));self.assertRegex(row['date'],r'^\d{4}-\d{2}-\d{2}$')
 def test_08_last_insert_id_concurrent(self):
  with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
   rows=list(pool.map(lambda i:self.request('POST','/ledger/records',json={'title':'并发验收-'+str(i),'type':'支出','amount':i+1})['record'],range(12)))
  self.assertEqual(len({r['id'] for r in rows}),12)
  self.assertTrue(all(r['amount']==i+1 and r['title']=='并发验收-'+str(i) for i,r in enumerate(rows)))
 def test_09_sqlite_url_rejected(self):
  with patch.dict(os.environ,{'DATABASE_URL':'sqlite:///should_not_be_created.db'}):
   with self.assertRaises(RuntimeError):connection_settings()
 def test_10_remark_upsert_stable_id(self):
  peer=self.f['子女']['user']['id'];uid=self.f['长辈']['user']['id'];ids=[]
  for text in ['家人🌱','家人备注更新']:
   self.request('PUT',f'/family/members/{peer}/remark',json={'remark':text})
   with conn() as c:ids.append(c.execute('SELECT id FROM family_member_remarks WHERE viewer_user_id=? AND peer_user_id=?',(uid,peer)).fetchone()['id'])
  self.assertEqual(ids[0],ids[1])
 def test_11_health_checks_real_connection(self):
  j=self.request('GET','/healthz');self.assertEqual(j['database'],'mysql');self.assertTrue(j['database_ready']);self.assertEqual(j['db_path'],'')
 def test_12_no_runtime_sqlite_import(self):
  for p in (ROOT/'backend/app').rglob('*.py'):
   text=p.read_text(encoding='utf-8');self.assertNotIn('sqlite3',text,str(p));self.assertNotIn('last_insert_rowid',text,str(p))

if __name__=='__main__':unittest.main(verbosity=2)
