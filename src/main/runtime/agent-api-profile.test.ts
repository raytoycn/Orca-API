import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareAgentApiProfile } from './agent-api-profile'
import type { AgentApiConnection } from '../../shared/agent-api-connection'

describe('host-owned API launch profiles', () => {
  it('writes Pi provider and default model without putting the key in either file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-api-pi-'))
    try {
      const env = await prepareAgentApiProfile(
        {
          agent: 'pi',
          protocol: 'openai-completions',
          baseUrl: 'https://api.example.test/v1',
          model: 'fixture-model',
          apiKey: 'fixture-secret',
          credentialType: 'api-key',
          contextWindow: 131072
        },
        directory
      )
      const models = await readFile(join(env.PI_CODING_AGENT_DIR, 'models.json'), 'utf8')
      expect(models).not.toContain('fixture-secret')
      expect(JSON.parse(models).providers['orca-api']).toMatchObject({
        apiKey: '${ORCA_MODEL_API_KEY}',
        models: [{ id: 'fixture-model', contextWindow: 131072 }]
      })
      expect(
        JSON.parse(await readFile(join(env.PI_CODING_AGENT_DIR, 'settings.json'), 'utf8'))
      ).toEqual({ defaultProvider: 'orca-api', defaultModel: 'fixture-model' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it.each(['gemini', 'qwen-code'] as const)(
    'writes a credential-free %s profile and reuses it',
    async (agent) => {
      const directory = await mkdtemp(join(tmpdir(), 'orca-api-profile-'))
      const input: AgentApiConnection = {
        agent,
        protocol: agent === 'gemini' ? 'google-genai' : 'openai-completions',
        baseUrl: 'https://api.example.test/v1',
        model: 'fixture-model',
        apiKey: 'fixture-secret',
        credentialType: 'api-key'
      }
      try {
        const env = await prepareAgentApiProfile(input, directory)
        const location = Object.values(env)[0]
        const text = await readFile(location, 'utf8')
        expect(text).not.toContain(input.apiKey)
        expect(text).toContain(input.model)
        const config = JSON.parse(text)
        expect(config.security.auth.selectedType).toBe(
          agent === 'gemini' ? 'gemini-api-key' : 'openai'
        )
        expect(await prepareAgentApiProfile(input, directory)).toEqual(env)
        const second = await prepareAgentApiProfile({ ...input, model: 'other-model' }, directory)
        expect(second).not.toEqual(env)
        expect(await readFile(location, 'utf8')).toBe(text)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )
})
