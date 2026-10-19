import type { AgentApiPreset } from '../../shared/agent-api-presets'
import { z } from 'zod'
import { AgentApiModelsRequest, type AgentApiModel } from '../../shared/agent-api-models'
import { AGENT_API_PROTOCOLS } from '../../shared/agent-api-connection'

const ModelRow = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  displayName: z.string().optional(),
  display_name: z.string().optional(),
  context_length: z.number().optional(),
  context_window: z.number().optional(),
  contextWindow: z.number().optional(),
  inputTokenLimit: z.number().optional(),
  max_input_tokens: z.number().optional()
})
const ModelPage = z.object({
  data: z.array(ModelRow).optional(),
  models: z.array(ModelRow).optional(),
  has_more: z.boolean().optional(),
  last_id: z.string().optional(),
  nextPageToken: z.string().optional()
})

export async function discoverAgentApiModels(
  input: AgentApiModelsRequest,
  fetcher: typeof fetch = fetch
): Promise<AgentApiModel[]> {
  const request = AgentApiModelsRequest.parse(input)
  if (!request.apiKey) {
    throw new Error('API key is required')
  }
  if (
    request.protocol === 'agent-service' ||
    !AGENT_API_PROTOCOLS[request.agent].includes(request.protocol)
  ) {
    throw new Error('This agent does not support model discovery for this protocol')
  }
  const base = request.baseUrl.replace(/\/+$/, '')
  const google = request.protocol === 'google-genai'
  const anthropic = request.protocol === 'anthropic-messages'
  const version = google ? 'v1beta' : 'v1'
  const url = new URL(`${base}${/\/v\d+(?:beta\d*)?$/.test(base) ? '' : `/${version}`}/models`)
  const headers: Record<string, string> = google
    ? { 'x-goog-api-key': request.apiKey }
    : anthropic && request.credentialType !== 'bearer'
      ? { 'x-api-key': request.apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${request.apiKey}` }
  if (anthropic) {
    headers['anthropic-version'] = '2023-06-01'
  }
  const models = new Map<string, AgentApiModel>()
  const signal = AbortSignal.timeout(15000)
  for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
    const response = await fetcher(url, { headers, signal, redirect: 'error' })
    if (!response.ok) {
      throw new Error(`Model list request failed (HTTP ${response.status})`)
    }
    const text = await response.text()
    if (text.length > 4 * 1024 * 1024) {
      throw new Error('Model list is too large')
    }
    const page = ModelPage.parse(JSON.parse(text))
    if (!page.data && !page.models) {
      throw new Error('The service did not return a model list')
    }
    for (const row of page.data ?? page.models ?? []) {
      const id = (row.id ?? row.name)?.replace(/^models\//, '')
      if (!id || id.length > 1024 || /[\r\n\0]/.test(id)) {
        continue
      }
      const context =
        row.context_window ??
        row.contextWindow ??
        row.context_length ??
        row.inputTokenLimit ??
        row.max_input_tokens
      models.set(id, {
        id,
        name: row.display_name ?? row.displayName ?? id,
        ...(context && Number.isInteger(context) && context >= 1024 && context <= 20000000
          ? { contextWindow: context }
          : {})
      })
    }
    if (google && page.nextPageToken) {
      url.searchParams.set('pageToken', page.nextPageToken)
    } else if (anthropic && page.has_more && page.last_id) {
      url.searchParams.set('after_id', page.last_id)
    } else {
      return [...models.values()].sort((a, b) => a.id.localeCompare(b.id))
    }
  }
  throw new Error('Model list has too many pages; narrow the service catalog')
}

export function discoverSavedAgentApiModels(
  presets: readonly AgentApiPreset[],
  request: AgentApiModelsRequest
) {
  const saved = presets.find((entry) => entry.id === request.presetId)
  // A retained credential must never be sent to an edited endpoint.
  const matches =
    saved &&
    saved.connection.agent === request.agent &&
    saved.connection.baseUrl === request.baseUrl &&
    saved.connection.protocol === request.protocol &&
    saved.connection.credentialType === request.credentialType
  return discoverAgentApiModels({
    ...request,
    apiKey: request.apiKey || (matches ? saved.connection.apiKey : undefined)
  })
}
