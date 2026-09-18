import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  ChatCircle,
  Check,
  DotsThree,
  DownloadSimple,
  FileText,
  GearSix,
  MagnifyingGlass,
  Paperclip,
  Plus,
  SidebarSimple,
  SlidersHorizontal,
  SquaresFour,
  Stop,
  Trash,
  X,
  PushPin,
  PencilSimple,
  Lightning,
  Scales,
} from '@phosphor-icons/react'
import {
  DEFAULT_QUESTIONS,
  EMPTY_WORKSPACE,
  STARTERS,
  parseContext,
  questionsSchema,
  type Conversation,
  type Questions,
  type Turn,
  type Workspace,
  type Settings,
} from '../../shared/domain'
import { bridge, download, isDesktop, message } from './bridge'
import { Glider, IconButton, Modal } from './components/Primitives'
import { QuestionEditor } from './components/QuestionEditor'
import { Results } from './components/Results'
import { SettingsDialog } from './components/SettingsDialog'

type Attachment = { name: string; content: string }
type NamedDialog = 'rename' | 'preset' | 'delete' | null

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(structuredClone(EMPTY_WORKSPACE))
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Questions>(structuredClone(DEFAULT_QUESTIONS))
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [search, setSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(
    () => matchMedia('(min-width: 1180px)').matches,
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [running, setRunning] = useState<{ requestId: string; conversationId: string } | null>(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [namedDialog, setNamedDialog] = useState<NamedDialog>(null)
  const [name, setName] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const conversation = workspace.conversations.find((c) => c.id === selected)
  const settings = workspace.settings
  const busy = Boolean(running)
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  )

  async function refreshKey() {
    setConfigured((await bridge.keyStatus()).configured)
  }
  useEffect(() => {
    let active = true
    Promise.all([bridge.load(), bridge.keyStatus()])
      .then(([data, status]) => {
        if (active) {
          setWorkspace({
            ...data,
            conversations: data.conversations.map((c) => ({
              ...c,
              turns: c.turns.map((t) =>
                !t.response && !t.error
                  ? {
                      ...t,
                      error: 'This decision was interrupted when Jever closed. You can retry it.',
                    }
                  : t,
              ),
            })),
          })
          setConfigured(status.configured)
          setLoaded(true)
        }
      })
      .catch((error) => {
        if (active) setLoadError(message(error))
      })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!loaded) return
    bridge
      .save(workspace)
      .then(() => setSaveError(''))
      .catch((error) => setSaveError(message(error)))
  }, [workspace, loaded])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const listener = () => setSystemDark(media.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme =
      settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme
    document.documentElement.dataset.accent = settings.accent
    document.documentElement.style.setProperty('--text-size', `${settings.textSize}px`)
  }, [settings.theme, settings.accent, settings.textSize, systemDark])
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [conversation?.turns.length, running])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSidebarOpen(true)
        searchRef.current?.focus()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        if (!busyRef.current) newConversation()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false)
        setInspectorOpen(false)
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function setSettings(next: Settings) {
    setWorkspace((current) => ({ ...current, settings: next }))
  }
  function newConversation() {
    setSelected(null)
    setDraft('')
    setAttachments([])
    setQuestions(structuredClone(DEFAULT_QUESTIONS))
    setError('')
    setSidebarOpen(false)
    textRef.current?.focus()
  }
  function selectConversation(item: Conversation) {
    setSelected(item.id)
    setQuestions(item.questions)
    setDraft('')
    setAttachments([])
    setError('')
    setSidebarOpen(false)
  }
  function changeQuestions(next: Questions) {
    setQuestions(next)
    if (selected && questionsSchema.safeParse(next).success)
      setWorkspace((current) => ({
        ...current,
        conversations: current.conversations.map((c) =>
          c.id === selected ? { ...c, questions: next } : c,
        ),
      }))
  }
  function starter(index: number) {
    const item = STARTERS[index]
    setQuestions(structuredClone(item.questions))
    setDraft(item.content)
    setAttachments([])
    setError('')
    setPresetsOpen(false)
    textRef.current?.focus()
  }
  async function attachFiles(files: FileList | null) {
    if (!files) return
    try {
      const next = [...attachments]
      for (const file of Array.from(files)) {
        if (!/\.(txt|md|json|csv|tsv|log|yaml|yml|js|ts|tsx|jsx|py|html|css)$/i.test(file.name))
          throw new Error(
            'Attach a text, Markdown, JSON, CSV, or source-code file. Images and PDFs are not supported by Jev.',
          )
        if (file.size > 100_000)
          throw new Error(`${file.name} is too large. Choose a file under 100 KB.`)
        next.push({ name: file.name, content: await file.text() })
      }
      if (next.length > 5 || next.reduce((sum, file) => sum + file.content.length, 0) > 100_000)
        throw new Error('Use up to 5 files totaling under 100,000 characters.')
      setAttachments(next)
      setError('')
    } catch (error) {
      setError(message(error))
    }
  }
  function updateTurn(conversationId: string, turnId: string, update: Partial<Turn>) {
    setWorkspace((current) => ({
      ...current,
      conversations: current.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              updatedAt: new Date().toISOString(),
              turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...update } : t)),
            }
          : c,
      ),
    }))
  }
  async function run(content = draft, recipe = questions, files = attachments) {
    if (busyRef.current || (!content.trim() && !files.length)) return
    if (!configured) {
      setSettingsOpen(true)
      return
    }
    const validation = questionsSchema.safeParse(recipe)
    if (!validation.success) {
      setError('Complete every question and give Choice or Score at least two valid options.')
      setInspectorOpen(true)
      return
    }
    const state = {
      input: parseContext(content),
      ...(files.length ? { attachments: files } : {}),
      ...(settings.context.trim() ? { background: settings.context } : {}),
      ...(settings.includeHistory && conversation
        ? {
            history: conversation.turns
              .filter((t) => t.response && !t.demo)
              .map((t) => ({
                input: t.content,
                attachments: t.attachments,
                questions: t.questions,
                answers: t.response!.answers,
              })),
          }
        : {}),
    }
    if (JSON.stringify({ state, questions: recipe }).length > 119_000) {
      setError(
        'This request is too large. Shorten the context, remove an attachment, or turn off conversation history.',
      )
      return
    }
    busyRef.current = true
    const conversationId = selected ?? crypto.randomUUID()
    const turnId = crypto.randomUUID()
    const requestId = crypto.randomUUID()
    const now = new Date().toISOString()
    const turn: Turn = {
      id: turnId,
      content,
      attachments: files,
      attachmentNames: files.map((f) => f.name),
      questions: recipe,
      createdAt: now,
      threshold: settings.threshold,
    }
    setWorkspace((current) => ({
      ...current,
      conversations: current.conversations.some((c) => c.id === conversationId)
        ? current.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, turns: [...c.turns, turn], updatedAt: now, questions: recipe }
              : c,
          )
        : [
            {
              id: conversationId,
              title: content.trim().slice(0, 55) || files[0]?.name || 'New conversation',
              createdAt: now,
              updatedAt: now,
              pinned: false,
              questions: recipe,
              turns: [turn],
            },
            ...current.conversations,
          ],
    }))
    setSelected(conversationId)
    setRunning({ requestId, conversationId })
    setDraft('')
    setAttachments([])
    setError('')
    const started = performance.now()
    try {
      const response = await bridge.evaluate({
        requestId,
        sessionId: conversationId,
        state,
        questions: recipe,
        timeout: settings.timeout,
        privateRouting: settings.privateRouting,
      })
      updateTurn(conversationId, turnId, { response, elapsed: performance.now() - started })
    } catch (error) {
      updateTurn(conversationId, turnId, { error: message(error) })
    } finally {
      busyRef.current = false
      setRunning(null)
    }
  }
  function openExample() {
    const now = new Date().toISOString()
    const recipe: Questions = {
      is_bug: {
        type: 'noul',
        instructions: 'Is the customer reporting a software defect?',
        criteria: {
          true: 'The customer describes broken or unexpected product behavior.',
          false: 'The customer is asking a question or requesting a feature.',
        },
      },
      team: {
        type: 'choice',
        instructions: 'Which team should own this ticket?',
        criteria: {
          account: 'Login, permissions, or profile issues.',
          frontend: 'Rendering, layout, or browser compatibility issues.',
          payments: 'Checkout, billing, or payment processing issues.',
        },
      },
    }
    const item: Conversation = {
      id: crypto.randomUUID(),
      title: 'A first look at Jev',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      questions: recipe,
      turns: [
        {
          id: crypto.randomUUID(),
          content:
            'My checkout page shows a blank screen after I click Pay. I have tried two browsers.',
          attachments: [],
          attachmentNames: [],
          questions: recipe,
          createdAt: now,
          demo: true,
          threshold: settings.threshold,
          response: {
            model: 'typesafe/jev-1.13-20260917',
            provider: 'TypeSafe',
            usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
            answers: {
              is_bug: { type: 'noul', noul: 0.96 },
              team: {
                type: 'choice',
                choice: 'payments',
                confidence: 0.75,
                probabilities: { account: 0, frontend: 0.16, payments: 0.84 },
              },
            },
          },
        },
      ],
    }
    setWorkspace((current) => ({ ...current, conversations: [item, ...current.conversations] }))
    selectConversation(item)
  }
  function completeNamedDialog() {
    if (namedDialog === 'delete' && conversation) {
      setWorkspace((current) => ({
        ...current,
        conversations: current.conversations.filter((c) => c.id !== conversation.id),
      }))
      newConversation()
      setToast('Conversation deleted.')
    }
    if (namedDialog === 'rename' && name.trim())
      setWorkspace((current) => ({
        ...current,
        conversations: current.conversations.map((c) =>
          c.id === selected ? { ...c, title: name.trim().slice(0, 160) } : c,
        ),
      }))
    if (namedDialog === 'preset' && name.trim()) {
      if (!questionsSchema.safeParse(questions).success) {
        setError('Complete your questions before saving a preset.')
        setNamedDialog(null)
        return
      }
      setWorkspace((current) => ({
        ...current,
        presets: [
          ...current.presets,
          {
            id: crypto.randomUUID(),
            name: name.trim().slice(0, 80),
            questions: structuredClone(questions),
          },
        ],
      }))
      setToast('Preset saved to your library.')
    }
    setNamedDialog(null)
  }
  const filtered = [...workspace.conversations]
    .filter((c) =>
      `${c.title} ${c.turns.map((t) => t.content).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))

  if (loadError)
    return (
      <main className="fatal">
        <Glider large />
        <h1>Your workspace needs attention.</h1>
        <p>{loadError}</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    )
  if (!loaded)
    return (
      <main className="fatal">
        <Glider large />
        <p>Opening your workspace…</p>
      </main>
    )
  return (
    <div
      className={`app-shell ${inspectorOpen ? 'show-inspector' : ''} ${sidebarOpen ? 'show-sidebar' : ''}`}
    >
      <div className="window-bar">
        <span className="window-app-name">Jever</span>
        <span className="window-bar-right mono">A SPACE FOR CLEARER THINKING</span>
      </div>
      {sidebarOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className="sidebar" aria-label="Conversations">
        <div className="brand">
          <Glider />
          <span>
            Jever<span className="brand-period">.</span>
          </span>
          <IconButton
            label="Close navigation"
            className="mobile-only"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </IconButton>
        </div>
        <button className="primary new-conversation" disabled={busy} onClick={newConversation}>
          <Plus size={18} />
          <span>New conversation</span>
        </button>
        <label className="search">
          <MagnifyingGlass size={16} />
          <input
            ref={searchRef}
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="key-hint">⌘ K</span>
        </label>
        <button className="sidebar-link" onClick={() => setPresetsOpen(true)}>
          <SquaresFour size={18} />
          Your presets<span>{workspace.presets.length}</span>
        </button>
        <div className="history-label mono">
          CONVERSATIONS<span>{workspace.conversations.length.toString().padStart(2, '0')}</span>
        </div>
        <div className="history-list">
          {filtered.map((c) => (
            <button
              key={c.id}
              className={`history-item ${selected === c.id ? 'active' : ''}`}
              onClick={() => selectConversation(c)}
              disabled={busy && c.id !== selected}
            >
              {c.pinned ? <PushPin size={16} /> : <ChatCircle size={16} />}
              <span>
                {c.title}
                <small>
                  {new Date(c.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  · {c.turns.length} {c.turns.length === 1 ? 'decision' : 'decisions'}
                </small>
              </span>
            </button>
          ))}
          {!filtered.length && (
            <div className="history-empty">
              <ChatCircle size={24} />
              <p>{search ? 'No conversations found.' : 'A clean slate.'}</p>
              <small>
                {search ? 'Try a different search.' : 'Your conversations will find a home here.'}
              </small>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="engine-label mono">
            <span className={`status-dot ${configured ? 'connected' : ''}`} />
            {configured ? 'API KEY SAVED' : 'READY WHEN YOU ARE'}
          </div>
          <button className="account-button" onClick={() => setSettingsOpen(true)}>
            <span className="account-avatar">
              <Glider />
            </span>
            <span>
              Personal workspace
              <small>
                {configured ? 'Jev latest · OpenRouter' : 'Connect your OpenRouter key'}
              </small>
            </span>
            <GearSix size={19} />
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="main-header">
          <div className="header-title">
            <IconButton
              label="Toggle navigation"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mobile-only"
            >
              <SidebarSimple size={20} />
            </IconButton>
            <span>{conversation?.title ?? 'New conversation'}</span>
          </div>
          <div className="header-actions">
            <button className="model-badge" onClick={() => void bridge.openExternal('model')}>
              <Glider />
              Jev latest
              <ArrowUpRight size={12} />
            </button>
            <IconButton
              label="Customize decisions"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className={inspectorOpen ? 'selected' : ''}
            >
              <SlidersHorizontal size={20} />
            </IconButton>
            {conversation && (
              <div className="conversation-menu">
                <IconButton label="Conversation actions" onClick={() => setMenuOpen(!menuOpen)}>
                  <DotsThree size={23} />
                </IconButton>
                {menuOpen && (
                  <>
                    <button
                      className="menu-dismiss"
                      aria-label="Close actions"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="menu">
                      <button
                        onClick={() => {
                          setName(conversation.title)
                          setNamedDialog('rename')
                          setMenuOpen(false)
                        }}
                      >
                        <PencilSimple size={16} />
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          setWorkspace((current) => ({
                            ...current,
                            conversations: current.conversations.map((c) =>
                              c.id === selected ? { ...c, pinned: !c.pinned } : c,
                            ),
                          }))
                          setMenuOpen(false)
                        }}
                      >
                        <PushPin size={16} />
                        {conversation.pinned ? 'Unpin' : 'Pin conversation'}
                      </button>
                      <button
                        onClick={() => {
                          download('jever-conversation.json', {
                            version: 1,
                            settings,
                            conversations: [conversation],
                            presets: [],
                          })
                          setMenuOpen(false)
                        }}
                      >
                        <DownloadSimple size={16} />
                        Export
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setNamedDialog('delete')
                          setMenuOpen(false)
                        }}
                      >
                        <Trash size={16} />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>
        {saveError && (
          <div className="save-error" role="alert">
            Changes could not be saved: {saveError}
          </div>
        )}
        <div className={`conversation-scroll ${conversation ? '' : 'empty'}`}>
          {!conversation ? (
            <section className="welcome">
              <div className="welcome-art" aria-hidden="true">
                <img src="/dither.png" alt="" />
                <div className="art-caption mono">
                  SMALL PATTERNS.
                  <br />
                  BIG POSSIBILITIES.
                </div>
                <div className="retro-window">
                  <div className="retro-title mono">
                    <span>JEV / SYSTEM ONE</span>
                    <span>▱ ×</span>
                  </div>
                  <div className="retro-content">
                    <div className="glider-grid">
                      <Glider large />
                    </div>
                    <span className="mono">
                      A little context.
                      <br />A clearer answer.
                      <span className="retro-cursor" />
                    </span>
                  </div>
                </div>
                <span className="art-coordinate mono">[ 01 / ∞ ]</span>
              </div>
              <div className="welcome-copy">
                <div className="welcome-label mono">INTELLIGENCE, A LITTLE DIFFERENT.</div>
                <h1>
                  Let's make sense
                  <br />
                  of what comes next<span>.</span>
                </h1>
                <p>
                  Bring your context. Ask a focused question.
                  <br />
                  Let Jev help you make the call.
                </p>
              </div>
              <div className="starter-list">
                {STARTERS.map((item, index) => (
                  <button key={item.id} onClick={() => starter(index)}>
                    <span className="starter-icon">
                      {index === 0 ? (
                        <ChatCircle size={20} />
                      ) : index === 1 ? (
                        <Lightning size={20} />
                      ) : (
                        <Scales size={20} />
                      )}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                ))}
              </div>
              <button className="example-link text-button" onClick={openExample}>
                <BookOpen size={15} />
                Take a look at an example
                <ArrowUpRight size={13} />
              </button>
            </section>
          ) : (
            <div className="conversation-content">
              {conversation.turns.map((turn) => (
                <Results
                  key={turn.id}
                  turn={turn}
                  busy={busy}
                  onRetry={() => void run(turn.content, turn.questions, turn.attachments)}
                  onEdit={() => {
                    setDraft(turn.content)
                    setQuestions(turn.questions)
                    setAttachments(turn.attachments)
                    textRef.current?.focus()
                  }}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
        <div className="composer-area">
          {error && (
            <div className="composer-error" role="alert">
              <span>{error}</span>
              <IconButton label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </IconButton>
            </div>
          )}
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              void run()
            }}
          >
            {attachments.length > 0 && (
              <div className="attachments">
                {attachments.map((file, i) => (
                  <span key={`${file.name}-${i}`}>
                    <FileText size={13} />
                    {file.name}
                    <IconButton
                      label={`Remove ${file.name}`}
                      onClick={() => setAttachments(attachments.filter((_, index) => index !== i))}
                    >
                      <X size={12} />
                    </IconButton>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={textRef}
              aria-label="Context for Jev"
              placeholder={
                conversation
                  ? 'Add more context, or try another decision…'
                  : 'Give Jev some context…'
              }
              rows={3}
              maxLength={100000}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  (settings.enterSends || event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault()
                  void run()
                }
              }}
            />
            <div className="composer-tools">
              <div className="flex items-center gap-2">
                <IconButton
                  label="Attach text files"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <Paperclip size={20} />
                </IconButton>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  accept=".txt,.md,.json,.csv,.tsv,.log,.yaml,.yml,.js,.ts,.tsx,.jsx,.py,.html,.css"
                  onChange={(event) => {
                    void attachFiles(event.target.files)
                    event.target.value = ''
                  }}
                />
                <span className="composer-divider" />
                <button
                  type="button"
                  className="recipe-button"
                  onClick={() => setInspectorOpen(true)}
                >
                  <SlidersHorizontal size={14} />
                  {Object.keys(questions).length}{' '}
                  {Object.keys(questions).length === 1 ? 'question' : 'questions'}
                  <span className="recipe-types">
                    {[...new Set(Object.values(questions).map((q) => q.type))].join(' + ')}
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="character-count mono">
                  {draft.length > 0 ? draft.length.toLocaleString() : ''}
                </span>
                {busy ? (
                  <button
                    type="button"
                    className="send-button"
                    aria-label="Stop decision"
                    onClick={() => running && void bridge.cancel(running.requestId)}
                  >
                    <Stop size={18} weight="fill" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-button"
                    aria-label="Run decision"
                    disabled={!draft.trim() && !attachments.length}
                  >
                    <ArrowUp size={21} />
                  </button>
                )}
              </div>
            </div>
          </form>
          <div className="composer-foot">
            <span>
              <Glider />
              Powered only by Jev.
            </span>
            <span>Decisions, with confidence.</span>
          </div>
        </div>
      </main>
      {inspectorOpen && (
        <button
          className="inspector-scrim"
          aria-label="Close customization panel"
          onClick={() => setInspectorOpen(false)}
        />
      )}
      <QuestionEditor
        questions={questions}
        onChange={changeQuestions}
        settings={settings}
        setSettings={setSettings}
        onSavePreset={() => {
          setName('')
          setNamedDialog('preset')
        }}
        onClose={() => setInspectorOpen(false)}
        disabled={busy}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workspace={workspace}
        setWorkspace={setWorkspace}
        configured={configured}
        refreshKey={refreshKey}
        notify={setToast}
      />
      <Modal
        open={presetsOpen}
        onOpenChange={setPresetsOpen}
        title="Your decision library."
        description="A familiar starting point for whatever comes next."
      >
        <div className="preset-list">
          {STARTERS.map((item, index) => (
            <button
              className="preset-row"
              disabled={busy}
              key={item.id}
              onClick={() => starter(index)}
            >
              <span>
                <strong>{item.title}</strong>
                <small>{Object.keys(item.questions).length} questions · Starter</small>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
          {workspace.presets.map((preset) => (
            <div className="saved-preset" key={preset.id}>
              <button
                className="preset-row"
                disabled={busy}
                onClick={() => {
                  changeQuestions(structuredClone(preset.questions))
                  setPresetsOpen(false)
                  setToast(`Loaded ${preset.name}`)
                }}
              >
                <span>
                  <strong>{preset.name}</strong>
                  <small>{Object.keys(preset.questions).length} questions · Your preset</small>
                </span>
                <ArrowRight size={18} />
              </button>
              <IconButton
                label={`Delete preset ${preset.name}`}
                onClick={() => {
                  setWorkspace((current) => ({
                    ...current,
                    presets: current.presets.filter((p) => p.id !== preset.id),
                  }))
                  setToast('Preset removed.')
                }}
              >
                <Trash size={16} />
              </IconButton>
            </div>
          ))}
        </div>
        <p className="hint">Build a recipe in the customization panel, then save it as a preset.</p>
      </Modal>
      <Modal
        open={namedDialog !== null}
        onOpenChange={() => setNamedDialog(null)}
        title={
          namedDialog === 'delete'
            ? 'Delete this conversation?'
            : namedDialog === 'rename'
              ? 'A name that makes sense.'
              : 'Keep this recipe.'
        }
        description={
          namedDialog === 'delete'
            ? 'This removes the conversation from this device. Export it first if you want a copy.'
            : namedDialog === 'rename'
              ? 'Make this conversation easier to find later.'
              : 'Save these questions and their criteria to your library.'
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            completeNamedDialog()
          }}
        >
          {namedDialog !== 'delete' && (
            <label className="field">
              <span>Name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={namedDialog === 'preset' ? 80 : 160}
              />
            </label>
          )}
          <div className="dialog-actions">
            <button type="button" className="outline" onClick={() => setNamedDialog(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={namedDialog !== 'delete' && !name.trim()}
              type="submit"
            >
              {namedDialog === 'delete' ? 'Delete conversation' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {!isDesktop && <span className="preview-label mono">BROWSER PREVIEW</span>}
    </div>
  )
}
