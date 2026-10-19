import { z } from 'zod'
import { AgentApiConnection, AgentApiAgent } from '../agent-api-connection'
import { AgentApiPresetDraft } from '../agent-api-presets'
import { isTuiAgent } from '../tui-agent-config'
import type { TuiAgent } from '../tui-agent'

const Agent = z.custom<TuiAgent>((value) => typeof value === 'string' && isTuiAgent(value))
const Value = z
  .string()
  .max(8 * 1024)
  .refine((value) => !value.includes('\0'), 'Invalid value')
const Name = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Invalid variable name')

export const AgentLaunchSettingsMutation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('api-preset-save'), preset: AgentApiPresetDraft }).strict(),
  z
    .object({
      type: z.literal('api-preset-activate'),
      agent: AgentApiAgent,
      id: z.string().min(1).max(128),
      model: z.string().trim().min(1).max(1024).optional(),
      contextWindow: z.number().int().positive().max(100_000_000).optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('api-preset-delete'),
      agent: AgentApiAgent,
      id: z.string().min(1).max(128)
    })
    .strict(),
  z.object({ type: z.literal('api-set'), connection: AgentApiConnection }).strict(),
  z.object({ type: z.literal('api-clear'), agent: AgentApiAgent }).strict(),
  z
    .object({
      type: z.literal('default'),
      agent: z.union([Agent, z.literal('blank'), z.null()]),
      setupOnly: z.boolean().optional()
    })
    .strict(),
  z.object({ type: z.literal('availability'), agent: Agent, enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('permissions'), mode: z.enum(['manual', 'yolo']) }).strict(),
  z.object({ type: z.literal('command'), agent: Agent, value: Value }).strict(),
  z.object({ type: z.literal('arguments'), agent: Agent, value: Value }).strict(),
  z.object({ type: z.literal('environment-set'), agent: Agent, name: Name, value: Value }).strict(),
  z.object({ type: z.literal('environment-remove'), agent: Agent, name: Name }).strict()
])
