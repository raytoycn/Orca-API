import { useRef, useState } from 'react'
import {
  DEFAULT_API_CONTEXT_WINDOW,
  type AgentApiPresetSummary
} from '../../../../shared/agent-api-presets'
import { AgentApiModelsRequest, type AgentApiModel } from '../../../../shared/agent-api-models'
import {
  AgentApiConnection,
  AGENT_API_PROTOCOLS,
  AGENT_SERVICE_API,
  isAgentServiceApi,
  type AgentApiAgent
} from '../../../../shared/agent-api-connection'
import type { AgentLaunchSettingsMutation } from '../../../../shared/agent-launch-settings'
import type { AgentDetectionTarget } from '@/hooks/useDetectedAgents'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'

export function useAgentApiConnection({
  agent,
  presets,
  activeId,
  target,
  mutate
}: {
  agent: AgentApiAgent
  presets: AgentApiPresetSummary[]
  activeId?: string
  target: AgentDetectionTarget
  mutate: (mutation: AgentLaunchSettingsMutation) => Promise<void>
}) {
  const service = isAgentServiceApi(agent) ? AGENT_SERVICE_API[agent] : null
  const initial = presets.find((preset) => preset.id === activeId)
  const [selectedId, setSelectedId] = useState(initial?.id ?? 'new')
  const [models, setModels] = useState<AgentApiModel[]>(initial?.models ?? [])
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
    initial?.models?.map((entry) => entry.id) ?? []
  )
  const [modelFilter, setModelFilter] = useState('')
  const discoveryGeneration = useRef(0)
  const [baseUrl, setBaseUrl] = useState(initial?.connection.baseUrl ?? service?.baseUrl ?? '')
  const [model, setModel] = useState(
    initial?.connection.model ?? (service ? 'service-default' : '')
  )
  const [apiKey, setApiKey] = useState('')
  const [contextWindow, setContextWindow] = useState(initial?.connection.contextWindow)
  const [protocol, setProtocol] = useState<AgentApiConnection['protocol']>(
    initial?.connection.protocol ?? AGENT_API_PROTOCOLS[agent][0]
  )
  const [pending, setPending] = useState(false)
  const [credentialType, setCredentialType] = useState<'api-key' | 'bearer'>(
    initial?.connection.credentialType ?? 'api-key'
  )
  const [status, setStatus] = useState('')
  const selectedPreset = presets.find((entry) => entry.id === selectedId)
  const selectedModels = models.filter((entry) => selectedModelIds.includes(entry.id))
  const selectedConnectionModel =
    selectedModels.find((entry) => entry.id === selectedPreset?.connection.model) ??
    selectedModels[0]
  const effectiveModel = selectedConnectionModel?.id ?? selectedPreset?.connection.model ?? model
  const filteredModels = models.filter((entry) =>
    `${entry.name} ${entry.id}`.toLowerCase().includes(modelFilter.trim().toLowerCase())
  )
  const connection = AgentApiConnection.safeParse({
    agent,
    baseUrl,
    model: effectiveModel,
    apiKey:
      apiKey || (presets.some((preset) => preset.id === selectedId) ? 'retained-on-host' : ''),
    protocol,
    credentialType,
    ...(!service
      ? {
          contextWindow:
            selectedConnectionModel?.contextWindow ?? contextWindow ?? DEFAULT_API_CONTEXT_WINDOW
        }
      : {})
  })
  const selectPreset = (id: string): void => {
    discoveryGeneration.current++
    const preset = presets.find((entry) => entry.id === id)
    setSelectedId(id)
    setApiKey('')
    setModels(preset?.models ?? [])
    setSelectedModelIds(preset?.models?.map((entry) => entry.id) ?? [])
    setModelFilter('')
    setStatus('')
    setBaseUrl(preset?.connection.baseUrl ?? service?.baseUrl ?? '')
    setModel(preset?.connection.model ?? (service ? 'service-default' : ''))
    setProtocol(preset?.connection.protocol ?? AGENT_API_PROTOCOLS[agent][0])
    setCredentialType(preset?.connection.credentialType ?? 'api-key')
    setContextWindow(preset?.connection.contextWindow)
  }
  const discover = async (): Promise<void> => {
    const request = AgentApiModelsRequest.safeParse({
      agent,
      protocol,
      baseUrl,
      apiKey: apiKey || undefined,
      credentialType,
      presetId: selectedId === 'new' ? undefined : selectedId
    })
    if (!request.success) {
      return
    }
    const generation = ++discoveryGeneration.current
    setPending(true)
    setStatus('')
    setModels([])
    setSelectedModelIds([])
    try {
      const result = await callRuntimeRpc<AgentApiModel[]>(
        target.kind === 'runtime'
          ? { kind: 'environment', environmentId: target.environmentId }
          : { kind: 'local' },
        'settings.listAgentApiModels',
        request.data,
        { timeoutMs: 20000 }
      )
      if (generation !== discoveryGeneration.current) {
        return
      }
      setModels(result)
      setSelectedModelIds(result.map((entry) => entry.id))
      setModel(result[0]?.id ?? model)
      setContextWindow(result[0]?.contextWindow ?? DEFAULT_API_CONTEXT_WINDOW)
      setStatus(
        result.length
          ? translate('settings.agents.api.modelsLoaded', 'Models loaded. Select models to add.')
          : translate(
              'settings.agents.api.noModels',
              'No models returned. Check the URL and API key.'
            )
      )
    } catch {
      if (generation === discoveryGeneration.current) {
        setStatus(
          translate(
            'settings.agents.api.modelsFailed',
            'Could not fetch models. Check the URL and API key.'
          )
        )
      }
    } finally {
      setPending(false)
    }
  }
  const save = async (mutation: AgentLaunchSettingsMutation): Promise<boolean> => {
    setPending(true)
    setStatus('')
    try {
      await mutate(mutation)
      setApiKey('')
      setStatus(translate('settings.agents.api.saved', 'Saved. Applies to new agent sessions.'))
      return true
    } catch {
      setStatus(
        translate(
          'settings.agents.api.failed',
          'Save failed. Check the connection fields and try again.'
        )
      )
      return false
    } finally {
      setPending(false)
    }
  }
  return {
    service,
    selectedId,
    setSelectedId,
    models,
    setModels,
    selectedModelIds,
    setSelectedModelIds,
    selectedModels,
    filteredModels,
    modelFilter,
    setModelFilter,
    discoveryGeneration,
    baseUrl,
    setBaseUrl,
    model,
    setModel,
    apiKey,
    setApiKey,
    contextWindow,
    setContextWindow,
    protocol,
    setProtocol,
    pending,
    credentialType,
    setCredentialType,
    status,
    connection,
    selectPreset,
    discover,
    save
  }
}
