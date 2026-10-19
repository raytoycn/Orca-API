import { ChevronDown, UserRound, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import {
  defaultOrcaAgentCollaborationSettings,
  isOrcaCollaborationReady,
  type OrcaAgentCollaborationSettings
} from '../../../../shared/orca-agent-collaboration'

const MODE_LABELS: Record<OrcaAgentCollaborationSettings['mode'], string> = {
  single: '单 Agent',
  'multi-role': '多角色协同'
}

function modeDescription(
  mode: OrcaAgentCollaborationSettings['mode'],
  settings: OrcaAgentCollaborationSettings
): string {
  if (mode === 'single') {
    return '用当前模型继续普通对话。'
  }
  return isOrcaCollaborationReady(settings)
    ? '按已配置角色启动 Orca 编排。'
    : '请先在设置中为每个角色选择模型。'
}

export function NativeChatCollaborationModePicker({
  agent
}: {
  agent?: string
}): React.JSX.Element | null {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  if (agent !== 'orca-agent') {
    return null
  }
  const collaboration = settings?.orcaAgentCollaboration ?? defaultOrcaAgentCollaborationSettings()
  const title = '运行方式'
  const Icon = collaboration.mode === 'multi-role' ? Users : UserRound
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label={`${title} ${MODE_LABELS[collaboration.mode]}`}
              className="max-w-44 min-w-0 shrink"
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{MODE_LABELS[collaboration.mode]}</span>
              <ChevronDown className="size-3 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {title}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top" collisionPadding={8} className="w-72">
        <DropdownMenuRadioGroup aria-label={title} value={collaboration.mode}>
          {(['single', 'multi-role'] as const).map((mode) => (
            <DropdownMenuRadioItem
              key={mode}
              value={mode}
              onSelect={() => {
                if (mode !== collaboration.mode) {
                  void updateSettings({ orcaAgentCollaboration: { ...collaboration, mode } })
                }
              }}
            >
              <div className="min-w-0 py-0.5">
                <div className="flex items-center gap-1.5">
                  {mode === 'multi-role' ? (
                    <Users className="size-3.5" aria-hidden />
                  ) : (
                    <UserRound className="size-3.5" aria-hidden />
                  )}
                  <span>{MODE_LABELS[mode]}</span>
                </div>
                <div className="text-xs font-normal text-muted-foreground">
                  {modeDescription(mode, { ...collaboration, mode })}
                </div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
