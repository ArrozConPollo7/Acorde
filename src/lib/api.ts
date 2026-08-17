import { supabase, isSupabaseConfigured } from './supabase'
import { NOTION_SONGS } from './notionSongs'

export type Instrument = 'guitarra' | 'piano' | 'bajo' | 'voz' | 'batería'
export type Status = 'confirmado' | 'pendiente' | 'rechazado'
export type Role = 'admin' | 'musician'

export interface Musician {
  id: string
  name: string
  instrument: Instrument
  initials: string
  email: string
  role?: Role
}

export interface SongSegment {
  chord?: string
  text: string
}

export interface LyricLine {
  label?: string
  segments: SongSegment[]
}

export interface Song {
  id: string
  title: string
  artist: string
  key: string
  tempo: 'rápida' | 'media' | 'lenta'
  tags: string[]
  lyrics: LyricLine[]
  media_url?: string
  is_classic?: boolean
}

export interface RosterEntry {
  mid: string
  status: Status
}

export interface ServiceEvent {
  date: string
  type: 'domingo' | 'midweek'
  label: string
  setlist: string[]
  roster: RosterEntry[]
}

export interface AISuggestion {
  songId: string
  reason: string
}

// ─── PARSER DE CHORDPRO / TEXTO PARA NUEVAS CANCIONES ─────────────────────────

export function parseChordProText(text: string): LyricLine[] {
  if (!text || !text.trim()) {
    return [{ segments: [{ text: 'Letra no ingresada.' }] }]
  }

  const lines = text.split('\n').map(l => l.trimEnd()).filter(Boolean)
  const result: LyricLine[] = []
  let currentLabel: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^(verso|estrofa|coro|puente|intro|outro|pre-coro|tag|coda|final)/i.test(trimmed)) {
      currentLabel = trimmed
      continue
    }

    const segments: SongSegment[] = []
    const regex = /\[([A-G][b#]?(?:m|maj7|m7|7|sus4|sus2|dim|aug|add9)?(?:\/[A-G][b#]?)?)\]/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    const hasBrackets = regex.test(line)
    regex.lastIndex = 0

    if (hasBrackets) {
      let pendingChord: string | undefined
      while ((match = regex.exec(line)) !== null) {
        const textBefore = line.slice(lastIndex, match.index)
        if (textBefore || pendingChord) {
          segments.push({ chord: pendingChord, text: textBefore })
          pendingChord = undefined
        }
        pendingChord = match[1]
        lastIndex = regex.lastIndex
      }
      const remainingText = line.slice(lastIndex)
      segments.push({ chord: pendingChord, text: remainingText })
    } else {
      segments.push({ text: line })
    }

    result.push({
      label: currentLabel,
      segments: segments.length > 0 ? segments : [{ text: line }],
    })
    currentLabel = undefined
  }

  return result.length > 0 ? result : [{ segments: [{ text }] }]
}

export function formatLyricsToChordPro(lyrics: LyricLine[]): string {
  if (!lyrics || lyrics.length === 0) return ''
  return lyrics
    .map(line => {
      const header = line.label ? `${line.label}\n` : ''
      const body = line.segments
        .map(seg => (seg.chord ? `[${seg.chord}]${seg.text}` : seg.text))
        .join('')
      return header + body
    })
    .join('\n')
}

// ─── REPERTORIO INICIAL DESDE NOTION ──────────────────────────────────────────

export const INITIAL_SONGS: Song[] = NOTION_SONGS

export const INITIAL_MUSICIANS: Musician[] = [
  { id: 'm1', name: 'Carlos Mejía', instrument: 'guitarra', initials: 'CM', email: 'carlos@ibami.org', role: 'musician' },
  { id: 'm2', name: 'Sofía Rodríguez', instrument: 'voz', initials: 'SR', email: 'sofia@ibami.org', role: 'musician' },
  { id: 'm3', name: 'Andrés Peña', instrument: 'piano', initials: 'AP', email: 'andres@ibami.org', role: 'musician' },
  { id: 'm4', name: 'Juliana Torres', instrument: 'batería', initials: 'JT', email: 'juliana@ibami.org', role: 'musician' },
  { id: 'm5', name: 'Miguel Lozano', instrument: 'bajo', initials: 'ML', email: 'miguel@ibami.org', role: 'musician' },
  { id: 'm6', name: 'Valentina Suárez', instrument: 'voz', initials: 'VS', email: 'vale@ibami.org', role: 'musician' },
]

export const INITIAL_EVENTS: ServiceEvent[] = [
  { date: '2026-08-02', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-1', 'notion-2', 'notion-5'], roster: [{ mid: 'm1', status: 'confirmado' }, { mid: 'm2', status: 'confirmado' }, { mid: 'm3', status: 'confirmado' }, { mid: 'm4', status: 'pendiente' }, { mid: 'm5', status: 'confirmado' }] },
  { date: '2026-08-06', type: 'midweek', label: 'Oración y Alabanza', setlist: ['notion-3', 'notion-4'], roster: [{ mid: 'm1', status: 'confirmado' }, { mid: 'm2', status: 'pendiente' }, { mid: 'm6', status: 'confirmado' }] },
  { date: '2026-08-09', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-4', 'notion-1', 'notion-3'], roster: [{ mid: 'm1', status: 'confirmado' }, { mid: 'm6', status: 'confirmado' }, { mid: 'm3', status: 'pendiente' }, { mid: 'm4', status: 'confirmado' }, { mid: 'm5', status: 'pendiente' }] },
  { date: '2026-08-13', type: 'midweek', label: 'Célula de Adoración', setlist: ['notion-5', 'notion-2'], roster: [{ mid: 'm2', status: 'confirmado' }, { mid: 'm3', status: 'confirmado' }] },
  { date: '2026-08-16', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-2', 'notion-5', 'notion-1', 'notion-3'], roster: [{ mid: 'm1', status: 'confirmado' }, { mid: 'm2', status: 'confirmado' }, { mid: 'm3', status: 'confirmado' }, { mid: 'm4', status: 'pendiente' }, { mid: 'm5', status: 'confirmado' }, { mid: 'm6', status: 'pendiente' }] },
  { date: '2026-08-20', type: 'midweek', label: 'Oración y Alabanza', setlist: ['notion-3', 'notion-1'], roster: [{ mid: 'm1', status: 'pendiente' }, { mid: 'm6', status: 'confirmado' }] },
  { date: '2026-08-23', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-1', 'notion-4', 'notion-2'], roster: [{ mid: 'm1', status: 'pendiente' }, { mid: 'm2', status: 'pendiente' }, { mid: 'm3', status: 'confirmado' }, { mid: 'm4', status: 'pendiente' }, { mid: 'm5', status: 'confirmado' }] },
  { date: '2026-08-27', type: 'midweek', label: 'Célula de Adoración', setlist: ['notion-4', 'notion-5'], roster: [{ mid: 'm2', status: 'pendiente' }, { mid: 'm3', status: 'pendiente' }, { mid: 'm6', status: 'pendiente' }] },
  { date: '2026-08-30', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-5', 'notion-3', 'notion-4', 'notion-1'], roster: [{ mid: 'm1', status: 'pendiente' }, { mid: 'm2', status: 'pendiente' }, { mid: 'm3', status: 'pendiente' }, { mid: 'm4', status: 'pendiente' }, { mid: 'm5', status: 'pendiente' }] },
]

export const FALLBACK_AI_SUGGESTIONS: AISuggestion[] = [
  { songId: 'notion-1', reason: 'La temática del amor incondicional y la gloria de Dios conecta directamente con el mensaje.' },
  { songId: 'notion-2', reason: 'Invita a la congregación a entrar en quietud y apertura para recibir la Palabra.' },
  { songId: 'notion-3', reason: 'Declara la soberanía y bondad de Dios en todo tiempo.' },
  { songId: 'notion-4', reason: 'Refuerza la confianza y dirección del Señor en nuestras vidas.' },
  { songId: 'notion-5', reason: 'Ideal para sellar el servicio con una declaración de alabanza y gratitud.' },
]

// ─── API SERVICES ─────────────────────────────────────────────────────────────

export async function fetchSongs(): Promise<Song[]> {
  if (!isSupabaseConfigured || !supabase) {
    return INITIAL_SONGS
  }

  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('title', { ascending: true })

    if (error || !data || data.length === 0) {
      return INITIAL_SONGS
    }

    return data.map(item => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      key: item.key,
      tempo: item.tempo,
      tags: item.tags || [],
      lyrics: Array.isArray(item.lyrics) ? item.lyrics : [],
      media_url: item.media_url,
      is_classic: item.is_classic,
    }))
  } catch (err) {
    console.error('Error al obtener canciones de Supabase:', err)
    return INITIAL_SONGS
  }
}

export async function createSong(newSong: Omit<Song, 'id'>): Promise<Song> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('songs')
        .insert({
          title: newSong.title,
          artist: newSong.artist,
          key: newSong.key,
          tempo: newSong.tempo,
          tags: newSong.tags,
          lyrics: newSong.lyrics,
          media_url: newSong.media_url,
          is_classic: newSong.is_classic ?? false,
        })
        .select()
        .single()

      if (!error && data) {
        return {
          id: data.id,
          title: data.title,
          artist: data.artist,
          key: data.key,
          tempo: data.tempo,
          tags: data.tags || [],
          lyrics: Array.isArray(data.lyrics) ? data.lyrics : [],
          media_url: data.media_url,
          is_classic: data.is_classic,
        }
      }
    } catch (err) {
      console.error('Error creando canción en Supabase:', err)
    }
  }

  // Fallback local
  return {
    id: `custom-${Date.now()}`,
    ...newSong,
  }
}

export async function updateSong(id: string, updates: Partial<Song>): Promise<Song> {
  if (isSupabaseConfigured && supabase) {
    try {
      const payload: any = {
        updated_at: new Date().toISOString(),
      }
      if (updates.title !== undefined) payload.title = updates.title
      if (updates.artist !== undefined) payload.artist = updates.artist
      if (updates.key !== undefined) payload.key = updates.key
      if (updates.tempo !== undefined) payload.tempo = updates.tempo
      if (updates.tags !== undefined) payload.tags = updates.tags
      if (updates.lyrics !== undefined) payload.lyrics = updates.lyrics
      if (updates.media_url !== undefined) payload.media_url = updates.media_url
      if (updates.is_classic !== undefined) payload.is_classic = updates.is_classic

      const { data, error } = await supabase
        .from('songs')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (!error && data) {
        return {
          id: data.id,
          title: data.title,
          artist: data.artist,
          key: data.key,
          tempo: data.tempo,
          tags: data.tags || [],
          lyrics: Array.isArray(data.lyrics) ? data.lyrics : [],
          media_url: data.media_url,
          is_classic: data.is_classic,
        }
      }
    } catch (err) {
      console.error('Error actualizando canción en Supabase:', err)
    }
  }

  // Fallback local
  return {
    id,
    title: updates.title || '',
    artist: updates.artist || '',
    key: updates.key || 'G',
    tempo: updates.tempo || 'media',
    tags: updates.tags || [],
    lyrics: updates.lyrics || [],
    media_url: updates.media_url,
    is_classic: updates.is_classic,
  }
}

export async function fetchEvents(): Promise<ServiceEvent[]> {
  if (!isSupabaseConfigured || !supabase) {
    return INITIAL_EVENTS
  }

  try {
    const { data: events, error: eventsError } = await supabase
      .from('service_events')
      .select(`
        id,
        date,
        type,
        label,
        service_setlists ( song_id, position ),
        service_roster ( user_id, status )
      `)
      .order('date', { ascending: true })

    if (eventsError || !events || events.length === 0) {
      return INITIAL_EVENTS
    }

    return events.map((ev: any) => ({
      date: ev.date,
      type: ev.type,
      label: ev.label,
      setlist: (ev.service_setlists || [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((s: any) => s.song_id),
      roster: (ev.service_roster || []).map((r: any) => ({
        mid: r.user_id,
        status: r.status,
      })),
    }))
  } catch (err) {
    console.error('Error al obtener eventos de Supabase:', err)
    return INITIAL_EVENTS
  }
}

export async function fetchMusicians(): Promise<Musician[]> {
  if (!isSupabaseConfigured || !supabase) {
    return INITIAL_MUSICIANS
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name', { ascending: true })

    if (error || !data || data.length === 0) {
      return INITIAL_MUSICIANS
    }

    return data.map(item => ({
      id: item.id,
      name: item.name,
      instrument: item.instrument,
      initials: item.initials || 'IB',
      email: item.email || '',
      role: item.role,
    }))
  } catch (err) {
    console.error('Error al obtener músicos de Supabase:', err)
    return INITIAL_MUSICIANS
  }
}

export async function updateAttendanceStatus(date: string, mid: string, status: Status): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return
  }

  try {
    const { data: event } = await supabase
      .from('service_events')
      .select('id')
      .eq('date', date)
      .single()

    if (!event) return

    await supabase
      .from('service_roster')
      .upsert({
        event_id: event.id,
        user_id: mid,
        status,
      }, { onConflict: 'event_id,user_id' })
  } catch (err) {
    console.error('Error actualizando asistencia en Supabase:', err)
  }
}

export async function suggestSongsWithGroq(topic: string, currentSetlist: string[], catalog: Song[]): Promise<AISuggestion[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('suggest-songs', {
        body: { topic, currentSetlist },
      })

      if (!error && data?.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        return data.suggestions
      }
    } catch (err) {
      console.warn('Edge Function no disponible, usando recomendador inteligente local:', err)
    }
  }

  // Recomendador local inteligente
  const cleanTopic = topic.toLowerCase().trim()
  const matching = catalog
    .map(song => {
      let score = 0
      const combined = `${song.title} ${song.artist} ${song.tags.join(' ')} ${song.lyrics.map(l => l.segments.map(s => s.text).join(' ')).join(' ')}`.toLowerCase()
      const words = cleanTopic.split(/\s+/)

      words.forEach(w => {
        if (w.length > 2 && combined.includes(w)) {
          score += combined.includes(w) ? 2 : 1
        }
      })

      return { song, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  if (matching.length > 0 && matching[0].score > 0) {
    return matching.map(({ song }) => ({
      songId: song.id,
      reason: `Su mensaje y temática sobre "${song.tags.join(', ')}" conecta con la enseñanza pastoral.`,
    }))
  }

  return FALLBACK_AI_SUGGESTIONS
}
