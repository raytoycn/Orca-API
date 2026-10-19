import { Crown, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import type { AgentApiPresetSummary } from '../../../../shared/agent-api-presets'
import { agentApiPresetDisplayName } from '../../../../shared/agent-api-presets'
import { uniqueOrcaAgentApiPresets } from '../../../../shared/agent-api-model-catalog'
import {
  isOrcaProviderModel,
  missingOrcaCollaborationModels,
  newOrcaCollaborationRole,
  ORCA_COLLABORATION_ROLE_LIMIT,
  parseOrcaProviderModel,
  type OrcaAgentCollaborationSettings,
  type OrcaCollaborationRole
} from '../../../../shared/orca-agent-collaboration'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '../ui/select'
import { Textarea } from '../ui/textarea'
import { SettingsSegmentedControl, SettingsSubsectionHeader } from './SettingsFormControls'

type ModelOption = {
  value: string
  label: string
  provider: string
}

export function OrcaAgentCollaborationEditor({
  presets,
  settings,
  onChange
}: {
  presets: readonly AgentApiPresetSummary[]
  settings: OrcaAgentCollaborationSettings
  onChange: (settings: OrcaAgentCollaborationSettings) => void
}): React.JSX.Element {
  const uniquePresets = useMemo(() => uniqueOrcaAgentApiPresets(presets), [presets])
  const optionsByProvider = useMemo(
    () =>
      uniquePresets.flatMap((preset) => {
        const providerId = preset.modelProviderId
        if (!providerId) {
          return []
        }
        const provider = agentApiPresetDisplayName(preset)
        const providerWithSource =
          preset.connection.agent === 'orca-agent'
            ? provider
            : `${provider} · ${preset.connection.agent}`
        return [
          {
            provider: providerWithSource,
            options: (preset.models ?? []).map((model): ModelOption => ({
              value: JSON.stringify([providerId, model.id]),
              label: `${model.name || model.id} · ${providerWithSource}`,
              provider: providerWithSource
            }))
          }
        ]
      }),
    [uniquePresets]
  )
  const missingModels = missingOrcaCollaborationModels(settings)
  const updateRole = (roleId: string, patch: Partial<OrcaCollaborationRole>): void => {
    onChange({
      ...settings,
      roles: settings.roles.map((role) => (role.id === roleId ? { ...role, ...patch } : role))
    })
  }
  const removeRole = (roleId: string): void => {
    if (settings.roles.length <= 1) {
      return
    }
    const roles = settings.roles.filter((role) => role.id !== roleId)
    onChange({
      ...settings,
      roles,
      coordinatorRoleId:
        settings.coordinatorRoleId === roleId ? roles[0]!.id : settings.coordinatorRoleId
    })
  }
  const addRole = (): void => {
    if (settings.roles.length >= ORCA_COLLABORATION_ROLE_LIMIT) {
      return
    }
    onChange({
      ...settings,
      roles: [...settings.roles, newOrcaCollaborationRole(settings.roles.length + 1)]
    })
  }
  return (
    <section className="mt-3 space-y-3 border-t border-border pt-3" aria-label="Orca Agent 协同">
      <SettingsSubsectionHeader
        title="运行方式"
        description="单 Agent 保持普通对话；多角色协同为新任务启用 Orca 编排。"
        action={
          <SettingsSegmentedControl
            value={settings.mode}
            size="sm"
            ariaLabel="Orca Agent 运行方式"
            onChange={(mode) => onChange({ ...settings, mode })}
            options={[
              { value: 'single', label: '单 Agent' },
              { value: 'multi-role', label: '多角色协同' }
            ]}
          />
        }
      />
      {settings.mode === 'single' && (
        <Select
          value={settings.singleEffort}
          onValueChange={(effort) =>
            onChange({
              ...settings,
              singleEffort: effort as OrcaAgentCollaborationSettings['singleEffort']
            })
          }
        >
          <SelectTrigger aria-label="单 Agent 思考模式" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">off</SelectItem>
            <SelectItem value="low">low</SelectItem>
            <SelectItem value="medium">medium</SelectItem>
            <SelectItem value="high">high</SelectItem>
          </SelectContent>
        </Select>
      )}
      {settings.mode === 'multi-role' && (
        <div className="space-y-2">
          {missingModels.length > 0 && (
            <p className="text-xs text-muted-foreground">
              还需为 {missingModels.length} 个角色选择供应商和模型。
            </p>
          )}
          {settings.roles.map((role) => (
            <div key={role.id} className="space-y-2 rounded-md border border-border/70 p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="角色名称"
                  value={role.name}
                  onChange={(event) => updateRole(role.id, { name: event.target.value })}
                  className="h-8 min-w-0 flex-1"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant={settings.coordinatorRoleId === role.id ? 'secondary' : 'ghost'}
                  aria-label={
                    settings.coordinatorRoleId === role.id ? '当前协调角色' : '设为协调角色'
                  }
                  title={settings.coordinatorRoleId === role.id ? '当前协调角色' : '设为协调角色'}
                  onClick={() => onChange({ ...settings, coordinatorRoleId: role.id })}
                >
                  <Crown className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="删除角色"
                  title="删除角色"
                  disabled={settings.roles.length <= 1}
                  onClick={() => removeRole(role.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Textarea
                aria-label={`${role.name} 职责`}
                value={role.duty}
                rows={2}
                onChange={(event) => updateRole(role.id, { duty: event.target.value })}
              />
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Select
                  value={isOrcaProviderModel(role.model) ? role.model : ''}
                  onValueChange={(value) => updateRole(role.id, { model: value })}
                >
                  <SelectTrigger aria-label={`${role.name} 模型`} className="w-full">
                    <SelectValue placeholder="选择供应商下的模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsByProvider.map((group) => (
                      <SelectGroup key={group.provider}>
                        <SelectLabel>{group.provider}</SelectLabel>
                        {group.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={role.effort}
                  onValueChange={(effort) =>
                    updateRole(role.id, { effort: effort as OrcaCollaborationRole['effort'] })
                  }
                >
                  <SelectTrigger aria-label={`${role.name} 思考模式`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">off</SelectItem>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {parseOrcaProviderModel(role.model) && (
                <p className="text-xs text-muted-foreground">
                  {settings.coordinatorRoleId === role.id ? '协调角色' : '执行角色'} ·{' '}
                  {parseOrcaProviderModel(role.model)!.model}
                </p>
              )}
            </div>
          ))}
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={settings.roles.length >= ORCA_COLLABORATION_ROLE_LIMIT}
            onClick={addRole}
          >
            <Plus className="size-3.5" />
            添加角色
          </Button>
        </div>
      )}
    </section>
  )
}
