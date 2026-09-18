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
import { EMPTY_WORKSPACE, requestSchema, workspaceSchema } from '../shared/domain'
import { evaluateDecision } from './api'
import { isTrustedRendererURL } from './security'

app.setName('Jever')
// Isolated data directory makes smoke tests independent of a real user's workspace.
if (process.env.JEVER_USER_DATA) app.setPath('userData', process.env.JEVER_USER_DATA)
protocol.registerSchemesAsPrivileged([
  { scheme: 'jever', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])
let window: BrowserWindow | null = null
let key = ''
let writeQueue = Promise.resolve()
const pending = new Map<string, AbortController>()
const externalLinks = {
  keys: 'https://openrouter.ai/settings/keys',
  docs: 'https://docs.typesafe.ai/',
  model: 'https://openrouter.ai/~typesafe/jev-latest',
}
const devUrl = process.env.ELECTRON_RENDERER_URL
const workspaceFile = () => join(app.getPath('userData'), 'workspace.json')
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
  register('key:status', () => ({
    configured: Boolean(key),
    encrypted:
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  }))
  register('key:set', async (value: unknown) => {
    if (typeof value !== 'string' || value.length > 1000) throw new Error('Invalid API key.')
    const next = value.trim()
    if (!next) {
      await unlink(keyFile()).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      key = ''
      return
    }
    if (!/^sk-or-[A-Za-z0-9_-]+$/.test(next))
      throw new Error('Enter a valid OpenRouter key beginning with sk-or-.')
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
      throw new Error(
        'An OS keychain is required to save an API key securely. Enable your system keychain and restart Jever.',
      )
    await writeFile(keyFile(), safeStorage.encryptString(next), { mode: 0o600 })
    key = next
  })
  register('decision:run', async (data: unknown) => {
    const request = requestSchema.parse(data)
    if (pending.size >= 1) throw new Error('A decision is already running.')
    const controller = new AbortController()
    pending.set(request.requestId, controller)
    const timeout = setTimeout(() => controller.abort('timeout'), request.timeout * 1000)
    try {
      return await evaluateDecision(request, key, controller.signal)
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          controller.signal.reason === 'timeout'
            ? 'The request timed out. Try a smaller context or increase the timeout in Settings.'
            : 'Decision stopped.',
        )
      if (error instanceof TypeError)
        throw new Error('Could not reach OpenRouter. Check your connection and try again.')
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
