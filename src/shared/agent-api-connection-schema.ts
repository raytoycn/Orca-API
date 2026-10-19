import { z } from 'zod'
export const API_CONFIGURATION_AGENTS = [
  'orca-agent',
  'claude',
  'opencode',
  'hermes',
  'gemini',
  'qwen-code',
  'aider',
  'goose',
  'codex',
  'pi',
  'kimi',
  'claude-agent-teams',
  'cursor',
  'amp'
] as const
export const AgentApiAgent = z.enum(API_CONFIGURATION_AGENTS)
export const AgentApiProtocol = z.enum([
  'anthropic-messages',
  'openai-completions',
  'openai-responses',
  'google-genai',
  'agent-service'
])
export const AGENT_API_PROTOCOLS: Record<
  z.infer<typeof AgentApiAgent>,
  readonly z.infer<typeof AgentApiProtocol>[]
> = {
  'orca-agent': ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-genai'],
  claude: ['anthropic-messages'],
  opencode: ['anthropic-messages', 'openai-completions', 'openai-responses'],
  hermes: ['openai-completions', 'openai-responses', 'anthropic-messages'],
  gemini: ['google-genai'],
  'qwen-code': ['openai-completions'],
  aider: ['openai-completions'],
  goose: ['openai-completions'],
  codex: ['openai-responses'],
  pi: ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-genai'],
  kimi: ['openai-completions', 'anthropic-messages'],
  'claude-agent-teams': ['anthropic-messages'],
  cursor: ['agent-service'],
  amp: ['agent-service']
}
export const AGENT_SERVICE_API = {
  cursor: { baseUrl: 'https://api.cursor.com', key: 'CURSOR_API_KEY' },
  amp: { baseUrl: 'https://ampcode.com', key: 'AMP_API_KEY' }
} as const
export function isAgentServiceApi(agent: string): agent is keyof typeof AGENT_SERVICE_API {
  return agent === 'cursor' || agent === 'amp'
}
const Text = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((value) => !/[\r\n\0]/.test(value))
export const AgentApiConnection = z
  .object({
    agent: AgentApiAgent,
    protocol: AgentApiProtocol,
    baseUrl: Text.refine((value) => {
      try {
        const url = new URL(value)
        return (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        )
      } catch {
        return false
      }
    }, 'Use an HTTP(S) base URL without credentials, query parameters or a fragment'),
    model: Text,
    contextWindow: z.number().int().min(1024).max(20000000).optional(),
    apiKey: z
      .string()
      .min(1)
      .max(8192)
      .refine((value) => !/[\r\n\0]/.test(value)),
    credentialType: z.enum(['api-key', 'bearer']).default('api-key')
  })
  .strict()

export type AgentApiConnection = z.infer<typeof AgentApiConnection>
export type AgentApiAgent = z.infer<typeof AgentApiAgent>
