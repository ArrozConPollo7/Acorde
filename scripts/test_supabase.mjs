import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pknggjhswkigtsgegndu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmdnamhzd2tpZ3RzZ2VnbmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODc5OTgsImV4cCI6MjEwMjU2Mzk5OH0.q_URfEqc8tb80ozMvQbIHfm__JmxpnduA82AjIZVe8g';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('--- TEST SUPABASE CONNECTION ---');
  
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  console.log('Profiles count:', profiles ? profiles.length : 0, 'Error:', pErr);
  if (profiles && profiles.length > 0) {
    console.log('Profiles:', profiles);
  }

  const { data: events, error: eErr } = await supabase.from('service_events').select('*');
  console.log('Events count:', events ? events.length : 0, 'Error:', eErr);
  if (events && events.length > 0) {
    console.log('Events:', events);
  }

  const { data: songs, error: sErr } = await supabase.from('songs').select('id, title').limit(5);
  console.log('Songs count:', songs ? songs.length : 0, 'Error:', sErr);

  const { data: roster, error: rErr } = await supabase.from('service_roster').select('*');
  console.log('Roster count:', roster ? roster.length : 0, 'Error:', rErr);
}

test();
