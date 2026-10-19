import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import { expect, it } from 'vitest'
import { prepareAgentApiCatalogEnvironment } from './agent-api-catalog-environment'
import { applyKimiApiConfiguration } from './kimi-api-configuration'
import { applyHermesApiConfiguration } from './hermes-api-configuration'
import {
  configureAgentApiEnvironment,
  type AgentApiConnection
} from '../../shared/agent-api-connection'
import { agentApiProfileContent } from '../../shared/agent-api-profile-content'
import { agentApiCatalogConnections } from '../../shared/agent-api-model-catalog'

const base: AgentApiConnection = {
  agent: 'kimi',
  protocol: 'openai-completions',
  baseUrl: 'https://first.test/v1',
  model: 'first',
  apiKey: 'first-secret',
  credentialType: 'api-key'
}
const connections = [
  base,
  { ...base, model: 'second' },
  { ...base, baseUrl: 'https://other.test/v1', model: 'third', apiKey: 'other-secret' }
]

it('expands one saved API model catalog into native per-model routes', () => {
  const active = { ...base, contextWindow: 1000000 }
  const preset = {
    id: 'provider-a',
    name: 'Provider A',
    connection: base,
    models: [
      { id: 'first', name: 'First', contextWindow: 1000000 },
      { id: 'second', name: 'Second', contextWindow: 2000000 }
    ]
  }
  expect(agentApiCatalogConnections(active, [preset])).toEqual([
    active,
    { ...base, model: 'second', contextWindow: 2000000 }
  ])
})

it('Kimi reads all models from native configuration, preserves existing providers and restores exact bytes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'orca-kimi-catalog-'))
  const original =
    '# user settings\ntelemetry = false\ndefault_model = "mine"\n[providers.mine]\ntype = "openai"\napi_key = "my-existing-key"\n[models.mine]\nprovider = "mine"\nmodel = "mine"\nmax_context_size = 4096\n'
  try {
    const file = join(home, 'config.toml')
    await writeFile(file, original)
    const env: Record<string, string> = {
      KIMI_CODE_HOME: home,
      ...(await prepareAgentApiCatalogEnvironment(base, home, connections))
    }
    const rollback = applyKimiApiConfiguration(
      { type: 'api-set', connection: base },
      env,
      home,
      connections
    )
    const configured = await readFile(file, 'utf8')
    const document = parse(configured)
    expect(Object.keys(document.models)).toEqual([
      'mine',
      'orca-api/first',
      'orca-api/second',
      'orca-api-1/third'
    ])
    expect(document.default_model).toBe('orca-api/first')
    expect(configured).not.toContain('first-secret')
    expect(env.KIMI_MODEL_NAME).toBe('')
    expect(env.ORCA_API_MODEL_KEY_1).toBe('other-secret')
    rollback?.()
    expect(await readFile(file, 'utf8')).toBe(original)
    applyKimiApiConfiguration({ type: 'api-set', connection: base }, env, home, connections)
    applyKimiApiConfiguration({ type: 'api-clear', agent: 'kimi' }, env, home)
    expect(await readFile(file, 'utf8')).toBe(original)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('Pi, OpenCode and Qwen retain three models across two independently authenticated providers', async () => {
  for (const agent of ['pi', 'opencode', 'qwen-code'] as const) {
    const active = { ...base, agent },
      all = connections.map((model) => ({ ...model, agent }))
    const profile = agentApiProfileContent(active, all)
    const env = configureAgentApiEnvironment({}, active, all)
    const catalog = JSON.parse(profile?.content ?? env.OPENCODE_CONFIG_CONTENT)
    if (agent === 'pi') {
      expect(catalog.providers['orca-api'].models.map((model: { id: string }) => model.id)).toEqual(
        ['first', 'second']
      )
      expect(catalog.providers['orca-api-1'].models[0].id).toBe('third')
      expect(catalog.providers['orca-api-1'].apiKey).toBe('${ORCA_API_MODEL_KEY_1}')
    } else if (agent === 'opencode') {
      expect(Object.keys(catalog.provider['orca-api'].models)).toEqual(['first', 'second'])
      expect(catalog.provider['orca-api-1'].options.apiKey).toBe('{env:ORCA_API_MODEL_KEY_1}')
      expect(env.ORCA_API_MODEL_KEY_1).toBe('other-secret')
    } else {
      expect(catalog.modelProviders.openai.map((model: { id: string }) => model.id)).toEqual([
        'first',
        'second',
        'third'
      ])
    }
    expect(JSON.stringify(catalog)).not.toContain('first-secret')
  }
})

it('Hermes exposes all configured models to its native provider picker and clears them on removal', async () => {
  const home = await mkdtemp(join(tmpdir(), 'orca-hermes-catalog-'))
  const active = { ...base, agent: 'hermes' } as const,
    all = connections.map((model) => ({ ...model, agent: 'hermes' as const }))
  const original = '# preferences\nmodel: previous\nagent:\n  max_turns: 12\n'
  try {
    await mkdir(home, { recursive: true })
    await writeFile(join(home, 'config.yaml'), original)
    const env = { HERMES_HOME: home, ORCA_HERMES_NATIVE_API: '1' }
    applyHermesApiConfiguration({ type: 'api-set', connection: active }, env, home, {}, all)
    const document = parseYaml(await readFile(join(home, 'config.yaml'), 'utf8'))
    expect(Object.keys(document.providers['orca-api'].models)).toEqual(['first', 'second'])
    expect(document.providers['orca-api-1'].api_key_env).toBe('ORCA_API_MODEL_KEY_1')
    applyHermesApiConfiguration({ type: 'api-clear', agent: 'hermes' }, env, home)
    expect(await readFile(join(home, 'config.yaml'), 'utf8')).toBe(original)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
