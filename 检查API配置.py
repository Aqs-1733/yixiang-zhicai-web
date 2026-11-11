"""仅检查本地 .env 是否填写所需字段。无需第三方包、不会发起网络请求、不会打印密钥。"""
from pathlib import Path
import re

p = Path(__file__).resolve().parent / 'backend' / '.env'
if not p.is_file():
    print('未找到 backend/.env，请参考 backend/.env.example 配置。')
    raise SystemExit(1)

e = {}
for line in p.read_text(encoding='utf-8-sig').splitlines():
    match = re.match(r'^\s*([A-Z][A-Z_0-9]*)\s*=\s*(.*?)\s*$', line)
    if match:
        e[match.group(1)] = match.group(2).strip().strip('"').strip("'")

groups = {
    '火山方舟 / 豆包': ['ARK_API_KEY', 'ARK_BASE_URL', 'ARK_MODEL'],
    'vivo 蓝心': ['VIVO_APP_ID', 'BLUELM_API_KEY', 'BLUELM_BASE_URL', 'BLUELM_TEXT_MODEL'],
    '百度语音 ASR/TTS': ['BAIDU_API_KEY', 'BAIDU_SECRET_KEY'],
    '聚合数据 · 财经新闻': ['JUHE_BULLETIN_KEY', 'JUHE_BULLETIN_URL'],
    '聚合数据 · 金融数据': ['JUHE_FINANCE_KEY', 'JUHE_FINANCE_URL'],
    '腾讯地图': ['TENCENT_MAP_KEY'],
    '微信小程序身份': ['WECHAT_APPID', 'WECHAT_SECRET'],
    '银行官方授权产品源': ['BANK_PRODUCTS_URL', 'BANK_API_KEY'],
    '微信支付': ['WECHAT_PAY_MCH_ID', 'WECHAT_PAY_API_V3_KEY', 'WECHAT_PAY_CERT_SERIAL_NO'],
}
print('【颐享智财 API 配置状态】仅检查配置，不调用外网，不显示密钥')
for title, needed in groups.items():
    missing = [key for key in needed if not e.get(key)]
    print(f'{title}: ' + ('已配置（待在线验证）' if not missing else '缺少 ' + ', '.join(missing)))
print('\n请在网站启动后浏览 http://127.0.0.1:8000/healthz 查看后端加载状态。')
