import { z } from 'zod'

export const ORCA_COLLABORATION_ROLE_LIMIT = 8

export type OrcaProviderModel = {
  providerId: string
  model: string
}

export function isOrcaProviderModel(value: string): boolean {
  return parseOrcaProviderModel(value) !== null
}

export function parseOrcaProviderModel(value: string): OrcaProviderModel | null {
  if (!value || value.length > 512) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      /^orca-[a-f0-9]{64}$/.test(parsed[0]) &&
      typeof parsed[1] === 'string' &&
      parsed[1].trim().length > 0
    ) {
      return { providerId: parsed[0], model: parsed[1] }
    }
  } catch {
    return null
  }
  return null
}

const RoleText = (max: number): z.ZodString =>
  z
    .string()
    .max(max)
    .refine((value) => !/[\r\n\0]/.test(value), 'Role text cannot contain line breaks')

export const OrcaCollaborationRole = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores'),
    name: RoleText(64),
    duty: RoleText(300),
    model: RoleText(512).refine(
      (value) => value.length === 0 || isOrcaProviderModel(value),
      'Choose a provider-qualified Orca Agent model'
    ),
    effort: z.enum(['off', 'low', 'medium', 'high'])
  })
  .strict()

const OrcaCollaborationSettingsSchema = z
  .object({
    mode: z.enum(['single', 'multi-role']),
    singleEffort: z.enum(['off', 'low', 'medium', 'high']),
    coordinatorRoleId: z.string().trim().min(1).max(64),
    roles: z.array(OrcaCollaborationRole).min(1).max(ORCA_COLLABORATION_ROLE_LIMIT)
  })
  .strict()
  .superRefine((settings, context) => {
    const ids = new Set<string>()
    for (const [index, role] of settings.roles.entries()) {
      if (ids.has(role.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['roles', index, 'id'],
          message: 'Role IDs must be unique'
        })
      }
      ids.add(role.id)
    }
    if (!ids.has(settings.coordinatorRoleId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coordinatorRoleId'],
        message: 'The coordinator role must exist'
      })
    }
  })

export type OrcaCollaborationRole = z.infer<typeof OrcaCollaborationRole>
export type OrcaAgentCollaborationSettings = z.infer<typeof OrcaCollaborationSettingsSchema>

export function defaultOrcaAgentCollaborationSettings(): OrcaAgentCollaborationSettings {
  return {
    mode: 'single',
    singleEffort: 'high',
    coordinatorRoleId: 'role-c',
    roles: [
      {
        id: 'role-a',
        name: 'A · 代码写作',
        duty: '按协调角色的方案修改代码、运行测试并完成整改。',
        model: '',
        effort: 'high'
      },
      {
        id: 'role-b',
        name: 'B · 项目知识',
        duty: '只读检索代码、文档和历史决策，提供带来源的相关资料。',
        model: '',
        effort: 'medium'
      },
      {
        id: 'role-c',
        name: 'C · 分析统筹',
        duty: '分析需求、制定方案、派工、处理审查报告并完成最终验收。',
        model: '',
        effort: 'high'
      },
      {
        id: 'role-d',
        name: 'D · 代码审查',
        duty: '独立审查指定版本、复现问题、核验测试并将问题报告给协调角色。',
        model: '',
        effort: 'high'
      }
    ]
  }
}

export function newOrcaCollaborationRole(index: number): OrcaCollaborationRole {
  return {
    id: `role-${index}-${Date.now().toString(36)}`,
    name: `角色 ${index}`,
    duty: '说明这个角色负责什么，以及应向协调角色交付什么。',
    model: '',
    effort: 'medium'
  }
}

export function normalizeOrcaAgentCollaborationSettings(
  settings: OrcaAgentCollaborationSettings
): OrcaAgentCollaborationSettings {
  return OrcaCollaborationSettingsSchema.parse(settings)
}

export function missingOrcaCollaborationModels(
  settings: OrcaAgentCollaborationSettings
): OrcaCollaborationRole[] {
  return settings.roles.filter((role) => !isOrcaProviderModel(role.model))
}

export function isOrcaCollaborationReady(settings: OrcaAgentCollaborationSettings): boolean {
  return settings.roles.length >= 2 && missingOrcaCollaborationModels(settings).length === 0
}

export function orcaCollaborationPrompt(
  request: string,
  settings: OrcaAgentCollaborationSettings
): string {
  const coordinator =
    settings.roles.find((role) => role.id === settings.coordinatorRoleId) ?? settings.roles[0]
  if (!coordinator || !isOrcaCollaborationReady(settings)) {
    throw new Error('Configure every collaboration role before starting a multi-role task.')
  }
  return [
    `本次任务使用 Orca 多角色协同。协调角色固定为“${coordinator.name}”，由它负责最终决策。`,
    '你是协调角色。请实际使用 Orca 编排，不要模拟或口头代替其他角色的工作。',
    '先通过 ORCA_CLI_COMMAND 指定的本应用 CLI 运行 `skills get orchestration`，读取与当前二进制匹配的指南。',
    '按照指南创建或绑定 Run，使用 task-create、worker-start、check、gate 和 worker_done 流程。',
    '除协调角色外，每个参与者都使用 orca-agent 引擎、当前工作区和下表中的完整 model 值；传给 worker-start 的 --model 必须保留供应商限定值，不能修改全局 API 配置。',
    '检查启动回执的 launch.effective；模型不匹配或结构化聊天不可用时停止该派工并报告，不能静默退回默认模型。',
    `协同角色：${JSON.stringify(
      settings.roles.map((role) => ({
        id: role.id,
        name: role.name,
        duty: role.duty,
        model: role.model,
        effort: role.effort,
        coordinator: role.id === coordinator.id
      }))
    )}`,
    '先让知识角色按需检索并给出证据，再由协调角色确认方案和验收标准后派工。',
    '写代码、测试和整改交给具有写入职责的角色；审查角色独立检查指定候选版本，并把问题报告给协调角色。',
    '审查开始时必须绑定候选提交和测试记录。代码变化后，旧审查结论失效。',
    '默认最多两个活跃 worker、一个代码写入者；worker 不继续派生 worker。只并行互不冲突的任务。',
    '审查报告交给协调角色，由它决定验收或整改。默认最多自动整改两轮，之后暂停并报告阻塞点。',
    '交接只传摘要和证据路径，不广播完整历史；角色职责不等于额外工具权限，仍遵守各会话实际批准设置。',
    '最终汇报实际参与者、有效供应商和模型、修改版本、测试、审查结论、用量记录和遗留问题。',
    '以下是用户本次需求：',
    request
  ].join('\n\n')
}
