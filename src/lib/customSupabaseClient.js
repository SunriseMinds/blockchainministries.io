import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ilykpeafezzcrdxorlmb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlseWtwZWFmZXp6Y3JkeG9ybG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExNzE2OTIsImV4cCI6MjA2Njc0NzY5Mn0.j2HNBk4MxpBY776FBqqHhYA8QRtzQAmxUQoxQEJDlv8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);