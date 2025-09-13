import { createClient } from '@supabase/supabase-js';

// Only create a Supabase client when the required environment variables are present.
// When they're missing we export `null` so calling code can gracefully skip
// database operations instead of throwing and rendering a blank screen.
const env = import.meta?.env ?? {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

export const hasSupabase = !!(url && key);
export const supabase = hasSupabase ? createClient(url, key) : null;
