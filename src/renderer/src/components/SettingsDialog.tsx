import { useState } from 'react'
import { ArrowUpRight, Check, Key, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import { type Settings, type Workspace, workspaceSchema } from '../../../shared/domain'
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
  function update(value: Partial<Settings>) {
    setWorkspace({ ...workspace, settings: { ...settings, ...value } })
  }
  async function saveKey(value: string) {
    setSaving(true)
    setError('')
    try {
      await bridge.setKey(value)
      setKey('')
      await refreshKey()
      notify(value ? 'OpenRouter key saved securely.' : 'API key removed.')
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
                <h3>Connect to OpenRouter</h3>
              </div>
              <p>Your key is stored securely on this device.</p>
              <div className="connection-status">
                <span className={`status-dot ${configured ? 'connected' : ''}`} />
                {configured ? 'API key saved' : 'No API key connected'}
              </div>
              {!isDesktop && (
                <div className="notice">
                  This is the browser preview. Open the Electron app to connect your key and run
                  live decisions.
                </div>
              )}
              <label className="field">
                <span>{configured ? 'Replace API key' : 'OpenRouter API key'}</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="sk-or-v1-…"
                  disabled={!isDesktop}
                />
              </label>
              <div className="flex gap-2">
                <button
                  className="primary"
                  disabled={!key.trim() || saving || !isDesktop}
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
                onClick={() => void bridge.openExternal('keys')}
              >
                Get an OpenRouter key <ArrowUpRight size={14} />
              </button>
              <div className="model-fixed">
                <strong>~typesafe/jev-latest</strong>
                <p>Jev latest via OpenRouter.</p>
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
                  Private provider routing
                  <small>
                    Only use providers that decline data collection. Availability may be reduced.
                  </small>
                </span>
                <input
                  type="checkbox"
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
                </select>
              </label>
            </>
          )}
          {tab === 'data' && (
            <>
              <h3>Data</h3>
              <p>
                Your conversations and presets are saved on this device. Context is sent to
                OpenRouter only when you run a decision. Conversation files and exported backups are
                not encrypted.
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
