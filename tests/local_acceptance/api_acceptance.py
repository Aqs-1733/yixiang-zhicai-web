"""HTTP acceptance against an isolated local test DB, never the private running service."""
import json,os,secrets,sys,time
from pathlib import Path
import httpx
BASE=os.getenv('YX_TEST_URL','http://127.0.0.1:8001')
assert BASE.startswith('http://127.0.0.1:8001'), 'Only isolated test service is accepted'
OUT=Path(os.getenv('YX_EVIDENCE_DIR',r'D:\Projects\YixiangZhicai_Execution_20261111'))
c=httpx.Client(base_url=BASE,timeout=35); results=[];fixtures={}
def case(name,method,path,actor=None,data=None,expect=(200,),check=None,**kwargs):
 try:
  h={'Authorization':'Bearer '+fixtures[actor]['token']} if actor else {}
  r=c.request(method,path,headers=h,json=data,**kwargs)
  try:j=r.json()
  except Exception:j={}
  ok=r.status_code in expect and (check(j) if check and r.status_code in expect else True)
  item={'test':name,'passed':bool(ok),'method':method,'path':path,'http':r.status_code,'expected':list(expect)}
  if not ok:item['response_fields']=list(j) if isinstance(j,dict) else type(j).__name__
  results.append(item); print(('PASS' if ok else 'FAIL'),name,'HTTP',r.status_code,flush=True)
  return j
 except Exception as e:
  results.append({'test':name,'passed':False,'method':method,'path':path,'error':type(e).__name__});print('FAIL',name,type(e).__name__,flush=True);return {}
def reg(role,label,code=None):
 p='199'+''.join(secrets.choice('0123456789') for _ in range(8));pw=secrets.token_urlsafe(15)
 body={'phone':p,'password':pw,'confirm':pw,'nickname':'验收'+label,'role':role}
 if code:body['bind_code']=code
 j=case(label+'注册','POST','/auth/register',data=body,check=lambda j:bool(j.get('token')) and j['user']['role']==role)
 fixtures[label]={**j,'phone':p,'password':pw};return j
for path in ['/site/','/docs','/healthz','/integrations/status','/openapi.json']:
 case('本地入口 '+path,'GET',path)
case('未登录资产保护','GET','/wealth/positions',expect=(401,))
case('未登录账本保护','GET','/ledger/summary',expect=(401,))
case('非法手机号注册拒绝','POST','/auth/register',data={'phone':'x','password':'abcd','nickname':'invalid'},expect=(400,))
a=reg('elder','长辈');b=reg('elder','隔离长辈')
code=case('长辈生成绑定码','GET','/family/bind-code','长辈',check=lambda j:len(j.get('code',''))==6).get('code')
ch=reg('child','子女',code);bid=ch.get('binding',{}).get('binding_id');eid=a.get('user',{}).get('id');other=b.get('user',{}).get('id')
fixtures['meta']={'binding_id':bid,'elder_id':eid,'other_id':other}
for label in ['长辈','子女']:
 f=fixtures[label]
 case(label+'密码登录','POST','/auth/password-login',data={'phone':f['phone'],'password':f['password'],'role':f['user']['role']},check=lambda j:j.get('user',{}).get('id')==f['user']['id'])
 case(label+'用户信息','GET','/auth/me',label,check=lambda j:j.get('user',{}).get('id')==f['user']['id'])
case('错误密码拒绝','POST','/auth/password-login',data={'phone':fixtures['长辈']['phone'],'password':'incorrect'},expect=(401,))
case('子女禁止生成长辈绑定码','GET','/family/bind-code','子女',expect=(403,))
case('设置密保问题','POST','/auth/security-question','长辈',{'question':'验收用颜色是什么','answer':'测试蓝色'})
case('查询密保问题','GET','/auth/security-question',params={'phone':fixtures['长辈']['phone']},check=lambda j:j.get('question')=='验收用颜色是什么')
case('错误密保拒绝','POST','/auth/password-reset',data={'phone':fixtures['长辈']['phone'],'answer':'错误答案','new_password':'new-test-password'},expect=(400,401,403))
new=secrets.token_urlsafe(16)
case('密保找回密码','POST','/auth/password-reset',data={'phone':fixtures['长辈']['phone'],'answer':'测试蓝色','new_password':new},check=lambda j:j.get('ok')==True)
case('旧密码失效','POST','/auth/password-login',data={'phone':fixtures['长辈']['phone'],'password':fixtures['长辈']['password']},expect=(401,))
fixtures['长辈']['password']=new
j=case('新密码登录','POST','/auth/password-login',data={'phone':fixtures['长辈']['phone'],'password':new},check=lambda j:bool(j.get('token')))
fixtures['长辈'].update(j)
case('画像持久化写入','POST','/profile/update','长辈',{'data':{'nickname':'验收长辈','age':65,'onboarding_completed':True,'monthly_income':5000,'monthly_expense':1800}})
case('画像持久化读取','GET','/profile/me','长辈',check=lambda j:'验收长辈' in json.dumps(j,ensure_ascii=False))
for path in ['/portfolio/overview','/portfolio/recommendation','/pockets/summary','/pockets/history','/risk/questionnaire','/risk/history','/products','/products/banks','/products/example','/market/sources','/market/products']:
 case('本地理财 '+path,'GET',path,'长辈')
case('问卷评估本地链路','POST','/risk/evaluate','长辈',{'answers':{'age':65,'risk_preference':'保守型','monthly_income':5000}})
case('养老金资金模拟','POST','/pockets/simulate','长辈',{'amount':100000})
case('产品检索','GET','/products/search','长辈',params={'q':'银行'})
case('无效产品核验真实状态','GET','/products/verify','长辈',params={'code':'INVALID_TEST_PRODUCT'},check=lambda j:bool(j))
r=case('账本新增支出','POST','/ledger/records','长辈',{'title':'验收早餐','type':'支出','amount':12.5})
rid=r.get('record',{}).get('id')
case('账本新增收入','POST','/ledger/records','长辈',{'title':'验收收入','type':'收入','amount':100})
case('账本拒绝零金额','POST','/ledger/records','长辈',{'title':'invalid','amount':0},expect=(400,))
case('账本修改','PUT',f'/ledger/records/{rid}','长辈',{'title':'验收早餐更新','type':'支出','amount':15},check=lambda j:j.get('record',{}).get('amount')==15)
case('他人账本修改拒绝','PUT',f'/ledger/records/{rid}','隔离长辈',{'title':'越权','amount':99},expect=(404,403))
case('他人账本删除拒绝','DELETE',f'/ledger/records/{rid}','隔离长辈',expect=(404,403))
case('账本统计与明细','GET','/ledger/summary','长辈',check=lambda j:any(x.get('id')==rid and x.get('amount')==15 for x in j.get('records',[])))
imp=case('账单导入预览','POST','/ledger/import/wechat-text','长辈',{'text':'2026-11-11 支出 早餐 20元\n2026-11-11 收入 养老金 3000元'})
case('账单导入确认','POST','/ledger/import/confirm','长辈',{'import_id':imp.get('import_id'),'items':imp.get('items',[])},check=lambda j:j.get('imported_count',0)>0)
case('账单导入历史','GET','/ledger/imports','长辈')
p=case('持仓新增','POST','/wealth/positions','长辈',{'product_name':'验收测试持仓','institution':'验收机构','buy_amount':1000,'buy_net_value':1,'current_net_value':1})
pid=p.get('id');fixtures['meta'].update(position_id=pid,ledger_id=rid)
case('持仓读取','GET',f'/wealth/positions/{pid}','长辈',check=lambda j:bool(j))
case('持仓更新','PUT',f'/wealth/positions/{pid}','长辈',{'current_net_value':1.02},check=lambda j:j.get('item',{}).get('current_net_value')==1.02)
case('持仓他人读取拒绝','GET',f'/wealth/positions/{pid}','隔离长辈',expect=(404,403))
case('持仓他人更新拒绝','PUT',f'/wealth/positions/{pid}','隔离长辈',{'current_net_value':999},expect=(404,403))
case('持仓他人删除拒绝','DELETE',f'/wealth/positions/{pid}','隔离长辈',expect=(404,403))
for path in ['/family/bindings','/family/members','/family/pending-bindings','/child/elders','/home/child-dashboard']:
 case('家庭读取 '+path,'GET',path,'子女',expect=(403,) if path=='/family/pending-bindings' else (200,))
for suffix in ['overview','ledger-summary','positions','weekly-report','health-reminders','location','alerts']:
 case('无绑定越权拒绝 '+suffix,'GET',f'/child/elders/{other}/{suffix}','子女',expect=(403,404))
for key,suffix in [('view_positions','positions'),('view_ledger_summary','ledger-summary'),('view_health','health-reminders'),('view_location','location'),('receive_alerts','alerts')]:
 case('长辈撤销权限 '+key,'PUT',f'/family/bindings/{bid}/permissions','长辈',{'permissions':{key:False}})
 case('拒绝未授权 '+suffix,'GET',f'/child/elders/{eid}/{suffix}','子女',expect=(403,))
 case('长辈授予权限 '+key,'PUT',f'/family/bindings/{bid}/permissions','长辈',{'permissions':{key:True}})
 case('已授权读取 '+suffix,'GET',f'/child/elders/{eid}/{suffix}','子女')
case('子女禁止改授权','PUT',f'/family/bindings/{bid}/permissions','子女',{'permissions':{'view_positions':True}},expect=(403,))
for key in ['view_messages','view_group_chat']:
 case('授予 '+key,'PUT',f'/family/bindings/{bid}/permissions','长辈',{'permissions':{key:True}})
case('家庭私信发送','POST','/family/messages','长辈',{'receiver_id':ch['user']['id'],'content':'本地验收问候'})
case('家庭私信读取','GET','/family/messages','子女')
case('家庭群聊发送','POST','/family/group-chat','子女',{'elder_id':eid,'content':'本地验收群聊'})
case('家庭群聊读取','GET','/family/group-chat','长辈')
case('家庭未绑定私信拒绝','POST','/family/messages','隔离长辈',{'receiver_id':ch['user']['id'],'content':'越权'},expect=(403,404))
case('群聊权限撤销','PUT',f'/family/bindings/{bid}/permissions','长辈',{'permissions':{'view_group_chat':False}})
case('群聊撤权读取拒绝','GET','/family/group-chat','子女',params={'elder_id':eid},expect=(403,))
case('群聊权限恢复','PUT',f'/family/bindings/{bid}/permissions','长辈',{'permissions':{'view_group_chat':True}})
case('家庭周报生成','GET','/family/weekly-report','长辈')
case('风险行为提醒','POST','/risk/behavior-check','长辈',{'text':'陌生人让我转账30000元到私人账户'})
case('反诈文本提醒','POST','/risk/text-check','长辈',data={'text':'保证高收益，先转账到私人账户'})
case('术语解释本地词典','POST','/term/explain','长辈',{'term':'净值'})
case('术语历史','GET','/term/history','长辈')
case('问答空输入拒绝','POST','/assistant/chat',data={'message':''},expect=(400,))
case('问答本地兜底标识','POST','/assistant/chat',data={'message':'你好','session_id':'acceptance-local-only'},check=lambda j:j.get('fallback')==True and j.get('provider')=='local')
case('多轮上下文请求结构','POST','/assistant/chat',data={'message':'我刚才说了什么','history':[{'role':'user','content':'我喜欢散步'},{'role':'assistant','content':'散步很好'}],'session_id':'acceptance-local-only'},check=lambda j:j.get('session_id')=='acceptance-local-only' and j.get('fallback')==True)
case('语音缺失降级','POST','/assistant/voice-to-text',check=lambda j:j.get('success')==False and bool(j.get('hint')))
case('TTS空输入拒绝','POST','/assistant/text-to-voice',data={'text':''},expect=(400,))
for path in ['/health/summary','/service/phones','/sport/today','/lesson/today','/alerts','/home/elder-dashboard']:
 case('生活服务 '+path,'GET',path,'长辈')
case('健康指标保存','PUT','/health/metrics','长辈',{'bp':'120/80','hr':72,'weight':61,'sleep':'7小时','steps':'4000'})
m=case('健康提醒新增','POST','/health/meds','长辈',{'name':'验收提醒','time':'08:00','dose':'仅测试','alarm':True});mid=next((x['id'] for x in c.get('/health/summary',headers={'Authorization':'Bearer '+fixtures['长辈']['token']}).json().get('meds',[]) if x.get('name')=='验收提醒'),None)
if mid:
 case('健康提醒完成','PUT',f'/health/meds/{mid}','长辈',{'done':True})
 case('健康提醒删除','DELETE',f'/health/meds/{mid}','长辈')
phone=case('常用电话新增','POST','/service/phones','长辈',{'name':'验收电话','phone':'12345'});phoneid=next((x['id'] for x in c.get('/service/phones',headers={'Authorization':'Bearer '+fixtures['长辈']['token']}).json().get('items',[]) if x.get('name')=='验收电话'),None)
if phoneid:case('常用电话删除','DELETE',f'/service/phones/{phoneid}','长辈')
case('每日课程视频','GET','/media/daily_lesson.mp4',expect=(200,206),check=None)
case('银行与支付禁用状态','GET','/integrations/status',check=lambda j:'llm' in j)
# Unbind a temporary second elder relation without destroying the UI test binding.
code2=case('第二长辈绑定码','GET','/family/bind-code','隔离长辈').get('code')
b2=case('第二家庭绑定','POST','/family/bind/accept-code','子女',{'code':code2})
b2id=b2.get('binding_id')
if b2id:
 case('家庭解绑','DELETE',f'/family/bindings/{b2id}','隔离长辈')
 case('解绑后访问拒绝','GET',f'/child/elders/{other}/positions','子女',expect=(403,404))
case('账本删除','DELETE',f'/ledger/records/{rid}','长辈')
case('删除后修改拒绝','PUT',f'/ledger/records/{rid}','长辈',{'title':'deleted','amount':1},expect=(404,))
# Keep only synthetic fixtures outside the Git working tree; never print tokens/passwords.
(OUT/'ui_fixtures.json').write_text(json.dumps(fixtures,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'api_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('API_RESULT',sum(x['passed'] for x in results),'/',len(results),flush=True)
sys.exit(0 if all(x['passed'] for x in results) else 1)
