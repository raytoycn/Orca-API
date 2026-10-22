# Orca API 上游更新记录 · 2026-10-21

## 更新范围

- 更新前恢复点：`39bf4191f9b19fad447f1ac876d330555c85ec3d`，分支 `backup/pre-upstream-20261021`。
- Orca 原上游基线：`04ce3d389116c1795d71934f7685c5781b9e87fc`。
- 本次固定上游提交：`d15677e334b01d345266b387252f68b47f35f038`（2026-10-21）。该提交晚于上游 v1.4.237 发布。
- DeepSeek Harness：`@deepseek-ai/dsh` 从 `0.2.0-rc.2` 升级为 `0.2.1-rc.2`，同步 npm 锁文件和内置运行时。
- Orca API 产品版本：`1.4.238`，保留独立应用标识和 `raytoycn/Orca-API` 更新地址。

## 保留功能与兼容处理

- 保留每个智能体的多个 API 配置、批量模型目录、供应商分组、同名模型隔离和首次发送前模型切换。
- 保留内置 Orca Agent、权限模式、思考选项、单 Agent / 自定义角色协同入口和默认编排技能。
- 保留 API 删除后的目录清理、配置持久化、Orca CLI 模型命令、启动安装检测与最小化到后台。
- 保留常驻横向菜单、侧栏折叠避让、窗口拖动区域和下移后的智能体栏。
- 三方合并使用真实上游基线，不使用包含自定义功能的本地提交作为上游基线。
- 适配新版会话独立选项记录、异步模型写入、过期读结果隔离及按智能体保存的权限设置。
- 新版 Harness 使用 ACP `configOptions` 列出供应商及模型；模型、思考强度通过 `session/set_config_option` 切换。
- 提取 API 模型视图与权限预设函数，保留上游文件长度规则。
- Windows 原生依赖使用上游临时目录构建器编译并校验加载，避开长目录下 MSVC 输出路径错误。
- 将 Harness 的 npm 锁文件纳入版本管理，支持干净环境下的 `npm ci`。

## 验证记录

- 全项目类型检查已通过；最终打包过程中继续核验。
- 保留功能测试：23 个文件，193 项通过。
- 会话、模型、权限和发送逻辑测试：9 个文件，108 项通过（与上一组有重叠）。
- 权限与设置持久化回归：7 个文件，61 项通过（与其他组有重叠）。
- Harness 真实进程检查：ACP 初始化成功；两个模拟 API、四条模型路由（包含同名模型）；跨供应商往返切换成功；思考强度切换到 high 成功。
- 检查使用本地模拟地址，不消耗真实模型服务额度。
- 桌面隐藏窗口检查：未打开工作区时菜单常驻；侧栏折叠后五个菜单无遮挡，拖动区与点击区属性正确。
- 桌面模型检查：首次消息前显示两个供应商、四条模型路由、两个同名模型；可以跨供应商切换，未发送任何对话请求。
- 所有 75 个本地新增文件均保留；API/协同/菜单等修改已和上游进行三方合并。
- Windows 安装包：构建中，完成后补充结果。

## 本地核验输出

- `work/upstream-feature-tests.txt`
- `work/upstream-session-tests.txt`
- `work/upstream-harness-smoke.txt`
- `work/upstream-typecheck.txt`
- `work/upstream-windows-build.txt`
- `work/upstream-windows-build-final.txt`
- `work/upstream-settings-tests.txt`
- `work/upstream-menu-ui.txt`
- `work/upstream-models-ui.txt`

Harness 版本字段的独立副本、补丁、验证记录、回滚脚本位于：

- `work/upstream-update-20261021/MODIFIED_FILE.json`
- `work/upstream-update-20261021/DIFF_FILE.patch`
- `work/upstream-update-20261021/VERIFICATION.txt`
- `work/upstream-update-20261021/ROLLBACK.sh`

版本字段检查：基线输出 `0.2.0-rc.2`，修改后输出 `0.2.1-rc.2`，独立回滚副本输出 `0.2.0-rc.2`；全部命令退出码为 0，回滚后哈希和原文件一致。

## 恢复方式

原代码由恢复点分支保留。需要恢复旧版时，先另存本次更新后的改动，再切回 `backup/pre-upstream-20261021`；不会自动更改现有账号或 API 密钥。

本次合并在本地更新分支完成；GitHub 推送单独执行。
