import { useEffect, useState } from 'react'
import { Plus, Trash, Code, ArrowLeft, X, FloppyDisk, SquaresFour } from '@phosphor-icons/react'
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
  onPresets,
  onClose,
  disabled,
}: {
  questions: Questions
  onChange: (questions: Questions) => void
  settings: Settings
  setSettings: (settings: Settings) => void
  onSavePreset: () => void
  onPresets: () => void
  onClose: () => void
  disabled: boolean
}) {
  const [json, setJson] = useState(false)
  const [raw, setRaw] = useState(() => JSON.stringify(questions, null, 2))
  const [error, setError] = useState('')
  useEffect(() => {
    setRaw(JSON.stringify(questions, null, 2))
  }, [questions])
  function update(id: string, question: Question) {
    onChange({ ...questions, [id]: question })
  }
  function setType(id: string, type: Question['type']) {
    const instructions = questions[id].instructions
    update(
      id,
      type === 'noul'
        ? { type, instructions }
        : type === 'score'
          ? { type, instructions, criteria: ['Low', 'Medium', 'High'] }
          : { type, instructions, criteria: { option_a: null, option_b: null } },
    )
  }
  function addQuestion() {
    let index = Object.keys(questions).length + 1
    while (Object.hasOwn(questions, `question_${index}`)) index++
    onChange({
      ...questions,
      [`question_${index}`]: { type: 'noul', instructions: 'Does this meet the requirements?' },
    })
  }
  function apply() {
    try {
      onChange(questionsSchema.parse(JSON.parse(raw)))
      setJson(false)
      setError('')
    } catch {
      setError('Check your JSON. Choice and Score need at least two options.')
    }
  }
  return (
    <div className="question-editor">
      <div className="question-editor-header">
        <h2>Questions</h2>
        <IconButton
          label={json ? 'Show builder' : 'Edit JSON'}
          onClick={() => {
            setJson(!json)
            setError('')
          }}
        >
          {json ? <ArrowLeft size={17} /> : <Code size={17} />}
        </IconButton>
        <IconButton label="Close questions" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </div>
      <div className="question-editor-scroll">
        <fieldset disabled={disabled} className="question-fields">
          {json ? (
            <>
              <label className="field">
                <span className="sr-only">Questions JSON</span>
                <textarea
                  className="code-input"
                  aria-label="Questions JSON"
                  rows={14}
                  spellCheck={false}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
              </label>
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <button className="primary w-full" type="button" onClick={apply}>
                Apply
              </button>
            </>
          ) : (
            Object.entries(questions).map(([id, question], index) => {
              const structured =
                typeof question.instructions !== 'string' ||
                (question.type !== 'noul' &&
                  Object.values(question.criteria).some(
                    (value) => value !== null && typeof value !== 'string',
                  )) ||
                (question.type === 'noul' &&
                  question.criteria &&
                  Object.values(question.criteria).some((value) => typeof value !== 'string'))
              return (
                <section className="question-section" key={id}>
                  <div className="question-type-row">
                    <select
                      aria-label={`Answer type for ${id}`}
                      value={question.type}
                      onChange={(e) => setType(id, e.target.value as Question['type'])}
                    >
                      <option value="choice">Choice</option>
                      <option value="score">Score</option>
                      <option value="noul">Yes / no</option>
                    </select>
                    {Object.keys(questions).length > 1 && (
                      <>
                        <span className="question-number">{index + 1}</span>
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
                          <Trash size={15} />
                        </IconButton>
                      </>
                    )}
                  </div>
                  {structured ? (
                    <button className="outline w-full" type="button" onClick={() => setJson(true)}>
                      Edit structured question
                    </button>
                  ) : (
                    <>
                      <textarea
                        className="question-input"
                        aria-label={`Question ${index + 1}`}
                        placeholder="What should Jev decide?"
                        rows={2}
                        value={text(question.instructions)}
                        onChange={(e) => update(id, { ...question, instructions: e.target.value })}
                      />
                      {question.type === 'choice' && (
                        <div className="criteria">
                          {Object.entries(question.criteria).map(([key, value], i) => (
                            <div className="option-row" key={i}>
                              <div>
                                <input
                                  aria-label={`Option ${i + 1} name for ${id}`}
                                  placeholder="Option"
                                  value={key}
                                  onChange={(e) => {
                                    if (
                                      e.target.value !== key &&
                                      Object.hasOwn(question.criteria, e.target.value)
                                    )
                                      return
                                    update(id, {
                                      ...question,
                                      criteria: Object.fromEntries(
                                        Object.entries(question.criteria).map(
                                          ([name, description]) => [
                                            name === key ? e.target.value : name,
                                            description,
                                          ],
                                        ),
                                      ),
                                    })
                                  }}
                                />
                                <input
                                  className="option-description"
                                  aria-label={`Option ${i + 1} description for ${id}`}
                                  placeholder="Description (optional)"
                                  value={value === null ? '' : text(value)}
                                  onChange={(e) =>
                                    update(id, {
                                      ...question,
                                      criteria: {
                                        ...question.criteria,
                                        [key]: e.target.value || null,
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
                                        ([name]) => name !== key,
                                      ),
                                    ),
                                  })
                                }
                              >
                                <Trash size={14} />
                              </IconButton>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="text-button"
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
                            Option
                          </button>
                        </div>
                      )}
                      {question.type === 'score' && (
                        <div className="criteria">
                          {question.criteria.map((value, i) => (
                            <div className="score-row" key={i}>
                              <span>{i}</span>
                              <input
                                aria-label={`Level ${i} for ${id}`}
                                value={text(value)}
                                onChange={(e) =>
                                  update(id, {
                                    ...question,
                                    criteria: question.criteria.map((v, j) =>
                                      j === i ? e.target.value : v,
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
                            type="button"
                            className="text-button"
                            onClick={() =>
                              update(id, {
                                ...question,
                                criteria: [...question.criteria, 'New level'],
                              })
                            }
                          >
                            <Plus size={14} />
                            Level
                          </button>
                        </div>
                      )}
                      {question.type === 'noul' && (
                        <details className="optional-criteria">
                          <summary>Define yes and no</summary>
                          <label className="field">
                            <span>Yes</span>
                            <input
                              value={question.criteria ? text(question.criteria.true) : ''}
                              placeholder="The condition is met"
                              onChange={(e) =>
                                update(id, {
                                  ...question,
                                  criteria: {
                                    true: e.target.value || 'The condition is met',
                                    false: question.criteria?.false ?? 'The condition is not met',
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            <span>No</span>
                            <input
                              value={question.criteria ? text(question.criteria.false) : ''}
                              placeholder="The condition is not met"
                              onChange={(e) =>
                                update(id, {
                                  ...question,
                                  criteria: {
                                    true: question.criteria?.true ?? 'The condition is met',
                                    false: e.target.value || 'The condition is not met',
                                  },
                                })
                              }
                            />
                          </label>
                        </details>
                      )}
                    </>
                  )}
                </section>
              )
            })
          )}
          {!json && (
            <button
              type="button"
              className="text-button add-question"
              disabled={Object.keys(questions).length >= 50}
              onClick={addQuestion}
            >
              <Plus size={15} />
              Add question
            </button>
          )}
        </fieldset>
        <details className="advanced-settings">
          <summary>Advanced</summary>
          <label className="field">
            <span>
              Review threshold <output>{Math.round(settings.threshold * 100)}%</output>
            </span>
            <input
              aria-label="Review threshold"
              type="range"
              min="0.5"
              max="1"
              step="0.01"
              value={settings.threshold}
              onChange={(e) => setSettings({ ...settings, threshold: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Background context</span>
            <textarea
              rows={3}
              value={settings.context}
              maxLength={30000}
              placeholder="Preferences or context for every request"
              onChange={(e) => setSettings({ ...settings, context: e.target.value })}
            />
          </label>
          <label className="toggle-row">
            <span>Include chat history</span>
            <input
              type="checkbox"
              checked={settings.includeHistory}
              onChange={(e) => setSettings({ ...settings, includeHistory: e.target.checked })}
            />
          </label>
        </details>
      </div>
      <div className="question-editor-footer">
        <button type="button" className="text-button" onClick={onPresets}>
          <SquaresFour size={16} />
          Presets
        </button>
        <button
          type="button"
          className="text-button"
          onClick={onSavePreset}
          disabled={disabled || json}
        >
          <FloppyDisk size={16} />
          Save preset
        </button>
      </div>
    </div>
  )
}
