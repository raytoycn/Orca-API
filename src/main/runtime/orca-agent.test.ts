import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AgentApiConnection,
  clearAgentApiEnvironment,
  configureAgentApiEnvironment
} from '../../shared/agent-api-connection'
import { prepareAgentApiProfile } from './agent-api-profile'
import { structuredAgentRuntimeRegistration } from './structured-agent-runtime-registrations'
import { decideAgentLaunchMode } from '../agent-launch/agent-launch-mode'
import { AcpStructuredOptions } from '../acp/acp-structured-options'

describe('built-in Orca Agent', () => {
  it('registers an ACP chat without requiring the experimental chat switch', () => {
    expect(structuredAgentRuntimeRegistration('orca-agent')?.definition).toMatchObject({
      agent: 'orca-agent',
      handleTransport: 'acp',
      accountHomeVariable: 'DSH_HOME',
      capabilities: { approvalEnforcement: 'orca', rewind: false, compact: false }
    })
    expect(
      decideAgentLaunchMode({
        placement: { agent: 'orca-agent', workspaceKind: 'git-worktree' },
        settings: { experimentalNativeChat: false }
      }).mode
    ).toBe('structured')
  })

  it('persists every API route without embedding credentials and clears its environment', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orca-agent-api-'))
    try {
      const first = AgentApiConnection.parse({
        agent: 'orca-agent',
        protocol: 'openai-completions',
        baseUrl: 'https://one.example/v1',
        apiKey: 'secret-one',
        model: 'first'
      })
      const connections = [
        first,
        { ...first, model: 'second' },
        { ...first, model: 'third', apiKey: 'secret-two', baseUrl: 'https://two.example/v1' }
      ]
      const env = {
        ...configureAgentApiEnvironment({ KEEP: 'yes' }, first, connections),
        ...(await prepareAgentApiProfile(first, home, connections))
      }
      const content = await readFile(env.ORCA_HARNESS_PATCH, 'utf8')
      expect(env.ORCA_HARNESS_PATCH).toMatch(/cordis\.patch\.yml$/)
      expect(content).toContain('second')
      expect(content).toContain('third')
      expect(content).toContain('ORCA_API_MODEL_KEY_1')
      expect(content).not.toContain('secret-one')
      expect(content).not.toContain('secret-two')
      expect(env.ORCA_API_MODEL_KEY_0).toBe('secret-one')
      expect(env.ORCA_API_MODEL_KEY_1).toBe('secret-two')
      expect(env.DSH_HOME).toBe(join(home, 'orca-agent'))
      expect(clearAgentApiEnvironment(env, 'orca-agent')).toEqual({ KEEP: 'yes' })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('projects Harness grouped models and reasoning selections into the Orca picker', () => {
    const options = new AcpStructuredOptions()
    options.adoptSession(
      {
        configOptions: [
          {
            id: 'model',
            name: 'Model',
            type: 'select',
            category: 'model',
            currentValue: '["a","first"]',
            options: [
              {
                group: 'a',
                name: 'API A',
                options: [
                  { value: '["a","first"]', name: 'first' },
                  { value: '["a","second"]', name: 'second' }
                ]
              },
              { group: 'b', name: 'API B', options: [{ value: '["b","third"]', name: 'third' }] }
            ]
          },
          {
            id: 'reasoning_effort',
            name: 'Effort',
            type: 'select',
            category: 'thought_level',
            currentValue: 'high',
            options: [{ value: 'high', name: 'High' }]
          }
        ]
      },
      'new'
    )
    expect(options.read().models).toHaveLength(3)
    expect(options.write('model', '["b","third"]')).toEqual({
      method: 'config',
      configId: 'model',
      value: '["b","third"]'
    })
    expect(options.write('effort', 'high')).toEqual({
      method: 'config',
      configId: 'reasoning_effort',
      value: 'high'
    })
  })
})
