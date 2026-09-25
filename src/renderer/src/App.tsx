import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  ArrowRight,
  ArrowUp,
  CaretDown,
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
  Stop,
  Trash,
  X,
  PushPin,
  PencilSimple,
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
import { bridge, download, message } from './bridge'
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
  const [sidebarOpen, setSidebarOpen] = useState(() => matchMedia('(min-width: 768px)').matches)
  const [inspectorOpen, setInspectorOpen] = useState(false)
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
  const local = settings.connection.provider === 'ollaya'
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  )

  async function refreshKey() {
    setConfigured((await bridge.keyStatus(settings.connection)).configured)
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
    let active = true
    setConfigured(false)
    bridge
      .keyStatus(settings.connection)
      .then((status) => {
        if (active) setConfigured(status.configured)
      })
      .catch((error) => {
        if (active) setError(message(error))
      })
    return () => {
      active = false
    }
  }, [settings.connection.provider, settings.connection.baseUrl])
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
      if (event.defaultPrevented) return
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
        if (!matchMedia('(min-width: 768px)').matches) setSidebarOpen(false)
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
    if (!matchMedia('(min-width: 768px)').matches) setSidebarOpen(false)
    setInspectorOpen(false)
    textRef.current?.focus()
  }
  function selectConversation(item: Conversation) {
    setSelected(item.id)
    setQuestions(item.questions)
    setDraft('')
    setAttachments([])
    setError('')
    if (!matchMedia('(min-width: 768px)').matches) setSidebarOpen(false)
    setInspectorOpen(false)
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
            'Attach a text, Markdown, JSON, CSV, or source-code file. Images and PDFs are not supported.',
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
    if (!local && !configured) {
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
        connection: settings.connection,
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
    <div className={`app-shell ${sidebarOpen ? 'show-sidebar' : ''}`}>
      <div className="window-bar" aria-hidden="true" />
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
          <span>Jever</span>
          <IconButton
            label="Close navigation"
            className="mobile-only"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </IconButton>
        </div>
        <button className="new-conversation" disabled={busy} onClick={newConversation}>
          <Plus size={18} />
          <span>New chat</span>
        </button>
        <label className="search">
          <MagnifyingGlass size={16} />
          <input
            ref={searchRef}
            aria-label="Search conversations"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="history-list">
          {filtered.map((c) => (
            <button
              key={c.id}
              className={`history-item ${selected === c.id ? 'active' : ''}`}
              onClick={() => selectConversation(c)}
              disabled={busy && c.id !== selected}
            >
              {c.pinned ? <PushPin size={16} /> : <ChatCircle size={16} />}
              <span>{c.title}</span>
            </button>
          ))}
          {!filtered.length && search && <p className="history-empty">No results</p>}
        </div>
        <div className="sidebar-bottom">
          <button className="account-button" onClick={() => setSettingsOpen(true)}>
            <GearSix size={19} />
            <span>Settings</span>
          </button>
        </div>
      </aside>
      <main className={`main-panel ${conversation ? 'has-conversation' : 'new-chat'}`}>
        <header className="main-header">
          <div className="header-title">
            <IconButton label="Toggle navigation" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <SidebarSimple size={20} />
            </IconButton>
            {conversation && <span>{conversation.title}</span>}
          </div>
          <div className="header-actions">
            <button
              className="connection-picker"
              title={
                local
                  ? `${settings.connection.model} · ${settings.connection.baseUrl}`
                  : 'Jev via OpenRouter'
              }
              onClick={() => setSettingsOpen(true)}
              aria-label="Change decision provider"
            >
              {local ? `Ollaya · ${settings.connection.model}` : 'OpenRouter · Jev'}
            </button>
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
        {conversation ? (
          <div className="conversation-scroll">
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
          </div>
        ) : null}
        <div className="composer-area">
          {!conversation && <h1>What’s on your mind?</h1>}
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
              aria-label="Decision context"
              placeholder="Message Jever"
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
                <Popover.Root open={inspectorOpen} onOpenChange={setInspectorOpen}>
                  <Popover.Trigger asChild>
                    <button type="button" className="recipe-button" aria-label="Questions">
                      <SlidersHorizontal size={16} />
                      Questions
                      {Object.keys(questions).length > 1 && (
                        <span className="question-count">{Object.keys(questions).length}</span>
                      )}
                      <CaretDown size={12} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="questions-popover"
                      side="top"
                      align="start"
                      sideOffset={12}
                      collisionPadding={16}
                      aria-label="Questions"
                      onCloseAutoFocus={(event) => {
                        if (namedDialog || presetsOpen || settingsOpen) event.preventDefault()
                      }}
                    >
                      <QuestionEditor
                        questions={questions}
                        onChange={changeQuestions}
                        settings={settings}
                        setSettings={setSettings}
                        onSavePreset={() => {
                          setInspectorOpen(false)
                          setName('')
                          setNamedDialog('preset')
                        }}
                        onPresets={() => {
                          setInspectorOpen(false)
                          setPresetsOpen(true)
                        }}
                        onClose={() => setInspectorOpen(false)}
                        disabled={busy}
                      />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
              <div className="flex items-center gap-3">
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
        </div>
      </main>
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
        title="Presets"
        description="Saved questions and starters."
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
        <button
          className="text-button"
          onClick={() => {
            setPresetsOpen(false)
            openExample()
          }}
        >
          View example
        </button>
      </Modal>
      <Modal
        descriptionVisible={namedDialog === 'delete'}
        open={namedDialog !== null}
        onOpenChange={() => setNamedDialog(null)}
        title={
          namedDialog === 'delete'
            ? 'Delete this conversation?'
            : namedDialog === 'rename'
              ? 'Rename chat'
              : 'Save preset'
        }
        description={
          namedDialog === 'delete'
            ? 'This removes the conversation from this device. Export it first if you want a copy.'
            : namedDialog === 'rename'
              ? 'Choose a name.'
              : 'Choose a name for these questions.'
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
    </div>
  )
}
