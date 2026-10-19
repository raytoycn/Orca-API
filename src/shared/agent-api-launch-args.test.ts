import { expect, it } from 'vitest'
import { configureAgentApiEnvironment } from './agent-api-connection'
import { agentApiLaunchArguments } from './agent-api-launch-args'
import { resolveAgentStartupPlanInputs } from './agent-startup-plan-inputs'
import { buildAgentStartupPlan } from './tui-agent-startup'
import { tokenizeStartupCommand } from './tui-agent-startup-shell'
import { structuredAgentConfiguredArgs } from '../main/native-chat/structured-agent-configured-args'

it.each(['posix', 'powershell', 'cmd'] as const)(
  'passes Codex API overrides once through the %s terminal and structured launch',
  (shell) => {
    const env = configureAgentApiEnvironment(
      {},
      {
        agent: 'codex',
        protocol: 'openai-responses',
        baseUrl: 'https://api.example.test/v1',
        model: 'fixture-model',
        apiKey: 'fixture-secret',
        credentialType: 'api-key'
      }
    )
    const args = agentApiLaunchArguments(env)
    const settings = { agentDefaultEnv: { codex: env }, agentDefaultArgs: { codex: '' } }
    const inputs = resolveAgentStartupPlanInputs({
      agent: 'codex',
      settings,
      platform: shell === 'posix' ? 'linux' : 'win32',
      shell,
      isRemote: false
    })
    const plan = buildAgentStartupPlan({ ...inputs, prompt: '', allowEmptyPromptLaunch: true })
    expect(plan).not.toBeNull()
    const parsed = tokenizeStartupCommand(plan?.launchCommand ?? '', shell)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.tokens.slice(1)).toEqual(args)
    }
    expect(plan?.launchCommand).not.toContain('fixture-secret')
    expect(structuredAgentConfiguredArgs('codex', settings, 'linux')).toEqual(args)
  }
)
