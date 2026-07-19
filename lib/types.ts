export type Profile = {
  id: string;
  display_name: string;
  default_nickname: string;
  created_at: string;
  updated_at: string;
};

export type Member = {
  id: string;
  host_id: string;
  name: string;
  profile_id: string | null;
  created_at: string;
};

export type GameStatus = "lobby" | "active" | "finished";

export type ChipDenomination = { value: number; label?: string; color?: string };

export type Game = {
  id: string;
  host_id: string;
  name: string;
  played_on: string;
  status: GameStatus;
  notes: string;
  join_code: string | null;
  small_blind: number;
  big_blind: number;
  dealer_seat: number | null;
  denominations: ChipDenomination[] | null;
  digital_cards: boolean;
  created_at: string;
};

export type PlayerStatus = "pending" | "approved" | "rejected" | "left";

export type GamePlayer = {
  id: string;
  game_id: string;
  profile_id: string | null;
  member_id: string | null;
  is_guest: boolean;
  status: PlayerStatus;
  nickname: string;
  seat: number | null;
  buy_in: number;
  stack: number;
  joined_at: string;
};

export type HandStreet = "preflop" | "flop" | "turn" | "river";
export type HandStatus = "betting" | "awaiting_showdown" | "complete";

export type Hand = {
  id: string;
  game_id: string;
  hand_number: number;
  dealer_seat: number;
  street: HandStreet;
  status: HandStatus;
  current_turn: string | null;
  current_bet: number;
  last_raise: number;
  pot: number;
  deck: string[];
  board: string[];
  created_at: string;
};

export type HandPlayerStatus = "active" | "folded" | "all_in";

export type HandPlayer = {
  id: string;
  hand_id: string;
  player_id: string;
  seat: number;
  committed: number;
  committed_street: number;
  status: HandPlayerStatus;
  has_acted: boolean;
  hole_cards: string[] | null;
};

export type GameResult = {
  id: string;
  game_id: string;
  member_id: string;
  buy_in: number;
  cash_out: number;
};

export type Settlement = {
  id: string;
  host_id: string;
  from_member: string;
  to_member: string;
  amount: number;
  note: string;
  created_at: string;
};

export type HandAction = {
  id: string;
  hand_id: string;
  player_id: string | null;
  street: HandStreet;
  action: string;
  amount: number;
  created_at: string;
};

export type SidePot = {
  pot_index: number;
  amount: number;
  eligible_player_ids: string[];
};

