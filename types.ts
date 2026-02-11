
export type GameStatus = 'idle' | 'counting' | 'playing' | 'ended';

export interface GameState {
  score: number;
  highScore: number;
  timeLeft: number;
  status: GameStatus;
  isNewHighScore: boolean;
}

export interface CrewmateInfo {
  id: number;
  active: boolean;
  color: string;
  isImposter: boolean;
  feedback: 'hit' | 'miss' | null;
}

export const CREWMATE_COLORS = [
  '#C51111', // Red
  '#132ED1', // Blue
  '#117F2D', // Green
  '#ED54BA', // Pink
  '#EF7D0D', // Orange
  '#F5F557', // Yellow
  '#3F474E', // Black
  '#D6E0F0', // White
  '#6B2FBB', // Purple
  '#71491E', // Brown
  '#38FEDB', // Cyan
  '#50EF39'  // Lime
];
