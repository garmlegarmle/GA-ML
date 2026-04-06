import { BET_SIZING_BUCKETS } from 'holdem/config/betSizing';
import { BLIND_LEVELS } from 'holdem/config/blindLevels';
import type { HoldemLang } from 'holdem/config/localization';
import type { TournamentConfig } from 'holdem/types/tournament';

export function getDefaultHumanPlayerName(lang: HoldemLang = 'ko') {
  return lang === 'en' ? 'You' : '당신';
}

export const DEFAULT_PLAYER_SEATS = [
  { seatIndex: 0, playerId: 'human-1', name: getDefaultHumanPlayerName('ko'), isHuman: true },
  { seatIndex: 1, playerId: 'bot-1', name: 'Mara', isHuman: false, profileId: 'tight-passive' as const },
  { seatIndex: 2, playerId: 'bot-2', name: 'Viktor', isHuman: false, profileId: 'tight-aggressive' as const },
  { seatIndex: 3, playerId: 'bot-3', name: 'Nina', isHuman: false, profileId: 'loose-passive' as const },
  { seatIndex: 4, playerId: 'bot-4', name: 'Rex', isHuman: false, profileId: 'loose-aggressive' as const },
  { seatIndex: 5, playerId: 'bot-5', name: 'June', isHuman: false, profileId: 'calling-station' as const },
  { seatIndex: 6, playerId: 'bot-6', name: 'Otto', isHuman: false, profileId: 'nit' as const },
  { seatIndex: 7, playerId: 'bot-7', name: 'Blaze', isHuman: false, profileId: 'maniac' as const },
  { seatIndex: 8, playerId: 'bot-8', name: 'Elliot', isHuman: false, profileId: 'balanced-regular' as const },
];

export function normalizeTournamentPlayerName(value: string | null | undefined, lang: HoldemLang = 'ko'): string {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);

  return normalized || getDefaultHumanPlayerName(lang);
}

export function createTournamentConfig(playerName?: string, lang: HoldemLang = 'ko'): TournamentConfig {
  const resolvedPlayerName = normalizeTournamentPlayerName(playerName, lang);

  return {
    startingStack: 10000,
    handsPerLevel: 8,
    blindLevels: BLIND_LEVELS,
    seats: DEFAULT_PLAYER_SEATS.map((seat) => (seat.isHuman ? { ...seat, name: resolvedPlayerName } : seat)),
    betSizingBuckets: BET_SIZING_BUCKETS,
    initialButtonSeatIndex: 0,
    actionDelayMs: 850,
    autoProgress: true,
  };
}

export const DEFAULT_TOURNAMENT_CONFIG: TournamentConfig = createTournamentConfig(undefined, 'ko');
