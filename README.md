# 颐享智财 Web

FastAPI + SQLite + 小程序页面兼容层。保留30个业务页面、5个原组件，以及奶油黄、浅绿、橙色的适老化配色。

## 当前版本 · 2026-11-12

- 本机入口：<http://127.0.0.1:8004/site/>。旧8000入口在确认新版服务后跳转到8004。
- 播放器和卡片节点在数据更新时保持连接；不再反复触发整卡透明度动画。课程支持选集、进度保存、返回续播、重试。
- 10门主课堂均为本地MP4，附本地海报与来源/授权元数据，不依赖外部HLS播放服务。
- 新闻有独立列表、可直接访问的详情、官方正文节选、出处和发布日期；AI获取已核验的官方资讯，不补造最新内容。
- 家庭群聊/私信在前台约1.5秒轮询自动同步；语音留言可跨账号播放，权限撤销与恢复由后端核验。
- 图片账单识别→核对→确认入账→刷新保持；同批导入重复确认不会重复记账。
- 模块插画、个人画像卡片、地图控件与移动端排版已调整。网页不提供微信登录。

本轮实际验收、已修问题与复现方式见 [可靠性验收](docs/RELIABILITY_RELEASE_20261112.md)。旧验收记录保留作历史记录，不代表当前版本状态。

## 分享与贡献

项目仓库：<https://github.com/Aqs-1733/yixiang-zhicai-web>。

Fork → 自己的功能分支 → Pull Request 到main。无需上游写权限；维护者审核后合并。步骤见 [CONTRIBUTING.md](CONTRIBUTING.md)。PR自动运行不读取云API密钥的源码/适配器检查。素材授权分别见课程JSON，不将原来源外链视频宣称为开源素材。

## 本地启动

Python 3.12；修改/校验浏览器源代码另需Node.js 22。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
# 按需在本机填写自己的API配置
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8004 --no-access-log
```

也可双击项目根目录的`启动网站.bat`。API文档为`/docs`，健康状态为`/healthz`，集成配置状态为`/integrations/status`，发布标识为`/app/release`。

配置状态不等于真实调用成功。未配置云API时可开发基础账户、账本、家庭协同与本地课堂；云端问答、识别、TTS与腾讯路线需要自己的配置。密钥仅放在被Git忽略的`backend/.env`，不要放在前端、PR或截图中。

## 结构与同步

- `backend/app/main.py`：账户、画像、理财知识、账本、家庭、健康、课程与生活服务。
- `backend/app/routers/assistant.py`、`services/`：AI、图像、ASR、TTS、新闻与位置服务。
- `miniprogram/`：原始页面、组件和业务逻辑，以及本地课程素材。
- `site/`：浏览器运行层、DOM增量更新、样式与插画。
- `tests/local_acceptance/`：本地隔离验收与离线回归。

修改原JS/WXML后在根目录运行：

```sh
python scripts/sync_browser_sources.py
node scripts/check_browser_sources.cjs
```

## API与数据

本机真实联网验收使用Ark Seed 2.1 Lite处理文字、图片与ASR，百度TTS处理播报，腾讯位置服务处理转换与路线。公共模板不附带任何可用密钥。

新闻当前来自中国政府网和中国人民银行公开源，保留原始发布日期、抓取时间与过期状态；详情为有来源的有限正文节选，可打开官方原文。不是覆盖全网的新闻服务。

产品目录为知识参考，不是银行官方实时在售产品。银行授权数据、实际资金交易与支付未接入；微信网站登录按需求不做。

## 测试

所有业务写入使用隔离数据库，不能把验收脚本指向私人运行数据库。Windows浏览器验收使用本机Edge和Playwright；麦克风与定位为可重复的合成音频/已知坐标夹具，另有真实云API链路核验。

```powershell
# 另开终端，在backend目录启动独立8001测试服务，数据库路径须为新建的验收副本
$env:DB_PATH='D:\YOUR_TEST_DIR\acceptance.db'
$env:DATABASE_URL=''
$env:LLM_PROVIDER_ORDER='local'
$env:ARK_ASR_ENABLED='0'
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
# 回到项目根目录，在同一证据目录顺序生成夹具并做浏览器验收
$env:YX_EVIDENCE_DIR='D:\YOUR_TEST_DIR'
.\.venv\Scripts\python.exe tests\local_acceptance\api_acceptance.py
.\.venv\Scripts\python.exe tests\local_acceptance\browser_acceptance.py
.\.venv\Scripts\python.exe tests\local_acceptance\test_family_realtime.py
.\.venv\Scripts\python.exe tests\local_acceptance\test_browser_session.py
.\.venv\Scripts\python.exe tests\local_acceptance\test_course_lifecycle.py
```

家人测试使用已生成的双角色夹具；课程生命周期测试将10门本地视频以4倍速播放到自然结束。云端识别与语音测试需要单独配置，不把离线Mock成功当成云服务成功。

历史报告：[初轮](LOCAL_ACCEPTANCE.md) · [视觉恢复](docs/PREMIUM_RESTORE_20261112.md) · [本轮可靠性](docs/RELIABILITY_RELEASE_20261112.md)。
