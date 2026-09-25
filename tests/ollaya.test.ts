import { describe, expect, it, vi } from 'vitest'
import {
  buildOllayaBody,
  connectionSchema,
  DEFAULT_CONNECTION,
  DEFAULT_QUESTIONS,
  EMPTY_WORKSPACE,
  questionsSchema,
  requestSchema,
  workspaceSchema,
  type EvaluationRequest,
} from '../src/shared/domain'
import { evaluateDecision, listOllayaModels } from '../src/main/api'

const connection = { ...DEFAULT_CONNECTION, provider: 'ollaya' as const }
const request: EvaluationRequest = {
  requestId: 'local-request',
  sessionId: 'local-session',
  connection,
  state: {
    input: 'Please refund the duplicate charge.',
    attachments: [{ name: 'note.txt', content: 'Order 123' }],
  },
  questions: {
    department: {
      type: 'choice',
      instructions: 'Which team?',
      criteria: { billing: 'Payments', technical: 'Bugs' },
    },
    urgency: { type: 'score', instructions: 'How urgent?', criteria: ['Can wait', 'Today', 'Now'] },
    refund: { type: 'noul', instructions: 'Does the customer want a refund?' },
  },
  timeout: 300,
  privateRouting: true,
}
const response = {
  model: 'laya:en',
  answers: {
    department: {
      type: 'choice',
      choice: 'billing',
      confidence: 0.8,
      probabilities: { billing: 0.9, technical: 0.1 },
    },
    urgency: {
      type: 'score',
      score: 1.1982,
      confidence: 0.3418,
      legend: { '0': 'Can wait', '1': 'Today', '2': 'Now' },
      probabilities: { '0': 0.1203, '1': 0.5612, '2': 0.3185 },
    },
    refund: { type: 'noul', noul: 0.9127 },
  },
  usage: { input_tokens: 118, output_tokens: 0 },
  routing: {
    router: 'laya:latest',
    model: 'laya:en',
    route: 'english',
    reason: 'English Latin text',
  },
  state_truncated: true,
  total_duration: 18734512,
  load_duration: 0,
  eval_duration: 16302117,
}
const jsonFetch = (value: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value), { status }))

describe('Ollaya decisions', () => {
  it('sends typed decisions to the configured server without OpenRouter fields or authentication', async () => {
    const fetcher = jsonFetch(response)
    const signal = new AbortController().signal
    expect(await evaluateDecision(request, '', signal, fetcher)).toEqual(response)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('http://localhost:11435/api/decide')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init?.signal).toBe(signal)
    expect(init?.redirect).toBe('error')
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'laya',
      state: request.state,
      questions: request.questions,
    })
  })
  it('supports custom models, proxy prefixes, and optional server authentication', async () => {
    const fetcher = jsonFetch(response)
    await evaluateDecision(
      {
        ...request,
        connection: {
          ...connection,
          baseUrl: 'https://models.example/ollaya/v1/',
          model: 'my-triage:v2',
        },
      },
      'server-key',
      new AbortController().signal,
      fetcher,
    )
    expect(fetcher.mock.calls[0][0]).toBe('https://models.example/ollaya/api/decide')
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer server-key' })
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).model).toBe('my-triage:v2')
  })
  it.each([
    ['MODEL_NOT_FOUND', 404, 'not installed'],
    ['TOO_MANY_OPTIONS', 422, 'context budget'],
    ['INPUT_TOO_LONG', 422, 'context length'],
    ['MODEL_LOAD_FAILED', 500, 'could not load'],
    ['UNSUPPORTED_MODEL', 501, 'cannot run'],
    ['QUEUE_FULL', 503, 'queue is full'],
    ['UNAUTHORIZED', 401, 'OLLAYA_API_KEY'],
    ['INVALID_REQUEST', 422, 'rejected the questions'],
    ['UNKNOWN', 502, 'HTTP 502'],
  ])('explains %s without exposing raw server payloads', async (code, status, expected) => {
    const fetcher = jsonFetch({ code, error: 'private payload' }, status)
    await expect(
      evaluateDecision(request, '', new AbortController().signal, fetcher),
    ).rejects.toThrow(expected)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('handles non-JSON failures and malformed successes', async () => {
    for (const status of [200, 404]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('<html>proxy page</html>', { status }))
      await expect(
        evaluateDecision(request, '', new AbortController().signal, fetcher),
      ).rejects.toThrow(status === 200 ? 'unexpected response format' : 'endpoint was not found')
    }
  })
  it('does not retry or fall back when cancelled', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('Stopped', 'AbortError'))
    await expect(
      evaluateDecision(request, '', new AbortController().signal, fetcher),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('rejects invalid Ollaya answers', async () => {
    const fetcher = jsonFetch({
      ...response,
      answers: { ...response.answers, refund: { type: 'noul', noul: 3 } },
    })
    await expect(
      evaluateDecision(request, '', new AbortController().signal, fetcher),
    ).rejects.toThrow('unexpected response')
  })
  it('enforces Ollaya option limits before making requests', async () => {
    for (const questions of [
      {
        q: {
          type: 'choice' as const,
          instructions: 'Choose',
          criteria: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [String(i), null])),
        },
      },
      { q: { type: 'score' as const, instructions: 'Rate', criteria: Array(11).fill('Level') } },
    ]) {
      const fetcher = vi.fn<typeof fetch>()
      await expect(
        evaluateDecision({ ...request, questions }, '', new AbortController().signal, fetcher),
      ).rejects.toThrow('Ollaya allows at most')
      expect(fetcher).not.toHaveBeenCalled()
    }
  })
  it('supports the full 256-question limit and longer model-loading timeout', () => {
    const questions = Object.fromEntries(
      Array.from({ length: 256 }, (_, i) => [
        `q${i}`,
        { type: 'noul', instructions: 'Is it ready?' },
      ]),
    )
    expect(
      Object.keys(
        buildOllayaBody({ ...request, questions: questionsSchema.parse(questions) }).questions,
      ),
    ).toHaveLength(256)
    expect(
      questionsSchema.safeParse({ ...questions, extra: { type: 'noul', instructions: 'Ready?' } })
        .success,
    ).toBe(false)
    expect(requestSchema.safeParse({ ...request, timeout: 600 }).success).toBe(true)
    expect(requestSchema.safeParse({ ...request, timeout: 601 }).success).toBe(false)
  })
  it('accepts Ollaya label arrays and question IDs as instructions', () => {
    const questions = questionsSchema.parse({
      sentiment: { type: 'choice', criteria: ['positive', 'negative'] },
      is_spam: { type: 'noul', instructions: null },
    })
    expect(questions.sentiment).toEqual({
      type: 'choice',
      instructions: 'sentiment',
      criteria: { positive: null, negative: null },
    })
    expect(questions.is_spam.instructions).toBe('is_spam')
    expect(
      questionsSchema.safeParse({ q: { type: 'choice', criteria: ['same', 'same'] } }).success,
    ).toBe(false)
  })
})

describe('Ollaya discovery and persistence', () => {
  it('normalizes pasted API bases consistently across settings, persistence, and transport', () => {
    const parsed = connectionSchema.parse({
      ...connection,
      baseUrl: 'https://models.example/ollaya/api/v1/',
    })
    expect(parsed.baseUrl).toBe('https://models.example/ollaya')
    expect(connectionSchema.parse(parsed)).toEqual(parsed)
  })
  it.each([
    { models: [] },
    { models: [{ name: 'laya:en', description: 'English', release_date: '2026-09-23' }] },
  ])('discovers installed models including empty servers', async ({ models }) => {
    const fetcher = jsonFetch({ models })
    expect(await listOllayaModels(connection, '', fetcher)).toEqual(models)
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:11435/v1/models')
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({})
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error')
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
  it('authenticates discovery and rejects malformed lists', async () => {
    const fetcher = jsonFetch({ models: [{ id: 'wrong-schema' }] })
    await expect(listOllayaModels(connection, 'local-key', fetcher)).rejects.toThrow(
      'unexpected model list',
    )
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer local-key' })
  })
  it.each([
    'file:///tmp/models',
    'javascript:alert(1)',
    'https://key:secret@example.com',
    'https://example.com?key=secret',
    'https://example.com/#secret',
    'not a url',
  ])('rejects unsafe or ambiguous URLs: %s', (baseUrl) => {
    expect(connectionSchema.safeParse({ ...connection, baseUrl }).success).toBe(false)
  })
  it('migrates old workspaces without changing their provider and preserves Ollaya metadata in backups', () => {
    expect(
      workspaceSchema.parse({ version: 1, settings: {}, conversations: [] }).settings.connection,
    ).toEqual(DEFAULT_CONNECTION)
    const workspace = workspaceSchema.parse({
      ...EMPTY_WORKSPACE,
      settings: { connection: { ...connection, apiKey: 'secret' } },
      conversations: [
        {
          id: 'c',
          title: 'Local',
          createdAt: '',
          updatedAt: '',
          questions: DEFAULT_QUESTIONS,
          turns: [
            { id: 't', content: 'Hello', createdAt: '', questions: request.questions, response },
          ],
        },
      ],
    })
    expect(workspace.settings.connection).toEqual(connection)
    expect(workspace.conversations[0].turns[0].response).toEqual(response)
    expect(JSON.stringify(workspace)).not.toContain('secret')
  })
})
