# 颐享智财 · 模板动效精修版（2026-11-10）

## 使用
Windows 11：将本压缩包解压后双击 `启动网站.bat`，打开 `http://127.0.0.1:8000/site/`。
Linux / macOS：请查看 `启动网站.sh`；使用 Python 3.10+，安装 `backend/requirements.txt`。

## 设计参考
- Astra Elderly Home: https://wpastra.com/templates/elderly-care-02/ ——温暖的大幅主视觉、白底内容块、适量轻视差。
- Blocksy Starter Sites: https://creativethemes.com/blocksy/starter-sites/ ——资讯列表、可响应的内容卡片与信息优先排版。
- Kadence Starter Templates: https://wordpress.org/plugins/kadence-starter-templates/ ——全局字号、配色与组件间距体系。

仅借鉴组织方式。没有引入 WordPress 或复制第三方付费模板代码，也没有更换原 FastAPI 后端。

## 本版变更
- `site/atelier.css`：统一精细间距、圆角、阅读字号、页面背景、黄绿橙渐变、多业务场景的视觉层级；修正天气数值与装饰重叠问题。
- `site/atelier.js`：路由渐入、滚动卡片显示、按钮水波纹、首页主视觉微视差（仅桌面鼠标）、用户设置减少动画时关闭动效。
- `site/index.html`：引入上面两个独立文件。此前的 30 页面、5 组件、业务脚本、API、登录逻辑均未删除。
- `网页视觉预览.html`：电脑、手机 7 类代表性页面实际截图的独立预览页面。
- `tests/atelier_v6`：所测设备视图、页面交互和基础检查记录。

## 测试边界
- `验证工程.py` 结构、资源与基础接口测试 23/23 通过。
- 电脑 1512×950、手机 390×844：登录、首页、问小享、理财识别页面均能渲染，无整页横向溢出；图片已成功加载。
- 交互烟雾测试：导航进入问小享、首页按钮进入问小享、CSS 动效加载等检查通过。
- 本轮没有完成全部 30 页面所有细分功能的真实端到端验证，也未重新验证外部付费 API 的有效性。受限测试环境里的模拟新闻和接口兜底，不代表实时数据接口可用。
- 仅客户端视觉改进；不能把保留原页面源码等同于所有浏览器原生能力已完成适配。

## API 配置
延用 `导入原项目API配置.py`。将原始 `颐享智财_可运行产品包.zip` 放在工程上一级目录，运行导入脚本以复用自己已有的凭证。不要将 `.env`、AppSecret 等放进前端或公开仓库。交付 ZIP 不包含 `.env`。
