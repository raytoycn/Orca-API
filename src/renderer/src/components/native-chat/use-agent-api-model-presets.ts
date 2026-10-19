import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { AgentLaunchSettings } from '../../../../shared/agent-launch-settings'
import type { AgentApiPresetSummary } from '../../../../shared/agent-api-presets'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { AgentApiModelsRequest } from '../../../../shared/agent-api-models'
import { isOrcaAgentBridgeableApiPreset } from '../../../../shared/agent-api-model-catalog'
import { uniqueOrcaAgentApiPresets } from '../../../../shared/agent-api-model-catalog'

const NO_API_PRESETS: AgentApiPresetSummary[] = []

export function useAgentApiModelPresets(
  agent: string,
  identity: string,
  target: RuntimeClientTarget
) {
  const savedApiPresets = useAppStore((state) => state.settings?.agentApiPresets)
  const environmentId = target.kind === 'environment' ? target.environmentId : null
  const scope = JSON.stringify([agent, identity, environmentId, savedApiPresets])
  const [host, setHost] = useState<{ scope: string; presets: AgentApiPresetSummary[] } | null>(null)
  const agentApiPresets =
    host?.scope === scope
      ? host.presets
      : environmentId === null
        ? (savedApiPresets ?? NO_API_PRESETS)
        : NO_API_PRESETS
  useEffect(() => {
    let stale = false
    const requestTarget: RuntimeClientTarget =
      environmentId === null ? { kind: 'local' } : { kind: 'environment', environmentId }
    const refresh = async () => {
      const initial = await callRuntimeRpc<{ settings: AgentLaunchSettings }>(
        requestTarget,
        'settings.getAgentLaunch',
        undefined
      )
      if (stale) {
        return
      }
      const initialPresets =
        agent === 'orca-agent'
          ? uniqueOrcaAgentApiPresets(
              (initial.settings.apiPresets ?? []).filter(isOrcaAgentBridgeableApiPreset)
            )
          : (initial.settings.apiPresets ?? []).filter(
              (preset) => preset.connection.agent === agent
            )
      setHost({ scope, presets: initialPresets })
      for (const preset of initialPresets) {
        if (
          stale ||
          (preset.connection.agent !== agent &&
            !(agent === 'orca-agent' && isOrcaAgentBridgeableApiPreset(preset)))
        ) {
          continue
        }
        const request = AgentApiModelsRequest.safeParse({
          agent: preset.connection.agent,
          protocol: preset.connection.protocol,
          baseUrl: preset.connection.baseUrl,
          credentialType: preset.connection.credentialType,
          presetId: preset.id
        })
        if (!request.success) {
          continue
        }
        await callRuntimeRpc(requestTarget, 'settings.listAgentApiModels', request.data, {
          timeoutMs: 20000
        }).catch(() => undefined)
      }
      if (stale) {
        return
      }
      const refreshedSettings = await callRuntimeRpc<{ settings: AgentLaunchSettings }>(
        requestTarget,
        'settings.getAgentLaunch',
        undefined
      )
      const refreshedPresets =
        agent === 'orca-agent'
          ? uniqueOrcaAgentApiPresets(
              (refreshedSettings.settings.apiPresets ?? []).filter(isOrcaAgentBridgeableApiPreset)
            )
          : (refreshedSettings.settings.apiPresets ?? []).filter(
              (preset) => preset.connection.agent === agent
            )
      if (!stale) {
        setHost({ scope, presets: refreshedPresets })
      }
    }
    void refresh().catch(() => {})
    return () => {
      stale = true
    }
  }, [agent, environmentId, scope])
  return agentApiPresets
}
