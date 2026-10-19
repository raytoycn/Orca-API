import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AgentApiPresetSummary } from '../../../../shared/agent-api-presets'
import type { AgentDetectionTarget } from '@/hooks/useDetectedAgents'
import { AgentApiPresetPicker } from './AgentApiPresetPicker'
import { useAgentApiConnection } from './use-agent-api-connection'
import {
  AgentApiProtocol,
  AGENT_API_PROTOCOLS,
  type AgentApiAgent
} from '../../../../shared/agent-api-connection'
import type { AgentLaunchSettingsMutation } from '../../../../shared/agent-launch-settings'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { translate } from '@/i18n/i18n'

const EMPTY_PRESETS: AgentApiPresetSummary[] = []
const LOCAL_TARGET = { kind: 'local' } as const

export function AgentApiConnectionEditor({
  agent,
  presets = EMPTY_PRESETS,
  activeId,
  presetsSupported = true,
  target = LOCAL_TARGET,
  mutate
}: {
  agent: AgentApiAgent
  presets?: AgentApiPresetSummary[]
  activeId?: string
  presetsSupported?: boolean
  target?: AgentDetectionTarget
  mutate: (mutation: AgentLaunchSettingsMutation) => Promise<void>
}): React.JSX.Element {
  const {
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
    apiKey,
    setApiKey,
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
  } = useAgentApiConnection({ agent, presets, activeId, target, mutate })
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">
        {service
          ? translate('settings.agents.api.serviceTitle', 'Agent platform API key')
          : translate('settings.agents.api.title', 'Custom API for this agent')}
      </p>
      <p className="text-xs text-muted-foreground">
        {service
          ? translate(
              'settings.agents.api.serviceDescription',
              'Use an API key issued by this agent’s own platform. Third-party model API keys do not authenticate this service.'
            )
          : translate(
              'settings.agents.api.description',
              'Connect directly with this agent’s supported protocol. Remove the API override to use its existing official login configuration.'
            )}
      </p>
      <fieldset disabled={pending} className="space-y-2">
        {presetsSupported && (
          <AgentApiPresetPicker
            presets={presets}
            selectedId={selectedId}
            activeId={activeId}
            onSelect={selectPreset}
            onActivate={() => void save({ type: 'api-preset-activate', agent, id: selectedId })}
            onDelete={() =>
              void save({ type: 'api-preset-delete', agent, id: selectedId }).then((ok) => {
                if (ok) {
                  selectPreset('new')
                }
              })
            }
          />
        )}
        <Select
          value={protocol}
          onValueChange={(value) => {
            const parsed = AgentApiProtocol.safeParse(value)
            if (parsed.success) {
              setProtocol(parsed.data)
              setModels([])
              setSelectedModelIds([])
              discoveryGeneration.current++
            }
          }}
        >
          <SelectTrigger aria-label={translate('settings.agents.api.protocol', 'API protocol')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGENT_API_PROTOCOLS[agent].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(agent === 'claude' || agent === 'claude-agent-teams') && (
          <Select
            value={credentialType}
            onValueChange={(value) => {
              if (value === 'api-key' || value === 'bearer') {
                setCredentialType(value)
              }
            }}
          >
            <SelectTrigger
              aria-label={translate('settings.agents.api.authentication', 'API authentication')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="api-key">x-api-key</SelectItem>
              <SelectItem value="bearer">Bearer token</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!service && (
          <Input
            aria-label={translate('settings.agents.api.url', 'API base URL')}
            placeholder={
              agent === 'gemini'
                ? 'https://generativelanguage.googleapis.com'
                : 'https://api.example.com/v1'
            }
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value)
              setModels([])
              setSelectedModelIds([])
              discoveryGeneration.current++
            }}
          />
        )}
        <Input
          type="password"
          autoComplete="off"
          aria-label={translate('settings.agents.api.key', 'API key')}
          placeholder={translate('settings.agents.api.key', 'API key')}
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value)
            setModels([])
            setSelectedModelIds([])
            discoveryGeneration.current++
          }}
        />
        {!service && (
          <Button
            size="xs"
            variant="outline"
            disabled={
              !presetsSupported ||
              (!apiKey && selectedId === 'new') ||
              !baseUrl ||
              target.kind === 'ssh'
            }
            onClick={() => void discover()}
          >
            {translate('settings.agents.api.fetchModels', 'Fetch models')}
          </Button>
        )}
        {models.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                aria-label={translate('settings.agents.api.searchModels', 'Search models')}
                placeholder={translate('settings.agents.api.searchModels', 'Search models')}
                value={modelFilter}
                onChange={(event) => setModelFilter(event.target.value)}
              />
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  const visibleIds = filteredModels.map((entry) => entry.id)
                  setSelectedModelIds((current) =>
                    visibleIds.every((id) => current.includes(id))
                      ? current.filter((id) => !visibleIds.includes(id))
                      : [...new Set([...current, ...visibleIds])]
                  )
                }}
              >
                {filteredModels.length > 0 &&
                filteredModels.every((entry) => selectedModelIds.includes(entry.id))
                  ? translate('settings.agents.api.clearModelSelection', 'Clear selection')
                  : translate('settings.agents.api.selectAllModels', 'Select all')}
              </Button>
            </div>
            <div
              role="group"
              aria-label={translate('settings.agents.api.models', 'Available models')}
              className="scrollbar-sleek max-h-48 overflow-y-auto rounded-md border border-border"
            >
              {filteredModels.map((item) => (
                <label
                  key={item.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2 border-b border-border px-3 last:border-b-0"
                >
                  <Checkbox
                    checked={selectedModelIds.includes(item.id)}
                    onCheckedChange={(checked) =>
                      setSelectedModelIds((current) =>
                        checked
                          ? [...new Set([...current, item.id])]
                          : current.filter((id) => id !== item.id)
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.id}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {translate(
                'settings.agents.api.modelsSelected',
                '{{selected}} of {{total}} models selected',
                {
                  selected: selectedModels.length,
                  total: models.length
                }
              )}
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="xs"
            disabled={!connection.success || pending || (!service && selectedModels.length === 0)}
            onClick={() => {
              if (connection.success) {
                if (!presetsSupported) {
                  void save({ type: 'api-set', connection: connection.data })
                  return
                }
                const id = selectedId === 'new' ? createBrowserUuid() : selectedId
                void save({
                  type: 'api-preset-save',
                  preset: {
                    id,
                    name: (() => {
                      try {
                        return new URL(baseUrl).host
                      } catch {
                        return connection.data.model
                      }
                    })(),
                    connection: { ...connection.data, apiKey: apiKey || undefined },
                    ...(models.length > 0 ? { models: selectedModels } : {})
                  }
                }).then((ok) => {
                  if (ok) {
                    setSelectedId(id)
                  }
                })
              }
            }}
          >
            {translate('settings.agents.save', 'Save')}
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() => {
              void save({ type: 'api-clear', agent })
            }}
          >
            {translate('settings.agents.api.clear', 'Remove API override')}
          </Button>
        </div>
      </fieldset>
      <p role="status" className="text-xs text-muted-foreground">
        {models.length > 0
          ? `已获取 ${models.length} 个模型，已选 ${selectedModels.length} 个；保存后一次加入智能体。${status ? ` ${status}` : ''}`
          : status}
      </p>
    </div>
  )
}
