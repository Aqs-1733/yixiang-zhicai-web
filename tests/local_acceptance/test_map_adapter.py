import importlib.util,unittest,os
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
spec=importlib.util.spec_from_file_location('map_adapter',Path(__file__).resolve().parents[2]/'backend/app/map_adapter.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MapAdapterTests(unittest.TestCase):
 def setUp(self):m._cache.clear()
 def test_no_key(self):
  with patch.dict(os.environ,{},clear=True),self.assertRaises(HTTPException) as ctx:m.static_map(39,117,14,400,300)
  self.assertEqual(ctx.exception.status_code,503)
 def test_image_and_cache(self):
  class Reply:
   headers={'content-type':'image/png'};content=b'png-test-fixture'
   def raise_for_status(self):pass
  with patch.dict(os.environ,{'TENCENT_MAP_KEY':'SYNTHETIC_TEST_KEY'}),patch.object(m.httpx,'get',return_value=Reply()) as request:
   a=m.static_map(39,117,14,400,300);b=m.static_map(39,117,14,400,300)
   self.assertEqual(a.status_code,200);self.assertEqual(a.body,b.body);self.assertEqual(request.call_count,1)
   self.assertNotIn(b'SYNTHETIC_TEST_KEY',a.body)
 def test_provider_error_sanitized(self):
  with patch.dict(os.environ,{'TENCENT_MAP_KEY':'SYNTHETIC_TEST_KEY'}),patch.object(m.httpx,'get',side_effect=ValueError('SYNTHETIC_TEST_KEY')),self.assertRaises(HTTPException) as ctx:m.static_map(39,117,14,400,300)
  self.assertEqual(ctx.exception.status_code,502);self.assertNotIn('SYNTHETIC_TEST_KEY',ctx.exception.detail)
 def test_nonimage_rejected(self):
  class Reply:
   headers={'content-type':'application/json'};content=b'{}'
   def raise_for_status(self):pass
  with patch.dict(os.environ,{'TENCENT_MAP_KEY':'SYNTHETIC_TEST_KEY'}),patch.object(m.httpx,'get',return_value=Reply()),self.assertRaises(HTTPException) as ctx:m.static_map(39,117,14,400,300)
  self.assertEqual(ctx.exception.status_code,502)
if __name__=='__main__':unittest.main()
