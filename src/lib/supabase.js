import { createClient } from '@supabase/supabase-js';

// Allow the app to run even if Supabase environment variables are missing.
// Vite replaces `import.meta.env` at build time, but when the values are
// undefined the `createClient` call would throw and the whole app would render
// a blank screen.  Fall back to harmless demo values so the UI can still load
// during local development.
const env = import.meta?.env ?? {};
const url = env.VITE_SUPABASE_URL || 'https://example.com';
const key = env.VITE_SUPABASE_ANON_KEY || 'public-anon-key';

export const supabase = createClient(url, key);
