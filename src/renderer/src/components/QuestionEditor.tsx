import { useEffect, useState } from 'react'
import { Plus, Trash, Code, ArrowLeft, SlidersHorizontal, FloppyDisk } from '@phosphor-icons/react'
import {
  questionsSchema,
  type Question,
  type Questions,
  type Settings,
} from '../../../shared/domain'
import { IconButton } from './Primitives'

const text = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2)
export function QuestionEditor({
  questions,
  onChange,
  settings,
  setSettings,
  onSavePreset,
  onClose,
  disabled,
}: {
  questions: Questions
  onChange: (questions: Questions) => void
  settings: Settings
  setSettings: (settings: Settings) => void
  onSavePreset: () => void
  onClose: () => void
  disabled: boolean
}) {
  const [tab, setTab] = useState<'questions' | 'context'>('questions')
  const [advanced, setAdvanced] = useState(false)
  const [raw, setRaw] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setRaw(JSON.stringify(questions, null, 2))
  }, [questions])
  function update(id: string, value: Question) {
    onChange({ ...questions, [id]: value })
  }
  function setType(id: string, type: Question['type']) {
    const instructions = questions[id].instructions
    update(
      id,
      type === 'noul'
        ? { type, instructions }
        : type === 'score'
          ? { type, instructions, criteria: ['Low', 'Medium', 'High'] }
          : {
              type,
              instructions,
              criteria: {
                option_a: 'First option',
                option_b: 'Second option',
                other: 'None of the above',
              },
            },
    )
  }
  function addQuestion() {
    let n = Object.keys(questions).length + 1
    while (questions[`question_${n}`]) n++
    onChange({
      ...questions,
      [`question_${n}`]: { type: 'noul', instructions: 'Does this context meet the requirements?' },
    })
  }
  function applyJson() {
    try {
      const parsed = questionsSchema.parse(JSON.parse(raw))
      onChange(parsed)
      setAdvanced(false)
      setError('')
    } catch (error) {
      setError(
        error instanceof SyntaxError
          ? 'This is not valid JSON. Check commas, quotes, and brackets.'
          : 'Each question needs an ID, a type, instructions, and valid criteria. Choice and Score need at least two options.',
      )
    }
  }
  return (
    <aside className="inspector" aria-label="Decision customization">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, YOUR RULES</span>
          <h2>Make it yours.</h2>
        </div>
        <IconButton label="Close customization" className="inspector-close" onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>
      <div className="segmented" role="tablist" aria-label="Customization">
        <button role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')}>
          Questions <span>{Object.keys(questions).length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'context'} onClick={() => setTab('context')}>
          Context
        </button>
      </div>
      <div className="inspector-scroll">
        {tab === 'questions' ? (
          <>
            <div className="editor-toolbar">
              <span className="mono">DECISION RECIPE</span>
              <button
                className="text-button"
                onClick={() => {
                  setRaw(JSON.stringify(questions, null, 2))
                  setAdvanced(!advanced)
                  setError('')
                }}
              >
                {advanced ? <ArrowLeft size={14} /> : <Code size={14} />}
                {advanced ? 'Builder' : 'JSON'}
              </button>
            </div>
            <fieldset disabled={disabled} className="question-fields">
              {advanced ? (
                <>
                  <label className="field">
                    <span>Questions JSON</span>
                    <textarea
                      className="code-input"
                      rows={22}
                      value={raw}
                      onChange={(event) => setRaw(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <p className="hint">
                    Use structured instructions, custom IDs, and multiple questions in one request.
                  </p>
                  {error && (
                    <p role="alert" className="error-text">
                      {error}
                    </p>
                  )}
                  <button className="primary w-full" onClick={applyJson}>
                    Apply questions
                  </button>
                </>
              ) : (
                Object.entries(questions).map(([id, question], index) => {
                  const structured =
                    typeof question.instructions !== 'string' ||
                    (question.type !== 'noul' &&
                      Object.values(question.criteria).some(
                        (v) => v !== null && typeof v !== 'string',
                      )) ||
                    (question.type === 'noul' &&
                      question.criteria &&
                      Object.values(question.criteria).some((v) => typeof v !== 'string'))
                  return (
                    <section className="question-section" key={id}>
                      <div className="question-caption">
                        <span className="mono">
                          {String(index + 1).padStart(2, '0')} / {id.replaceAll('_', ' ')}
                        </span>
                        {Object.keys(questions).length > 1 && (
                          <IconButton
                            label={`Remove question ${id}`}
                            onClick={() =>
                              onChange(
                                Object.fromEntries(
                                  Object.entries(questions).filter(([key]) => key !== id),
                                ),
                              )
                            }
                          >
                            <Trash size={14} />
                          </IconButton>
                        )}
                      </div>
                      <label className="field">
                        <span>Answer type</span>
                        <select
                          value={question.type}
                          onChange={(event) => setType(id, event.target.value as Question['type'])}
                        >
                          <option value="choice">Choice · pick an option</option>
                          <option value="score">Score · rate on a scale</option>
                          <option value="noul">Noul · yes or no</option>
                        </select>
                      </label>
                      {structured ? (
                        <div className="notice">
                          This question uses structured guidance.{' '}
                          <button className="text-button" onClick={() => setAdvanced(true)}>
                            Edit in JSON
                          </button>
                        </div>
                      ) : (
                        <>
                          <label className="field">
                            <span>Question</span>
                            <textarea
                              rows={3}
                              value={text(question.instructions)}
                              onChange={(event) =>
                                update(id, { ...question, instructions: event.target.value })
                              }
                            />
                          </label>
                          {question.type === 'choice' && (
                            <div className="criteria">
                              <span className="field-label">Options</span>
                              {Object.entries(question.criteria).map(
                                ([key, value], optionIndex) => (
                                  <div className="option-row" key={optionIndex}>
                                    <div>
                                      <input
                                        aria-label={`Option ${optionIndex + 1} name for ${id}`}
                                        value={key}
                                        placeholder="Option name"
                                        onChange={(event) => {
                                          const next = event.target.value
                                          if (
                                            next !== key &&
                                            Object.hasOwn(question.criteria, next)
                                          )
                                            return
                                          update(id, {
                                            ...question,
                                            criteria: Object.fromEntries(
                                              Object.entries(question.criteria).map(([k, v]) => [
                                                k === key ? next : k,
                                                v,
                                              ]),
                                            ),
                                          })
                                        }}
                                      />
                                      <input
                                        className="option-description"
                                        aria-label={`Option ${optionIndex + 1} description for ${id}`}
                                        value={value === null ? '' : text(value)}
                                        placeholder="Describe this option"
                                        onChange={(event) =>
                                          update(id, {
                                            ...question,
                                            criteria: {
                                              ...question.criteria,
                                              [key]: event.target.value || null,
                                            },
                                          })
                                        }
                                      />
                                    </div>
                                    <IconButton
                                      label={`Remove option ${key}`}
                                      disabled={Object.keys(question.criteria).length <= 2}
                                      onClick={() =>
                                        update(id, {
                                          ...question,
                                          criteria: Object.fromEntries(
                                            Object.entries(question.criteria).filter(
                                              ([k]) => k !== key,
                                            ),
                                          ),
                                        })
                                      }
                                    >
                                      <Trash size={14} />
                                    </IconButton>
                                  </div>
                                ),
                              )}
                              <button
                                className="text-button add-option"
                                onClick={() => {
                                  let n = Object.keys(question.criteria).length + 1
                                  while (Object.hasOwn(question.criteria, `option_${n}`)) n++
                                  update(id, {
                                    ...question,
                                    criteria: { ...question.criteria, [`option_${n}`]: null },
                                  })
                                }}
                              >
                                <Plus size={14} />
                                Add option
                              </button>
                            </div>
                          )}
                          {question.type === 'score' && (
                            <div className="criteria">
                              <span className="field-label">Levels · lowest to highest</span>
                              {question.criteria.map((value, i) => (
                                <div className="score-row" key={i}>
                                  <span className="mono">{i}</span>
                                  <input
                                    aria-label={`Level ${i} for ${id}`}
                                    value={text(value)}
                                    onChange={(event) =>
                                      update(id, {
                                        ...question,
                                        criteria: question.criteria.map((v, j) =>
                                          i === j ? event.target.value : v,
                                        ),
                                      })
                                    }
                                  />
                                  <IconButton
                                    label={`Remove level ${i}`}
                                    disabled={question.criteria.length <= 2}
                                    onClick={() =>
                                      update(id, {
                                        ...question,
                                        criteria: question.criteria.filter((_, j) => i !== j),
                                      })
                                    }
                                  >
                                    <Trash size={14} />
                                  </IconButton>
                                </div>
                              ))}
                              <button
                                className="text-button add-option"
                                onClick={() =>
                                  update(id, {
                                    ...question,
                                    criteria: [...question.criteria, 'New level'],
                                  })
                                }
                              >
                                <Plus size={14} />
                                Add level
                              </button>
                            </div>
                          )}
                          {question.type === 'noul' && (
                            <>
                              <p className="hint">Returns the probability of “yes”, from 0 to 1.</p>
                              <label className="field">
                                <span>
                                  Yes means <small>optional</small>
                                </span>
                                <input
                                  value={question.criteria ? text(question.criteria.true) : ''}
                                  placeholder="The condition is met"
                                  onChange={(event) =>
                                    update(id, {
                                      ...question,
                                      criteria: {
                                        true: event.target.value || 'The condition is met',
                                        false:
                                          question.criteria?.false ?? 'The condition is not met',
                                      },
                                    })
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>
                                  No means <small>optional</small>
                                </span>
                                <input
                                  value={question.criteria ? text(question.criteria.false) : ''}
                                  placeholder="The condition is not met"
                                  onChange={(event) =>
                                    update(id, {
                                      ...question,
                                      criteria: {
                                        true: question.criteria?.true ?? 'The condition is met',
                                        false: event.target.value || 'The condition is not met',
                                      },
                                    })
                                  }
                                />
                              </label>
                            </>
                          )}
                        </>
                      )}
                    </section>
                  )
                })
              )}
              {!advanced && (
                <button
                  className="outline w-full"
                  onClick={addQuestion}
                  disabled={Object.keys(questions).length >= 50}
                >
                  <Plus size={16} />
                  Add question
                </button>
              )}
            </fieldset>
            <div className="threshold-section">
              <label htmlFor="threshold">
                Review threshold <output>{Math.round(settings.threshold * 100)}%</output>
              </label>
              <input
                id="threshold"
                type="range"
                min="0.5"
                max="1"
                step="0.01"
                value={settings.threshold}
                onChange={(event) =>
                  setSettings({ ...settings, threshold: Number(event.target.value) })
                }
              />
              <p className="hint">
                Flag low-confidence results for review. Noul uses the probability of its yes/no
                verdict. All results stay visible.
              </p>
            </div>
          </>
        ) : (
          <>
            <label className="field context-field">
              <span>Persistent context</span>
              <textarea
                rows={10}
                value={settings.context}
                maxLength={30000}
                placeholder="Add your preferences, a policy, or background Jev should consider with every decision."
                onChange={(event) => setSettings({ ...settings, context: event.target.value })}
              />
            </label>
            <p className="hint">
              Included with every request. Keep decision rules in your questions.
            </p>
            <label className="toggle-row">
              <span>
                Include conversation history
                <small>Previous contexts and results are sent with each follow-up.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.includeHistory}
                onChange={(event) =>
                  setSettings({ ...settings, includeHistory: event.target.checked })
                }
              />
            </label>
          </>
        )}
      </div>
      <div className="inspector-footer">
        <button className="text-button" onClick={onSavePreset} disabled={disabled}>
          <FloppyDisk size={16} />
          Save as preset
        </button>
        <SlidersHorizontal size={17} />
      </div>
    </aside>
  )
}
function XIcon() {
  return <span aria-hidden="true">×</span>
}
