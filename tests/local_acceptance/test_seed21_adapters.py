"""Offline adapter regressions. Mocked provider replies are not counted as external acceptance."""
import asyncio,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'backend'))
from app.services import ai_gateway as ag,asr_gateway as asr
class AdapterTests(unittest.TestCase):
 def test_normal_reply(self):self.assertEqual(ag._extract_content({'choices':[{'message':{'content':'连接成功'}}]}),'连接成功')
 def test_null_is_not_answer(self):self.assertEqual(ag._extract_content({'choices':[{'message':{'content':None}}]}),'')
 def test_error_payload_is_not_answer(self):self.assertEqual(ag._extract_content({'error':{'code':'test'}}),'')
 def test_legacy_vivo_reply(self):self.assertEqual(ag._extract_content({'data':{'content':'测试'}}),'测试')
 def test_content_blocks(self):self.assertEqual(ag._extract_content({'choices':[{'message':{'content':[{'type':'text','text':'测试'}]}}]}),'测试')
 def test_ark_short_reply_mode(self):
  payload={}
  with patch.dict(os.environ,{'ARK_THINKING_MODE':'disabled'}):ag._apply_ark_options(payload,{'name':'ark','model':'doubao-seed-2-1-lite-260915'})
  self.assertEqual(payload['thinking'],{'type':'disabled'})
 def test_other_providers_unchanged(self):
  payload={};ag._apply_ark_options(payload,{'name':'vivo_bluelm','model':'test'});self.assertNotIn('thinking',payload)
 def test_ark_asr_opt_in(self):
  with patch.dict(os.environ,{'ARK_ASR_ENABLED':'1','ARK_API_KEY':'unit-test-placeholder','ARK_MODEL':'doubao-seed-2-1-lite-260915'}):self.assertEqual(asr.status()['active_provider'],'ark_asr')
 def test_ark_asr_off_preserves_old_chain(self):
  with patch.dict(os.environ,{'ARK_ASR_ENABLED':'0'}):self.assertNotEqual(asr.status()['active_provider'],'ark_asr')
 def test_empty_audio_no_network(self):
  result=asyncio.run(ag.transcribe_ark_audio(b''));self.assertFalse(result['ok'])
if __name__=='__main__':unittest.main(verbosity=2)
