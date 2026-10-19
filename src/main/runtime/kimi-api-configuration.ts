import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parse, stringify } from 'smol-toml'
import { z } from 'zod'
import type { AgentLaunchSettingsMutation } from '../../shared/agent-launch-settings'
import type { AgentApiConnection } from '../../shared/agent-api-connection'
import { agentApiCatalogGroups } from '../../shared/agent-api-model-catalog'
import { DEFAULT_API_CONTEXT_WINDOW } from '../../shared/agent-api-presets'
import {
  writeFileAtomically,
  writeFileAtomicallyIfUnchanged,
  removeFileAtomicallyIfUnchanged
} from '../codex-accounts/fs-utils'

const Table = z.record(z.string(), z.unknown())
const Ledger = z.object({ before: z.string().nullable(), applied: z.string() })
const managed = (name: string): boolean =>
  name === 'orca-api' || /^orca-api-\d+(?:\/|$)/.test(name) || name.startsWith('orca-api/')
const table = (value: unknown) => Table.parse(value ?? {})

export function applyKimiApiConfiguration(
  mutation: AgentLaunchSettingsMutation,
  env: Record<string, string>,
  stateDirectory: string,
  connections: readonly AgentApiConnection[] = [],
  processEnv: NodeJS.ProcessEnv = process.env
): (() => void) | null {
  const setting = mutation.type === 'api-set' && mutation.connection.agent === 'kimi'
  const clearing =
    mutation.type === 'api-clear' && mutation.agent === 'kimi' && env.ORCA_KIMI_NATIVE_API === '1'
  if (!setting && !clearing) {
    return null
  }
  const target = join(
    env.KIMI_CODE_HOME || processEnv.KIMI_CODE_HOME || join(homedir(), '.kimi-code'),
    'config.toml'
  )
  const original = existsSync(target) ? readFileSync(target, 'utf8') : null
  const ledgerPath = join(
    stateDirectory,
    'agent-api-backups',
    `kimi-${createHash('sha256').update(target).digest('hex')}.json`
  )
  const oldLedger = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : null
  const previous = oldLedger ? Ledger.parse(JSON.parse(oldLedger)) : null
  const document: Record<string, unknown> = parse(original ?? '')
  const originalDocument = previous ? parse(previous.before ?? '') : null
  const appliedDocument = previous ? parse(previous.applied) : null
  for (const section of ['providers', 'models']) {
    const current = table(document[section])
    const expected = table(appliedDocument?.[section])
    for (const [name, value] of Object.entries(current)) {
      if (!managed(name)) {
        continue
      }
      if (!previous || !isDeepStrictEqual(value, expected[name])) {
        throw new Error('Kimi model catalog changed outside Orca; keep the current configuration')
      }
      delete current[name]
    }
    document[section] = current
  }
  if (setting && mutation.type === 'api-set') {
    const groups = agentApiCatalogGroups(mutation.connection, connections)
    const providers = table(document.providers),
      models = table(document.models)
    for (const group of groups) {
      providers[group.id] = {
        type: group.connection.protocol === 'anthropic-messages' ? 'anthropic' : 'openai',
        base_url: group.connection.baseUrl,
        api_key_env: group.keyEnv
      }
      for (const model of group.models) {
        models[`${group.id}/${model.model}`] = {
          provider: group.id,
          model: model.model,
          display_name: model.model,
          max_context_size: model.contextWindow ?? DEFAULT_API_CONTEXT_WINDOW,
          capabilities: ['tool_use']
        }
      }
    }
    document.providers = providers
    document.models = models
    document.default_model = `orca-api/${mutation.connection.model}`
  } else if (previous) {
    if (typeof document.default_model === 'string' && managed(document.default_model)) {
      if (originalDocument?.default_model !== undefined) {
        document.default_model = originalDocument.default_model
      } else {
        delete document.default_model
      }
    }
  } else {
    throw new Error('Kimi API backup is missing')
  }
  const next =
    clearing && previous && original === previous.applied ? previous.before : stringify(document)
  const restore = (expected: string | null, value: string | null): void => {
    mkdirSync(dirname(target), { recursive: true })
    const success =
      value === null
        ? expected === null || removeFileAtomicallyIfUnchanged(target, expected)
        : writeFileAtomicallyIfUnchanged(target, expected, value, { mode: 0o600 })
    if (!success) {
      throw new Error('Kimi configuration changed during API save')
    }
  }
  mkdirSync(dirname(ledgerPath), { recursive: true })
  restore(original, next)
  try {
    if (setting) {
      writeFileAtomically(
        ledgerPath,
        JSON.stringify({ before: previous ? previous.before : original, applied: next }),
        { mode: 0o600 }
      )
    } else {
      rmSync(ledgerPath, { force: true })
    }
  } catch (error) {
    restore(next, original)
    throw error
  }
  return () => {
    restore(next, original)
    if (oldLedger === null) {
      rmSync(ledgerPath, { force: true })
    } else {
      writeFileAtomically(ledgerPath, oldLedger, { mode: 0o600 })
    }
  }
}
