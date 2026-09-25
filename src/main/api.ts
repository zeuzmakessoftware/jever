import {
  buildBody,
  buildOllayaBody,
  connectionSchema,
  modelListSchema,
  ENDPOINT,
  responseSchema,
  validateAnswers,
  type EvaluationRequest,
  type Connection,
} from '../shared/domain'

export async function evaluateDecision(
  request: EvaluationRequest,
  key: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const connection = connectionSchema.parse(request.connection ?? {})
  const local = connection.provider === 'ollaya'
  const body = local ? buildOllayaBody(request) : buildBody(request)
  if (!local && !key.trim())
    throw new Error('Add your OpenRouter API key in Settings to run a decision.')
  const response = await fetcher(local ? `${connection.baseUrl}/api/decide` : ENDPOINT, {
    method: 'POST',
    redirect: 'error',
    signal,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
      ...(!local ? { 'X-OpenRouter-Title': 'Jever' } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    if (local) throw await ollayaError(response)
    const messages: Record<number, string> = {
      401: 'Your OpenRouter key was not accepted. Update it in Settings.',
      402: 'Your OpenRouter account needs credits to run this decision.',
      403: 'OpenRouter denied this request. Check the permissions on your API key.',
      404: 'The Jev model or Decisions endpoint is unavailable on OpenRouter.',
      413: 'This context is too large. Shorten it or remove an attachment.',
      429: 'OpenRouter is rate limiting requests. Wait a moment, then retry.',
      502: 'The Jev provider is temporarily unavailable. Try again shortly.',
      503: 'No Jev provider is available for these routing settings. Try again later or review private routing.',
      529: 'The Jev provider is overloaded. Wait a moment, then retry.',
    }
    throw new Error(
      messages[response.status] ??
        `OpenRouter could not complete the decision (HTTP ${response.status}). Check your questions and try again.`,
    )
  }
  const parsed = responseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success)
    throw new Error(
      `${local ? 'Ollaya' : 'OpenRouter'} returned an unexpected response format. Your context has been preserved.`,
    )
  return validateAnswers(parsed.data, request.questions)
}

async function ollayaError(response: Response) {
  const body = await response.json().catch(() => null)
  const messages: Record<string, string> = {
    MODEL_NOT_FOUND:
      'The selected model is not installed. Run ollaya pull with that model name, then refresh models in Settings.',
    TOO_MANY_OPTIONS:
      'These options exceed the model’s context budget. Use fewer or shorter options, or select a larger-context model.',
    INPUT_TOO_LONG:
      'Ollaya rejected the context length. Shorten it or remove attachments or history.',
    MODEL_LOAD_FAILED:
      'Ollaya could not load this model. Check server logs, available memory, and model files.',
    UNSUPPORTED_MODEL:
      'This Ollaya build cannot run the selected model. Update Ollaya or choose another model.',
    QUEUE_FULL: 'Ollaya’s request queue is full. Wait a moment and retry.',
    INVALID_REQUEST:
      'Ollaya rejected the questions or context. Check the question types, criteria, and model limits.',
  }
  const statuses: Record<number, string> = {
    401: 'Ollaya requires a valid API key. Save the server’s OLLAYA_API_KEY in Settings.',
    403: 'Ollaya denied access. Check the server’s host and access settings.',
    404: 'The Ollaya endpoint was not found. Check the server URL and Ollaya version.',
    413: 'This context is too large for Ollaya. Shorten it or remove an attachment.',
    503: 'Ollaya is busy. Wait a moment and retry.',
  }
  const code = typeof body?.code === 'string' ? body.code : ''
  return new Error(
    (Object.hasOwn(messages, code) ? messages[code] : statuses[response.status]) ??
      `Ollaya could not complete the request (HTTP ${response.status}). Check the server and try again.`,
  )
}

export async function listOllayaModels(
  connection: Connection,
  key: string,
  fetcher: typeof fetch = fetch,
) {
  const parsed = connectionSchema.parse(connection)
  if (parsed.provider !== 'ollaya') throw new Error('Model discovery is available for Ollaya.')
  const response = await fetcher(`${parsed.baseUrl}/v1/models`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  })
  if (!response.ok) throw await ollayaError(response)
  const result = modelListSchema.safeParse(await response.json().catch(() => null))
  if (!result.success) throw new Error('Ollaya returned an unexpected model list.')
  return result.data.models
}
