# ORCA 独立 API 接入进度（2026-10-17）

上游主干已从 `44a86bb188fb4582c6d60c05b86d490386e37879` 同步至 `6fcc183ab951fb751cf02ccb9e2af3cf129a4316`，版本号仍为 `1.4.214`。本次采用上游差异的三方合并，保留下面列出的全部独立 API 适配。后续同步基线记录在 `config/orca-api-upstream.json`，避免重复合入上游改动。

入口：设置 → 智能体 → 对应智能体旁的“配置 API”。未安装的受支持智能体也可预先配置。保存后用于新会话；移除覆盖后使用原有登录配置。无需安装 CC Switch 或 Harness 作为转接。

## 当前适配范围

| 智能体 | 接入类型 | 实现与验证 |
|---|---|---|
| Claude、Claude Agent Teams | Anthropic Messages | 独立 API key / Bearer，保留其他环境变量；单元测试 |
| Codex | OpenAI Responses | 原生 provider 启动参数，密钥通过环境变量；实际 CLI 模拟请求通过 |
| OpenCode | Messages / Completions / Responses | 合并原生配置，保留其他 provider；单元测试 |
| Hermes | Completions / Responses / Messages | 原生 YAML 模型配置、备份和恢复，保留其他设置；实际 CLI 模拟请求通过 |
| Pi | Completions / Responses / Messages / Google | 专属 models.json 和默认模型设置；实际 CLI 模拟请求通过 |
| Kimi Code 新版 | Completions / Messages | 官方 KIMI_MODEL_* 覆盖；实际 CLI 模拟请求通过 |
| Gemini | Google GenAI | 系统设置文件选择 API 认证、独立端点/模型/密钥；配置与界面测试 |
| Qwen Code | Completions | 系统设置文件明确选择 OpenAI 认证；配置测试 |
| Aider、Goose | Completions | 各自原生环境变量和 URL 路径；配置测试 |
| Cursor、Amp | 各自平台 API 密钥 | 与第三方模型 API 分开显示，只接受平台接入协议；配置测试 |

合计 13 类：11 类模型 API 适配，2 类平台密钥适配。真实 CLI 验证使用本机已安装程序和本地 HTTP 模拟服务，检查模型标识、密钥匹配和 ORCA_API_OK 返回；没有使用真实模型凭据或外部付费模型。Hermes CLI 通过已安装环境的 Python 入口运行，未测试独立 EXE 的启动器链路。

桌面 CDP 实测 Codex、Pi、Kimi、Hermes、Cursor、Gemini 六类的保存、读取和清除；另外检查 Pi/Gemini 配置路径、Hermes YAML 落盘、Cursor 隐藏第三方模型字段。64 项测试（10 个文件）、类型检查、改动代码质量、翻译检查、Electron 构建通过。

## 尚待适配（32 类）

codebuddy、openclaude、autohand、opencode2、mimo-code、omp、qoder、qoder-cn、antigravity、kilo、kiro、crush、aug、cline、codebuff、freebuff、command-code、continue、droid、mistral-vibe、rovo、openclaw、copilot、grok、devin、ante、trae、muse、zcode、prime-agent、dsh、jcode。

这些项目在列表明确显示“API 适配待补充”。此状态表示本项目尚未实现并验证适配，不表示对应产品永久不支持 API。后续需要逐一核实原生接口、版本和启动链路；目前没有完成全部 45 类。

## 参考源码与文档

Windows x64 定制安装包：安装根目录和 `mobile/` 的锁定依赖，并准备 Rust MSVC 工具链、Visual Studio C++ 构建工具后，在 Windows 上执行 `pnpm run build:win:api`。安装包输出到项目旁的 `ORCA-Windows-x64/`，名称为 `Orca-API-<版本>-x64-Setup.exe`。该命令使用独立应用标识及本仓库的稳定版更新地址，不上传 GitHub Release。本地构建未配置签名证书。

- [CC Switch](https://github.com/farion1231/cc-switch)：参考各 Agent 原生配置适配方式，本地只读参考 commit eb09fbb1b7d204095bedf0a8f7241cf69a441f43。
- [Kimi Code](https://github.com/MoonshotAI/kimi-code)：参考 commit 18c6d64272952503baccf706bff455bb6a2c488e；[新版环境变量文档](https://moonshotai.github.io/kimi-code/en/configuration/env-vars.html)。实际测试发现旧 kimi-cli 的 --config-file 不适用于本机新版，已改用新版原生变量。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：参考 commit 687f282e8625c6b8d11ff58211a90524be2e4317；其 provider/profile 插件配置已调研，未将其作为其他 Agent 的代理。
- [Pi 模型文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/models.md)、[Hermes 环境变量](https://hermes-agent.nousresearch.com/docs/reference/environment-variables)、[Gemini 配置](https://geminicli.com/docs/reference/configuration/)、[Qwen 认证](https://qwenlm.github.io/qwen-code-docs/zh/users/configuration/auth/)。


## API 配置与默认编排

同一 Agent 可以保存多套具名 API 配置，选择一套启用后应用于新会话。选择已有配置时密钥保持隐藏，留空保存可复用原密钥；变更地址、协议或认证方式时需要重新输入密钥。删除当前配置会解除 API 覆盖，其他配置保留。

填写地址和密钥后点击“获取模型列表”，从服务返回的列表选择模型；服务没有模型列表接口时可手动填写。支持 OpenAI 兼容、Anthropic 和 Gemini 模型列表及分页。已有配置获取模型时使用执行主机保留的密钥，不向界面回传密钥。新功能依赖对应执行主机版本，旧主机保持原来的手动配置入口。

Pi 和 Kimi 的上下文长度默认 1,000,000 tokens。选择模型后优先采用服务返回的长度；设置值不会扩展服务实际支持的上下文容量。

Orca API 安装包附带 `orca-cli` 和 `orchestration` 技能，启动时离线安装到本机共享技能目录，并为检测到的受支持 Agent 建立技能入口。此过程复用现有事务安装、完整性检查和恢复机制，保留用户修改的技能。默认编排工人深度和普通任务的单 Agent 行为保持原设置。WSL、SSH 或其他执行主机仍使用各自的技能安装机制。
