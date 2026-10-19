import { apply as installAutoReview } from '@deepseek-ai/dsh-experimental-auto-review'

export const name = 'orca-chat-permissions'
export const inject = ['permissionPresets', 'sessions', 'approval', 'llm', 'tools']

export function apply(ctx) {
  installAutoReview(ctx)
  const mode = process.env.ORCA_CHAT_PERMISSION_MODE ?? 'ask'
  const preset =
    mode === 'full-access' ? 'danger-full-access' : mode === 'auto' ? 'auto' : 'workspace-write'
  const select = (session) => ctx.permissionPresets.set(session, preset)
  ctx.on('session/created', select, { global: true })
  for (const session of ctx.sessions.list()) {
    select(session)
  }
}
