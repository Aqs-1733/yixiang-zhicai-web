"""Check configured MySQL, optionally start the explicitly configured local instance."""
import os,subprocess,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app.database import connection_settings,readiness

def main():
 try:
  readiness();print('MySQL 连接正常');return 0
 except Exception:
  pass
 try:
  settings=connection_settings()
  config=Path(os.getenv('MYSQL_LOCAL_CONFIG',''))
  binary=Path(os.getenv('MYSQL_LOCAL_BINARY',''))
  if '--autostart-local' in sys.argv and settings['host'] in ('127.0.0.1','localhost') and config.is_file() and binary.is_file():
   log=config.parent/'launcher.log'
   with log.open('ab') as output:
    subprocess.Popen([str(binary),'--defaults-file='+str(config),'--console'],stdin=subprocess.DEVNULL,stdout=output,stderr=output,
                     creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
   for _ in range(30):
    time.sleep(.5)
    try:
     readiness();print('本地 MySQL 已启动，连接正常');return 0
    except Exception:pass
 except Exception:
  pass
 print('MySQL 尚未连接。请检查 backend/.env 中的 MYSQL_*，并确认数据库服务已启动。')
 return 1

if __name__=='__main__':raise SystemExit(main())
