import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError, type RuntimeClient, type RuntimeRpcSuccess } from '../runtime-client'
import { parseCliAgent } from '../agent-launch-request'
import { AgentApiAgent, AGENT_API_PROTOCOLS } from '../../shared/agent-api-connection-schema'
import { AgentApiModelsRequest } from '../../shared/agent-api-models'
import {
  isOrcaAgentBridgeableApiPreset,
  uniqueOrcaAgentApiPresets
} from '../../shared/agent-api-model-catalog'
import type { AgentApiPresetSummary } from '../../shared/agent-api-presets'
import type { AgentLaunchSettings } from '../../shared/agent-launch-settings'
import type { AgentSessionModelCatalogResult } from '../../shared/agent-session-wire'
import type { TuiAgent } from '../../shared/tui-agent'
import { formatModelsList, formatModelsUse, type ModelsListEntry } from './models-format'

const MODEL_AGENTS = [
  'orca-agent',
  'claude',
  'codex',
  'grok',
  'opencode',
  'opencode2',
  'omp',
  'antigravity',
  'pi',
  'kimi',
  'hermes',
  'cursor',
  'trae',
  'devin',
  'gemini',
  'qwen-code',
  'aider',
  'goose',
  'claude-agent-teams'
] as const

type ModelSource =
  | { kind: 'api'; preset: AgentApiPresetSummary }
  | { kind: 'account'; agent: string }

type CollectedModel = ModelsListEntry & { sourceKind: ModelSource }

async function readAgentLaunchSettings(client: RuntimeClient): Promise<AgentLaunchSettings> {
  const response = await client.call<{ settings: AgentLaunchSettings }>(
    'settings.getAgentLaunch',
    undefined
  )
  return response.result.settings
}

async function readApiModels(
  client: RuntimeClient,
  preset: AgentApiPresetSummary
): Promise<AgentApiPresetSummary['models']> {
  const request = AgentApiModelsRequest.safeParse({
    agent: preset.connection.agent,
    protocol: preset.connection.protocol,
    baseUrl: preset.connection.baseUrl,
    credentialType: preset.connection.credentialType,
    presetId: preset.id
  })
  if (!request.success) {
    return preset.models ?? []
  }
  try {
    const response = await client.call<AgentApiPresetSummary['models']>(
      'settings.listAgentApiModels',
      request.data,
      { timeoutMs: 20_000 }
    )
    return response.result ?? preset.models ?? []
  } catch {
    return preset.models ?? []
  }
}

async function readAccountModels(
  client: RuntimeClient,
  agent: string
): Promise<AgentSessionModelCatalogResult | null> {
  try {
    const response = await client.call<AgentSessionModelCatalogResult>(
      'agentSession.modelCatalog',
      { agent, savedOnly: true },
      { timeoutMs: 20_000 }
    )
    return response.result
  } catch {
    return null
  }
}

async function collectModels(
  client: RuntimeClient,
  agentFilter: string | undefined,
  sourceFilter: 'api' | 'account' | undefined
): Promise<CollectedModel[]> {
  const settings = await readAgentLaunchSettings(client)
  const presets = uniqueOrcaAgentApiPresets(settings.apiPresets ?? []).filter(
    (preset) => agentFilter === undefined || preset.connection.agent === agentFilter
  )
  const models: CollectedModel[] = []
  if (sourceFilter === undefined || sourceFilter === 'api') {
    for (const preset of presets) {
      const apiModels = await readApiModels(client, preset)
      for (const model of apiModels ?? []) {
        models.push({
          agent: preset.connection.agent,
          source: 'api',
          provider: preset.name,
          model: model.id,
          label: model.name,
          ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
          switchable: true,
          sourceKind: { kind: 'api', preset: { ...preset, models: apiModels ?? [] } }
        })
      }
    }
  }
  if (sourceFilter === undefined || sourceFilter === 'account') {
    const agents = agentFilter === undefined ? MODEL_AGENTS : [agentFilter]
    for (const agent of agents) {
      const catalog = await readAccountModels(client, agent)
      if (!catalog || catalog.origin === 'unknown' || !('models' in catalog)) {
        continue
      }
      for (const model of catalog.models) {
        models.push({
          agent,
          source: 'account',
          provider: model.provider?.label ?? agent,
          model: model.id,
          label: model.label,
          switchable: false,
          sourceKind: { kind: 'account', agent }
        })
      }
    }
  }
  return models.sort(
    (left, right) =>
      left.agent.localeCompare(right.agent) ||
      left.source.localeCompare(right.source) ||
      left.provider.localeCompare(right.provider) ||
      left.model.localeCompare(right.model)
  )
}

function parseSourceFilter(value: string | undefined): 'api' | 'account' | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value !== 'api' && value !== 'account') {
    throw new RuntimeClientError('invalid_argument', '--source must be api or account')
  }
  return value
}

function parseAgentFilter(value: string | undefined): TuiAgent | undefined {
  return value === undefined ? undefined : parseCliAgent(value)
}

function matchModel(entry: CollectedModel, model: string): boolean {
  return entry.model === model || entry.label === model
}

function printModelsList(models: readonly CollectedModel[], json: boolean): void {
  const result = { models: models.map(({ sourceKind: _sourceKind, ...entry }) => entry) }
  const response = {
    id: 'models-list',
    ok: true,
    result,
    _meta: { runtimeId: 'cli' }
  } as RuntimeRpcSuccess<{ models: ModelsListEntry[] }>
  printResult(response, json, formatModelsList)
}

export const MODELS_HANDLERS: Record<string, CommandHandler> = {
  'models list': async ({ flags, client, json }: HandlerContext) => {
    const agent = parseAgentFilter(getOptionalStringFlag(flags, 'agent'))
    const source = parseSourceFilter(getOptionalStringFlag(flags, 'source'))
    const models = await collectModels(client, agent, source)
    printModelsList(models, json)
  },
  'models use': async ({ flags, client, json }: HandlerContext) => {
    const model = getRequiredStringFlag(flags, 'model')
    const targetAgent = parseAgentFilter(getOptionalStringFlag(flags, 'agent')) ?? 'orca-agent'
    const models = await collectModels(client, undefined, 'api')
    const matches = models.filter((entry) => matchModel(entry, model))
    if (matches.length === 0) {
      throw new RuntimeClientError(
        'invalid_argument',
        `No API-backed model "${model}" is currently available. Run \`orca models list --source api\` first.`
      )
    }
    const targetMatches =
      targetAgent === 'orca-agent'
        ? matches.filter(
            (entry) =>
              entry.agent === 'orca-agent' ||
              (entry.sourceKind.kind === 'api' &&
                isOrcaAgentBridgeableApiPreset(entry.sourceKind.preset))
          )
        : matches.filter((entry) => entry.agent === targetAgent)
    if (targetMatches.length === 0) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Model "${model}" is not available for ${targetAgent}. Run \`orca models list --agent ${targetAgent}\` to see its models.`
      )
    }
    if (targetMatches.length > 1) {
      const choices = targetMatches
        .map((entry) => `${entry.agent} · ${entry.provider} · ${entry.model}`)
        .join('\n')
      throw new RuntimeClientError(
        'invalid_argument',
        `Model "${model}" matches multiple API presets. Pass --agent to choose one:\n${choices}`
      )
    }
    const entry = targetMatches[0]!
    if (entry.sourceKind.kind !== 'api') {
      throw new RuntimeClientError(
        'invalid_argument',
        `Model "${model}" is account-backed. Account models cannot be switched from the CLI.`
      )
    }
    const parsedTargetAgent = AgentApiAgent.safeParse(targetAgent)
    if (!parsedTargetAgent.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        `${targetAgent} does not support API model switching.`
      )
    }
    const sourcePreset = entry.sourceKind.preset
    if (targetAgent !== sourcePreset.connection.agent) {
      if (targetAgent !== 'orca-agent') {
        throw new RuntimeClientError(
          'invalid_argument',
          `Model "${model}" belongs to ${sourcePreset.connection.agent}; pass --agent orca-agent to bridge it.`
        )
      }
      if (!AGENT_API_PROTOCOLS['orca-agent'].includes(sourcePreset.connection.protocol)) {
        throw new RuntimeClientError(
          'invalid_argument',
          `Model "${model}" uses a protocol Orca Agent cannot bridge.`
        )
      }
    }
    const response = await client.call<{ settings: AgentLaunchSettings }>(
      'settings.mutateAgentLaunch',
      {
        type: 'api-preset-activate',
        agent: parsedTargetAgent.data,
        id: sourcePreset.id,
        model: entry.model,
        ...(entry.contextWindow ? { contextWindow: entry.contextWindow } : {})
      }
    )
    printResult(response, json, () =>
      formatModelsUse({
        agent: targetAgent,
        model: entry.model,
        provider: entry.provider
      })
    )
  }
}
