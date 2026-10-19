import { z } from 'zod'
import { quoteStartupArg, type AgentStartupShell } from './tui-agent-startup-shell'

export const AGENT_API_ARGUMENTS_ENV = 'ORCA_AGENT_API_ARGUMENTS'
const Arguments = z
  .array(
    z
      .string()
      .max(8192)
      .refine((value) => !/[\r\n\0]/.test(value))
  )
  .max(64)

export function agentApiLaunchArguments(
  env: Readonly<Record<string, string>> | null | undefined
): string[] {
  const value = env?.[AGENT_API_ARGUMENTS_ENV]
  return value ? Arguments.parse(JSON.parse(value)) : []
}

export function appendAgentApiArguments(
  args: string | null | undefined,
  env: Readonly<Record<string, string>> | null | undefined,
  shell: AgentStartupShell
): string | null | undefined {
  const apiArgs = agentApiLaunchArguments(env)
  if (!apiArgs.length) {
    return args
  }
  const suffix = apiArgs.map((arg) => quoteStartupArg(arg, shell)).join(' ')
  return args?.endsWith(suffix) ? args : [args, suffix].filter(Boolean).join(' ')
}
