# 2026-11-12 · 功能恢复与暖色区块系统

## 已实现

保留奶油白、橙色、浅绿色基调，按任务区分八类页面模板：

1. 首页封面与杂志式 Bento 分栏，课程大卡片、资讯列表、服务卡组。
2. 理财识别工作台：输入主栏、持仓侧栏、分段标签、结构化结果卡。
3. 账本仪表盘：三色真实金额摘要、收支总览、记录操作卡。
4. 家庭关怀马赛克：绑定家人、留言、群聊、周报、权限入口。
5. 健康与提醒：建议卡、饮食/运动功能卡、记录时间线、用药提醒。
6. 个人画像：身份封面、风险结果、可编辑资料行。
7. 电话与附近服务：目录卡片、地图、选点与地点卡。
8. 对话、弹窗与表单：统一圆角、层级、输入焦点、选项与操作区。

实现为 `site/patterns.css`、`site/patterns.js` 的可复用区块装饰，原小程序业务节点、数据和处理函数保留。没有引入 WordPress 后台或复制商业主题代码。

参考 [WordPress Dashboard Layout](https://wordpress.org/patterns/pattern/dashboard-layout/) 的分栏思路及 [Grid Cards](https://wordpress.org/patterns/pattern/grid-cards/) 的卡组布局；所有样式为本项目重新编写。没有恢复前一轮移除的页脚说明或英文装饰小字。

## 动效

`site/motion.js` 按页面实例和节点键管理动效，避免输入和数据刷新时整页重复入场：

- 页面淡入、滚动卡片错峰入场、功能卡悬浮、图标反馈。
- 分段标签滑动底板、按钮涟漪、弹窗弹性入场、消息/结果卡出现。
- 录音中脉冲、天气光晕、提示条反馈。
- 减少动画偏好即时取消 Web Animations，并保留全部内容及交互。

弹窗位置计入 Web 侧栏/顶部栏，拖动和关闭经过实际鼠标验证；涟漪不改变绝对定位按钮的位置，也不拦截原操作。

## 功能恢复

- 原有 8 个课程实际为远端 HLS 播放列表。增加原生 HLS / MediaSource 双路径，非原生浏览器使用本地随包 Hls.js 1.7.4；依官方 npm 元数据验证完整 tarball 的 SHA-512，保留许可证，不依赖运行时 CDN 脚本。
- 八个原课程继续使用原项目的播放源，没有下载或重新分发第三方整部视频。
- 增加原创的约 65 秒本地基础课：四页字幕、离线中文语音、H.264/AAC，内容依据原项目基础课文本编写。它明确是本项目新增的离线备用课，不冒充原来的课程文件。
- 本地 MP4 接口支持 Range 请求，视频播放、暂停、进度、选集、课程计数和重绘状态实测。
- 修复麦克风授权仍在等待时用户提前松开的竞态，取消后释放迟到的流；离开页面或切入后台停止录音。
- 按用户本轮要求，网页版不做微信登录：移除其可见入口，浏览器注册不再尝试小程序微信绑定；保留手机号登录、注册、密保/找回、长辈/子女切换和七天记住登录。

## 复验入口

在隔离本地 8001 服务、合成测试账号和 `YX_EVIDENCE_DIR` 下运行：

```powershell
python tests/local_acceptance/api_acceptance.py
python tests/local_acceptance/browser_acceptance.py
python tests/local_acceptance/test_mini_parity.py
python tests/local_acceptance/test_mini_components.py
python tests/local_acceptance/test_premium_experience.py
python tests/local_acceptance/test_all_courses.py
python tests/local_acceptance/audit_miniprogram_parity.py
```

数据接口测试使用隔离数据库；第三方 AI 配置沿用此前已接入版本。本轮未把离线 AI 兜底测试写成真实云模型验收。课程测试包含真实视频解码，而非只派发 play 事件；跨浏览器 HLS 分支另做强制 MSE 适配测试。

HLS 实现参考 [video-dev/hls.js 官方文档](https://github.com/video-dev/hls.js)。私有 `.env`、用户数据库和测试凭据均不进入仓库。
