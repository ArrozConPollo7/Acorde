import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pknggjhswkigtsgegndu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmdnamhzd2tpZ3RzZ2VnbmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODc5OTgsImV4cCI6MjEwMjU2Mzk5OH0.q_URfEqc8tb80ozMvQbIHfm__JmxpnduA82AjIZVe8g';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verify() {
  const { data: sample, error } = await supabase
    .from('songs')
    .select('title, artist, church_domain, team_domain, musical_type, technical_complexity, is_classic')
    .limit(10);

  console.log('Sample songs from Supabase:', sample, 'Error:', error);
}

verify();
