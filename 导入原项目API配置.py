#!/usr/bin/env python3
"""从用户原始产品包导入本地后端私密 .env；不上传、不回显任何密钥。"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys
import zipfile

ROOT=Path(__file__).resolve().parent
TARGET=ROOT/'.env'


def parse_env(raw: str) -> dict[str, str]:
    data={}
    for line in raw.splitlines():
        line=line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key,value=line.split('=',1)
        key=key.strip()
        if key.isidentifier():data[key]=value.strip()
    return data


def get_files(src: Path) -> tuple[dict[str,str],dict[str,str]]:
    if src.is_dir():
        possible=[src, *[f for f in src.iterdir() if f.is_dir()]]
        root=next((d for d in possible if (d/'.env').exists() and (d/'backend').is_dir()),None)
        if root is None:raise FileNotFoundError('未找到同时含 .env 与 backend/ 的原始项目目录')
        return parse_env((root/'.env').read_text(encoding='utf-8-sig')),parse_env((root/'backend'/'.env').read_text(encoding='utf-8-sig'))
    with zipfile.ZipFile(src) as z:
        names=z.namelist()
        backend=next((n for n in names if n.endswith('/backend/.env') and not n.startswith('__MACOSX')),None)
        if not backend:raise FileNotFoundError('原包缺少 backend/.env，请检查是否选择了可运行产品包')
        project=backend[:-len('backend/.env')]
        root_name=project+'.env'
        root_data=parse_env(z.read(root_name).decode('utf-8-sig')) if root_name in names else {}
        backend_data=parse_env(z.read(backend).decode('utf-8-sig'))
        return root_data,backend_data


def main():
    parser=argparse.ArgumentParser(description='从原始 ZIP 安全导入已有 API 凭证')
    parser.add_argument('source',nargs='?',help='原始颐享智财_可运行产品包.zip 的路径，或解压目录')
    args=parser.parse_args()
    if args.source:
        source=Path(args.source).expanduser()
    else:
        paths=[ROOT/'颐享智财_可运行产品包.zip',ROOT.parent/'颐享智财_可运行产品包.zip']
        source=next((p for p in paths if p.exists()),None)
        if source is None:
            print('把原始「颐享智财_可运行产品包.zip」放在本项目同级目录，或执行：')
            print('python 导入原项目API配置.py "D:\\原始项目\\颐享智财_可运行产品包.zip"')
            return 2
    if not source.exists():raise FileNotFoundError(source)
    if TARGET.exists():
        response=input('已有本地 API 配置 .env。是否创建备份后覆盖？[y/N] ').strip().lower()
        if response!='y':print('保留原配置，未修改。');return 0
        backup=ROOT/'.env.bak';backup.write_bytes(TARGET.read_bytes())
    outer,backend=get_files(source)
    # 后端配置优先，补充根目录中的 vivo / BlueLM 多模态专属选项。
    merge={**outer,**backend}
    vivo_names=[k for k in outer if k.startswith(('VIVO_','BLUELM_'))]
    for key in vivo_names:
        if not merge.get(key) or backend.get(key,'')=='':merge[key]=outer[key]
    if merge.get('BLUELM_API_KEY') and merge.get('ARK_API_KEY'):
        merge['LLM_PROVIDER_ORDER']='vivo_bluelm,ark,qwen,deepseek,openai,llm,local'
    # 原包可能使用相对 DB_PATH=backend/app/data/... ，仍使用当前网站包内演示库。
    merge['DB_PATH']='app/data/yixiang.db'
    entries=['# 仅供本机 FastAPI 加载，严禁上传到公开仓库。']
    entries.extend(f'{k}={v}' for k,v in merge.items())
    TARGET.write_text('\n'.join(entries)+'\n',encoding='utf-8')
    try:TARGET.chmod(0o600)
    except OSError:pass
    print('已安全导入本地 .env（未显示任何密钥内容）。')
    groups={
      '豆包/火山方舟':bool(merge.get('ARK_API_KEY')),
      'vivo 蓝心':bool(merge.get('BLUELM_API_KEY')),
      '百度语音':bool(merge.get('BAIDU_API_KEY') and merge.get('BAIDU_SECRET_KEY')),
      '聚合财经新闻':bool(merge.get('JUHE_BULLETIN_KEY')),
      '腾讯地图':bool(merge.get('TENCENT_MAP_KEY')),
    }
    for name,ok in groups.items():print(f'  {name}: {"已找到配置" if ok else "配置缺失"}')
    print('注意：配置存在不代表接口有效，需启动网站后进行真实调用测试。')
    return 0

if __name__=='__main__':sys.exit(main())
