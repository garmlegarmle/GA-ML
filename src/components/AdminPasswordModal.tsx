import { useEffect, useState } from 'react';
import { t } from '../lib/site';
import type { SiteLang } from '../types';

interface AdminPasswordModalProps {
  open: boolean;
  lang: SiteLang;
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
}

export function AdminPasswordModal({ open, lang, onClose, onSubmit }: AdminPasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setLoading(false);
    setError('');
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    if (!currentPassword || !newPassword) {
      setError(lang === 'ko' ? '현재 비밀번호와 새 비밀번호를 입력하세요.' : 'Enter current and new password.');
      return;
    }
    if (newPassword.length < 10) {
      setError(lang === 'ko' ? '새 비밀번호는 10자 이상이어야 합니다.' : 'New password must be at least 10 characters.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onSubmit(currentPassword, newPassword);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'ko' ? '비밀번호 변경에 실패했습니다.' : 'Password change failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label={t(lang, 'admin.changePassword')}>
      <div className="admin-modal__backdrop" onClick={onClose} />
      <div className="admin-modal__panel admin-login-modal">
        <div className="admin-modal__header">
          <div>
            <h2>{t(lang, 'admin.changePassword')}</h2>
          </div>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>
        <div className="admin-modal__body">
          <div className="admin-form-grid">
            <label>
              {t(lang, 'admin.currentPassword')}
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              {t(lang, 'admin.newPassword')}
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            {error ? <p className="admin-error">{error}</p> : null}
            <div className="admin-actions">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={onClose} disabled={loading}>
                {t(lang, 'admin.cancel')}
              </button>
              <button type="button" className="admin-btn" onClick={() => void handleSubmit()} disabled={loading}>
                {loading ? `${t(lang, 'admin.changePassword')}...` : t(lang, 'admin.changePassword')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
