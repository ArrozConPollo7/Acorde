import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pknggjhswkigtsgegndu.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmdnamhzd2tpZ3RzZ2VnbmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODc5OTgsImV4cCI6MjEwMjU2Mzk5OH0.q_URfEqc8tb80ozMvQbIHfm__JmxpnduA82AjIZVe8g'

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('tu-proyecto') &&
  !supabaseUrl.includes('xxxxxxxxxxxx')

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
