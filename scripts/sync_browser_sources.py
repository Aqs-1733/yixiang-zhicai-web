"""Rebuild the checked-in, buildless browser bindings from original mini-program sources."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1];MINI=ROOT/'miniprogram'
modules=['/* Generated from miniprogram sources. Run python scripts/sync_browser_sources.py. */','window.__yx_modules=Object.create(null);']
files=sorted(MINI.rglob('*.js'))
for p in files:
 key=p.relative_to(MINI).as_posix();source=p.read_text(encoding='utf-8-sig').replace('\r\n','\n')
 modules.append('window.__yx_modules['+json.dumps(key)+']=function(require,module,exports){\n'+source+'\n};')
(ROOT/'site/modules.js').write_text('\n'.join(modules)+'\n',encoding='utf-8')
templates={p.relative_to(MINI).with_suffix('').as_posix():p.read_text(encoding='utf-8-sig') for p in sorted(MINI.rglob('*.wxml'))}
(ROOT/'site/templates.js').write_text('window.__yx_templates='+json.dumps(templates,ensure_ascii=False)+';\n',encoding='utf-8')
print('SYNC_BROWSER',len(files),'modules;',len(templates),'templates')
