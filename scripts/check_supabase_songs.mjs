import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pknggjhswkigtsgegndu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmdnamhzd2tpZ3RzZ2VnbmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODc5OTgsImV4cCI6MjEwMjU2Mzk5OH0.q_URfEqc8tb80ozMvQbIHfm__JmxpnduA82AjIZVe8g';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSongs() {
  const { data: songs, error } = await supabase.from('songs').select('*');
  console.log('Total songs in Supabase:', songs ? songs.length : 0, 'Error:', error);
  if (songs && songs.length > 0) {
    console.log('First 5 songs in Supabase:', JSON.stringify(songs.slice(0, 5), null, 2));
  }
}

checkSongs();
