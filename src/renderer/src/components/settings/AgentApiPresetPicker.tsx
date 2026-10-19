import type { AgentApiPresetSummary } from '../../../../shared/agent-api-presets'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { translate } from '@/i18n/i18n'
import { agentApiPresetDisplayName } from '../../../../shared/agent-api-presets'

export function AgentApiPresetPicker({
  presets,
  selectedId,
  activeId,
  onSelect,
  onActivate,
  onDelete
}: {
  presets: AgentApiPresetSummary[]
  selectedId: string
  activeId?: string
  onSelect: (id: string) => void
  onActivate: () => void
  onDelete: () => void
}): React.JSX.Element {
  const existing = presets.some((preset) => preset.id === selectedId)
  return (
    <div className="space-y-2">
      <Select value={selectedId} onValueChange={onSelect}>
        <SelectTrigger aria-label={translate('settings.agents.api.preset', 'API configuration')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new">
            {translate('settings.agents.api.newPreset', 'Add API configuration')}
          </SelectItem>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              {agentApiPresetDisplayName(preset)}
              {preset.id === activeId
                ? ` · ${translate('settings.agents.api.active', 'Active')}`
                : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {existing && (
        <div className="flex gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={selectedId === activeId}
            onClick={onActivate}
          >
            {translate('settings.agents.api.activate', 'Use this API')}
          </Button>
          <Button size="xs" variant="ghost" onClick={onDelete}>
            {translate('settings.agents.api.deletePreset', 'Delete configuration')}
          </Button>
        </div>
      )}
    </div>
  )
}
