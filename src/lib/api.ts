import { supabase, isSupabaseConfigured } from './supabase'
import { NOTION_SONGS } from './notionSongs'

export type Instrument = 'guitarra' | 'piano' | 'bajo' | 'voz' | 'batería'
export type Status = 'confirmado' | 'pendiente' | 'rechazado'
export type Role = 'admin' | 'musician' | 'both'

export interface Musician {
  id: string
  name: string
  instrument: Instrument
  initials: string
  email: string
  phone?: string
  role?: Role
}

export function hasRole(m: Musician | undefined | null, targetRole: 'admin' | 'musician'): boolean {
  if (!m) return false
  if (m.role === 'both') return true
  return m.role === targetRole
}

export function normalizePhone(p: string): string {
  return p.replace(/\D/g, '')
}

export function findMusicianByIdentifier(identifier: string, list: Musician[]): Musician | undefined {
  if (!identifier || !identifier.trim() || !list || list.length === 0) return undefined
  const clean = identifier.trim().toLowerCase()
  const digits = identifier.replace(/\D/g, '')

  return list.find(m => {
    if (m.email && m.email.toLowerCase().trim() === clean) return true
    if (digits.length >= 7 && m.phone) {
      const mDigits = m.phone.replace(/\D/g, '')
      if (mDigits === digits || mDigits.endsWith(digits) || digits.endsWith(mDigits)) return true
    }
    return false
  })
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
  moment?: 'Apertura' | 'Adoración' | 'Ministración'
}

// ─── LOCAL STORAGE PERSISTENCE HELPERS ────────────────────────────────────────

const STORAGE_KEYS = {
  SONGS: 'acorde_custom_songs',
  EVENTS: 'acorde_custom_events',
  MUSICIANS: 'acorde_custom_musicians',
}

function getStored<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('Error guardando en localStorage:', err)
  }
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

// ─── REPERTORIO INICIAL ───────────────────────────────────────────────────────

export const INITIAL_SONGS: Song[] = NOTION_SONGS

export const INITIAL_MUSICIANS: Musician[] = []

export const INITIAL_EVENTS: ServiceEvent[] = [
  { date: '2026-08-02', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-1', 'notion-2', 'notion-5'], roster: [] },
  { date: '2026-08-06', type: 'midweek', label: 'Oración y Alabanza', setlist: ['notion-3', 'notion-4'], roster: [] },
  { date: '2026-08-09', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-4', 'notion-1', 'notion-3'], roster: [] },
  { date: '2026-08-13', type: 'midweek', label: 'Célula de Adoración', setlist: ['notion-5', 'notion-2'], roster: [] },
  { date: '2026-08-16', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-2', 'notion-5', 'notion-1', 'notion-3'], roster: [] },
  { date: '2026-08-20', type: 'midweek', label: 'Oración y Alabanza', setlist: ['notion-3', 'notion-1'], roster: [] },
  { date: '2026-08-23', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-1', 'notion-4', 'notion-2'], roster: [] },
  { date: '2026-08-27', type: 'midweek', label: 'Célula de Adoración', setlist: ['notion-4', 'notion-5'], roster: [] },
  { date: '2026-08-30', type: 'domingo', label: 'Servicio Dominical', setlist: ['notion-5', 'notion-3', 'notion-4', 'notion-1'], roster: [] },
]

// ─── CANCIONES API ────────────────────────────────────────────────────────────

export async function fetchSongs(): Promise<Song[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .order('title', { ascending: true })

      if (!error && data) {
        const mapped = data.map(item => ({
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
        setStored(STORAGE_KEYS.SONGS, mapped)
        return mapped
      }
    } catch (err) {
      console.error('Error al obtener canciones de Supabase:', err)
    }
  }

  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS)
  if (cached !== null) return cached
  return INITIAL_SONGS
}

export async function createSong(newSong: Omit<Song, 'id'>): Promise<Song> {
  let created: Song = {
    id: `custom-${Date.now()}`,
    ...newSong,
  }

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
        created = {
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

  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS) || INITIAL_SONGS
  setStored(STORAGE_KEYS.SONGS, [created, ...cached])
  return created
}

export async function updateSong(id: string, updates: Partial<Song>): Promise<Song> {
  let updated: Song = {
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

  if (isSupabaseConfigured && supabase) {
    try {
      const payload: any = { updated_at: new Date().toISOString() }
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
        updated = {
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

  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS) || INITIAL_SONGS
  setStored(STORAGE_KEYS.SONGS, cached.map(s => s.id === id ? { ...s, ...updated } : s))
  return updated
}

export async function deleteSong(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('songs').delete().eq('id', id)
    } catch (err) {
      console.error('Error eliminando canción en Supabase:', err)
    }
  }
  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS) || INITIAL_SONGS
  setStored(STORAGE_KEYS.SONGS, cached.filter(s => s.id !== id))
}

// ─── SERVICIOS / EVENTOS API ──────────────────────────────────────────────────

export async function fetchEvents(): Promise<ServiceEvent[]> {
  if (isSupabaseConfigured && supabase) {
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

      if (!eventsError && events) {
        const mapped = events.map((ev: any) => ({
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
        setStored(STORAGE_KEYS.EVENTS, mapped)
        return mapped
      }
    } catch (err) {
      console.error('Error al obtener eventos de Supabase:', err)
    }
  }

  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS)
  if (cached !== null) return cached
  return INITIAL_EVENTS
}

export async function createServiceEvent(event: ServiceEvent): Promise<ServiceEvent> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: eventRow, error: evErr } = await supabase
        .from('service_events')
        .insert({
          date: event.date,
          type: event.type,
          label: event.label,
        })
        .select()
        .single()

      if (!evErr && eventRow) {
        if (event.setlist.length > 0) {
          await supabase.from('service_setlists').insert(
            event.setlist.map((song_id, position) => ({
              event_id: eventRow.id,
              song_id,
              position: position + 1,
            }))
          )
        }
        if (event.roster.length > 0) {
          await supabase.from('service_roster').insert(
            event.roster.map(r => ({
              event_id: eventRow.id,
              user_id: r.mid,
              status: r.status,
            }))
          )
        }
      }
    } catch (err) {
      console.error('Error creando servicio en Supabase:', err)
    }
  }

  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS) || INITIAL_EVENTS
  const updated = [...cached.filter(e => e.date !== event.date), event].sort((a, b) => a.date.localeCompare(b.date))
  setStored(STORAGE_KEYS.EVENTS, updated)
  return event
}

export async function updateServiceEvent(date: string, updates: Partial<ServiceEvent>): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: existing } = await supabase
        .from('service_events')
        .select('id')
        .eq('date', date)
        .single()

      if (existing) {
        if (updates.type || updates.label || updates.date) {
          await supabase
            .from('service_events')
            .update({
              ...(updates.type ? { type: updates.type } : {}),
              ...(updates.label ? { label: updates.label } : {}),
              ...(updates.date ? { date: updates.date } : {}),
            })
            .eq('id', existing.id)
        }

        if (updates.setlist) {
          await supabase.from('service_setlists').delete().eq('event_id', existing.id)
          if (updates.setlist.length > 0) {
            await supabase.from('service_setlists').insert(
              updates.setlist.map((song_id, position) => ({
                event_id: existing.id,
                song_id,
                position: position + 1,
              }))
            )
          }
        }

        if (updates.roster) {
          await supabase.from('service_roster').delete().eq('event_id', existing.id)
          if (updates.roster.length > 0) {
            await supabase.from('service_roster').insert(
              updates.roster.map(r => ({
                event_id: existing.id,
                user_id: r.mid,
                status: r.status,
              }))
            )
          }
        }
      }
    } catch (err) {
      console.error('Error actualizando servicio en Supabase:', err)
    }
  }

  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS) || INITIAL_EVENTS
  setStored(STORAGE_KEYS.EVENTS, cached.map(e => e.date === date ? { ...e, ...updates } : e))
}

export async function deleteServiceEvent(date: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('service_events').delete().eq('date', date)
    } catch (err) {
      console.error('Error eliminando servicio en Supabase:', err)
    }
  }
  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS) || INITIAL_EVENTS
  setStored(STORAGE_KEYS.EVENTS, cached.filter(e => e.date !== date))
}

// ─── MÚSICOS & PERFILES API ───────────────────────────────────────────────────

export async function fetchMusicians(): Promise<Musician[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true })

      if (!error && data) {
        const mapped = data.map(item => ({
          id: item.id,
          name: item.name,
          instrument: item.instrument,
          initials: item.initials || item.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
          email: item.email || '',
          phone: item.phone || '',
          role: item.role,
        }))
        setStored(STORAGE_KEYS.MUSICIANS, mapped)
        return mapped
      }
    } catch (err) {
      console.error('Error al obtener músicos de Supabase:', err)
    }
  }

  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS)
  if (cached !== null) return cached
  return INITIAL_MUSICIANS
}

export async function createMusician(musician: { name: string; instrument: Instrument; email: string; phone?: string; role?: Role }): Promise<Musician> {
  const initials = musician.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  let created: Musician = {
    id: `m-${Date.now()}`,
    name: musician.name,
    instrument: musician.instrument,
    initials,
    email: musician.email,
    phone: musician.phone,
    role: musician.role || 'musician',
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          name: musician.name,
          instrument: musician.instrument,
          initials,
          email: musician.email,
          phone: musician.phone || '',
          role: musician.role || 'musician',
        })
        .select()
        .single()

      if (!error && data) {
        created = {
          id: data.id,
          name: data.name,
          instrument: data.instrument,
          initials: data.initials || initials,
          email: data.email,
          phone: data.phone,
          role: data.role,
        }
      }
    } catch (err) {
      console.error('Error creando músico en Supabase:', err)
    }
  }

  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS) || INITIAL_MUSICIANS
  setStored(STORAGE_KEYS.MUSICIANS, [...cached, created])
  return created
}

export async function updateMusician(id: string, updates: Partial<Musician>): Promise<Musician> {
  let updated: Musician = {
    id,
    name: updates.name || '',
    instrument: updates.instrument || 'guitarra',
    initials: updates.name ? updates.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'IB',
    email: updates.email || '',
    phone: updates.phone,
    role: updates.role || 'musician',
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const payload: any = { updated_at: new Date().toISOString() }
      if (updates.name !== undefined) {
        payload.name = updates.name
        payload.initials = updates.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      }
      if (updates.instrument !== undefined) payload.instrument = updates.instrument
      if (updates.email !== undefined) payload.email = updates.email
      if (updates.phone !== undefined) payload.phone = updates.phone
      if (updates.role !== undefined) payload.role = updates.role

      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (!error && data) {
        updated = {
          id: data.id,
          name: data.name,
          instrument: data.instrument,
          initials: data.initials,
          email: data.email,
          phone: data.phone,
          role: data.role,
        }
      }
    } catch (err) {
      console.error('Error actualizando músico en Supabase:', err)
    }
  }

  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS) || INITIAL_MUSICIANS
  setStored(STORAGE_KEYS.MUSICIANS, cached.map(m => m.id === id ? { ...m, ...updated } : m))
  return updated
}

export async function deleteMusician(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('profiles').delete().eq('id', id)
    } catch (err) {
      console.error('Error eliminando músico en Supabase:', err)
    }
  }
  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS) || INITIAL_MUSICIANS
  setStored(STORAGE_KEYS.MUSICIANS, cached.filter(m => m.id !== id))
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

// ─── IA MINISTERIAL (GROQ & LOCAL SEMANTIC ENGINE) ────────────────────────────

interface ThematicCategory {
  keywords: string[]
  moment: 'Apertura' | 'Adoración' | 'Ministración'
  description: string
}

const THEMATIC_KNOWLEDGE_BASE: Record<string, ThematicCategory> = {
  gracia_cruz: {
    keywords: ['gracia', 'perdon', 'cruz', 'calvario', 'justificacion', 'sangre', 'redencion', 'rescate', 'libertad', 'pecado', 'cordero', 'salvacion', 'romanos 5', 'romanos 8', 'efesios 2'],
    moment: 'Adoración',
    description: 'Enfatiza el favor inmerecido y la obra expiatoria de Cristo en la cruz, preparando a la congregación para recibir el mensaje del evangelio.',
  },
  fidelidad_paz: {
    keywords: ['fidelidad', 'fiel', 'promesas', 'esperanza', 'confianza', 'roca', 'refugio', 'torre', 'seguridad', 'paz', 'tormenta', 'duda', 'salmo 23', 'salmo 91', 'descanso'],
    moment: 'Adoración',
    description: 'Afirma el reposo en las promesas y el carácter inmutable del Señor frente a tiempos de prueba, aflicción o incertidumbre.',
  },
  santidad_gloria: {
    keywords: ['santo', 'santidad', 'gloria', 'majestad', 'trono', 'exaltacion', 'rey', 'soberano', 'digno', 'honra', 'reyes', 'isaias 6', 'apocalipsis 4', 'temor'],
    moment: 'Adoración',
    description: 'Proclamación solemne y teocéntrica de la majestad, hermosura y trascendencia de Dios en su trono.',
  },
  gozo_victoria: {
    keywords: ['gozo', 'alegria', 'fiesta', 'celebracion', 'victoria', 'vencio', 'danza', 'cantad', 'aleluya', 'cantar', 'gratitud', 'resurreccion', 'triunfo', 'salmo 100', 'salmo 150'],
    moment: 'Apertura',
    description: 'Ideal para la apertura del servicio: convoca a la congregación con celebración viva, gratitud y triunfo en Cristo.',
  },
  consagracion_entrega: {
    keywords: ['entrega', 'consagracion', 'rendicion', 'manos', 'altar', 'fuego', 'espiritu', 'rendido', 'llamado', 'obediencia', 'corazon', 'todo', 'romanos 12', 'mi vida'],
    moment: 'Ministración',
    description: 'Canción de respuesta e introspección ideal para el tiempo de llamado, compromiso y ministración tras la predicación.',
  },
  espiritu_santo: {
    keywords: ['espiritu', 'espiritu santo', 'fuego', 'viento', 'consolador', 'uncion', 'llenura', 'presencia', 'avivamiento', 'hechos 2', 'poder'],
    moment: 'Ministración',
    description: 'Invoca la guía, unción y llenura del Espíritu Santo para transformar los corazones durante la ministración.',
  },
  comunion_santa_cena: {
    keywords: ['santa cena', 'comunion', 'pan', 'vino', 'cuerpo', 'sangre', 'pacto', 'mesa', 'memorial', 'partimiento', '1 corintios 11'],
    moment: 'Adoración',
    description: 'Especialmente diseñada para acompañar la mesa del Señor y la memoria del sacrificio de Cristo.',
  },
  sanidad_fe: {
    keywords: ['sanidad', 'sanador', 'milagro', 'restauracion', 'herida', 'dolor', 'poder', 'creer', 'fe', 'isaias 53', 'medico', 'imposible'],
    moment: 'Ministración',
    description: 'Fortalece la fe en la soberanía y poder sanador de Dios sobre la aflicción física y espiritual.',
  },
  amor_padre: {
    keywords: ['amor', 'padre', 'hijo', 'hijos', 'familia', 'abrazo', 'hogar', 'buen padre', 'bondad', '1 juan 4', 'misericordia', 'adopcion'],
    moment: 'Adoración',
    description: 'Medita en el amor paternal e incondicional de Dios que nos adopta y cuida eternamente.',
  },
}

export async function suggestSongsWithGroq(
  topic: string,
  currentSetlist: string[],
  catalog: Song[],
  moment: 'todos' | 'Apertura' | 'Adoración' | 'Ministración' = 'todos',
  limit: number = 8
): Promise<AISuggestion[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('suggest-songs', {
        body: { topic, currentSetlist, moment, limit },
      })

      if (!error && data?.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        return data.suggestions
      }
    } catch (err) {
      console.warn('Edge Function no disponible, usando motor pastoral local:', err)
    }
  }

  // Motor semántico litúrgico local de alta precisión
  const cleanTopic = topic.toLowerCase().trim()
  const words = cleanTopic.split(/[\s,.-]+/).filter(w => w.length > 2)

  // Encontrar categorías temáticas coincidentes
  const matchedThemes: ThematicCategory[] = []
  for (const [, themeData] of Object.entries(THEMATIC_KNOWLEDGE_BASE)) {
    if (themeData.keywords.some(k => cleanTopic.includes(k))) {
      matchedThemes.push(themeData)
    }
  }

  const scoredSongs = catalog.map(song => {
    let score = 0
    const songText = `${song.title} ${song.artist} ${song.tags.join(' ')} ${song.lyrics.map(l => l.segments.map(s => s.text).join(' ')).join(' ')}`.toLowerCase()

    // 1. Coincidencia directa por palabras del tema
    words.forEach(word => {
      if (song.title.toLowerCase().includes(word)) score += 8
      if (song.tags.some(t => t.toLowerCase().includes(word))) score += 6
      if (songText.includes(word)) score += 3
    })

    // 2. Coincidencia con bases teológicas
    matchedThemes.forEach(theme => {
      theme.keywords.forEach(kw => {
        if (song.title.toLowerCase().includes(kw)) score += 6
        if (song.tags.some(t => t.toLowerCase().includes(kw))) score += 4
        if (songText.includes(kw)) score += 2
      })
    })

    // 3. Filtro por momento litúrgico
    if (moment === 'Apertura' && song.tempo === 'rápida') score += 5
    if (moment === 'Adoración' && (song.tempo === 'media' || song.tempo === 'lenta')) score += 4
    if (moment === 'Ministración' && song.tempo === 'lenta') score += 5

    // 4. Bonificación para clásicos de la congregación
    if (song.is_classic) score += 2

    // 5. Descuento si ya está en el setlist
    if (currentSetlist.includes(song.id)) score -= 15

    return { song, score }
  })

  scoredSongs.sort((a, b) => b.score - a.score)
  const topMatches = scoredSongs.slice(0, Math.max(limit, 8))

  return topMatches.map(({ song }, idx) => {
    let songMoment: 'Apertura' | 'Adoración' | 'Ministración' = 'Adoración'
    if (song.tempo === 'rápida' || idx === 0) songMoment = 'Apertura'
    else if (song.tempo === 'lenta' || idx >= topMatches.length - 2) songMoment = 'Ministración'

    if (moment !== 'todos') songMoment = moment

    const primaryTheme = matchedThemes[0]
    const themeDesc = primaryTheme
      ? primaryTheme.description
      : `Su mensaje y tags de "${song.tags.join(', ') || 'Alabanza'}" conectan con el sermón sobre "${topic}".`

    return {
      songId: song.id,
      moment: songMoment,
      reason: `[${songMoment}] ${themeDesc}`,
    }
  })
}
