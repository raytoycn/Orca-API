# Orca API：Agent 页面里的多角色协同

## 入口

1. 打开设置中的 Agent 页面。
2. 在“已安装”列表上方的“Orca Agent 协同”区直接选择“单 Agent”或“多角色协同”。
3. 单 Agent 模式下，页面会显示“单 Agent 思考模式”。

多角色默认包含 A 代码写作、B 项目知识、C 分析统筹、D 代码审查。每个角色可以修改名称和职责，可以增加或删除角色，并分别选择供应商、模型与思考模式。其中一个角色必须标记为协调角色；默认是 C。

## 使用方式

在新对话中选择 Orca Agent，然后把“运行方式”切到“多角色协同”，直接输入需求并发送。

单 Agent 模式下，新对话页会显示“思考模式”；多角色模式下，每个角色都可以单独选择“思考模式”。

Orca Agent 会作为协调角色启动。程序自动把角色表、供应商限定模型、职责、并行限制和审查返回路径写入任务说明，并要求它通过本应用的 Orca CLI 创建 Run、Task 和 worker。其他角色使用各自配置的 `--model` 启动结构化 Orca Agent 会话。

单 Agent 模式保持原有行为，不生成编排任务。

## 当前边界

- 第一版默认最多两个活跃 worker、一个代码写入者。
- 模型必须在 Orca Agent 的 API 配置中先获取并保存；角色只从已保存的供应商和模型中选择。
- Orca Agent 可以复用其他智能体已配置的兼容 API 模型目录；选择时会复制成一个 Orca Agent API 配置。
- 只复用 Orca Agent 支持的协议：OpenAI Completions、OpenAI Responses、Anthropic Messages 和 Google GenAI。
- 仅官方登录、没有可用 API 端点的智能体不会出现在 Orca Agent 模型列表里；那些模型的访问权在原智能体内部，不能直接转发。
- 同一供应商的重复 API 预设会合并成一个分组；优先使用 Orca Agent 自己的预设，并合并两份预设的模型列表。
- 当前可走标准 API 桥接的智能体包括 Claude、Codex、OpenCode、Kimi、Hermes、Pi 和 Cursor。
- Grok、Trae、Devin 当前没有标准模型 API 适配器；要用它们的登录账号，需要后续逐个写账号桥接器。
- B/D 的只读是任务约束；第一版没有额外的角色级文件系统沙箱。
- 角色数量可配置为 1 到 8 个；多角色任务至少需要两个角色，并且每个角色都要选择模型。
- 多角色任务要求本机 Orca Agent 使用结构化聊天；远端或旧执行主机不支持时会明确报错。

## 已有编排底座

Orca 已提供 Run、Task、Dispatch、依赖任务、worker 完成回报、消息、决策关卡和 worker 生命周期。本次没有重复实现这些机制，只在 Agent 设置页增加了角色配置，并在聊天入口自动生成使用这些机制的协同任务。

## Orca CLI 模型入口

```text
orca models list
orca models list --agent grok
orca models use --model qwen3.8-max
```

`orca models list` 会合并两类来源：

- `api`：智能体已保存且可用的 API 模型。
- `account`：智能体登录账号后由本机模型目录列出的模型。

`orca models use` 默认把选中的 API 模型切换给 Orca Agent；如果模型来自另一个兼容 API 的智能体，会自动复制成 Orca Agent 预设。`account` 模型目前只能显示，不能从这里直接切换，因为凭据仍在原智能体进程内。
