/** What the mounted list last committed, for the shadow check against main's retention. */
export type WindowSidebarTemporalReadout = {
  sessionId: string
  /** Undefined while sleeping workspaces are shown. */
  retainedIds: ReadonlySet<string> | undefined
}

let sessionId: string | null = null
// Kept apart from the session: the sweep may commit before the list's session begins.
let retainedIds: ReadonlySet<string> | undefined

export function beginWindowSidebarTemporalReadout(nextSessionId: string): void {
  sessionId = nextSessionId
}

export function recordWindowSleepingRetention(ids: ReadonlySet<string> | undefined): void {
  retainedIds = ids
}

/** The list unmounted; nothing is compared until the next one begins. */
export function clearWindowSidebarTemporalReadout(endedSessionId: string): void {
  if (sessionId === endedSessionId) {
    sessionId = null
  }
}

export function readWindowSidebarTemporal(): WindowSidebarTemporalReadout | null {
  return sessionId === null ? null : { sessionId, retainedIds }
}
