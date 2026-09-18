import type { DesktopAPI } from '../../shared/domain'
declare global {
  interface Window {
    jever?: DesktopAPI
  }
}
