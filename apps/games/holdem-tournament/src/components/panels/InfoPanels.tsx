import { useGameStore } from 'holdem/app/store/useGameStore';
import { getGameUiText, getStreetLabel, type HoldemLang } from 'holdem/config/localization';
import { selectActingSeat, selectHandsUntilLevelUp, selectTotalPot } from 'holdem/engine/stateMachine/selectors';
import type { ActionLogEntry, GameState } from 'holdem/types/engine';
import styles from 'holdem/components/panels/InfoPanels.module.css';

export function CompactStatus({ game, lang }: { game: GameState; lang: HoldemLang }) {
  const actingSeat = selectActingSeat(game);
  const totalPot = selectTotalPot(game);
  const handsUntilLevelUp = selectHandsUntilLevelUp(game);
  const copy = getGameUiText(lang);

  return (
    <section className={styles.cornerStatus}>
      <div className={styles.cornerTitle}>{copy.tournament}</div>
      <div className={styles.cornerLine}>
        <span>{copy.level} {game.currentLevel.level}</span>
        <span>
          {game.currentLevel.smallBlind}/{game.currentLevel.bigBlind}
        </span>
        <span>{copy.ante} {game.currentLevel.ante}</span>
      </div>
      <div className={styles.cornerLine}>
        <span>{copy.hand} #{game.hand.handNumber}</span>
        <span>{copy.pot} {totalPot.toLocaleString()}</span>
        <span>{copy.nextLevelInHands(handsUntilLevelUp)}</span>
      </div>
      <div className={styles.cornerLine}>
        <span>{getStreetLabel(game.betting.street, lang)}</span>
        <span>{actingSeat?.name ?? copy.waiting}</span>
      </div>
    </section>
  );
}

export function SettingsPanel({ game, lang }: { game: GameState; lang: HoldemLang }) {
  const setActionSpeed = useGameStore((state) => state.setActionSpeed);
  const toggleAutoProgress = useGameStore((state) => state.toggleAutoProgress);
  const advanceOneStep = useGameStore((state) => state.advanceOneStep);
  const restart = useGameStore((state) => state.restart);
  const copy = getGameUiText(lang);

  return (
    <section className={styles.panel}>
      <h3 className={styles.title}>{copy.settings}</h3>
      <label className={styles.sliderLabel}>
        {copy.aiSpeed}: {game.ui.actionSpeed}ms
        <input
          type="range"
          min={150}
          max={1600}
          step={50}
          value={game.ui.actionSpeed}
          onChange={(event) => setActionSpeed(Number(event.target.value))}
        />
      </label>
      <button className={styles.toggle} onClick={toggleAutoProgress}>
        {copy.autoProgress}: {game.ui.autoProgress ? copy.on : copy.off}
      </button>
      {!game.ui.autoProgress && (
        <button className={styles.secondary} onClick={advanceOneStep}>
          {copy.stepOnce}
        </button>
      )}
      <button className={styles.secondary} onClick={() => restart(undefined, undefined, lang)}>
        {copy.restartTournament}
      </button>
      <div className={styles.seed}>{copy.seed}: {game.ui.lastSeed || game.rngState}</div>
    </section>
  );
}

export function LogPanel({ entries, lang }: { entries: ActionLogEntry[]; lang: HoldemLang }) {
  const copy = getGameUiText(lang);

  return (
    <section className={styles.panel}>
      <h3 className={styles.title}>{copy.handHistory}</h3>
      <div className={styles.logList}>
        {entries.slice().reverse().map((entry) => (
          <div key={entry.id} className={styles.logEntry}>
            <span className={styles.logStreet}>{getStreetLabel(entry.street, lang)}</span>
            <span>{entry.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
