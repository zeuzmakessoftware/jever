import {
  buildBody,
  ENDPOINT,
  responseSchema,
  validateAnswers,
  type EvaluationRequest,
} from '../shared/domain'

export async function evaluateDecision(
  request: EvaluationRequest,
  key: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const body = buildBody(request)
  if (!key.trim()) throw new Error('Add your OpenRouter API key in Settings to run a decision.')
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'Jever',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
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
  const parsed = responseSchema.safeParse(await response.json())
  if (!parsed.success)
    throw new Error(
      'OpenRouter returned an unexpected response format. Your context has been preserved.',
    )
  return validateAnswers(parsed.data, request.questions)
}
