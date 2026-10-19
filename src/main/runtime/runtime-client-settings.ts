import { projectRuntimeClientSettings } from './runtime-client-settings-projection'
import { getAppEnvironment } from '../../shared/app-environment'
import {
  prepareAgentApiMutationEnvironment,
  verifyPreparedAgentApiMutation
} from './agent-api-catalog-environment'
import type { AgentApiModelsRequest } from '../../shared/agent-api-models'
import { listAndCacheAgentApiModels } from './agent-api-model-catalog-refresh'
import { applyAgentApiNativeConfiguration } from './agent-api-native-configuration'
import { applyPRBotAuthorOverride } from '../../shared/pr-bot-author-overrides'
import {
  applyTerminalQuickCommandMutation,
  MAX_QUICK_COMMANDS,
  type TerminalQuickCommandMutation
} from '../../shared/terminal-quick-commands'
import { haveSameDisabledTuiAgents } from '../../shared/tui-agent-selection'
import { applyNativeChatSessionOptionSettingsMutation } from '../../shared/native-chat-session-option-defaults'
import type { NativeChatSessionOptionSettingsMutation } from '../../shared/native-chat-session-options'
import type { TerminalQuickCommand } from '../../shared/terminal-quick-command-types'
import { recordManagedHookInstallFailure } from '../agent-hooks/install-telemetry'
import { applyAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { isAgentStatusHooksEnabledForAgent } from '../../shared/agent-status-hooks-setting'
import type { RuntimeStore } from './runtime-store-contract'
import {
  agentLaunchSettingsMutationUpdates,
  projectAgentLaunchSettings,
  type AgentLaunchSettings,
  type AgentLaunchSettingsMutation
} from '../../shared/agent-launch-settings'
import { agentLaunchSettingsRollbackUpdates } from './agent-launch-settings-rollback'
import type {
  RuntimeClientSettings,
  RuntimeClientSettingsUpdate
} from './runtime-client-settings-shape'

export class RuntimeClientSettingsController {
  private reconciliationGeneration = 0
  private reconciliationTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly store: Pick<
      RuntimeStore,
      'getSettings' | 'updateSettings' | 'runDurableMutation'
    > | null,
    private readonly notifyReposChanged: (() => void) | undefined = undefined
  ) {}

  get(): RuntimeClientSettings {
    if (!this.store?.getSettings) {
      throw new Error('runtime_unavailable')
    }
    const settings = this.store.getSettings()
    return projectRuntimeClientSettings(settings)
  }

  async update(updates: RuntimeClientSettingsUpdate): Promise<RuntimeClientSettings> {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const beforeSettings = this.store.getSettings()
    const before = beforeSettings.agentStatusHooksEnabled !== false
    // Legacy clients can select an agent or a shell, but cannot select None.
    this.store.updateSettings(
      {
        ...updates,
        ...(updates.defaultTuiAgent !== undefined ? { newWorkspaceSetupOnly: false } : {})
      },
      { notifyListeners: true }
    )
    const settings = this.store.getSettings()
    if (updates.worktreeVisibilityDefaults !== undefined) {
      this.notifyReposChanged?.()
    }
    if (
      (typeof updates.agentStatusHooksEnabled === 'boolean' &&
        before !== updates.agentStatusHooksEnabled) ||
      (updates.disabledTuiAgents !== undefined &&
        !haveSameDisabledTuiAgents(beforeSettings.disabledTuiAgents, settings.disabledTuiAgents))
    ) {
      await this.reconcileManagedAgentHooks()
    }
    return this.get()
  }

  getTerminalQuickCommands(): TerminalQuickCommand[] {
    if (!this.store?.getSettings) {
      throw new Error('runtime_unavailable')
    }
    return this.store.getSettings().terminalQuickCommands ?? []
  }

  getAgentLaunch(): AgentLaunchSettings {
    if (!this.store?.getSettings) {
      throw new Error('runtime_unavailable')
    }
    return projectAgentLaunchSettings(this.store.getSettings())
  }

  async listAgentApiModels(request: AgentApiModelsRequest) {
    return listAndCacheAgentApiModels(
      request,
      () => this.store?.getSettings(),
      (mutation) => this.mutateAgentLaunch(mutation)
    )
  }

  async mutateAgentLaunch(mutation: AgentLaunchSettingsMutation): Promise<AgentLaunchSettings> {
    const store = this.store
    if (!store?.getSettings || !store.updateSettings || !store.runDurableMutation) {
      throw new Error('runtime_unavailable')
    }
    const applySettings = store.updateSettings.bind(store)
    const originalMutation = mutation
    const { resolved, connections, profileEnvironment } = await prepareAgentApiMutationEnvironment(
      store.getSettings(),
      mutation,
      getAppEnvironment().getPath('userData')
    )
    mutation = resolved.mutation
    const committed = await store.runDurableMutation(() => {
      const before = store.getSettings()
      const currentResolved = verifyPreparedAgentApiMutation(
        before,
        originalMutation,
        mutation,
        connections
      )
      const updates = agentLaunchSettingsMutationUpdates(
        { ...before, ...currentResolved.updates },
        mutation,
        process.platform
      )
      Object.assign(updates, currentResolved.updates)
      if (mutation.type === 'api-set' && updates.agentDefaultEnv) {
        const agent = mutation.connection.agent
        updates.agentDefaultEnv[agent] = {
          ...updates.agentDefaultEnv[agent],
          ...profileEnvironment
        }
      }
      const agent =
        mutation.type === 'api-set'
          ? mutation.connection.agent
          : 'agent' in mutation
            ? mutation.agent
            : null
      const nativeRollback = applyAgentApiNativeConfiguration(
        mutation,
        agent && agent !== 'blank' ? (before.agentDefaultEnv?.[agent] ?? {}) : {},
        getAppEnvironment().getPath('userData'),
        connections
      )
      try {
        applySettings(updates, { notifyListeners: true })
      } catch (error) {
        nativeRollback?.()
        throw error
      }
      const applied = store.getSettings()
      return {
        value: {
          settings: projectAgentLaunchSettings(applied),
          reconcileHooks:
            updates.disabledTuiAgents !== undefined &&
            !haveSameDisabledTuiAgents(before.disabledTuiAgents, applied.disabledTuiAgents)
        },
        rollback: () => {
          nativeRollback?.()
          const rollback = agentLaunchSettingsRollbackUpdates(
            before,
            applied,
            store.getSettings(),
            updates
          )
          if (Object.keys(rollback).length > 0) {
            applySettings(rollback, { notifyListeners: true })
          }
        }
      }
    })
    if (committed.reconcileHooks) {
      void this.reconcileManagedAgentHooks().catch((error) => {
        console.error(
          '[agent-hooks] Failed to reconcile managed hooks after saving launch settings:',
          error
        )
      })
    }
    return committed.settings
  }

  updateTerminalQuickCommands(mutation: TerminalQuickCommandMutation): TerminalQuickCommand[] {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const current = this.getTerminalQuickCommands()
    if (
      mutation.type === 'upsert' &&
      !current.some((command) => command.id === mutation.command.id) &&
      current.length >= MAX_QUICK_COMMANDS
    ) {
      throw new Error('Quick command limit reached')
    }
    const next = applyTerminalQuickCommandMutation(current, mutation)
    this.store.updateSettings({ terminalQuickCommands: next }, { notifyListeners: true })
    return this.getTerminalQuickCommands()
  }

  updatePRBotAuthorOverride(args: { author: string; isBot: boolean }): RuntimeClientSettings {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const current = this.store.getSettings().prBotAuthorOverrides
    this.store.updateSettings(
      { prBotAuthorOverrides: applyPRBotAuthorOverride(current, args.author, args.isBot) },
      { notifyListeners: true }
    )
    return this.get()
  }

  updateNativeChatSessionOptions(mutation: NativeChatSessionOptionSettingsMutation): void {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const next = applyNativeChatSessionOptionSettingsMutation(
      this.store.getSettings().nativeChatSessionOptions,
      mutation
    )
    if (next) {
      this.store.updateSettings({ nativeChatSessionOptions: next }, { notifyListeners: true })
    }
  }

  private reconcileManagedAgentHooks(): Promise<void> {
    const generation = ++this.reconciliationGeneration
    const reconciliation = this.reconciliationTail.then(async () => {
      if (generation !== this.reconciliationGeneration) {
        return
      }
      const settings = this.store?.getSettings()
      if (!settings) {
        return
      }
      await applyAgentStatusHooksEnabled(settings.agentStatusHooksEnabled !== false, settings, {
        shouldHydrateShellPath: getAppEnvironment().isPackaged(),
        onInstallError: recordManagedHookInstallFailure,
        shouldContinue: (agent) => {
          const current = this.store?.getSettings()
          return current !== undefined && isAgentStatusHooksEnabledForAgent(current, agent)
        }
      })
    })
    this.reconciliationTail = reconciliation.catch(() => {})
    return reconciliation
  }
}
