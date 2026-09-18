export function isTrustedRendererURL(value: string, developmentURL?: string): boolean {
  try {
    const url = new URL(value)
    if (developmentURL) return url.origin === new URL(developmentURL).origin
    // Node's URL.origin is "null" for custom schemes, even when Electron registers them as secure.
    return (
      url.protocol === 'jever:' &&
      url.hostname === 'app' &&
      !url.port &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
