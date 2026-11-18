"""Offline disclosure parser and cache semantics, using synthetic table rows."""
from pathlib import Path
import sys,unittest
from datetime import datetime,timezone,timedelta
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'backend'))
from app.services import official_products as m
class Disclosures(unittest.TestCase):
 def html(self,code='TEST123A',name='合成测试产品',nav='1.2345',stamp=None):
  stamp=stamp or datetime.now(timezone(timedelta(hours=8))).strftime('%Y/%m/%d')
  return '<table><tr>'+''.join('<td>'+v+'</td>' for v in [code,name,nav,'1.2500','0.0000','','',stamp+' 00:00:00'])+'</tr></table>'
 def test_exact_values_and_date(self):
  row=m.parse_page(self.html())[0];self.assertEqual(row['unit_net_value'],'1.2345');self.assertEqual(row['product_code'],'TEST123A')
 def test_no_invented_risk(self):
  row=m.parse_page(self.html())[0];self.assertFalse(row['safe']);self.assertEqual(row['registration_code'],'')
 def test_missing_name_ignored(self):self.assertEqual(m.parse_page(self.html(name='')),[])
 def test_invalid_nav_ignored(self):self.assertEqual(m.parse_page(self.html(nav='NaN')),[])
 def test_future_date_ignored(self):self.assertEqual(m.parse_page(self.html(stamp='2099/01/01')),[])
 def test_exact_code_not_substring(self):
  with patch.object(m,'catalogue',return_value={'items':m.parse_page(self.html())}):
   self.assertIsNotNone(m.exact_quote('test123a'));self.assertIsNone(m.exact_quote('TEST123'))
if __name__=='__main__':unittest.main(verbosity=2)
