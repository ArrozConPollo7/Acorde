import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://pknggjhswkigtsgegndu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmdnamhzd2tpZ3RzZ2VnbmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODc5OTgsImV4cCI6MjEwMjU2Mzk5OH0.q_URfEqc8tb80ozMvQbIHfm__JmxpnduA82AjIZVe8g';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testInsert() {
  const profileId = crypto.randomUUID();
  console.log('Testing insert profile with UUID:', profileId);
  const { data: prof, error: profErr } = await supabase.from('profiles').insert({
    id: profileId,
    name: 'Juan David',
    instrument: 'dirección',
    secondary_instruments: ['piano', 'voz líder'],
    initials: 'JD',
    email: 'juand@ibami.org',
    phone: '3101234567',
    role: 'both',
  }).select().single();

  console.log('Profile insert:', prof, 'Error:', profErr);

  const eventId = crypto.randomUUID();
  console.log('Testing insert service_events with UUID:', eventId);
  const { data: ev, error: evErr } = await supabase.from('service_events').insert({
    id: eventId,
    date: '2026-08-30',
    type: 'domingo',
    label: 'Servicio Dominical - Prueba',
  }).select().single();

  console.log('Event insert:', ev, 'Error:', evErr);
}

testInsert();
