import { supabaseClient } from '@/lib/supabaseClient';

export function useSupabase() {
  return supabaseClient;
}
