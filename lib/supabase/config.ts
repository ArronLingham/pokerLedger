/**
 * Public Supabase connection values, read from env.
 *
 * Supports both the current publishable key (`sb_publishable_...`) and the
 * legacy anon key — paste whichever your Supabase "Connect" screen shows.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
