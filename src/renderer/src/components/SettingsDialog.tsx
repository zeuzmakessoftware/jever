import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Key, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import {
  type Settings,
  type Workspace,
  type LocalModel,
  connectionSchema,
  workspaceSchema,
} from '../../../shared/domain'
import { bridge, download, isDesktop, message } from '../bridge'
import { Modal } from './Primitives'

export function SettingsDialog({
  open,
  onOpenChange,
  workspace,
  setWorkspace,
  configured,
  refreshKey,
  notify,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: Workspace
  setWorkspace: (workspace: Workspace) => void
  configured: boolean
  refreshKey: () => Promise<void>
  notify: (text: string) => void
}) {
  const [tab, setTab] = useState('connection')
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const settings = workspace.settings
  const connection = settings.connection
  const local = connection.provider === 'ollaya'
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl)
  const [model, setModel] = useState(connection.model)
  const [models, setModels] = useState<LocalModel[]>([])
  const [checking, setChecking] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('')
  const checkId = useRef(0)
  useEffect(() => {
    setBaseUrl(connection.baseUrl)
    setKey('')
    setError('')
    setModels([])
    setConnectionStatus('')
    setChecking(false)
    checkId.current++
  }, [connection.provider, connection.baseUrl])
  useEffect(() => setModel(connection.model), [connection.model])
  async function checkConnection() {
    const id = ++checkId.current
    setChecking(true)
    setError('')
    setConnectionStatus('')
    try {
      const found = await bridge.models(connection)
      if (id !== checkId.current) return
      setModels(found)
      setConnectionStatus(
        found.length
          ? `Connected. ${found.length} installed models available.`
          : 'Connected, but no models are installed. Run ollaya pull laya, then refresh.',
      )
    } catch (error) {
      if (id === checkId.current) {
        setModels([])
        setError(message(error))
      }
    } finally {
      if (id === checkId.current) setChecking(false)
    }
  }
  function saveConnection() {
    const parsed = connectionSchema.safeParse({ ...connection, baseUrl, model })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setBaseUrl(parsed.data.baseUrl)
    setModel(parsed.data.model)
    update({ connection: parsed.data })
    setError('')
    notify('Ollaya connection saved.')
  }
  function update(value: Partial<Settings>) {
    setWorkspace({ ...workspace, settings: { ...settings, ...value } })
  }
  async function saveKey(value: string) {
    setSaving(true)
    setError('')
    try {
      await bridge.setKey(value, connection)
      setKey('')
      await refreshKey()
      notify(value ? `${local ? 'Ollaya' : 'OpenRouter'} key saved securely.` : 'API key removed.')
    } catch (error) {
      setError(message(error))
    } finally {
      setSaving(false)
    }
  }
  async function importWorkspace(file?: File) {
    if (!file) return
    try {
      if (file.size > 20_000_000) throw new Error('Choose a backup smaller than 20 MB.')
      const imported = workspaceSchema.parse(JSON.parse(await file.text()))
      const existing = new Set(workspace.conversations.map((c) => c.id))
      const presets = new Set(workspace.presets.map((p) => p.id))
      setWorkspace({
        ...workspace,
        conversations: [
          ...imported.conversations.filter((c) => !existing.has(c.id)),
          ...workspace.conversations,
        ],
        presets: [...workspace.presets, ...imported.presets.filter((p) => !presets.has(p.id))],
      })
      notify('Backup imported. Existing conversations were kept.')
    } catch {
      setError('This is not a valid Jever backup. No conversations were changed.')
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        setError('')
        setKey('')
        onOpenChange(value)
      }}
      title="Settings"
      description="Connection, appearance, and preferences."
      wide
    >
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings categories">
          {['connection', 'appearance', 'behavior', 'data'].map((item) => (
            <button
              className={tab === item ? 'active' : ''}
              key={item}
              onClick={() => {
                setTab(item)
                setError('')
              }}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'connection' && (
            <>
              <div className="settings-section-title">
                <Key size={22} />
                <h3>{local ? 'Connect to Ollaya' : 'Connect to OpenRouter'}</h3>
              </div>
              <label className="field">
                <span>Decision provider</span>
                <select
                  value={connection.provider}
                  disabled={saving}
                  onChange={(event) =>
                    update({
                      connection: {
                        ...connection,
                        provider: event.target.value as Settings['connection']['provider'],
                      },
                    })
                  }
                >
                  <option value="openrouter">OpenRouter · Jev</option>
                  <option value="ollaya">Ollaya · Local models</option>
                </select>
              </label>
              {local && (
                <>
                  <p>
                    Run models on your own Ollaya server. Start it with <code>ollaya serve</code>{' '}
                    and install a model with <code>ollaya pull laya</code>.
                  </p>
                  <label className="field">
                    <span>Server URL</span>
                    <input
                      type="url"
                      value={baseUrl}
                      spellCheck={false}
                      disabled={saving}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="http://localhost:11435"
                    />
                  </label>
                  <label className="field">
                    <span>Model</span>
                    <input
                      list="ollaya-models"
                      value={model}
                      spellCheck={false}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder="laya"
                    />
                    <datalist id="ollaya-models">
                      {models.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.description}
                        </option>
                      ))}
                    </datalist>
                  </label>
                  <div className="flex gap-2">
                    <button className="primary" disabled={saving} onClick={saveConnection}>
                      Save connection
                    </button>
                    <button
                      className="outline"
                      disabled={
                        !isDesktop ||
                        checking ||
                        baseUrl !== connection.baseUrl ||
                        model !== connection.model
                      }
                      onClick={() => void checkConnection()}
                    >
                      {checking ? 'Checking…' : 'Test & refresh models'}
                    </button>
                  </div>
                  {connectionStatus && (
                    <p className="hint" role="status">
                      {connectionStatus}
                    </p>
                  )}
                  <p className="hint">
                    Save URL or model changes before testing. Context, attachments, and enabled
                    history go to this server. Local servers need no API key unless authentication
                    is enabled.
                  </p>
                </>
              )}
              <p>Your keys are stored securely on this device.</p>
              <div className="connection-status">
                <span className={`status-dot ${configured ? 'connected' : ''}`} />
                {configured
                  ? 'API key saved'
                  : local
                    ? 'No API key saved · optional'
                    : 'No API key connected'}
              </div>
              {!isDesktop && (
                <div className="notice">
                  This is the browser preview. Open the Electron app to connect your key and run
                  live decisions.
                </div>
              )}
              <label className="field">
                <span>
                  {configured
                    ? 'Replace API key'
                    : local
                      ? 'Ollaya API key (optional)'
                      : 'OpenRouter API key'}
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder={local ? 'Server API key' : 'sk-or-v1-…'}
                  disabled={!isDesktop}
                />
              </label>
              <div className="flex gap-2">
                <button
                  className="primary"
                  disabled={
                    !key.trim() || saving || !isDesktop || (local && baseUrl !== connection.baseUrl)
                  }
                  onClick={() => void saveKey(key)}
                >
                  {saving ? 'Saving…' : 'Save API key'}
                </button>
                {configured && (
                  <button className="outline" disabled={saving} onClick={() => void saveKey('')}>
                    Remove key
                  </button>
                )}
              </div>
              <button
                className="text-button external-button"
                onClick={() => void bridge.openExternal(local ? 'ollaya' : 'keys')}
              >
                {local ? 'Ollaya setup guide' : 'Get an OpenRouter key'} <ArrowUpRight size={14} />
              </button>
              <div className="model-fixed">
                <strong>{local ? connection.model : '~typesafe/jev-latest'}</strong>
                <p>{local ? 'Via your Ollaya server.' : 'Jev latest via OpenRouter.'}</p>
              </div>
            </>
          )}
          {tab === 'appearance' && (
            <>
              <h3>Appearance</h3>
              <label className="field">
                <span>Theme</span>
                <select
                  value={settings.theme}
                  onChange={(event) => update({ theme: event.target.value as Settings['theme'] })}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </label>
              <span className="field-label">Accent</span>
              <div className="swatches">
                {(['rose', 'sage', 'blue'] as const).map((accent) => (
                  <button
                    className={`swatch ${accent}`}
                    key={accent}
                    aria-label={`${accent} accent`}
                    aria-pressed={settings.accent === accent}
                    onClick={() => update({ accent })}
                  >
                    {settings.accent === accent && <Check size={20} />}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>
                  Text size <output>{settings.textSize}px</output>
                </span>
                <input
                  type="range"
                  min="13"
                  max="18"
                  value={settings.textSize}
                  onChange={(event) => update({ textSize: Number(event.target.value) })}
                />
              </label>
            </>
          )}
          {tab === 'behavior' && (
            <>
              <h3>Behavior</h3>
              <label className="toggle-row">
                <span>
                  Enter to send<small>Shift + Enter always adds a new line.</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.enterSends}
                  onChange={(event) => update({ enterSends: event.target.checked })}
                />
              </label>
              <label className="toggle-row">
                <span>
                  Include conversation history
                  <small>Send earlier contexts and results with follow-up decisions.</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.includeHistory}
                  onChange={(event) => update({ includeHistory: event.target.checked })}
                />
              </label>
              <label className="toggle-row">
                <span>
                  Private provider routing (OpenRouter)
                  <small>
                    Only use providers that decline data collection. Availability may be reduced.
                  </small>
                </span>
                <input
                  type="checkbox"
                  disabled={local}
                  checked={settings.privateRouting}
                  onChange={(event) => update({ privateRouting: event.target.checked })}
                />
              </label>
              <label className="field">
                <span>Request timeout</span>
                <select
                  value={settings.timeout}
                  onChange={(event) => update({ timeout: Number(event.target.value) })}
                >
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                  <option value={120}>120 seconds</option>
                  <option value={300}>5 minutes · model loading</option>
                  <option value={600}>10 minutes</option>
                </select>
              </label>
            </>
          )}
          {tab === 'data' && (
            <>
              <h3>Data</h3>
              <p>
                Your conversations and presets are saved on this device. Context is sent to your
                selected provider only when you run a decision. Conversation files and exported
                backups are not encrypted.
              </p>
              <div className="data-stat">
                <strong>{workspace.conversations.length}</strong>
                <span>saved conversations</span>
              </div>
              <button
                className="outline w-full"
                onClick={() => download('jever-backup.json', workspace)}
              >
                <DownloadSimple size={17} />
                Export workspace
              </button>
              <label className="outline w-full import-button">
                <UploadSimple size={17} />
                Import backup
                <input
                  type="file"
                  accept=".json"
                  onChange={(event) => {
                    void importWorkspace(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
              <p className="hint">
                Backups include conversations, settings, and presets. They never include your API
                key. Imports merge conversations and presets while keeping current preferences.
              </p>
            </>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
