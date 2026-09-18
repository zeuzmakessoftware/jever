import { describe, expect, it, vi } from 'vitest'
import {
  buildBody,
  DEFAULT_QUESTIONS,
  DEFAULT_SETTINGS,
  ENDPOINT,
  MODEL,
  parseContext,
  questionsSchema,
  requestSchema,
  responseSchema,
  reviewStatus,
  workspaceSchema,
  type EvaluationRequest,
} from '../src/shared/domain'
import { evaluateDecision } from '../src/main/api'

const request: EvaluationRequest = {
  requestId: 'test-request',
  sessionId: 'test-session',
  state: 'The release is ready.',
  questions: DEFAULT_QUESTIONS,
  timeout: 30,
  privateRouting: false,
}
const response = {
  model: 'typesafe/jev-1.13',
  provider: 'TypeSafe',
  answers: {
    decision: {
      type: 'choice',
      choice: 'positive',
      confidence: 0.8,
      probabilities: { positive: 0.9, neutral: 0.08, negative: 0.02 },
    },
  },
  usage: { input_tokens: 120, output_tokens: 20, cost: 0.000005 },
}

describe('Jev request contract', () => {
  it('locks the model and endpoint, and never enables fallback models', () => {
    const body = buildBody({ ...request, model: 'another-model' } as EvaluationRequest)
    expect(body.model).toBe(MODEL)
    expect(body.model).toBe('~typesafe/jev-latest')
    expect(ENDPOINT).toBe('https://openrouter.ai/api/alpha/decisions')
    expect(body.provider.allow_fallbacks).toBe(false)
    expect(body).not.toHaveProperty('models')
    expect(body).not.toHaveProperty('messages')
  })
  it('routes privately only when requested', () => {
    expect(buildBody(request).provider).not.toHaveProperty('data_collection')
    expect(buildBody({ ...request, privateRouting: true }).provider.data_collection).toBe('deny')
  })
  it('supports mixed questions with structured instructions in one call', () => {
    expect(
      questionsSchema.parse({
        a: {
          type: 'choice',
          instructions: { task: 'Select a route', path: 'input' },
          criteria: { first: ['One', 'Two'], second: null },
        },
        b: {
          type: 'score',
          instructions: 'How urgent?',
          criteria: ['Routine', { urgency: 'Immediate' }],
        },
        c: { type: 'noul', instructions: 'Does it work?', criteria: { true: 'Yes', false: 'No' } },
      }),
    ).toHaveProperty('c.type', 'noul')
  })
  it.each([
    {},
    { q: { type: 'choice', instructions: 'Choose', criteria: { only: null } } },
    { q: { type: 'score', instructions: 'Rate', criteria: ['Only'] } },
    { q: { type: 'noul', instructions: '' } },
    { q: { type: 'text', instructions: 'Generate prose' } },
  ])('rejects incomplete recipes %j', (value) => {
    expect(questionsSchema.safeParse(value).success).toBe(false)
  })
  it('bounds request size and timeout', () => {
    expect(requestSchema.safeParse({ ...request, state: 'x'.repeat(120_001) }).success).toBe(false)
    expect(requestSchema.safeParse({ ...request, timeout: 0 }).success).toBe(false)
  })
  it('keeps JSON objects and arrays structured, and allows plain text', () => {
    expect(parseContext('{"ticket":"Hello"}')).toEqual({ ticket: 'Hello' })
    expect(parseContext('[1,2]')).toEqual([1, 2])
    expect(parseContext('hello')).toBe('hello')
    expect(parseContext('null')).toBe('null')
  })
})

describe('OpenRouter transport', () => {
  it('posts only to Decisions and passes cancellation through', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    const controller = new AbortController()
    const result = await evaluateDecision(request, 'sk-or-test', controller.signal, fetcher)
    expect(result).toEqual(response)
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe(ENDPOINT)
    expect(init?.signal).toBe(controller.signal)
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-or-test' })
    expect(JSON.parse(init?.body as string)).toEqual(buildBody(request))
  })
  it('does not make a network request without a key', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      evaluateDecision(request, '', new AbortController().signal, fetcher),
    ).rejects.toThrow('API key')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    [401, 'not accepted'],
    [402, 'credits'],
    [429, 'rate limiting'],
    [503, 'No Jev provider'],
  ])('explains HTTP %i without leaking provider payloads', async (status, expected) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('sensitive upstream details', { status: Number(status) }))
    await expect(
      evaluateDecision(request, 'sk-or-test', new AbortController().signal, fetcher),
    ).rejects.toThrow(String(expected))
  })
  it('rejects malformed provider responses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: 'wrong API' }] })))
    await expect(
      evaluateDecision(request, 'sk-or-test', new AbortController().signal, fetcher),
    ).rejects.toThrow('unexpected response')
  })
  it('rejects omitted question answers', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ...response, answers: {} })))
    await expect(
      evaluateDecision(request, 'sk-or-test', new AbortController().signal, fetcher),
    ).rejects.toThrow('invalid answer')
  })
  it('rejects a choice that was never offered', async () => {
    const invalid = { ...response, answers: { decision: { type: 'choice', choice: 'invented' } } }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(invalid)))
    await expect(
      evaluateDecision(request, 'sk-or-test', new AbortController().signal, fetcher),
    ).rejects.toThrow('unknown choice')
  })
  it('rejects out-of-range scores', async () => {
    const invalid = { ...response, answers: { decision: { type: 'score', score: 7 } } }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(invalid)))
    await expect(
      evaluateDecision(
        {
          ...request,
          questions: {
            decision: { type: 'score', instructions: 'Rate', criteria: ['Low', 'High'] },
          },
        },
        'sk-or-test',
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow('out-of-range')
  })
  it('propagates abort without retrying or switching models', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('Stopped', 'AbortError'))
    await expect(
      evaluateDecision(request, 'sk-or-test', new AbortController().signal, fetcher),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
})

describe('result semantics and persistence', () => {
  it('uses reported confidence, not winning probability, for Choice', () => {
    expect(
      reviewStatus(
        { type: 'choice', choice: 'yes', confidence: 0.6, probabilities: { yes: 0.9, no: 0.1 } },
        0.7,
      ),
    ).toBe('Review suggested')
  })
  it('uses a symmetric yes/no probability threshold for Noul', () => {
    expect(reviewStatus({ type: 'noul', noul: 0.05 }, 0.8)).toBe('Above threshold')
    expect(reviewStatus({ type: 'noul', noul: 0.52 }, 0.8)).toBe('Review suggested')
  })
  it('flags responses without confidence for review', () => {
    expect(reviewStatus({ type: 'score', score: 1.2 }, 0.7)).toBe('Review suggested')
  })
  it('rejects invalid probabilities', () => {
    expect(
      responseSchema.safeParse({ ...response, answers: { q: { type: 'noul', noul: 1.3 } } })
        .success,
    ).toBe(false)
  })
  it('validates a backup and excludes credentials', () => {
    const data = workspaceSchema.parse({
      version: 1,
      conversations: [],
      presets: [],
      settings: DEFAULT_SETTINGS,
      apiKey: 'must-not-export',
    })
    expect(data).not.toHaveProperty('apiKey')
    expect(
      workspaceSchema.safeParse({ version: 3, settings: {}, conversations: 'invalid' }).success,
    ).toBe(false)
  })
})
