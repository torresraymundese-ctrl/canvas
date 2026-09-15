# 导演画布（本地版）

这是一个面向短剧制作的无限画布。它把“导演 Agent”和“视频生成模型”分开：导演模型负责理解剧本、拆人物/场景/分镜，Seedance 负责把确认后的单个镜头生成视频。

## 当前可用功能

- 导入 `.txt`、`.md`、`.json` 剧本，项目刷新后仍会保留。
- 使用 `Doubao Seed 2.0 Pro` 把剧本拆成结构化分镜。
- 在任务中心查看排队、进度、完成、失败、取消和重试。
- 点开故事、视觉、角色、分镜和视频节点查看真实结果。
- 勾选并确认单个分镜后，选择 Seedance Mini 或 Seedance 2.0 生成视频。
- 生成的视频保存到本机并可直接播放。
- 画布支持 10%–120% 缩放、任意方向平移、双击空白处创建节点、撤销/重做和自动保存。

## 一键启动

双击 `D:\画布\启动画布.cmd`。后台服务窗口会自动最小化，浏览器会在画布准备完成后打开。如果画布已经运行，再次双击只会打开页面，不会重复启动服务。

关闭标题为 `Director Canvas Service` 的最小化窗口即可停止画布。启动器不会修改 `.env` 或 API Key；没有 `.env` 时仍使用不产生模型费用的 `mock` 模式。

## 默认测试方式（不产生模型费用）

```powershell
npm.cmd run build
npm.cmd run start:local
```

然后访问 `http://127.0.0.1:4173/`。默认是 `mock` 模拟模式，完整流程可操作，但返回的是内置测试分镜和演示视频。

## 火山引擎真实模式

模型配置：

- 导演：`doubao-seed-2-0-pro-260215`
- 低成本视频测试：`doubao-seedance-2-0-mini-260615`
- 高质量视频：`doubao-seedance-2-0-260128`
- Ark 地址：`https://ark.cn-beijing.volces.com/api/v3`

在项目根目录把 `.env.example` 复制为 `.env`，仅在本机填写：

```dotenv
MODEL_EXECUTION_MODE=live
ARK_API_KEY=你的火山引擎APIKey
```

不要把 API Key 发到聊天中，也不要提交或分享 `.env`。真实模式下，确认窗口会显示红色费用提醒；建议第一次只生成一个 5 秒的 Seedance Mini 镜头。

## 本机数据

- 任务记录：`runtime/jobs.json`
- 生成视频：`runtime/outputs/<job-id>.mp4`
- 浏览器画布状态：浏览器本地存储
- API Key：只存在本机 `.env` 和运行中的 Node 进程，不会发送到浏览器或写入任务文件

## 开发验证

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:sites
```

本地服务只监听 `127.0.0.1`。当前 Sites 构建保留用于前端预览，但真实模型调用只由本地 Node 服务提供。
