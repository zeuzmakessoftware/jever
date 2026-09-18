import { describe, expect, it } from 'vitest'
import { isTrustedRendererURL } from '../src/main/security'

describe('native bridge URL validation', () => {
  it('accepts the packaged custom scheme', () => {
    expect(isTrustedRendererURL('jever://app/index.html')).toBe(true)
  })
  it.each([
    'https://app/index.html',
    'jever://evil/index.html',
    'jever://app.evil/index.html',
    'jever://app:123/index.html',
    'jever://user@app/index.html',
    'file:///tmp/index.html',
    'not a url',
  ])('rejects untrusted URL %s', (url) => {
    expect(isTrustedRendererURL(url)).toBe(false)
  })
  it('accepts only the configured development origin', () => {
    expect(isTrustedRendererURL('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(isTrustedRendererURL('http://localhost:9999/', 'http://localhost:5173')).toBe(false)
    expect(isTrustedRendererURL('http://localhost.evil:5173/', 'http://localhost:5173')).toBe(false)
  })
})
