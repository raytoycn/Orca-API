export type ModelsListEntry = {
  agent: string
  source: 'api' | 'account'
  provider: string
  model: string
  label: string
  contextWindow?: number
  switchable: boolean
}

export function formatModelsList(result: { models: ModelsListEntry[] }): string {
  if (result.models.length === 0) {
    return 'No models found. Add an API configuration or sign in to a CLI agent first.'
  }
  const headers = ['agent', 'source', 'provider', 'model', 'switchable']
  const rows = result.models.map((entry) => [
    entry.agent,
    entry.source,
    entry.provider,
    entry.label || entry.model,
    entry.switchable ? 'yes' : 'no'
  ])
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]!.length))
  )
  const line = (row: readonly string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index]!)).join('  ')
  return [line(headers), ...rows.map(line)].join('\n')
}

export function formatModelsUse(result: {
  agent: string
  model: string
  provider?: string
}): string {
  return [
    `agent: ${result.agent}`,
    `model: ${result.model}`,
    ...(result.provider ? [`provider: ${result.provider}`] : [])
  ].join('\n')
}
