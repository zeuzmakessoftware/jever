import { useState } from 'react'
import { Check, Copy, ArrowClockwise, WarningCircle, CaretDown } from '@phosphor-icons/react'
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
        <div className="message-label">
          <span>You</span>
          <button className="text-button" disabled={busy} onClick={onEdit}>
            Use again
          </button>
        </div>
        <p>{turn.content}</p>
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
        <span className="mono">{turn.demo ? 'DOCUMENTATION EXAMPLE' : 'SYSTEM ONE'}</span>
        {turn.elapsed !== undefined && (
          <span className="latency mono">{(turn.elapsed / 1000).toFixed(2)}s</span>
        )}
      </div>
      {turn.error ? (
        <div className="error-result" role="alert">
          <WarningCircle size={20} />
          <p>{turn.error}</p>
          <button className="text-button" onClick={onRetry} disabled={busy}>
            <ArrowClockwise size={16} />
            Retry
          </button>
        </div>
      ) : turn.response ? (
        <>
          {turn.demo && (
            <p className="demo-notice">
              Illustrative response from the OpenRouter API documentation. No live request was made.
            </p>
          )}
          <div className="answers">
            {Object.entries(turn.response.answers).map(([id, answer]) => {
              const label =
                answer.type === 'choice'
                  ? answer.choice.replaceAll('_', ' ')
                  : answer.type === 'score'
                    ? answer.score.toFixed(2)
                    : answer.noul >= 0.5
                      ? 'Yes'
                      : 'No'
              const review = reviewStatus(answer, turn.threshold)
              const dist =
                answer.type === 'noul'
                  ? { Yes: answer.noul, No: 1 - answer.noul }
                  : answer.probabilities
              const question = turn.questions[id]
              return (
                <section className="answer" key={id}>
                  <div className="answer-header">
                    <span className="mono">{id.replaceAll('_', ' ')}</span>
                    <span className="type-label">
                      {answer.type === 'noul' ? 'YES / NO' : answer.type.toUpperCase()}
                    </span>
                  </div>
                  <p className="answer-question">
                    {typeof question?.instructions === 'string'
                      ? question.instructions
                      : JSON.stringify(question?.instructions)}
                  </p>
                  <div className="verdict">
                    <strong>{label}</strong>
                    <span
                      className={`review-badge ${review === 'Above threshold' ? 'accepted' : ''}`}
                    >
                      {review === 'Above threshold' ? (
                        <Check size={12} />
                      ) : (
                        <WarningCircle size={12} />
                      )}
                      {review}
                    </span>
                  </div>
                  {answer.type === 'score' && question?.type === 'score' && (
                    <p className="hint">On a scale from 0 to {question.criteria.length - 1}</p>
                  )}
                  {dist && (
                    <div className="distribution">
                      {Object.entries(dist).map(([option, probability]) => (
                        <div className="probability-row" key={option}>
                          <span className="probability-name">
                            {answer.type === 'score' && answer.legend?.[option]
                              ? `${option} · ${typeof answer.legend[option] === 'string' ? answer.legend[option] : JSON.stringify(answer.legend[option])}`
                              : option.replaceAll('_', ' ')}
                          </span>
                          <span className="probability-track">
                            <span style={{ width: `${probability * 100}%` }} />
                          </span>
                          <span className="mono">{(probability * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="answer-foot mono">
                    {answer.type === 'noul'
                      ? `P(YES) ${answer.noul.toFixed(3)}`
                      : answer.confidence === undefined
                        ? 'CONFIDENCE NOT PROVIDED'
                        : `CONFIDENCE ${(answer.confidence * 100).toFixed(1)}%`}
                  </div>
                </section>
              )
            })}
          </div>
          <div className="result-actions">
            <IconButton label={copied ? 'Copied response' : 'Copy response JSON'} onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </IconButton>
            <IconButton label="Run again" onClick={onRetry} disabled={busy}>
              <ArrowClockwise size={16} />
            </IconButton>
            <span className="mono">
              {turn.response.usage.input_tokens.toLocaleString()} input tokens
              {turn.response.usage.cost !== undefined &&
                ` · $${turn.response.usage.cost.toFixed(6)}`}
            </span>
          </div>
          <details className="raw-response">
            <summary>
              <CodeLabel />
              Request & response <CaretDown size={14} />
            </summary>
            <pre>
              {JSON.stringify({ questions: turn.questions, response: turn.response }, null, 2)}
            </pre>
          </details>
        </>
      ) : (
        <div className="pending-result" role="status">
          <span className="loading-square" />
          Jev is evaluating your questions…
        </div>
      )}
    </article>
  )
}
function CodeLabel() {
  return (
    <span className="mono" aria-hidden="true">
      {'{}'}
    </span>
  )
}
