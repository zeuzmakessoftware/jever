import * as Dialog from '@radix-ui/react-dialog'
import { X } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

export function Glider({ large = false }: { large?: boolean }) {
  return (
    <span className={`glider ${large ? 'large' : ''}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={[1, 5, 6, 7, 8].includes(i) ? 'on' : ''} />
      ))}
    </span>
  )
}
export function IconButton({
  label,
  children,
  onClick,
  disabled,
  className = '',
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content ${wide ? 'wide' : ''}`}>
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close dialog">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="dialog-description">{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
