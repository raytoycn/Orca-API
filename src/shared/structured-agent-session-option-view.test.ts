import { describe, expect, it } from 'vitest'
import { CLAUDE_SESSION_OPTION_CATALOG } from './agent-session-option-catalog-claude-codex'
import type { AgentSessionModelCatalogResult } from './agent-session-wire'
import {
  applyStructuredAgentSessionModelCatalog,
  applyStructuredAgentSessionOptions,
  createStructuredAgentSessionOptionState,
  structuredAgentSessionOptionSnapshot,
  type StructuredAgentSessionOptionState
} from './structured-agent-session-options'
import {
  nearestAgentEffort,
  structuredAgentSessionListedPicks,
  structuredAgentSessionOptionView,
  structuredAgentSessionSendSelection,
  structuredAgentSessionShownSnapshot
} from './structured-agent-session-option-view'

const levels = (...values: string[]) => values.map((value) => ({ value, label: value }))
const OPUS = { id: 'opus[1m]', label: 'Opus', isDefault: false, efforts: levels('low', 'xhigh') }
const SONNET = { id: 'sonnet', label: 'Sonnet', isDefault: false, efforts: levels('low', 'high') }
// Claude's session-less listing marks no default row.
const LISTED: AgentSessionModelCatalogResult = { origin: 'probe', fetchedAt: 1, models: [OPUS] }
const remembered = { model: 'claude-gone', effort: 'max' }

const fresh = () => createStructuredAgentSessionOptionState('claude', CLAUDE_SESSION_OPTION_CATALOG)
const withHostList = (state = fresh(), catalog: AgentSessionModelCatalogResult = LISTED) =>
  applyStructuredAgentSessionModelCatalog(state, CLAUDE_SESSION_OPTION_CATALOG, catalog, {
    newLaunch: true
  })
// A chat's own answer lists its listing's rows plus its own model, named by its id; `listed` are
// the ids its listing names (none from an older host).
const stopped = (model: string, rows = [OPUS], listed = rows.map((row) => row.id)) =>
  applyStructuredAgentSessionOptions(fresh(), CLAUDE_SESSION_OPTION_CATALOG, {
    models: [...rows, { id: model, label: model, isDefault: false, efforts: [] }],
    listedModelIds: listed,
    current: { model, effort: 'high' }
  })

function shown(...args: Parameters<typeof structuredAgentSessionOptionView>) {
  const snapshot = structuredAgentSessionOptionSnapshot(structuredAgentSessionOptionView(...args))
  const value = (id: string) => {
    const kind = snapshot.find((descriptor) => descriptor.id === id)?.kind
    return kind?.type === 'select' ? kind.currentValue : undefined
  }
  return { model: value('model'), effort: value('effort') }
}

describe('a Claude model the verified list no longer offers', () => {
  it('shows a new chat on the first listed row, effort moved to the nearest level', () => {
    const state = withHostList()
    expect(shown(state, remembered, {}, true)).toEqual({ model: 'opus[1m]', effort: 'xhigh' })
    expect(structuredAgentSessionListedPicks(state, remembered, {})).toEqual({
      model: 'opus[1m]',
      effort: 'xhigh'
    })
    // Derived only: the record never takes it.
    expect(state.record.model).toBeUndefined()
  })

  it('shows a stopped chat on it too, its own unlisted row aside', () => {
    expect(shown(withHostList(stopped('claude-gone')), undefined, {}, true)).toEqual({
      model: 'opus[1m]',
      effort: 'xhigh'
    })
  })

  it('keeps a model the listing names, and takes a listed row whose label is its id', () => {
    const live = withHostList(stopped('sonnet', [OPUS, SONNET]), {
      ...LISTED,
      models: [OPUS, SONNET]
    })
    expect(structuredAgentSessionListedPicks(live, undefined, {})).toBeNull()
    const held = { model: 'opus[1m]' }
    expect(structuredAgentSessionListedPicks(withHostList(), remembered, held)).toBeNull()
    // A listing with no display names names each row by its id.
    const plain = { id: 'opus', label: 'opus', isDefault: true, efforts: levels('low', 'high') }
    const unnamed = withHostList(fresh(), { ...LISTED, models: [SONNET, plain] })
    expect(structuredAgentSessionListedPicks(unnamed, remembered, {})).toEqual({
      model: 'opus',
      effort: 'high'
    })
  })

  it('moves a model only the session itself lists, as its listing does not name it', () => {
    const live = stopped('sonnet', [OPUS, SONNET], ['opus[1m]'])
    expect(structuredAgentSessionListedPicks(live, undefined, {})).toEqual({
      model: 'opus[1m]',
      effort: 'xhigh'
    })
  })

  it("shows the chat's own model to a host that cannot take a send's model", () => {
    expect(shown(withHostList(stopped('claude-gone')), undefined, {}, false).model).toBe(
      'claude-gone'
    )
  })

  it.each<[string, AgentSessionModelCatalogResult]>([
    ['still listing', { ...LISTED, listingInProgress: true }],
    ['behind a failed sign-in', { ...LISTED, unavailable: { reason: 'notSignedIn' } }]
  ])('keeps the model while the list is %s', (_name, catalog) => {
    const state = withHostList(fresh(), catalog)
    expect(structuredAgentSessionListedPicks(state, remembered, {})).toBeNull()
  })

  it('takes no row the finished listing does not name, as from a built-in fallback list', () => {
    // A live answer from before startup finished lists the built-in rows, not the account's.
    const fallback = applyStructuredAgentSessionOptions(
      withHostList(),
      CLAUDE_SESSION_OPTION_CATALOG,
      {
        models: CLAUDE_SESSION_OPTION_CATALOG.models.map((model) => ({
          id: model.id,
          label: model.label,
          isDefault: model.isDefault === true,
          efforts: []
        })),
        current: { model: 'claude-gone' }
      }
    )
    expect(structuredAgentSessionListedPicks(fallback, undefined, {})).toBeNull()
  })

  it.each<[string, unknown[]]>([
    ['a null row', [null]],
    ['a row with no efforts', [{ id: 'opus[1m]', label: 'Opus', isDefault: false }]],
    ['no rows', []]
  ])('keeps the model when the host answer has %s', (_name, models) => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a malformed host answer is the case under test.
    const answer = { origin: 'probe', fetchedAt: 1, models } as AgentSessionModelCatalogResult
    const state = withHostList(stopped('claude-gone', [OPUS], []), answer)
    expect(structuredAgentSessionListedPicks(state, undefined, {})).toBeNull()
  })

  it('keeps the model before any host answer, and on an answer that verifies no row', () => {
    expect(structuredAgentSessionListedPicks(fresh(), remembered, {})).toBeNull()
    // An older host's answer names no listed ids.
    const unverified = withHostList(stopped('claude-gone', [OPUS], []))
    expect(structuredAgentSessionListedPicks(unverified, undefined, {})).toBeNull()
  })
})

describe('what a send carries', () => {
  const carried = (
    state: StructuredAgentSessionOptionState,
    seed?: Readonly<Record<string, string>>,
    picks: Readonly<Record<string, string>> = {}
  ) =>
    structuredAgentSessionSendSelection(
      state.record.agent,
      structuredAgentSessionOptionSnapshot(
        structuredAgentSessionOptionView(state, seed, picks, true)
      )
    )

  it('carries the shown model and effort, the replacement included', () => {
    expect(carried(withHostList(), remembered)).toEqual({ model: 'opus[1m]', effort: 'xhigh' })
    // A chat that still runs a listed model carries that one.
    const listed = { ...LISTED, models: [OPUS, SONNET] }
    expect(carried(withHostList(stopped('sonnet', [OPUS, SONNET]), listed))).toEqual({
      model: 'sonnet',
      effort: 'high'
    })
  })

  it('carries the default it shows, and a model it keeps while the list is unproven', () => {
    const named = { ...SONNET, isDefault: true }
    const listing = { ...LISTED, models: [OPUS, named], listingNamesConfiguredModel: true }
    expect(carried(withHostList(fresh(), listing))).toEqual({ model: 'sonnet' })
    expect(carried(stopped('claude-gone', [OPUS], []))).toEqual({ model: 'claude-gone' })
  })

  it("keeps a model the chat's own listing names, whichever CLI version wrote the host's", () => {
    // Claude Code 2.1.280 lists opus[1m] as its default and no plain opus; 2.1.302 the reverse.
    const row = (id: string, isDefault = false) => ({ ...SONNET, id, label: id, isDefault })
    const cli280 = [row('opus[1m]', true), row('sonnet'), row('sonnet[1m]'), row('haiku')]
    const cli302 = [row('opus', true), row('sonnet'), row('haiku')]
    const sent = (child: typeof cli280, model: string, host: typeof cli280) =>
      carried(withHostList(stopped(model, child), { ...LISTED, models: host }))?.model
    expect(sent(cli280, 'opus[1m]', cli302)).toBe('opus[1m]')
    expect(sent(cli302, 'opus', cli280)).toBe('opus')
    // A model the chat's own CLI no longer lists still moves to that CLI's default.
    expect(sent(cli302, 'opus[1m]', cli280)).toBe('opus')
    // An older host names no listed ids: only the chat's own default, where the host lists it.
    const older = (child: typeof cli280, model: string, host: typeof cli280) =>
      carried(withHostList(stopped(model, child, []), { ...LISTED, models: host }))?.model
    expect(older(cli280, 'opus[1m]', cli302)).toBe('opus[1m]')
    expect(older(cli302, 'opus', cli280)).toBe('opus')
    expect(older(cli302, 'opus[1m]', cli302)).toBe('opus')
  })

  it('resolves a pick on its way as the picker shows it, a gone model it names included', () => {
    const listed = withHostList(fresh(), { ...LISTED, models: [OPUS, SONNET] })
    expect(carried(listed, remembered, { model: 'sonnet' })).toMatchObject({ model: 'sonnet' })
    expect(carried(withHostList(), undefined, { model: 'claude-retired' })).toMatchObject({
      model: 'opus[1m]'
    })
    expect(carried(withHostList(), remembered, { effort: 'low' })).toEqual({
      model: 'opus[1m]',
      effort: 'low'
    })
  })

  it('carries nothing before a model shows, or for another agent', () => {
    expect(carried(fresh())).toBeUndefined()
    const codex = applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('codex', CLAUDE_SESSION_OPTION_CATALOG),
      CLAUDE_SESSION_OPTION_CATALOG,
      { models: [OPUS], current: { model: 'opus[1m]' } }
    )
    expect(carried(codex)).toBeUndefined()
  })

  it("shows the phone's picker on the replacement too, only for a host that takes it", () => {
    const model = (takes: boolean) =>
      structuredAgentSessionShownSnapshot(withHostList(stopped('claude-gone')), takes).find(
        (descriptor) => descriptor.id === 'model'
      )?.kind
    expect(model(true)).toMatchObject({ currentValue: 'opus[1m]' })
    expect(model(false)).toMatchObject({ currentValue: 'claude-gone' })
  })
})

describe('nearestAgentEffort', () => {
  it('keeps an offered level, takes the higher on a tie, and names none it cannot rank', () => {
    expect(nearestAgentEffort('high', ['low', 'high'])).toBe('high')
    expect(nearestAgentEffort('medium', ['low', 'high'])).toBe('high')
    expect(nearestAgentEffort('max', ['low', 'xhigh'])).toBe('xhigh')
    expect(nearestAgentEffort('turbo', ['low', 'high'])).toBeUndefined()
  })
})
