import { EMPTY_WORKSPACE, workspaceSchema, type DesktopAPI } from '../../shared/domain'

export const isDesktop = Boolean(window.jever)
export const bridge: DesktopAPI = window.jever ?? {
  load: async () => {
    const value = localStorage.getItem('jever-preview')
    return value ? workspaceSchema.parse(JSON.parse(value)) : structuredClone(EMPTY_WORKSPACE)
  },
  save: async (workspace) => {
    localStorage.setItem('jever-preview', JSON.stringify(workspaceSchema.parse(workspace)))
  },
  keyStatus: async () => ({ configured: false, encrypted: false }),
  setKey: async () => {
    throw new Error('Open the Jever desktop app to securely connect your API key.')
  },
  models: async () => {
    throw new Error('Open the Jever desktop app to discover Ollaya models.')
  },
  evaluate: async () => {
    throw new Error(
      'Run this decision in the Jever desktop app. Browser preview does not access API keys.',
    )
  },
  cancel: async () => {},
  openExternal: async (destination) => {
    const links = {
      ollaya: 'https://ollaya.dev/docs/quickstart',
      keys: 'https://openrouter.ai/settings/keys',
      docs: 'https://docs.typesafe.ai/',
      model: 'https://openrouter.ai/~typesafe/jev-latest',
    }
    window.open(links[destination], '_blank', 'noopener,noreferrer')
  },
}

export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
    : 'Something went wrong. Please try again.'
}
