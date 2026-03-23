import { buildPots } from 'holdem/engine/pots/buildPots';
import { getGameUiText } from 'holdem/config/localization';
import { distributePots } from 'holdem/engine/pots/distributePots';
import type { GameState, Payout } from 'holdem/types/engine';

export function resolveShowdown(state: GameState): Pick<GameState['hand'], 'pots' | 'payouts' | 'showdown' | 'winnerMessage'> {
  const copy = getGameUiText(state.ui.lang);
  const contenders = state.seats.filter((seat) => seat.status === 'active' && seat.totalCommitted > 0);
  const pots = buildPots(state.seats);

  if (contenders.filter((seat) => !seat.hasFolded).length === 1) {
    const winner = contenders.find((seat) => !seat.hasFolded)!;
    const totalPot = state.seats.reduce((sum, seat) => sum + seat.totalCommitted, 0);
    const payouts: Payout[] = [
      {
        potId: 'main',
        playerId: winner.playerId,
        amount: totalPot,
        isOddChip: false,
      },
    ];

    return {
      pots,
      payouts,
      showdown: [],
      winnerMessage: copy.noContestWinner(winner.name, totalPot),
    };
  }

  const { payouts, showdown } = distributePots(
    pots,
    state.seats.filter((seat) => !seat.hasFolded),
    state.hand.communityCards,
    state.buttonSeatIndex,
  );
  const winnerNames = [...new Set(payouts.map((payout) => state.seats.find((seat) => seat.playerId === payout.playerId)?.name ?? payout.playerId))];

  return {
    pots,
    payouts,
    showdown,
    winnerMessage:
      winnerNames.length === 1
        ? copy.showdownWinner(winnerNames[0])
        : copy.splitPotWinner(winnerNames),
  };
}
