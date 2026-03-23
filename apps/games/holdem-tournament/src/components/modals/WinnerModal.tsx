import { useGameStore } from 'holdem/app/store/useGameStore';
import { formatPlacement, getGameUiText, type HoldemLang } from 'holdem/config/localization';
import type { GameState } from 'holdem/types/engine';
import styles from 'holdem/components/modals/WinnerModal.module.css';

export function WinnerModal({ game, lang }: { game: GameState; lang: HoldemLang }) {
  const restart = useGameStore((state) => state.restart);
  const uiCopy = getGameUiText(lang);

  if (game.phase !== 'tournament_complete' || !game.tournamentCompletionReason) {
    return null;
  }

  const winner = game.seats.find((seat) => seat.playerId === game.tournamentWinnerId);
  const humanSeat = game.seats.find((seat) => seat.isHuman);
  const isGameOver = game.tournamentCompletionReason === 'human-busted';
  const isHumanWinner = Boolean(winner?.isHuman);
  const winnerName = winner?.name ?? uiCopy.unknownPlayer;
  const title = isGameOver ? uiCopy.gameOver : isHumanWinner ? uiCopy.tournamentWin : lang === 'ko' ? `${winnerName} 우승` : `${winnerName} wins`;
  const bustPlace = typeof humanSeat?.eliminationOrder === 'number'
    ? formatPlacement(humanSeat.eliminationOrder, lang)
    : lang === 'ko'
      ? '순위 미정'
      : 'an unknown place';
  const bodyText = isGameOver
    ? uiCopy.winnerModalBusted(bustPlace)
    : isHumanWinner
      ? uiCopy.winnerModalHuman(Number(winner?.stack || 0), game.currentLevel.level)
      : uiCopy.winnerModalBot(winnerName, Number(winner?.stack || 0), game.currentLevel.level);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <span className={styles.eyebrow}>{isGameOver ? uiCopy.playerBusted : uiCopy.tournamentComplete}</span>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.copy}>{bodyText}</p>
        <button className={styles.restartButton} onClick={() => restart(undefined, undefined, lang)}>
          {uiCopy.restartRun}
        </button>
      </div>
    </div>
  );
}
