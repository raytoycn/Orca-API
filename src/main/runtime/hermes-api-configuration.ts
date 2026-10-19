import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { isMap, parseDocument } from 'yaml'
import { z } from 'zod'
import type { AgentLaunchSettingsMutation } from '../../shared/agent-launch-settings'
import type { AgentApiConnection } from '../../shared/agent-api-connection'
import { agentApiCatalogGroups } from '../../shared/agent-api-model-catalog'
import { DEFAULT_API_CONTEXT_WINDOW } from '../../shared/agent-api-presets'
import { writeConfigFile } from '../hermes/hermes-home-filesystem'
import { writeFileAtomically } from '../codex-accounts/fs-utils'

const Ledger = z.object({ before: z.string().nullable(), applied: z.string() })
function document(source: string) {
  const parsed = parseDocument(source || '{}')
  if (parsed.errors.length || !isMap(parsed.contents)) {
    throw new Error('Hermes config.yaml must be a valid mapping')
  }
  return parsed
}

export function applyHermesApiConfiguration(
  mutation: AgentLaunchSettingsMutation,
  env: Record<string, string>,
  userData: string,
  processEnv: NodeJS.ProcessEnv = process.env,
  connections: readonly AgentApiConnection[] = []
): (() => void) | null {
  const setting = mutation.type === 'api-set' && mutation.connection.agent === 'hermes'
  const clearing =
    mutation.type === 'api-clear' &&
    mutation.agent === 'hermes' &&
    env.ORCA_HERMES_NATIVE_API === '1'
  if (!setting && !clearing) {
    return null
  }
  const home =
    env.HERMES_HOME ||
    processEnv.HERMES_HOME ||
    (process.platform === 'win32'
      ? join(processEnv.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'hermes')
      : join(homedir(), '.hermes'))
  const target = join(home, 'config.yaml')
  const original = existsSync(target) ? readFileSync(target, 'utf8') : null
  const current = document(original ?? '')
  const ledgerPath = join(
    userData,
    'agent-api-backups',
    `hermes-${createHash('sha256').update(target).digest('hex')}.json`
  )
  const oldLedgerBytes = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : null
  const previous =
    oldLedgerBytes && env.ORCA_HERMES_NATIVE_API === '1'
      ? Ledger.parse(JSON.parse(oldLedgerBytes))
      : null
  let next: string | null
  if (setting && mutation.type === 'api-set') {
    const input = mutation.connection
    const mode = {
      'openai-completions': 'chat_completions',
      'openai-responses': 'codex_responses',
      'anthropic-messages': 'anthropic_messages',
      'google-genai': 'chat_completions',
      'agent-service': 'chat_completions'
    }[input.protocol]
    if (connections.length > 0) {
      if (current.has('providers') && !isMap(current.get('providers', true))) {
        throw new Error('Hermes providers must be a mapping')
      }
      const previousProviders = previous ? document(previous.applied).get('providers', true) : null
      const providerMap = current.get('providers', true)
      if (isMap(providerMap)) {
        for (const pair of providerMap.items.slice()) {
          const name = String(pair.key)
          if (name !== 'orca-api' && !/^orca-api-\d+$/.test(name)) {
            continue
          }
          if (
            !isMap(previousProviders) ||
            !isDeepStrictEqual(providerMap.get(name), previousProviders.get(name))
          ) {
            throw new Error('Hermes API provider changed outside Orca')
          }
          current.deleteIn(['providers', name])
        }
      }
      for (const group of agentApiCatalogGroups(input, connections)) {
        current.setIn(['providers', group.id], {
          name: group.id,
          base_url: group.connection.baseUrl,
          api_key_env: group.keyEnv,
          api_mode:
            group.connection.protocol === 'anthropic-messages'
              ? 'anthropic_messages'
              : group.connection.protocol === 'openai-responses'
                ? 'codex_responses'
                : 'chat_completions',
          models: Object.fromEntries(
            group.models.map((model) => [
              model.model,
              { context_length: model.contextWindow ?? DEFAULT_API_CONTEXT_WINDOW }
            ])
          )
        })
      }
    }
    const priorModel = current.get('model')
    if (isMap(priorModel)) {
      for (const [key, value] of Object.entries({
        default: input.model,
        provider: 'custom',
        base_url: input.baseUrl,
        api_key: '${ORCA_MODEL_API_KEY}',
        api_mode: mode
      })) {
        current.setIn(['model', key], value)
      }
    } else {
      current.set('model', {
        default: input.model,
        provider: 'custom',
        base_url: input.baseUrl,
        api_key: '${ORCA_MODEL_API_KEY}',
        api_mode: mode
      })
    }
    next = current.toString()
    mkdirSync(dirname(ledgerPath), { recursive: true })
    writeFileAtomically(
      ledgerPath,
      JSON.stringify({ before: previous ? previous.before : original, applied: next }),
      { mode: 0o600 }
    )
  } else {
    if (!previous) {
      throw new Error('Hermes API backup is missing')
    }
    if (original === previous.applied) {
      next = previous.before
    } else {
      const managed = document(previous.applied)
      if (!isDeepStrictEqual(current.toJS().model, managed.toJS().model)) {
        throw new Error(
          'Hermes model configuration changed outside Orca; keep the current file and reconcile before clearing'
        )
      }
      const before = document(previous.before ?? '')
      const managedProviders = managed.get('providers', true)
      if (isMap(managedProviders)) {
        for (const pair of managedProviders.items) {
          const name = String(pair.key)
          if (name !== 'orca-api' && !/^orca-api-\d+$/.test(name)) {
            continue
          }
          if (
            !isDeepStrictEqual(
              current.getIn(['providers', name]),
              managed.getIn(['providers', name])
            )
          ) {
            throw new Error('Hermes API provider changed outside Orca')
          }
          current.deleteIn(['providers', name])
        }
        const providers = current.get('providers', true)
        if (isMap(providers) && providers.items.length === 0 && !before.has('providers')) {
          current.delete('providers')
        }
      }
      if (before.has('model')) {
        current.set('model', before.get('model', true))
      } else {
        current.delete('model')
      }
      next = current.toString()
    }
  }
  const restore = (contents: string | null) => {
    if (contents === null) {
      rmSync(target, { force: true })
    } else {
      mkdirSync(dirname(target), { recursive: true })
      writeConfigFile(target, contents)
    }
  }
  try {
    restore(next)
    if (!setting) {
      rmSync(ledgerPath, { force: true })
    }
  } catch (error) {
    if (oldLedgerBytes !== null) {
      writeFileAtomically(ledgerPath, oldLedgerBytes, { mode: 0o600 })
    } else {
      rmSync(ledgerPath, { force: true })
    }
    throw error
  }
  return () => {
    const live = existsSync(target) ? readFileSync(target, 'utf8') : null
    if (live !== next) {
      throw new Error('Hermes rollback conflict: config.yaml changed after API save')
    }
    restore(original)
    if (oldLedgerBytes !== null) {
      writeFileAtomically(ledgerPath, oldLedgerBytes, { mode: 0o600 })
    } else {
      rmSync(ledgerPath, { force: true })
    }
  }
}
