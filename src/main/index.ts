import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  session,
  Menu,
  protocol,
  net,
} from 'electron'
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  EMPTY_WORKSPACE,
  requestSchema,
  workspaceSchema,
  connectionSchema,
  type Connection,
} from '../shared/domain'
import { evaluateDecision, listOllayaModels } from './api'
import { isTrustedRendererURL } from './security'

app.setName('Jever')
// Isolated data directory makes smoke tests independent of a real user's workspace.
if (process.env.JEVER_USER_DATA) app.setPath('userData', process.env.JEVER_USER_DATA)
protocol.registerSchemesAsPrivileged([
  { scheme: 'jever', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])
let window: BrowserWindow | null = null
let key = ''
let ollayaKeys: Record<string, string> = {}
let writeQueue = Promise.resolve()
const pending = new Map<string, AbortController>()
const externalLinks = {
  ollaya: 'https://ollaya.dev/docs/quickstart',
  keys: 'https://openrouter.ai/settings/keys',
  docs: 'https://docs.typesafe.ai/',
  model: 'https://openrouter.ai/~typesafe/jev-latest',
}
const devUrl = process.env.ELECTRON_RENDERER_URL
const workspaceFile = () => join(app.getPath('userData'), 'workspace.json')
const ollayaKeyFile = () => join(app.getPath('userData'), 'ollaya-credentials.bin')
const connectionKey = (connection: Connection) =>
  connection.provider === 'openrouter' ? key : (ollayaKeys[connection.baseUrl] ?? '')
const keyFile = () => join(app.getPath('userData'), 'credential.bin')

function register(channel: string, handler: (...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    const url = event.senderFrame?.url
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !url ||
      !isTrustedRendererURL(url, devUrl)
    )
      throw new Error('Untrusted request')
    return handler(...args)
  })
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 740,
    minHeight: 620,
    title: 'Jever',
    backgroundColor: '#f7f7f2',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('closed', () => {
    pending.forEach((controller) => controller.abort())
    window = null
  })
  if (devUrl) await window.loadURL(devUrl)
  else await window.loadURL('jever://app/index.html')
}

app.whenReady().then(async () => {
  await mkdir(app.getPath('userData'), { recursive: true })
  if (safeStorage.isEncryptionAvailable()) {
    try {
      key = safeStorage.decryptString(await readFile(keyFile()))
    } catch {
      /* No saved key, or OS keychain is unavailable. */
    }
  }
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const saved = JSON.parse(safeStorage.decryptString(await readFile(ollayaKeyFile())))
      if (
        saved &&
        typeof saved === 'object' &&
        Object.values(saved).every((value) => typeof value === 'string')
      )
        ollayaKeys = saved
    } catch {
      /* No Ollaya credentials saved. */
    }
  }
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  session.defaultSession.setPermissionCheckHandler(() => false)
  protocol.handle('jever', (request) => {
    const url = new URL(request.url)
    const rendererRoot = resolve(__dirname, '../renderer')
    const path = resolve(rendererRoot, '.' + decodeURIComponent(url.pathname))
    if (url.host !== 'app' || !path.startsWith(rendererRoot + sep))
      return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(path).toString())
  })
  register('workspace:load', async () => {
    try {
      return workspaceSchema.parse(JSON.parse(await readFile(workspaceFile(), 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_WORKSPACE
      throw new Error(
        'Your saved workspace could not be read. It has not been overwritten. Restore a backup or inspect workspace.json in the Jever data folder.',
      )
    }
  })
  register('workspace:save', (data: unknown) => {
    if (JSON.stringify(data).length > 20_000_000)
      throw new Error('Workspace is too large. Export older conversations first.')
    const workspace = workspaceSchema.parse(data)
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        const target = workspaceFile()
        await writeFile(target + '.tmp', JSON.stringify(workspace), { mode: 0o600 })
        await rename(target + '.tmp', target)
      })
    return writeQueue
  })
  register('key:status', (value: unknown) => ({
    configured: Boolean(connectionKey(connectionSchema.parse(value ?? {}))),
    encrypted:
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  }))
  register('key:set', async (value: unknown, options: unknown) => {
    const connection = connectionSchema.parse(options ?? {})
    const local = connection.provider === 'ollaya'
    if (typeof value !== 'string' || value.length > 1000) throw new Error('Invalid API key.')
    const next = value.trim()
    if (!next && !local) {
      await unlink(keyFile()).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      key = ''
      return
    }
    if (!local && !/^sk-or-[A-Za-z0-9_-]+$/.test(next))
      throw new Error('Enter a valid OpenRouter key beginning with sk-or-.')
    if (/[\r\n]/.test(next)) throw new Error('API keys must not contain line breaks.')
    if (local && !next && Object.keys(ollayaKeys).every((url) => url === connection.baseUrl)) {
      await unlink(ollayaKeyFile()).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      ollayaKeys = {}
      return
    }
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
      throw new Error(
        'An OS keychain is required to save an API key securely. Enable your system keychain and restart Jever.',
      )
    if (local) {
      const updated = { ...ollayaKeys }
      if (next) updated[connection.baseUrl] = next
      else delete updated[connection.baseUrl]
      await writeFile(ollayaKeyFile(), safeStorage.encryptString(JSON.stringify(updated)), {
        mode: 0o600,
      })
      ollayaKeys = updated
    } else {
      await writeFile(keyFile(), safeStorage.encryptString(next), { mode: 0o600 })
      key = next
    }
  })
  register('connection:models', async (value: unknown) => {
    const connection = connectionSchema.parse(value)
    try {
      return await listOllayaModels(connection, connectionKey(connection))
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error('Could not reach Ollaya. Start ollaya serve and check the server URL.')
      if (error instanceof Error && error.name === 'TimeoutError')
        throw new Error('Ollaya did not respond within 10 seconds. Check the server and try again.')
      throw error
    }
  })
  register('decision:run', async (data: unknown) => {
    const request = requestSchema.parse(data)
    if (pending.size >= 1) throw new Error('A decision is already running.')
    const controller = new AbortController()
    pending.set(request.requestId, controller)
    const timeout = setTimeout(() => controller.abort('timeout'), request.timeout * 1000)
    try {
      return await evaluateDecision(request, connectionKey(request.connection), controller.signal)
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          controller.signal.reason === 'timeout'
            ? 'The request timed out. Try a smaller context or increase the timeout in Settings.'
            : 'Decision stopped.',
        )
      if (error instanceof TypeError)
        throw new Error(
          request.connection.provider === 'ollaya'
            ? 'Could not reach Ollaya. Start ollaya serve and check the server URL in Settings.'
            : 'Could not reach OpenRouter. Check your connection and try again.',
        )
      throw error
    } finally {
      clearTimeout(timeout)
      pending.delete(request.requestId)
    }
  })
  register('decision:cancel', (id: unknown) => {
    if (typeof id === 'string') pending.get(id)?.abort()
  })
  register('external:open', (destination: keyof typeof externalLinks) => {
    if (Object.hasOwn(externalLinks, destination))
      return shell.openExternal(externalLinks[destination])
    throw new Error('Unsupported destination')
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: 'Jever',
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
        ],
      },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    ]),
  )
  await createWindow()
  app.on('activate', () => {
    if (!window) void createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
let flushedForQuit = false
app.on('before-quit', (event) => {
  pending.forEach((controller) => controller.abort())
  if (!flushedForQuit) {
    event.preventDefault()
    writeQueue
      .catch(() => {})
      .finally(() => {
        flushedForQuit = true
        app.quit()
      })
  }
})
