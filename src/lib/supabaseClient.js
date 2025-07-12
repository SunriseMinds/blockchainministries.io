import { createClient } from '@supabase/supabase-js'

// Retrieve Supabase URL and anon key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY')
}

// Create a single Supabase client for use throughout the app
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
