"""Compare executable Web bundles with every supplied mini-program source module."""
import json,os,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ['YX_EVIDENCE_DIR'])
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True);p=b.new_page();p.goto('http://127.0.0.1:8001/site/');p.wait_for_function('window.YX&&YX.getPage()')
 report=p.evaluate('YX.auditBindings()');templates=p.evaluate('window.__yx_templates');modules=p.evaluate('Object.fromEntries(Object.entries(window.__yx_modules).map(([k,v])=>[k,v.toString().slice(v.toString().indexOf("{")+1,v.toString().lastIndexOf("}")).trim()]))');b.close()
 report['template_mismatches']=[k for k,v in templates.items() if (ROOT/'miniprogram'/ (k+'.wxml')).read_text(encoding='utf-8').strip().lstrip('\ufeff')!=v.strip().lstrip('\ufeff')]
 report['module_mismatches']=[k for k,v in modules.items() if (ROOT/'miniprogram'/k).read_text(encoding='utf-8').strip().lstrip('\ufeff')!=v.strip().lstrip('\ufeff')]
 report['modules']=len(modules)
 (OUT/'SOURCE_BINDING_AUDIT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print('SOURCE_BINDINGS',json.dumps(report,ensure_ascii=False));sys.exit(0 if report['pages']==30 and report['components']==5 and not any(report[k] for k in ['missing','unsupported','template_mismatches','module_mismatches']) else 1)
