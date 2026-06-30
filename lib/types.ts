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

export type Game = {
  id: string;
  host_id: string;
  name: string;
  played_on: string;
  status: GameStatus;
  notes: string;
  created_at: string;
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
