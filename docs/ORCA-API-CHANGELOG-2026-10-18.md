# ORCA-API 本次改动

日期：2026-10-18

## 用户侧改动

- 首页直接输入需求并发送，首条消息在当前窗口原位打开聊天，不再自动跳转到另一个工作区标签。
- 首页聊天创建会话时保持后台创建，创建完成后由首页接管会话显示。
- 聊天界面保留“新对话”入口，可返回首页继续创建任务。
- 会话模型选择器会合并当前 Agent 已配置的多个 API 预设模型。
- 同一模型 ID 会去重，并保留 Agent 自己报告的模型行及其默认状态。
- 不属于当前 Agent 的 API 模型不会混入当前会话。
- API 模型合并逻辑增加回归测试，覆盖多 API、多模型、重复模型和其他 Agent 隔离。

## 构建产物

- Windows x64 安装包：`outputs/ORCA-Windows-x64/Orca-API-1.4.214-x64-Setup.exe`
- 文件大小：290282248 字节
- SHA-256：`6564CB007000D06FF1CA9CFE4AFDF2D3F7F6D454B02F6BF63C4881C7DCCB5B8A`
- 构建流程：Node 24.22.0、pnpm 12.8.1、Electron 43.7.8、NSIS x64

## 上游仓库跟踪

本项目引用并跟踪以下仓库：

| 仓库 | 2026-10-18 检测到的 HEAD | 本地同步状态 |
| --- | --- | --- |
| `stablyai/orca` | `04ce3d389116c1795d71934f7685c5781b9e87fc` | 已同步至上游最新提交；保留 Orca API 本地功能 |
| `deepseek-ai/deepseek-harness` | `687f282e8625c6b8d11ff58211a90524be2e4317` | 已检测；通过 `config/orca-agent-engine` 的依赖准备脚本集成 |

更新检查命令：

```powershell
git fetch origin main
git ls-remote https://github.com/deepseek-ai/deepseek-harness.git HEAD
```

每次上游更新后，需要检查冲突、逐项保留本项目 API 适配器，运行 `pnpm run typecheck:web`，再重新构建 Windows 安装包并更新本文件中的版本、时间和哈希。
