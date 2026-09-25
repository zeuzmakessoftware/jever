import { useState } from 'react'
import { Check, Copy, ArrowClockwise, WarningCircle, PencilSimple } from '@phosphor-icons/react'
import { reviewStatus, type Turn } from '../../../shared/domain'
import { Glider, IconButton } from './Primitives'

export function Results({
  turn,
  onRetry,
  onEdit,
  busy,
}: {
  turn: Turn
  onRetry: () => void
  onEdit: () => void
  busy: boolean
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(turn.response, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  return (
    <article className="conversation-turn">
      <div className="user-message">
        <p>{turn.content}</p>
        <IconButton label="Reuse message" disabled={busy} onClick={onEdit}>
          <PencilSimple size={15} />
        </IconButton>
        {turn.attachmentNames.length > 0 && (
          <div className="attachment-labels">
            {turn.attachmentNames.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        )}
      </div>
      <div className="assistant-label">
        <Glider />
        <strong>Jever</strong>
      </div>
      {turn.error ? (
        <div className="error-result" role="alert">
          <WarningCircle size={18} />
          <p>{turn.error}</p>
          <button className="text-button" onClick={onRetry} disabled={busy}>
            <ArrowClockwise size={16} />
            Retry
          </button>
        </div>
      ) : turn.response ? (
        <>
          {turn.demo && <p className="demo-notice">Example from the docs. No live request.</p>}
          {turn.response.state_truncated && (
            <p className="notice" role="status">
              Ollaya shortened the context to fit this model. Part of your input was not evaluated.
              Use a shorter context or a larger-context model.
            </p>
          )}
          <div className="answers">
            {Object.entries(turn.response.answers).map(([id, answer]) => {
              const question = turn.questions[id]
              const label =
                answer.type === 'choice'
                  ? answer.choice.replaceAll('_', ' ')
                  : answer.type === 'score'
                    ? `${answer.score.toFixed(2)}${question?.type === 'score' ? ` / ${question.criteria.length - 1}` : ''}`
                    : answer.noul >= 0.5
                      ? 'Yes'
                      : 'No'
              const review = reviewStatus(answer, turn.threshold)
              const certainty =
                answer.type === 'noul'
                  ? `${(Math.max(answer.noul, 1 - answer.noul) * 100).toFixed(1)}% probability`
                  : answer.confidence !== undefined
                    ? `${(answer.confidence * 100).toFixed(1)}% confidence`
                    : ''
              return (
                <section className="answer" key={id}>
                  <p className="answer-question">
                    {typeof question?.instructions === 'string'
                      ? question.instructions
                      : JSON.stringify(question?.instructions)}
                  </p>
                  <div className="verdict">
                    <strong>{label}</strong>
                    <span className="certainty">{certainty}</span>
                    {review === 'Review suggested' && (
                      <span className="review-badge">
                        <WarningCircle size={13} />
                        Review suggested
                      </span>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
          <div className="result-actions">
            <IconButton label={copied ? 'Copied response' : 'Copy response JSON'} onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </IconButton>
            <IconButton label="Run again" disabled={busy} onClick={onRetry}>
              <ArrowClockwise size={16} />
            </IconButton>
          </div>
          <details className="result-details">
            <summary>Details</summary>
            {Object.entries(turn.response.answers).map(([id, answer]) => {
              const dist =
                answer.type === 'noul'
                  ? { Yes: answer.noul, No: 1 - answer.noul }
                  : answer.probabilities
              return (
                dist && (
                  <div className="distribution" key={id}>
                    <span className="distribution-label">{id.replaceAll('_', ' ')}</span>
                    {Object.entries(dist).map(([option, probability]) => (
                      <div className="probability-row" key={option}>
                        <span>
                          {answer.type === 'score' && answer.legend?.[option]
                            ? text(answer.legend[option])
                            : option.replaceAll('_', ' ')}
                        </span>
                        <span className="probability-track">
                          <span style={{ width: `${probability * 100}%` }} />
                        </span>
                        <span>{(probability * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )
              )
            })}
            <p className="usage">
              {turn.response.usage.input_tokens.toLocaleString()} input tokens
              {turn.response.usage.cost !== undefined &&
                ` · $${turn.response.usage.cost.toFixed(6)}`}
              {turn.elapsed !== undefined && ` · ${(turn.elapsed / 1000).toFixed(2)}s`}
            </p>
            <details className="raw-response">
              <summary>JSON</summary>
              <pre>
                {JSON.stringify({ questions: turn.questions, response: turn.response }, null, 2)}
              </pre>
            </details>
          </details>
        </>
      ) : (
        <div className="pending-result" role="status">
          <span className="loading-square" />
          Thinking…
        </div>
      )}
    </article>
  )
}
function text(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
