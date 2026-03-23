import type { CSSProperties } from 'react';
import { AI_PROFILES } from 'holdem/config/aiProfiles';
import { getGameUiText, getProfileDescription, getProfileLabel, type HoldemLang } from 'holdem/config/localization';
import styles from 'holdem/components/modals/BotProfileIntro.module.css';

interface BotProfileIntroProps {
  lang: HoldemLang;
  onBack: () => void;
  onConfirm: () => void;
}

export function BotProfileIntro({ lang, onBack, onConfirm }: BotProfileIntroProps) {
  const profiles = Object.values(AI_PROFILES);
  const copy = getGameUiText(lang);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>{copy.opponentProfiles}</span>
          <h2 className={styles.title}>{copy.tournamentEntrants}</h2>
          <p className={styles.copy}>{copy.tournamentEntrantsCopy}</p>
        </div>

        <div className={styles.grid}>
          {profiles.map((profile) => {
            return (
              <article
                key={profile.id}
                className={styles.card}
                style={{ ['--accent' as const]: profile.color } as CSSProperties}
              >
                <div className={styles.cardTop}>
                  <span className={styles.name}>{getProfileLabel(profile.id, lang)}</span>
                </div>
                <p className={styles.description}>{getProfileDescription(profile.id, lang)}</p>
              </article>
            );
          })}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onBack}>
            {copy.back}
          </button>
          <button type="button" className={styles.primary} onClick={onConfirm}>
            {copy.confirmStart}
          </button>
        </div>
      </div>
    </div>
  );
}
