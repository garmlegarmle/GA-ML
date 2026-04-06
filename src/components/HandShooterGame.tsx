import type { SiteLang } from '../types';

export const MINE_CART_DUEL_SLUG = 'mine-cart-duel';

const COPY = {
  en: {
    title: 'Mine Cart Duel',
    hint: 'The embedded build uses webcam hand tracking. Press Start Game inside the game to grant camera permission.'
  },
  ko: {
    title: '마인 카트 듀얼',
    hint: '이 내장 게임은 웹캠 손 추적을 사용합니다. 게임 안에서 Start Game을 눌러 카메라 권한을 허용하세요.'
  }
} as const;

export function HandShooterGameContent({ lang, embedded = false }: { lang: SiteLang; embedded?: boolean }) {
  const copy = COPY[lang];
  const iframeSrc = `/embedded-games/hand-shooter-mvp/index.html?lang=${lang}`;

  return (
    <div className={`hand-shooter-game${embedded ? ' hand-shooter-game--embedded' : ''}`}>
      <div className="hand-shooter-game__frame-shell">
        <iframe
          className="hand-shooter-game__frame"
          src={iframeSrc}
          title={copy.title}
          loading="lazy"
          allow="camera; microphone; autoplay; fullscreen"
        />
      </div>
      <p className="hand-shooter-game__hint">{copy.hint}</p>
    </div>
  );
}
