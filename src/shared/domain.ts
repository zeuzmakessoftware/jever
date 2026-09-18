import { z } from 'zod'

export const MODEL = '~typesafe/jev-latest' as const
export const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions' as const
const description = z.union([
  z.string().min(1),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
])
export const questionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    instructions: description,
    criteria: z
      .record(z.string().min(1), description.nullable())
      .refine((v) => Object.keys(v).length >= 2, 'Add at least two choices.'),
  }),
  z.object({
    type: z.literal('score'),
    instructions: description,
    criteria: z.array(description).min(2, 'Add at least two ordered levels.'),
  }),
  z.object({
    type: z.literal('noul'),
    instructions: description,
    criteria: z.object({ true: description, false: description }).optional(),
  }),
])
export const questionsSchema = z
  .record(z.string().min(1).max(100), questionSchema)
  .refine(
    (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 50,
    'Use between 1 and 50 questions.',
  )
export type Question = z.infer<typeof questionSchema>
export type Questions = Record<string, Question>
const probability = z.number().min(0).max(1)
const probabilities = z.record(z.string(), probability).optional()
const answerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    confidence: probability.optional(),
    probabilities,
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    confidence: probability.optional(),
    probabilities,
    legend: z.record(z.string(), description).optional(),
  }),
  z.object({ type: z.literal('noul'), noul: probability }),
])
export const responseSchema = z.object({
  id: z.string().optional(),
  model: z.string(),
  provider: z.string().optional(),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({
    input_tokens: z.number().nonnegative(),
    output_tokens: z.number().nonnegative(),
    cost: z.number().nonnegative().optional(),
  }),
})
export type DecisionResponse = z.infer<typeof responseSchema>
export type Answer = z.infer<typeof answerSchema>
export const requestSchema = z
  .object({
    requestId: z.string().min(1).max(100),
    sessionId: z.string().min(1).max(100),
    state: description,
    questions: questionsSchema,
    timeout: z.number().int().min(10).max(120),
    privateRouting: z.boolean(),
  })
  .refine(
    (v) => JSON.stringify(v).length <= 120_000,
    'Keep the combined context and questions below 120,000 characters.',
  )
export type EvaluationRequest = z.infer<typeof requestSchema>
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('light'),
  accent: z.enum(['rose', 'sage', 'blue']).default('rose'),
  textSize: z.number().int().min(13).max(18).default(14),
  threshold: z.number().min(0.5).max(1).default(0.7),
  enterSends: z.boolean().default(true),
  includeHistory: z.boolean().default(false),
  context: z.string().max(30_000).default(''),
  timeout: z.number().int().min(10).max(120).default(60),
  privateRouting: z.boolean().default(false),
})
export type Settings = z.infer<typeof settingsSchema>
export const DEFAULT_SETTINGS = settingsSchema.parse({})
export const turnSchema = z.object({
  id: z.string(),
  content: z.string(),
  attachmentNames: z.array(z.string()).default([]),
  attachments: z.array(z.object({ name: z.string(), content: z.string() })).default([]),
  questions: questionsSchema,
  createdAt: z.string(),
  response: responseSchema.optional(),
  elapsed: z.number().optional(),
  error: z.string().optional(),
  demo: z.boolean().optional(),
  threshold: z.number().min(0.5).max(1).default(0.7),
})
export type Turn = z.infer<typeof turnSchema>
export const conversationSchema = z.object({
  id: z.string(),
  title: z.string().max(160),
  createdAt: z.string(),
  updatedAt: z.string(),
  pinned: z.boolean().default(false),
  questions: questionsSchema,
  turns: z.array(turnSchema),
})
export type Conversation = z.infer<typeof conversationSchema>
export const workspaceSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema,
  conversations: z.array(conversationSchema),
  presets: z
    .array(z.object({ id: z.string(), name: z.string().max(80), questions: questionsSchema }))
    .default([]),
})
export type Workspace = z.infer<typeof workspaceSchema>
export const EMPTY_WORKSPACE: Workspace = {
  version: 1,
  settings: DEFAULT_SETTINGS,
  conversations: [],
  presets: [],
}
export const DEFAULT_QUESTIONS: Questions = {
  decision: {
    type: 'choice',
    instructions: 'Which option best describes this context?',
    criteria: {
      positive: 'Positive or favorable',
      neutral: 'Neutral or mixed',
      negative: 'Negative or unfavorable',
    },
  },
}
export const STARTERS: {
  id: string
  title: string
  subtitle: string
  content: string
  questions: Questions
}[] = [
  {
    id: 'feedback',
    title: 'Understand feedback',
    subtitle: 'Find the sentiment in the signal.',
    content:
      'The new dashboard is much easier to use. I love the filters, but the export button keeps timing out. Could you look into it?',
    questions: {
      sentiment: {
        type: 'choice',
        instructions: 'What is the overall sentiment of the feedback?',
        criteria: {
          positive: 'Mostly satisfied',
          mixed: 'Both praise and concerns',
          negative: 'Mostly dissatisfied',
        },
      },
      bug_report: {
        type: 'noul',
        instructions: 'Does this feedback describe broken or unexpected product behavior?',
      },
    },
  },
  {
    id: 'priority',
    title: 'Find what matters',
    subtitle: 'Put a clear rubric behind a decision.',
    content:
      'Our checkout has failed for all customers for the last 30 minutes. Payments are not being processed and there is no workaround.',
    questions: {
      urgency: {
        type: 'score',
        instructions: 'How urgent is resolving this issue?',
        criteria: [
          'Can wait for the next release',
          'Should be fixed this week',
          'Needs attention today',
          'Blocking customers right now',
        ],
      },
    },
  },
  {
    id: 'judge',
    title: 'Make a judgment',
    subtitle: 'Ask a focused yes-or-no question.',
    content:
      'Release checklist: all critical tests passed, rollback was tested, and the on-call engineer confirmed coverage. One cosmetic issue is tracked for the next patch.',
    questions: {
      ready: {
        type: 'noul',
        instructions:
          'Are the critical release checks complete with rollback and on-call coverage confirmed?',
        criteria: {
          true: 'All critical checks, rollback, and coverage are confirmed',
          false: 'At least one critical requirement is missing',
        },
      },
    },
  },
]

export function buildBody(request: EvaluationRequest) {
  const parsed = requestSchema.parse(request)
  return {
    model: MODEL,
    state: parsed.state,
    questions: parsed.questions,
    session_id: parsed.sessionId,
    provider: {
      allow_fallbacks: false,
      ...(parsed.privateRouting ? { data_collection: 'deny' } : {}),
    },
  }
}

export function validateAnswers(response: DecisionResponse, questions: Questions) {
  for (const [id, question] of Object.entries(questions)) {
    const answer = response.answers[id]
    if (!answer || answer.type !== question.type)
      throw new Error(`The provider returned an invalid answer for “${id}”.`)
    if (
      answer.type === 'choice' &&
      question.type === 'choice' &&
      !Object.hasOwn(question.criteria, answer.choice)
    )
      throw new Error(`The provider returned an unknown choice for “${id}”.`)
    if (
      answer.type === 'score' &&
      question.type === 'score' &&
      (answer.score < 0 || answer.score > question.criteria.length - 1)
    )
      throw new Error(`The provider returned an out-of-range score for “${id}”.`)
  }
  return response
}

export function reviewStatus(answer: Answer, threshold: number) {
  // Noul is a probability, not the separate entropy-based confidence returned for Choice/Score.
  const value = answer.type === 'noul' ? Math.max(answer.noul, 1 - answer.noul) : answer.confidence
  return value === undefined || value < threshold ? 'Review suggested' : 'Above threshold'
}

export function parseContext(content: string): string | object | unknown[] {
  try {
    const parsed: unknown = JSON.parse(content)
    if (parsed !== null && typeof parsed === 'object') return parsed
  } catch {
    /* Plain text is a valid state. */
  }
  return content
}

export interface DesktopAPI {
  load: () => Promise<Workspace>
  save: (workspace: Workspace) => Promise<void>
  keyStatus: () => Promise<{ configured: boolean; encrypted: boolean }>
  setKey: (key: string) => Promise<void>
  evaluate: (request: EvaluationRequest) => Promise<DecisionResponse>
  cancel: (requestId: string) => Promise<void>
  openExternal: (destination: 'keys' | 'docs' | 'model') => Promise<void>
}
