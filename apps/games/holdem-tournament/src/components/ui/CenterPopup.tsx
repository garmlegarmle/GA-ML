import type { ReactNode } from 'react';
import styles from 'holdem/components/ui/CenterPopup.module.css';

interface CenterPopupProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

export function CenterPopup({ title, closeLabel, onClose, children }: CenterPopupProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
