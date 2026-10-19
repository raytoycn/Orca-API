import { describe, expect, it } from 'vitest'
import {
  defaultOrcaAgentCollaborationSettings,
  isOrcaCollaborationReady,
  normalizeOrcaAgentCollaborationSettings,
  orcaCollaborationPrompt,
  parseOrcaProviderModel
} from './orca-agent-collaboration'

const providerA = `orca-${'a'.repeat(64)}`
const providerB = `orca-${'b'.repeat(64)}`

describe('Orca Agent collaboration', () => {
  it('starts with four customizable roles and the C coordinator', () => {
    const settings = defaultOrcaAgentCollaborationSettings()
    expect(settings.mode).toBe('single')
    expect(settings.roles.map((role) => role.name)).toEqual([
      'A · 代码写作',
      'B · 项目知识',
      'C · 分析统筹',
      'D · 代码审查'
    ])
    expect(settings.coordinatorRoleId).toBe('role-c')
  })

  it('keeps same-named models distinct by provider', () => {
    expect(parseOrcaProviderModel(JSON.stringify([providerA, 'qwen3.8']))).toEqual({
      providerId: providerA,
      model: 'qwen3.8'
    })
    expect(parseOrcaProviderModel(JSON.stringify([providerB, 'qwen3.8']))).toEqual({
      providerId: providerB,
      model: 'qwen3.8'
    })
  })

  it('accepts custom role counts and builds an orchestration handoff', () => {
    const settings = normalizeOrcaAgentCollaborationSettings({
      mode: 'multi-role',
      singleEffort: 'high',
      coordinatorRoleId: 'lead',
      roles: [
        {
          id: 'writer',
          name: '实现角色',
          duty: '写代码并运行测试',
          model: JSON.stringify([providerA, 'code-model']),
          effort: 'high'
        },
        {
          id: 'lead',
          name: '统筹角色',
          duty: '派工和验收',
          model: JSON.stringify([providerB, 'plan-model']),
          effort: 'medium'
        },
        {
          id: 'audit',
          name: '审查角色',
          duty: '审查指定提交',
          model: JSON.stringify([providerA, 'review-model']),
          effort: 'high'
        }
      ]
    })
    expect(isOrcaCollaborationReady(settings)).toBe(true)
    const prompt = orcaCollaborationPrompt('修复登录问题', settings)
    expect(prompt).toContain('协调角色固定为“统筹角色”')
    expect(prompt).toContain('实现角色')
    expect(prompt).toContain('审查角色')
    expect(prompt).toContain(providerA)
    expect(prompt).toContain('review-model')
    expect(prompt).toContain('修复登录问题')
  })

  it('does not call an incomplete team ready', () => {
    const settings = defaultOrcaAgentCollaborationSettings()
    settings.mode = 'multi-role'
    settings.roles[0]!.model = JSON.stringify([providerA, 'code-model'])
    expect(isOrcaCollaborationReady(settings)).toBe(false)
  })
})
