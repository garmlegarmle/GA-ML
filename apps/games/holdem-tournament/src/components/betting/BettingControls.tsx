import { useEffect } from 'react';
import { useGameStore } from 'holdem/app/store/useGameStore';
import { getGameUiText, type HoldemLang } from 'holdem/config/localization';
import styles from 'holdem/components/betting/BettingControls.module.css';
import type { LegalAction, Seat } from 'holdem/types/engine';

interface BettingControlsProps {
  seat?: Seat;
  legalActions: LegalAction[];
  amountToCall: number;
  potSize: number;
  bigBlind: number;
  lang: HoldemLang;
}

interface ShortcutOption {
  label: string;
  amount: number;
}

function buildShortcutOptions(
  wagerAction: Extract<LegalAction, { min: number; max: number }> | undefined,
  seat: Seat,
  amountToCall: number,
  potSize: number,
  bigBlind: number,
  lang: HoldemLang,
): ShortcutOption[] {
  if (!wagerAction) {
    return [];
  }

  const options: ShortcutOption[] = [];
  const copy = getGameUiText(lang);
  const add = (label: string, rawAmount: number) => {
    const amount = Math.max(wagerAction.min, Math.min(wagerAction.max, Math.round(rawAmount)));

    if (options.some((option) => option.amount === amount)) {
      return;
    }

    options.push({ label, amount });
  };

  [2, 2.5, 3, 4].forEach((multiplier) => add(`${multiplier}BB`, multiplier * bigBlind));
  [0.33, 0.5, 0.75, 1].forEach((ratio) =>
    add(copy.potShortcut(Math.round(ratio * 100)), seat.currentBet + amountToCall + potSize * ratio),
  );

  return options;
}

export function BettingControls({ seat, legalActions, amountToCall, potSize, bigBlind, lang }: BettingControlsProps) {
  const raiseInput = useGameStore((state) => state.game.ui.raiseInput);
  const performHumanAction = useGameStore((state) => state.performHumanAction);
  const setRaiseInput = useGameStore((state) => state.setRaiseInput);
  const copy = getGameUiText(lang);

  const checkAction = legalActions.find((action) => action.type === 'check');
  const callAction = legalActions.find((action) => action.type === 'call');
  const foldAction = legalActions.find((action) => action.type === 'fold');
  const allInAction = legalActions.find((action) => action.type === 'all-in');
  const wagerAction = legalActions.find(
    (action): action is Extract<LegalAction, { min: number; max: number }> => 'min' in action,
  );
  const shortcutOptions = seat ? buildShortcutOptions(wagerAction, seat, amountToCall, potSize, bigBlind, lang) : [];

  useEffect(() => {
    if (wagerAction) {
      const clamped = Math.max(wagerAction.min, Math.min(wagerAction.max, raiseInput));

      if (clamped !== raiseInput) {
        setRaiseInput(clamped);
      }
    }
  }, [raiseInput, setRaiseInput, wagerAction]);

  if (!seat || seat.status !== 'active') {
    return <div className={styles.disabled}>{copy.eliminatedMessage}</div>;
  }

  return (
    <div className={styles.controls}>
      {wagerAction ? (
        <div className={styles.raisePanel}>
          <label className={styles.label}>
            {wagerAction.type === 'bet' ? copy.betAmount : copy.raiseAmount}
            {shortcutOptions.length > 0 && (
              <div className={styles.shortcutRow}>
                {shortcutOptions.map((option) => (
                  <button
                    key={`${option.label}-${option.amount}`}
                    type="button"
                    className={styles.shortcutButton}
                    onClick={() => setRaiseInput(option.amount)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <input
              type="range"
              min={wagerAction.min}
              max={wagerAction.max}
              step={1}
              value={Math.max(wagerAction.min, Math.min(wagerAction.max, raiseInput))}
              onChange={(event) => setRaiseInput(Number(event.target.value))}
            />
          </label>
          <input
            className={styles.numeric}
            type="number"
            min={wagerAction.min}
            max={wagerAction.max}
            value={Math.max(wagerAction.min, Math.min(wagerAction.max, raiseInput))}
            onChange={(event) => setRaiseInput(Number(event.target.value))}
          />
        </div>
      ) : (
        <div className={styles.raisePanelPlaceholder}>{copy.noWagerAvailable}</div>
      )}
      <div className={styles.buttons}>
        {foldAction && (
          <button className={styles.secondary} onClick={() => performHumanAction('fold')}>
            {copy.fold}
          </button>
        )}
        {checkAction && (
          <button className={styles.secondary} onClick={() => performHumanAction('check')}>
            {copy.check}
          </button>
        )}
        {callAction && (
          <button className={styles.secondary} onClick={() => performHumanAction('call')}>
            {copy.call(callAction.amount)}
          </button>
        )}
        {wagerAction && (
          <button className={styles.primary} onClick={() => performHumanAction(wagerAction.type, raiseInput)}>
            {wagerAction.type === 'bet' ? copy.bet(raiseInput) : copy.raise(raiseInput)}
          </button>
        )}
        {allInAction && (
          <button className={styles.danger} onClick={() => performHumanAction('all-in')}>
            {copy.allInAction(allInAction.amount)}
          </button>
        )}
      </div>
    </div>
  );
}
