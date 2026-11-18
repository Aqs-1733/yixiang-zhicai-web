"""Parse spoken RMB units without dropping jiao/fen from ASR transcripts."""
import re
from decimal import Decimal

CN='零〇一二两三四五六七八九十百千万点'
NUMBER=rf'(?:[+-]?\d+(?:\.\d+)?(?:万)?|[{CN}]+)'
RMB_PATTERN=re.compile(rf'(?:{NUMBER}\s*(?:元|块钱|块)(?:\s*半|\s*{NUMBER}\s*(?:角|毛)(?:\s*{NUMBER}\s*分)?|\s*{NUMBER}\s*分|\s*[一二两三四五六七八九1-9](?=$|[，,。；;！!？?\s]))?|{NUMBER}\s*(?:角|毛)(?:\s*{NUMBER}\s*分)?|{NUMBER}\s*分)')

def number(value):
 value=value.strip();digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
 if re.fullmatch(r'[+-]?\d+(?:\.\d+)?万?',value):return Decimal(value.rstrip('万'))*(10000 if value.endswith('万') else 1)
 if '点' in value:
  left,right=value.split('点',1);return number(left)+Decimal('0.'+''.join(str(digits[c]) for c in right))
 total=section=current=0
 for c in value:
  if c in digits:current=digits[c]
  elif c in '十百千':section+=(current or 1)*{'十':10,'百':100,'千':1000}[c];current=0
  elif c=='万':total+=(section+current)*10000;section=current=0
 return Decimal(total+section+current)

def parse_rmb(value):
 text=re.sub(r'\s+','',str(value or '')).replace('块钱','元').replace('块','元').replace('毛','角')
 if not RMB_PATTERN.fullmatch(text):return None
 amount=Decimal(0)
 if '元' in text:
  yuan,text=text.split('元',1);amount=number(yuan)
 if text=='半':amount+=Decimal('.5');text=''
 elif text and not any(unit in text for unit in ['角','分']):amount+=number(text)/10;text=''
 if '角' in text:
  jiao,text=text.split('角',1);amount+=number(jiao)/10
 if text.endswith('分'):amount+=number(text[:-1])/100
 return float(abs(amount))
