# 参与颐享智财开发

欢迎通过 Fork → 分支 → Pull Request 提交改进，不需要仓库写权限。

## 本地运行

Python 3.12，Node.js 22；浏览器建议最新 Edge/Chrome。

```sh
git clone https://github.com/YOUR_ACCOUNT/yixiang-zhicai-web.git
cd yixiang-zhicai-web
python -m venv .venv
# Windows: .venv\Scripts\activate；Linux/macOS: source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8004
```

浏览器打开 http://127.0.0.1:8004/site/ 。密钥只放本机 backend/.env；不配置云API时，基础账户、账本、家庭协同和本地课堂仍可开发，识别与云端回答需要自己的服务配置。

## 修改源码

- 原业务：miniprogram/pages、components、utils。
- 浏览器：site/compat.js、dom-patch.js、reliability.css。
- API：backend/app。
- 修改原业务JS/WXML后，在项目根目录执行 `python scripts/sync_browser_sources.py`，同步浏览器模块与模板。
- 不要在 setData 中断开播放器节点，也不要让数据更新反复启动整卡透明度动画。
- 课程主列表全部使用本地MP4，图片/音轨与来源信息一起提交；各素材的授权分别见对应JSON，不把外链视频标为开源素材。

## 提交PR

```sh
git switch -c fix/your-change
# 修改、同步、测试
git add <修改的源码>
git commit -m "Fix: 简述问题"
git push origin fix/your-change
```

到上游仓库 Pull requests → New pull request，选择 `compare across forks`，从自己的分支提交到本仓库 main。说明复现步骤、变更、测试结果，界面修改附桌面与手机截图。PR不自动合并，上游维护者审核后合并。

不要提交本机.env、运行数据库、测试账号资料或个人截图。公开PR的CI不读取任何云API密钥。
