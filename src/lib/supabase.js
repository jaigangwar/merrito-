import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://jdwbkvphqshcsuiqqugg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_ZwkQI-3TLHCzrBQY8JJKBQ_udi5CZ2S';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function getSupabase() {
  return supabase;
}

