import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pknggjhswkigtsgegndu.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmdnamhzd2tpZ3RzZ2VnbmR1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk4Nzk5OCwiZXhwIjoyMTAyNTYzOTk4fQ.SmxCVI5q0sormfC0pVYPPWdNU-HGAY__2xeav0ixFu8';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function testAdmin() {
  console.log('Testing admin insert to profiles...');
  const { data: prof, error: pErr } = await supabaseAdmin.from('profiles').insert({
    name: 'Juan David (Admin Test)',
    instrument: 'dirección',
    secondary_instruments: ['piano'],
    initials: 'JD',
    email: 'juand@ibami.org',
    phone: '3101234567',
    role: 'both'
  }).select();

  console.log('Profiles admin insert:', prof, 'Error:', pErr);
}

testAdmin();
