export interface ToastMessage {
  id: string;
  kind: 'info' | 'success' | 'warning';
  text: string;
}

export interface UIState {
  started: boolean;
  playerName: string;
  lang: 'en' | 'ko';
  raiseInput: number;
  actionSpeed: number;
  autoProgress: boolean;
  overlayPanel: 'settings' | 'history' | null;
  selectedSeatIndex: number | null;
  toastQueue: ToastMessage[];
  lastSeed: number;
}
