"""Failure paths and coordinate payloads without network calls."""
import sys,json,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'backend'))
from app.services import live_news as news,geo_gateway as geo
class NewsGeo(unittest.TestCase):
 def setUp(self):news._last=0;news._items=[];news._errors=[];news._fetched_at='';news._stale=True
 def test_empty_source_never_creates_today_news(self):
  with patch.object(news,'_gov',return_value=[]),patch.object(news,'_pbc',return_value=[]):
   r=news.get_news();self.assertFalse(r['success']);self.assertEqual(r['items'],[]);self.assertFalse(r['fallback'])
 def test_cached_dates_survive_failure(self):
  old={'id':'a','title':'测试旧资讯','url':'https://www.gov.cn/a','time':'2025-01-01'}
  with patch.object(news,'_gov',return_value=[old]),patch.object(news,'_pbc',return_value=[]):news.get_news()
  news._last=0
  with patch.object(news,'_gov',side_effect=RuntimeError()),patch.object(news,'_pbc',side_effect=RuntimeError()):
   r=news.get_news();self.assertTrue(r['stale']);self.assertEqual(r['items'][0]['time'],'2025-01-01')
 def test_unregistered_url_rejected(self):
  with patch.object(news,'_gov',return_value=[]),patch.object(news,'_pbc',return_value=[]):self.assertIsNone(news.find_article(url='http://127.0.0.1/private'))
 def test_gps_payload_uses_type_one(self):
  with patch.object(geo,'_get',return_value={'locations':[{'lat':39.1,'lng':117.2}]}) as call:
   r=geo.convert(39,117);self.assertEqual(r['coordinate_system'],'gcj02');self.assertEqual(call.call_args.args[1],{'locations':'39,117','type':1})
 def test_decode_real_route_format(self):
  with patch.object(geo,'_get',return_value={'result':{'routes':[{'distance':100,'duration':2,'polyline':[39,117,10,20,30,40],'steps':[{'instruction':'沿<b>测试路</b>行进'}]}]}}):
   r=geo.walking(39,117,39.1,117.1);self.assertAlmostEqual(r['polyline'][2][0],39.00004);self.assertEqual(r['steps'][0]['instruction'],'沿测试路行进')
 def test_missing_route_never_invents_steps(self):
  with patch.object(geo,'_get',return_value={'result':{'routes':[]}}):
   with self.assertRaises(Exception):geo.walking(39,117,39.1,117.1)
if __name__=='__main__':unittest.main(verbosity=2)
