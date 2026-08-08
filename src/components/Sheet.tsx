import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../data/i18n';
import { CloseIcon } from './icons';

/** Locks page scroll while any sheet is mounted (nesting-safe). */
let lockCount = 0;
function useScrollLock(): void {
  useEffect(() => {
    lockCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = '';
    };
  }, []);
}

type SheetProps = {
  title?: string;
  /** Full-height variant, for browsing/picking rather than a short form. */
  full?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Extra control rendered left of the close button. */
  headerAction?: React.ReactNode;
};

/**
 * Bottom sheet. Tapping the backdrop closes it; the "×" sits top-right of the
 * header, which is where every dismiss control in this app lives.
 */
export function Sheet({ title, full, onClose, children, footer, headerAction }: SheetProps) {
  useScrollLock();
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className={full ? 'sheet sheet-full' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s1)' }}>
            {headerAction}
            <button className="icon-btn" onClick={onClose} aria-label={t('sheet.close')}>
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

type ConfirmProps = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const { t } = useLanguage();

  return (
    <Sheet
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>
            {t('sheet.cancel')}
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            style={{ flex: 1 }}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('sheet.confirmDefault')}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-dim)', fontSize: 15 }}>{message}</p>
    </Sheet>
  );
}

type ToastProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function Toast({ message, actionLabel, onAction }: ToastProps) {
  return createPortal(
    <div className="toast" role="status">
      <span>{message}</span>
      {actionLabel && (
        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--accent)' }} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>,
    document.body,
  );
}
