type ClaudeModelPricing = {
  input: number
  output: number
  cacheRead: number
  /** 5-minute TTL cache write (1.25x base input). */
  cacheWrite: number
  /** 1-hour TTL cache write (2x base input). */
  cacheWrite1h: number
  thresholdTokens?: number
  inputAboveThreshold?: number
  outputAboveThreshold?: number
  cacheReadAboveThreshold?: number
  cacheWriteAboveThreshold?: number
  cacheWrite1hAboveThreshold?: number
}

const LONG_CONTEXT_THRESHOLD_TOKENS = 200_000
const SONNET_LONG_CONTEXT_PRICING = {
  thresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
  inputAboveThreshold: 6,
  outputAboveThreshold: 22.5,
  cacheReadAboveThreshold: 0.6,
  cacheWriteAboveThreshold: 7.5,
  cacheWrite1hAboveThreshold: 12
} satisfies Partial<ClaudeModelPricing>

// Mythos models are billed at their Fable counterparts' rates.
const FABLE_5_1_PRICING: ClaudeModelPricing = {
  input: 10,
  output: 50,
  cacheRead: 0.25,
  cacheWrite: 12.5,
  cacheWrite1h: 20
}
const FABLE_5_PRICING: ClaudeModelPricing = {
  input: 10,
  output: 50,
  cacheRead: 1,
  cacheWrite: 12.5,
  cacheWrite1h: 20
}

/**
 * Keyed by `claude-<family>-<major>[-<minor>]`; `normalizeModelForPricing` resolves only exact
 * keys, so a new model stays unpriced (and flagged in the UI) until its row lands here.
 * Why no `claude-haiku-5-5`: it reprices a whole request whose prompt exceeds 100K tokens, and
 * these estimates run on daily totals that cannot tell which requests crossed that line.
 */
export const MODEL_PRICING: Record<string, ClaudeModelPricing> = {
  'claude-fable-5-1': FABLE_5_1_PRICING,
  'claude-mythos-5-1': FABLE_5_1_PRICING,
  'claude-fable-5': FABLE_5_PRICING,
  'claude-mythos-5': FABLE_5_PRICING,
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, cacheWrite1h: 8 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, cacheWrite1h: 10 },
  // Why: Sonnet 5.5 cache reads are 0.05x base input, half of Sonnet 5's.
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5, cacheWrite1h: 4 },
  // Why: Sonnet 5 bills its full 1M window at flat rates, so no long-context tier here.
  // Why: $2/$10 needs no date dimension — it launched as introductory pricing through
  // 2026-08-31 but is now the standard price; the 2026-09-01 rise to $3/$15 was cancelled.
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, cacheWrite1h: 4 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, cacheWrite1h: 10 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, cacheWrite1h: 10 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, cacheWrite1h: 10 },
  'claude-opus-4-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, cacheWrite1h: 10 },
  'claude-opus-4-1': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75, cacheWrite1h: 30 },
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75, cacheWrite1h: 30 },
  // Claude 4.6 and later keep standard rates across the full 1M context window.
  'claude-sonnet-4-6': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6
  },
  'claude-sonnet-4-5': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    ...SONNET_LONG_CONTEXT_PRICING
  },
  'claude-sonnet-4': {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    ...SONNET_LONG_CONTEXT_PRICING
  },
  'claude-sonnet-3-7': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, cacheWrite1h: 6 },
  'claude-sonnet-3-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, cacheWrite1h: 6 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25, cacheWrite1h: 2 },
  'claude-haiku-3-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1, cacheWrite1h: 1.6 },
  'claude-haiku-3': {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.03,
    cacheWrite: 0.3,
    cacheWrite1h: 0.5
  }
}

// Opaque IDs that carry no family or version to parse.
const MODEL_ALIASES: Record<string, string> = {
  model_placeholder_m26: 'claude-opus-4-6',
  model_placeholder_m35: 'claude-sonnet-4-6'
}

const MODEL_FAMILIES = 'fable|mythos|opus|sonnet|haiku'
// `claude-opus-5-5[1m]`, `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, `claude-opus-4@20250514`.
// Why: a minor is at most two digits and not followed by a letter, so date stamps and the
// `-1m` context suffix are not read as point releases.
const FAMILY_FIRST_ID = new RegExp(
  `(?:^|[^a-z])(?<family>${MODEL_FAMILIES})-(?<major>\\d{1,2})(?:-(?<minor>\\d{1,2})(?![0-9a-z]))?(?![0-9])`
)
// Legacy version-first IDs such as `claude-3-5-sonnet-20241022`, still in historical logs.
const VERSION_FIRST_ID = new RegExp(
  `(?:^|[^0-9a-z])(?<major>\\d{1,2})(?:-(?<minor>\\d{1,2}))?-(?<family>${MODEL_FAMILIES})(?![a-z])`
)

function parseModelKey(normalized: string): string | null {
  const groups = (FAMILY_FIRST_ID.exec(normalized) ?? VERSION_FIRST_ID.exec(normalized))?.groups
  if (!groups) {
    return null
  }
  const { family, major, minor } = groups
  return minor === undefined ? `claude-${family}-${major}` : `claude-${family}-${major}-${minor}`
}

export function normalizeModelForPricing(model: string | null): string | null {
  if (!model) {
    return null
  }
  const lower = model.toLowerCase().trim()
  const key = MODEL_ALIASES[lower] ?? parseModelKey(lower.replace(/\./g, '-'))
  return key !== null && Object.hasOwn(MODEL_PRICING, key) ? key : null
}

function calculateTieredCost(
  tokens: number,
  basePrice: number,
  abovePrice?: number,
  threshold?: number
): number {
  if (threshold === undefined || abovePrice === undefined) {
    return tokens * basePrice
  }
  const belowTokens = Math.min(tokens, threshold)
  const aboveTokens = Math.max(tokens - threshold, 0)
  return belowTokens * basePrice + aboveTokens * abovePrice
}

/**
 * @param cacheWriteTokens every cache write, both TTLs
 * @param cacheWrite1hTokens the 1-hour-TTL subset of `cacheWriteTokens`
 */
export function estimateCostUsd(
  model: string | null,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
  cacheWrite1hTokens = 0
): number | null {
  const normalized = normalizeModelForPricing(model)
  if (!normalized) {
    return null
  }
  const pricing = MODEL_PRICING[normalized]
  const write1hTokens = Math.min(Math.max(cacheWrite1hTokens, 0), cacheWriteTokens)
  // Why: both TTL buckets share one long-context allowance. Giving each its own
  // would make a split bucket cheaper than the same tokens billed entirely at 5m.
  const write1hShare = cacheWriteTokens > 0 ? write1hTokens / cacheWriteTokens : 0
  const write5mThreshold =
    pricing.thresholdTokens === undefined ? undefined : pricing.thresholdTokens * (1 - write1hShare)
  const write1hThreshold =
    pricing.thresholdTokens === undefined ? undefined : pricing.thresholdTokens * write1hShare
  return (
    (calculateTieredCost(
      inputTokens,
      pricing.input,
      pricing.inputAboveThreshold,
      pricing.thresholdTokens
    ) +
      calculateTieredCost(
        outputTokens,
        pricing.output,
        pricing.outputAboveThreshold,
        pricing.thresholdTokens
      ) +
      calculateTieredCost(
        cacheReadTokens,
        pricing.cacheRead,
        pricing.cacheReadAboveThreshold,
        pricing.thresholdTokens
      ) +
      calculateTieredCost(
        cacheWriteTokens - write1hTokens,
        pricing.cacheWrite,
        pricing.cacheWriteAboveThreshold,
        write5mThreshold
      ) +
      calculateTieredCost(
        write1hTokens,
        pricing.cacheWrite1h,
        pricing.cacheWrite1hAboveThreshold,
        write1hThreshold
      )) /
    1_000_000
  )
}
