import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import AgentCombobox from './AgentCombobox'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { AgentApiAgent } from '../../../../shared/agent-api-connection-schema'
import { AgentApiModelsRequest, type AgentApiModel } from '../../../../shared/agent-api-models'
import { isOrcaAgentBridgeableApiPreset } from '../../../../shared/agent-api-model-catalog'
import { uniqueOrcaAgentApiPresets } from '../../../../shared/agent-api-model-catalog'
import { DEFAULT_API_CONTEXT_WINDOW } from '../../../../shared/agent-api-presets'
import type { TuiAgent } from '../../../../shared/tui-agent'
import {
  defaultOrcaAgentCollaborationSettings,
  isOrcaCollaborationReady,
  orcaCollaborationPrompt,
  type OrcaAgentCollaborationSettings
} from '../../../../shared/orca-agent-collaboration'

export function AgentChatLanding({
  onChatStarted
}: {
  onChatStarted: (session: { agent: TuiAgent; sessionId: string; worktreeId: string }) => void
}): React.JSX.Element {
  const [agent, setAgent] = useState<TuiAgent>('orca-agent')
  const [prompt, setPrompt] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [chosenApiId, setChosenApiId] = useState<string | null>(null)
  const [chosenModel, setChosenModel] = useState<{ presetId: string; model: string } | null>(null)
  const [apiModels, setApiModels] = useState<AgentApiModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsFailed, setModelsFailed] = useState(false)
  const [modelRefresh, setModelRefresh] = useState(0)
  const [sending, setSending] = useState(false)
  const [collaborationMode, setCollaborationMode] =
    useState<OrcaAgentCollaborationSettings['mode']>('single')
  const { worktrees, repos } = useAppStore(
    useShallow((s) => ({ worktrees: s.worktreesByRepo, repos: s.repos }))
  )
  const disabled = useAppStore((s) => s.settings?.disabledTuiAgents)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const collaborationSettings =
    settings?.orcaAgentCollaboration ?? defaultOrcaAgentCollaborationSettings()
  const openModal = useAppStore((s) => s.openModal)
  const choices = repos.flatMap((repo) =>
    (worktrees[repo.id] ?? []).map((tree) => ({
      id: tree.id,
      label: `${repo.displayName} / ${tree.displayName}`
    }))
  )
  const target = choices.some((choice) => choice.id === workspace)
    ? workspace
    : (choices[0]?.id ?? '')
  const parsedApiAgent = AgentApiAgent.safeParse(agent)
  const apiAgent = parsedApiAgent.success ? parsedApiAgent.data : null
  const presets = useMemo(
    () =>
      agent === 'orca-agent'
        ? uniqueOrcaAgentApiPresets(
            (settings?.agentApiPresets ?? []).filter(isOrcaAgentBridgeableApiPreset)
          )
        : (settings?.agentApiPresets ?? []).filter((preset) => preset.connection.agent === agent),
    [settings?.agentApiPresets, agent]
  )
  const activePresetId = apiAgent ? settings?.activeAgentApiPresets?.[apiAgent] : undefined
  const selectedApiId = presets.some((preset) => preset.id === chosenApiId)
    ? chosenApiId!
    : presets.some((preset) => preset.id === activePresetId)
      ? activePresetId!
      : (presets[0]?.id ?? '')
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedApiId),
    [presets, selectedApiId]
  )
  useEffect(() => {
    setChosenApiId(null)
    setChosenModel(null)
    setApiModels([])
    setModelsLoading(false)
    setModelsFailed(false)
  }, [agent])
  useEffect(() => {
    if (agent === 'orca-agent') {
      setCollaborationMode(collaborationSettings.mode)
    }
  }, [agent, collaborationSettings.mode])
  useEffect(() => {
    let current = true
    setApiModels(selectedPreset?.models ?? [])
    setModelsFailed(false)
    if (!apiAgent || !selectedPreset) {
      return
    }
    const request = AgentApiModelsRequest.safeParse({
      agent: apiAgent,
      protocol: selectedPreset.connection.protocol,
      baseUrl: selectedPreset.connection.baseUrl,
      credentialType: selectedPreset.connection.credentialType,
      presetId: selectedPreset.id
    })
    if (!request.success) {
      return
    }
    setModelsLoading(true)
    void callRuntimeRpc<AgentApiModel[]>(
      { kind: 'local' },
      'settings.listAgentApiModels',
      request.data,
      {
        timeoutMs: 20000
      }
    )
      .then((models) => {
        if (current) {
          setApiModels(models)
        }
      })
      .catch(() => {
        if (current) {
          setApiModels(selectedPreset.models ?? [])
          setModelsFailed(true)
        }
      })
      .finally(() => {
        if (current) {
          setModelsLoading(false)
        }
      })
    return () => {
      current = false
    }
  }, [apiAgent, selectedPreset, modelRefresh])
  const selectApi = async (id: string, model?: string, contextWindow?: number): Promise<void> => {
    if (!apiAgent) {
      return
    }
    try {
      await callRuntimeRpc({ kind: 'local' }, 'settings.mutateAgentLaunch', {
        type: 'api-preset-activate',
        agent: apiAgent,
        id,
        ...(model ? { model } : {}),
        ...(contextWindow ? { contextWindow } : {})
      })
      setChosenApiId(id)
      if (model) {
        setChosenModel({ presetId: id, model })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '切换 API 失败')
    }
  }
  const selectedModel =
    chosenModel?.presetId === selectedApiId
      ? chosenModel.model
      : (selectedPreset?.connection.model ?? '')
  const modelOptions = presets.flatMap((preset) => {
    const catalog =
      preset.id === selectedApiId && apiModels.length
        ? apiModels
        : preset.models?.length
          ? preset.models
          : [
              {
                id: preset.connection.model,
                name: preset.connection.model,
                contextWindow: preset.connection.contextWindow
              }
            ]
    return catalog.map((model) => ({
      key: JSON.stringify([preset.id, model.id]),
      preset,
      model
    }))
  })
  const selectedModelOption = modelOptions.find(
    (entry) => entry.preset.id === selectedApiId && entry.model.id === selectedModel
  )
  const send = async (): Promise<void> => {
    if (!prompt.trim() || sending || !target) {
      return
    }
    setSending(true)
    try {
      let outgoingPrompt = prompt.trim()
      if (agent === 'orca-agent' && collaborationMode === 'multi-role') {
        const selectedSettings: OrcaAgentCollaborationSettings = {
          ...collaborationSettings,
          mode: 'multi-role'
        }
        if (!isOrcaCollaborationReady(selectedSettings)) {
          throw new Error('多角色协同尚未配置完整，请先在 Orca Agent 中为每个角色选择模型。')
        }
        outgoingPrompt = orcaCollaborationPrompt(outgoingPrompt, selectedSettings)
      }
      const result = launchAgentInNewTab({
        agent,
        worktreeId: target,
        requestId: newAgentLaunchRequestId(),
        prompt: outgoingPrompt,
        promptDelivery: 'auto-submit',
        activate: false
      })
      if (!result) {
        throw new Error('会话启动失败，请检查智能体和 API 配置。')
      }
      if (result.structuredSettlement) {
        const settlement = await result.structuredSettlement
        if (settlement.kind === 'failed' || settlement.kind === 'cancelled') {
          throw new Error('智能体会话未能启动。')
        }
        if (settlement.kind === 'structured') {
          onChatStarted({ agent, sessionId: settlement.sessionId, worktreeId: target })
        } else if (settlement.kind === 'terminal') {
          toast.error('该智能体未能启动原生聊天会话。')
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '会话启动失败')
    } finally {
      setSending(false)
    }
  }
  return (
    <section className="w-full space-y-3" aria-label="新对话" data-testid="agent-chat-landing">
      <Textarea
        aria-label="输入需求"
        placeholder="描述你想开发的功能，或向智能体提问…"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={5}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void send()
          }
        }}
      />
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <AgentCombobox
            agents={getAgentCatalog().filter((entry) => !disabled?.includes(entry.id))}
            value={agent}
            onValueChange={setAgent}
            triggerClassName="w-full"
          />
        </div>
        {apiAgent && presets.length > 0 && (
          <>
            <Select
              value={selectedModelOption?.key ?? ''}
              onValueChange={(key) => {
                const selected = modelOptions.find((entry) => entry.key === key)
                if (selected) {
                  void selectApi(
                    selected.preset.id,
                    selected.model.id,
                    selected.model.contextWindow ?? DEFAULT_API_CONTEXT_WINDOW
                  )
                }
              }}
            >
              <SelectTrigger aria-label="模型" className="min-w-40 flex-1">
                <SelectValue placeholder={modelsLoading ? '正在获取模型…' : '选择模型'} />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map(({ key, preset, model }) => (
                  <SelectItem key={key} value={key}>
                    {`${model.name || model.id} · ${preset.name}${
                      preset.connection.agent === 'orca-agent'
                        ? ''
                        : ` · ${preset.connection.agent}`
                    }`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {modelsFailed && selectedPreset && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="重新获取模型"
                title="模型获取失败，重新获取"
                onClick={() => setModelRefresh((value) => value + 1)}
              >
                <RefreshCw className="size-4" />
              </Button>
            )}
          </>
        )}
        {agent === 'orca-agent' && (
          <>
            <select
              aria-label="运行方式"
              className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={collaborationMode}
              onChange={(event) =>
                setCollaborationMode(event.target.value === 'multi-role' ? 'multi-role' : 'single')
              }
            >
              <option value="single">单 Agent</option>
              <option value="multi-role">多角色协同</option>
            </select>
            {collaborationMode === 'single' && (
              <select
                aria-label="思考模式"
                className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={collaborationSettings.singleEffort}
                onChange={(event) => {
                  const effort = event.target
                    .value as OrcaAgentCollaborationSettings['singleEffort']
                  void updateSettings({
                    orcaAgentCollaboration: { ...collaborationSettings, singleEffort: effort }
                  })
                }}
              >
                <option value="off">off</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            )}
          </>
        )}
        <select
          aria-label="工作区"
          className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={target}
          onChange={(event) => setWorkspace(event.target.value)}
        >
          {!target && <option value="">请先创建工作区</option>}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
        <Button
          className="sm:col-span-2 sm:justify-self-end"
          aria-label="发送需求"
          disabled={!prompt.trim() || !target || sending}
          onClick={() => void send()}
        >
          <ArrowUp className="size-4" />
          {sending ? '启动中' : '发送'}
        </Button>
      </div>
      {agent === 'orca-agent' && collaborationMode === 'multi-role' && (
        <p className="text-xs text-muted-foreground">
          协同角色：{collaborationSettings.roles.map((role) => role.name).join('、')} ·{' '}
          {collaborationSettings.roles.find(
            (role) => role.id === collaborationSettings.coordinatorRoleId
          )?.name ?? collaborationSettings.roles[0]?.name}{' '}
          统筹
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        使用该智能体已配置的模型和 API。Enter 发送，Shift+Enter 换行。
      </p>
      {!target && (
        <Button
          variant="outline"
          onClick={() => openModal('new-workspace-composer', { telemetrySource: 'unknown' })}
        >
          创建工作区
        </Button>
      )}
    </section>
  )
}
