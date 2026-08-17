import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pknggjhswkigtsgegndu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmdnamhzd2tpZ3RzZ2VnbmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODc5OTgsImV4cCI6MjEwMjU2Mzk5OH0.q_URfEqc8tb80ozMvQbIHfm__JmxpnduA82AjIZVe8g';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function sync() {
  const content = fs.readFileSync('src/lib/notionSongs.ts', 'utf8');
  const equalsIdx = content.indexOf('= [');
  const jsonStart = content.indexOf('[', equalsIdx);
  const jsonEnd = content.lastIndexOf(']');
  const jsonStr = content.slice(jsonStart, jsonEnd + 1);
  const songs = JSON.parse(jsonStr);

  console.log(`Loaded ${songs.length} songs from notionSongs.ts`);

  console.log('Fetching existing songs in DB before sync...');
  const { data: existingSongs, error: fetchErr } = await supabase.from('songs').select('*');
  console.log('Existing songs in DB:', existingSongs ? existingSongs.length : 0, 'Error:', fetchErr);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const s of songs) {
    const payload = {
      title: s.title,
      artist: s.artist,
      key: s.key,
      tempo: s.tempo || 'media',
      tags: s.tags || [],
      lyrics: s.lyrics || [],
      media_url: s.media_url || null,
      is_classic: Boolean(s.is_classic),
      church_domain: s.church_domain || 'Conocida',
      team_domain: s.team_domain || 'Por practicar',
      musical_type: s.musical_type || 'Worship contemporáneo',
      technical_complexity: s.technical_complexity || 'Básica',
      notion_id: s.id,
      updated_at: new Date().toISOString()
    };

    const match = existingSongs ? existingSongs.find(es => es.title.trim().toLowerCase() === s.title.trim().toLowerCase()) : null;
    
    if (match) {
      const { error } = await supabase.from('songs').update(payload).eq('id', match.id);
      if (error) {
        console.error(`Error updating "${s.title}":`, error);
        errors++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from('songs').insert(payload);
      if (error) {
        console.error(`Error inserting "${s.title}":`, error);
        errors++;
      } else {
        inserted++;
      }
    }
  }

  console.log(`Sync complete! Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`);

  if (existingSongs) {
    for (const es of existingSongs) {
      const isReal = songs.some(s => s.title.trim().toLowerCase() === es.title.trim().toLowerCase());
      if (!isReal) {
        console.log(`Deleting old test song: ${es.title} (${es.id})`);
        await supabase.from('songs').delete().eq('id', es.id);
      }
    }
  }

  const { count } = await supabase.from('songs').select('*', { count: 'exact', head: true });
  console.log(`Total songs now in Supabase: ${count}`);
}

sync();
