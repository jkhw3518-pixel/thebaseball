import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const looksPlaceholder = (v) => !v || v.includes('your-project') || v.includes('your-anon');

export const isSupabaseConfigured = !looksPlaceholder(url) && !looksPlaceholder(anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;
