import { supabase, isSupabaseConfigured } from './supabase'
import { NOTION_SONGS } from './notionSongs'

export type Instrument =
  | 'dirección'
  | 'voz líder'
  | 'voz de apoyo'
  | 'piano'
  | 'guitarra acústica'
  | 'guitarra eléctrica'
  | 'bajo'
  | 'batería'
  | 'percusión'
  | 'saxofón'
  | 'guitarra'
  | 'voz'
  | string

export type Status = 'confirmado' | 'pendiente' | 'rechazado'
export type Role = 'admin' | 'musician' | 'both'

export interface Musician {
  id: string
  name: string
  instrument: string
  secondary_instruments?: string[]
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

export interface InstrumentScores {
  guitarra?: LyricLine[]
  piano?: LyricLine[]
  bajo?: LyricLine[]
  [key: string]: LyricLine[] | undefined
}

export interface InstrumentNotes {
  guitarra?: string
  piano?: string
  bajo?: string
  [key: string]: string | undefined
}

export interface Song {
  id: string
  title: string
  artist: string
  key: string
  tempo: 'rápida' | 'media' | 'lenta'
  tags: string[]
  lyrics: LyricLine[]
  instrument_lyrics?: InstrumentScores // Letra y acordes personalizados para Guitarra, Piano, Bajo
  instrument_notes?: InstrumentNotes   // Indicaciones técnicas para cada instrumentista
  media_url?: string
  is_classic?: boolean
  church_domain?: string // 'Nueva' | 'Conocida' | 'Dominada'
  team_domain?: string // 'Por entrar' | 'Por practicar' | 'Ensamblada' | 'Montada'
  musical_type?: string // 'Worship contemporáneo' | 'Balada congregacional' | 'Celebración Rítmica' | 'Himno Tradicional' | 'Coral' | 'Especial'
  technical_complexity?: string // 'Básica' | 'Intermedia' | 'Avanzada'
  resumen_tematico?: string // Resumen temático denso generado una sola vez para búsqueda semántica con IA
}

export interface RosterEntry {
  mid: string
  status: Status
  instrument?: string
  secondary_instruments?: string[]
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

export const STORAGE_KEYS = {
  SONGS: 'acorde_custom_songs',
  EVENTS: 'acorde_custom_events',
  MUSICIANS: 'acorde_custom_musicians',
  AVAILABILITY: 'acorde_custom_availability',
}

export function getStored<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('Error guardando en localStorage:', err)
  }
}

// Timeout helper para que Supabase nunca cuelgue la app si está pausado o sin red
export function withTimeout<T>(promiseLike: PromiseLike<T>, timeoutMs = 3000): Promise<T> {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de ${timeoutMs}ms excedido en consulta a Supabase`)), timeoutMs)
    ),
  ])
}

// Control de circuito para evitar múltiples llamadas bloqueantes cuando Supabase está caído
let supabaseReachable = true
let lastFailureTimestamp = 0

export function isDatabaseTemporarilyUnreachable(): boolean {
  if (supabaseReachable) return false
  // Reintentar verificar después de 25 segundos
  if (Date.now() - lastFailureTimestamp > 25000) {
    supabaseReachable = true
    return false
  }
  return true
}

export function markDatabaseUnreachable(): void {
  supabaseReachable = false
  lastFailureTimestamp = Date.now()
}

export function markDatabaseReachable(): void {
  supabaseReachable = true
}

export function getInitialSongs(): Song[] {
  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS)
  if (cached && cached.length > 0) return cached
  return INITIAL_SONGS
}

export function getInitialEvents(): ServiceEvent[] {
  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS)
  if (cached && cached.length > 0) return cached
  return INITIAL_EVENTS
}

export function getInitialMusicians(): Musician[] {
  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS)
  if (cached && cached.length > 0) return cached
  return INITIAL_MUSICIANS
}

export function getInitialAvailability(): AvailabilityMap {
  const cached = getStored<AvailabilityMap>(STORAGE_KEYS.AVAILABILITY)
  if (cached) return cached
  return {}
}

// ─── PARSER DE CHORDPRO Y CIFRACLUB UNIVERSAL ─────────────────────────────────

const CHORD_CORE_PATTERN = '[A-G][b#]?(?:[mM]|maj|min|aug|dim|sus|add|[0-9]|\\+|\\-|\\(|\\)|º|ø|M)*'
const CHORD_FULL_VALIDATOR = new RegExp(`^${CHORD_CORE_PATTERN}(?:\\/${CHORD_CORE_PATTERN})?$`)

function isSingleChordToken(token: string): boolean {
  if (!token) return false
  const clean = token.replace(/^[\[\(]+|[\]\)]+$/g, '').trim()
  return CHORD_FULL_VALIDATOR.test(clean)
}

function isPureChordLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^\[[^\]]+\]$/.test(trimmed)) return false
  if (/^[eEaAdDgGbB]\|/.test(trimmed)) return false

  const tokens = trimmed.split(/\s+/)
  return tokens.length > 0 && tokens.every(token => isSingleChordToken(token))
}

export function parseChordProText(text: string): LyricLine[] {
  if (!text || !text.trim()) {
    return [{ segments: [{ text: 'Letra no ingresada.' }] }]
  }

  // 1. Limpiar artefactos de copiado de CifraClub (">Gm, duplicados de accesibilidad)
  let cleaned = text.replace(/^">\s*/gm, '').replace(/">\s*/g, '')
  const rawLines = cleaned.split('\n')
  const deduplicatedLines: string[] = []
  let lastNonEmpty = ''

  for (const l of rawLines) {
    const trimmed = l.trim()
    if (trimmed && trimmed === lastNonEmpty) {
      continue
    }
    deduplicatedLines.push(l)
    if (trimmed) lastNonEmpty = trimmed
  }

  const result: LyricLine[] = []
  let currentLabel: string | undefined

  for (let i = 0; i < deduplicatedLines.length; i++) {
    const rawLine = deduplicatedLines[i]
    const trimmed = rawLine.trim()

    if (!trimmed) continue

    // Detectar encabezados de sección ([Intro], [Verso 1], [Estribillo], [Solo], [Puente], etc.)
    if (/^\[([^\]]+)\]$/.test(trimmed) || /^(verso|estrofa|coro|puente|intro|outro|pre-coro|pre-estribillo|estribillo|tag|coda|final|solo|instrumental|parte\s+\d+)/i.test(trimmed)) {
      currentLabel = trimmed.replace(/^\[|\]$/g, '')
      continue
    }

    // Detectar líneas de tablatura (E|---, B|---, etc.)
    if (/^[eEaAdDgGbB]\|/.test(trimmed) || /^\|\s*[-0-9pbh~\/\\r\s]+\|?$/.test(trimmed)) {
      result.push({
        label: currentLabel,
        isTab: true,
        segments: [{ text: rawLine }],
      })
      currentLabel = undefined
      continue
    }

    // Caso 1: Línea en formato CifraClub (Acordes en línea superior + Letra en línea inferior)
    if (isPureChordLine(rawLine)) {
      const nextLine = deduplicatedLines[i + 1]
      if (nextLine && nextLine.trim() && !isPureChordLine(nextLine) && !/^\[[^\]]+\]$/.test(nextLine.trim()) && !/^[eEaAdDgGbB]\|/.test(nextLine.trim())) {
        const chordLine = rawLine
        const lyricLine = nextLine
        i++ // Consumir la siguiente línea

        const chordMatches: { chord: string; index: number }[] = []
        const chordTokenRegex = /\S+/g
        let cMatch: RegExpExecArray | null
        while ((cMatch = chordTokenRegex.exec(chordLine)) !== null) {
          const cleanChord = cMatch[0].replace(/^[\[\(]+|[\]\)]+$/g, '')
          if (CHORD_FULL_VALIDATOR.test(cleanChord)) {
            chordMatches.push({
              chord: cleanChord,
              index: cMatch.index,
            })
          }
        }

        if (chordMatches.length === 0) {
          result.push({ label: currentLabel, segments: [{ text: lyricLine }] })
        } else {
          const segments: SongSegment[] = []
          let lastLyricIdx = 0

          for (let m = 0; m < chordMatches.length; m++) {
            const { chord, index } = chordMatches[m]
            const nextIndex = m + 1 < chordMatches.length ? chordMatches[m + 1].index : lyricLine.length

            if (index > lastLyricIdx) {
              const textBefore = lyricLine.slice(lastLyricIdx, index)
              if (textBefore) {
                segments.push({ text: textBefore })
              }
            }

            const segText = lyricLine.slice(index, Math.max(index + 1, nextIndex))
            segments.push({ chord, text: segText })
            lastLyricIdx = Math.max(index + 1, nextIndex)
          }

          if (lastLyricIdx < lyricLine.length) {
            segments.push({ text: lyricLine.slice(lastLyricIdx) })
          }

          result.push({
            label: currentLabel,
            segments: segments.length > 0 ? segments : [{ text: lyricLine }],
          })
        }

        currentLabel = undefined
        continue
      } else {
        // Línea de acordes sueltos (Intro, Interludio, etc.)
        const chordTokenRegex = /\S+/g
        const segments: SongSegment[] = []
        let cMatch: RegExpExecArray | null
        while ((cMatch = chordTokenRegex.exec(rawLine)) !== null) {
          const cleanChord = cMatch[0].replace(/^[\[\(]+|[\]\)]+$/g, '')
          segments.push({ chord: cleanChord, text: '   ' })
        }
        result.push({
          label: currentLabel,
          segments: segments.length > 0 ? segments : [{ text: rawLine }],
        })
        currentLabel = undefined
        continue
      }
    }

    // Caso 2: Formato ChordPro nativo con corchetes [C9] o [D/F#]
    const bracketRegex = /\[([A-G][b#]?(?:[mM]|maj|min|aug|dim|sus|add|[0-9]|\+|\-|\(|\)|º|ø|M)*(?:\/[A-G][b#]?(?:[mM]|maj|min|aug|dim|sus|add|[0-9]|\+|\-|\(|\)|º|ø|M)*)?)\]/g
    const segments: SongSegment[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = bracketRegex.exec(rawLine)) !== null) {
      const textBefore = rawLine.slice(lastIndex, match.index)
      if (textBefore || segments.length === 0 && match.index > 0) {
        if (segments.length > 0 && segments[segments.length - 1].chord && !segments[segments.length - 1].text) {
          segments[segments.length - 1].text = textBefore
        } else if (textBefore) {
          segments.push({ text: textBefore })
        }
      }
      segments.push({ chord: match[1], text: '' })
      lastIndex = bracketRegex.lastIndex
    }

    const remainingText = rawLine.slice(lastIndex)
    if (segments.length > 0) {
      if (segments[segments.length - 1].chord && !segments[segments.length - 1].text) {
        segments[segments.length - 1].text = remainingText
      } else if (remainingText) {
        segments.push({ text: remainingText })
      }
    } else {
      segments.push({ text: rawLine })
    }

    result.push({
      label: currentLabel,
      segments: segments.length > 0 ? segments : [{ text: rawLine }],
    })
    currentLabel = undefined
  }

  return result.length > 0 ? result : [{ segments: [{ text }] }]
}

export function formatLyricsToChordPro(lyrics: LyricLine[]): string {
  if (!lyrics || lyrics.length === 0) return ''
  return lyrics
    .map(line => {
      const header = line.label ? `[${line.label}]\n` : ''
      if (line.isTab) {
        return header + line.segments.map(s => s.text).join('')
      }
      const body = line.segments
        .map(seg => (seg.chord ? `[${seg.chord}]${seg.text}` : seg.text))
        .join('')
      return header + body
    })
    .join('\n')
}

// ─── REPERTORIO INICIAL ───────────────────────────────────────────────────────

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─── REPERTORIO INICIAL ───────────────────────────────────────────────────────

export const INITIAL_SONGS: Song[] = NOTION_SONGS

export const INITIAL_MUSICIANS: Musician[] = []

export const INITIAL_EVENTS: ServiceEvent[] = []

// ─── CANCIONES API ────────────────────────────────────────────────────────────

export async function fetchSongs(): Promise<Song[]> {
  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS) || []

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('songs')
          .select('*')
          .order('title', { ascending: true }),
        2500
      )

      if (!error && data) {
        markDatabaseReachable()
        const mapped: Song[] = data.map(item => {
          let instLyrics: InstrumentScores | undefined
          let instNotes: InstrumentNotes | undefined

          if (item.chordpro && typeof item.chordpro === 'string') {
            try {
              const parsedChordpro = JSON.parse(item.chordpro)
              if (parsedChordpro && typeof parsedChordpro === 'object') {
                if (parsedChordpro.instrument_lyrics) instLyrics = parsedChordpro.instrument_lyrics
                if (parsedChordpro.instrument_notes) instNotes = parsedChordpro.instrument_notes
              }
            } catch {
              // Si no es formato JSON, es texto plano
            }
          }

          return {
            id: item.id,
            title: item.title,
            artist: item.artist,
            key: item.key,
            tempo: item.tempo,
            tags: item.tags || [],
            lyrics: Array.isArray(item.lyrics) ? item.lyrics : [],
            instrument_lyrics: instLyrics,
            instrument_notes: instNotes,
            media_url: item.media_url,
            is_classic: item.is_classic ?? false,
            church_domain: item.church_domain || 'Conocida',
            team_domain: item.team_domain || 'Por practicar',
            musical_type: item.musical_type || 'Worship contemporáneo',
            technical_complexity: item.technical_complexity || 'Básica',
            resumen_tematico: generateSongThematicSummary(item),
          }
        })

        // Preservar canciones locales si no se han sincronizado
        const dbIds = new Set(mapped.map(s => s.id))
        const localOnly = cached.filter(s => !dbIds.has(s.id))
        const combined = [...localOnly, ...mapped]

        setStored(STORAGE_KEYS.SONGS, combined)
        return combined
      } else if (error) {
        console.warn('Aviso obteniendo canciones de Supabase (usando datos locales):', error.message)
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Supabase no disponible o pausado para canciones (usando cache local):', err)
    }
  }

  if (cached.length > 0) return cached
  return INITIAL_SONGS
}

export function generateSongThematicSummary(song: Partial<Song>): string {
  const title = (song.title || '').trim()
  const artist = (song.artist || '').trim()
  const tags = song.tags || []
  const musicalType = song.musical_type || 'Worship contemporáneo'
  const tempo = song.tempo || 'media'

  let lyricsSnippet = ''
  if (Array.isArray(song.lyrics) && song.lyrics.length > 0) {
    const textLines = song.lyrics
      .map(l => (l.segments || []).map(s => s.text || '').join(' '))
      .filter(t => t.trim().length > 0 && !t.includes('Letra de '))
    if (textLines.length > 0) {
      lyricsSnippet = textLines.slice(0, 3).join(' ').replace(/\s+/g, ' ').slice(0, 120)
    }
  }

  let themeDesc = 'Proclama la grandeza de Dios y la comunión congregacional'
  if (tags.some(t => t.toLowerCase().includes('consagr') || t.toLowerCase().includes('entreg'))) {
    themeDesc = 'Rendición incondicional, obediencia y entrega total al señorío de Cristo'
  } else if (tags.some(t => t.toLowerCase().includes('doctrin') || t.toLowerCase().includes('gracia'))) {
    themeDesc = 'Afirmación de la suficiencia de la cruz, el perdón inmerecido y la soberanía de Dios'
  } else if (tags.some(t => t.toLowerCase().includes('gozo') || t.toLowerCase().includes('celebr'))) {
    themeDesc = 'Fiesta espiritual, gozo y júbilo congregacional por el triunfo en Cristo'
  } else if (tags.some(t => t.toLowerCase().includes('exalt') || t.toLowerCase().includes('gloria') || t.toLowerCase().includes('santo'))) {
    themeDesc = 'Exaltación sublime de la santidad, majestad y gloria del Señor en su trono'
  } else if (tags.some(t => t.toLowerCase().includes('clamor') || t.toLowerCase().includes('interces'))) {
    themeDesc = 'Clamor ferviente por misericordia, sanidad, consuelo y auxilio divino'
  }

  const tone = tempo === 'rápida'
    ? 'Festivo, rítmico y de llamado al júbilo'
    : tempo === 'lenta'
    ? 'Íntimo, reverente y de profunda adoración'
    : 'Devocional, solemne y edificante'

  const keywords = Array.from(new Set([...tags, title, artist, tempo])).filter(Boolean).slice(0, 5)

  let summary = `Tema central: ${themeDesc} a través de "${title}". `
  summary += `Tono espiritual: ${tone} (${musicalType}). `
  if (lyricsSnippet) {
    summary += `Énfasis lírico: "${lyricsSnippet}...". `
  }
  summary += `Palabras clave: ${keywords.join(', ')}.`

  return summary
}

export async function createSong(newSong: Omit<Song, 'id'>): Promise<Song> {
  const resumen = newSong.resumen_tematico || generateSongThematicSummary(newSong)
  
  // Empaquetar instrument_lyrics e instrument_notes en chordpro JSON
  const chordproData = (newSong.instrument_lyrics || newSong.instrument_notes)
    ? JSON.stringify({
        instrument_lyrics: newSong.instrument_lyrics,
        instrument_notes: newSong.instrument_notes,
      })
    : null

  let created: Song = {
    id: `custom-${Date.now()}`,
    ...newSong,
    is_classic: newSong.is_classic ?? false,
    church_domain: newSong.church_domain || 'Conocida',
    team_domain: newSong.team_domain || 'Por practicar',
    musical_type: newSong.musical_type || 'Worship contemporáneo',
    technical_complexity: newSong.technical_complexity || 'Básica',
    resumen_tematico: resumen,
    instrument_lyrics: newSong.instrument_lyrics,
    instrument_notes: newSong.instrument_notes,
  }

  // Guardar SIEMPRE en almacenamiento local primero (garantía 100% de persistencia)
  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS) || INITIAL_SONGS
  setStored(STORAGE_KEYS.SONGS, [created, ...cached.filter(s => s.id !== created.id)])

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('songs')
          .insert({
            title: newSong.title,
            artist: newSong.artist,
            key: newSong.key,
            tempo: newSong.tempo,
            tags: newSong.tags,
            lyrics: newSong.lyrics,
            chordpro: chordproData,
            media_url: newSong.media_url || null,
            is_classic: newSong.is_classic ?? false,
            church_domain: newSong.church_domain || 'Conocida',
            team_domain: newSong.team_domain || 'Por practicar',
            musical_type: newSong.musical_type || 'Worship contemporáneo',
            technical_complexity: newSong.technical_complexity || 'Básica',
          })
          .select()
          .single(),
        3500
      )

      if (!error && data) {
        markDatabaseReachable()
        const oldId = created.id
        created = {
          ...created,
          id: data.id,
        }
        const currentCache = getStored<Song[]>(STORAGE_KEYS.SONGS) || []
        setStored(STORAGE_KEYS.SONGS, currentCache.map(s => s.id === oldId ? created : s))
      } else if (error) {
        console.warn('Aviso guardando en Supabase (guardado localmente):', error.message)
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Supabase no disponible o pausado (canción guardada en almacenamiento local):', err)
    }
  }

  return created
}

export async function updateSong(id: string, updates: Partial<Song>): Promise<Song> {
  const resumen = updates.resumen_tematico || generateSongThematicSummary(updates)

  const chordproData = (updates.instrument_lyrics !== undefined || updates.instrument_notes !== undefined)
    ? JSON.stringify({
        instrument_lyrics: updates.instrument_lyrics,
        instrument_notes: updates.instrument_notes,
      })
    : undefined

  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS) || INITIAL_SONGS
  const existing = cached.find(s => s.id === id)

  let updated: Song = {
    ...(existing || {}),
    id,
    title: updates.title !== undefined ? updates.title : (existing?.title || ''),
    artist: updates.artist !== undefined ? updates.artist : (existing?.artist || ''),
    key: updates.key !== undefined ? updates.key : (existing?.key || 'G'),
    tempo: updates.tempo !== undefined ? updates.tempo : (existing?.tempo || 'media'),
    tags: updates.tags !== undefined ? updates.tags : (existing?.tags || []),
    lyrics: updates.lyrics !== undefined ? updates.lyrics : (existing?.lyrics || []),
    instrument_lyrics: updates.instrument_lyrics !== undefined ? updates.instrument_lyrics : existing?.instrument_lyrics,
    instrument_notes: updates.instrument_notes !== undefined ? updates.instrument_notes : existing?.instrument_notes,
    media_url: updates.media_url !== undefined ? updates.media_url : existing?.media_url,
    is_classic: updates.is_classic !== undefined ? updates.is_classic : existing?.is_classic,
    church_domain: updates.church_domain !== undefined ? updates.church_domain : existing?.church_domain,
    team_domain: updates.team_domain !== undefined ? updates.team_domain : existing?.team_domain,
    musical_type: updates.musical_type !== undefined ? updates.musical_type : existing?.musical_type,
    technical_complexity: updates.technical_complexity !== undefined ? updates.technical_complexity : existing?.technical_complexity,
    resumen_tematico: resumen,
  }

  // Guardar SIEMPRE en almacenamiento local primero (éxito garantizado de la edición)
  setStored(STORAGE_KEYS.SONGS, cached.map(s => s.id === id ? { ...s, ...updated } : s))

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const payload: any = { updated_at: new Date().toISOString() }
      if (updates.title !== undefined) payload.title = updates.title
      if (updates.artist !== undefined) payload.artist = updates.artist
      if (updates.key !== undefined) payload.key = updates.key
      if (updates.tempo !== undefined) payload.tempo = updates.tempo
      if (updates.tags !== undefined) payload.tags = updates.tags
      if (updates.lyrics !== undefined) payload.lyrics = updates.lyrics
      if (chordproData !== undefined) payload.chordpro = chordproData
      if (updates.media_url !== undefined) payload.media_url = updates.media_url || null
      if (updates.is_classic !== undefined) payload.is_classic = updates.is_classic
      if (updates.church_domain !== undefined) payload.church_domain = updates.church_domain
      if (updates.team_domain !== undefined) payload.team_domain = updates.team_domain
      if (updates.musical_type !== undefined) payload.musical_type = updates.musical_type
      if (updates.technical_complexity !== undefined) payload.technical_complexity = updates.technical_complexity

      const { data, error } = await withTimeout(
        supabase
          .from('songs')
          .update(payload)
          .eq('id', id)
          .select()
          .single(),
        3500
      )

      if (!error && data) {
        markDatabaseReachable()
      } else if (error) {
        console.warn('Aviso actualizando en Supabase (guardado localmente):', error.message)
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Supabase no disponible o pausado (edición guardada localmente):', err)
    }
  }

  return updated
}

export async function deleteSong(id: string): Promise<void> {
  const cached = getStored<Song[]>(STORAGE_KEYS.SONGS) || INITIAL_SONGS
  setStored(STORAGE_KEYS.SONGS, cached.filter(s => s.id !== id))

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { error } = await withTimeout(
        supabase.from('songs').delete().eq('id', id),
        3500
      )
      if (!error) {
        markDatabaseReachable()
      } else {
        console.warn('Aviso eliminando en Supabase (eliminado localmente):', error.message)
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Supabase no disponible o pausado (eliminado localmente):', err)
    }
  }
}

// ─── SERVICIOS / EVENTOS API ──────────────────────────────────────────────────

export async function fetchEvents(): Promise<ServiceEvent[]> {
  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS)

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { data: events, error: eventsError } = await withTimeout(
        supabase
          .from('service_events')
          .select(`
            id,
            date,
            type,
            label,
            service_setlists ( song_id, position ),
            service_roster ( user_id, status, instrument, secondary_instruments )
          `)
          .order('date', { ascending: true }),
        2500
      )

      if (!eventsError && events) {
        markDatabaseReachable()
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
            instrument: r.instrument || undefined,
            secondary_instruments: Array.isArray(r.secondary_instruments) ? r.secondary_instruments : [],
          })),
        }))
        setStored(STORAGE_KEYS.EVENTS, mapped)
        return mapped
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Supabase no disponible para eventos (usando datos locales):', err)
    }
  }

  if (cached !== null) return cached
  return INITIAL_EVENTS
}

export async function createServiceEvent(event: ServiceEvent): Promise<ServiceEvent> {
  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS) || INITIAL_EVENTS
  const updated = [...cached.filter(e => e.date !== event.date), event].sort((a, b) => a.date.localeCompare(b.date))
  setStored(STORAGE_KEYS.EVENTS, updated)

  const newEventId = generateUUID()
  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { data: eventRow } = await withTimeout(
        supabase
          .from('service_events')
          .insert({
            id: newEventId,
            date: event.date,
            type: event.type,
            label: event.label,
          })
          .select()
          .single(),
        3500
      )

      const targetId = eventRow ? eventRow.id : newEventId

      if (event.setlist.length > 0) {
        await supabase.from('service_setlists').insert(
          event.setlist.map((song_id, position) => ({
            event_id: targetId,
            song_id,
            position: position + 1,
          }))
        )
      }
      if (event.roster.length > 0) {
        await supabase.from('service_roster').insert(
          event.roster.map(r => ({
            event_id: targetId,
            user_id: r.mid,
            status: r.status,
            instrument: r.instrument || null,
            secondary_instruments: r.secondary_instruments || [],
          }))
        )
      }
      markDatabaseReachable()
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Aviso guardando servicio en Supabase (guardado localmente):', err)
    }
  }

  return event
}

export async function updateServiceEvent(date: string, updates: Partial<ServiceEvent>): Promise<void> {
  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS) || INITIAL_EVENTS
  setStored(STORAGE_KEYS.EVENTS, cached.map(e => e.date === date ? { ...e, ...updates } : e))

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { data: existing } = await withTimeout(
        supabase
          .from('service_events')
          .select('id')
          .eq('date', date)
          .single(),
        3000
      )

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
                instrument: r.instrument || null,
                secondary_instruments: r.secondary_instruments || [],
              }))
            )
          }
        }
        markDatabaseReachable()
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Aviso actualizando servicio en Supabase (guardado localmente):', err)
    }
  }
}

export async function deleteServiceEvent(date: string): Promise<void> {
  const cached = getStored<ServiceEvent[]>(STORAGE_KEYS.EVENTS) || INITIAL_EVENTS
  setStored(STORAGE_KEYS.EVENTS, cached.filter(e => e.date !== date))

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      await withTimeout(supabase.from('service_events').delete().eq('date', date), 3000)
      markDatabaseReachable()
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Aviso eliminando servicio en Supabase (eliminado localmente):', err)
    }
  }
}

// ─── MÚSICOS & PERFILES API ───────────────────────────────────────────────────

export async function fetchMusicians(): Promise<Musician[]> {
  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS)

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('*')
          .order('name', { ascending: true }),
        2500
      )

      if (!error && data) {
        markDatabaseReachable()
        const mapped = data.map(item => ({
          id: item.id,
          name: item.name,
          instrument: item.instrument || 'guitarra',
          secondary_instruments: Array.isArray(item.secondary_instruments) ? item.secondary_instruments : [],
          initials: item.initials || item.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
          email: item.email || '',
          phone: item.phone || '',
          role: item.role,
        }))
        setStored(STORAGE_KEYS.MUSICIANS, mapped)
        return mapped
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Supabase no disponible para perfiles (usando datos locales):', err)
    }
  }

  if (cached !== null) return cached
  return INITIAL_MUSICIANS
}

export async function createMusician(musician: {
  name: string
  instrument: string
  secondary_instruments?: string[]
  email: string
  phone?: string
  role?: Role
}): Promise<Musician> {
  const newId = generateUUID()
  const initials = musician.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  let created: Musician = {
    id: newId,
    name: musician.name,
    instrument: musician.instrument,
    secondary_instruments: musician.secondary_instruments || [],
    initials,
    email: musician.email,
    phone: musician.phone,
    role: musician.role || 'musician',
  }

  // Guardar localmente de inmediato
  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS) || INITIAL_MUSICIANS
  setStored(STORAGE_KEYS.MUSICIANS, [...cached, created])

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .insert({
            id: newId,
            name: musician.name,
            instrument: musician.instrument,
            secondary_instruments: musician.secondary_instruments || [],
            initials,
            email: musician.email,
            phone: musician.phone || '',
            role: musician.role || 'musician',
          })
          .select()
          .single(),
        3500
      )

      if (!error && data) {
        markDatabaseReachable()
        created = {
          id: data.id,
          name: data.name,
          instrument: data.instrument,
          secondary_instruments: Array.isArray(data.secondary_instruments) ? data.secondary_instruments : [],
          initials: data.initials || initials,
          email: data.email,
          phone: data.phone,
          role: data.role,
        }
        const currentCached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS) || []
        setStored(STORAGE_KEYS.MUSICIANS, currentCached.map(m => m.id === newId ? created : m))
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Aviso creando músico en Supabase (guardado localmente):', err)
    }
  }

  return created
}

export async function updateMusician(id: string, updates: Partial<Musician>): Promise<Musician> {
  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS) || INITIAL_MUSICIANS
  const existing = cached.find(m => m.id === id)

  let updated: Musician = {
    ...(existing || {}),
    id,
    name: updates.name !== undefined ? updates.name : (existing?.name || ''),
    instrument: updates.instrument !== undefined ? updates.instrument : (existing?.instrument || 'guitarra'),
    secondary_instruments: updates.secondary_instruments !== undefined ? updates.secondary_instruments : (existing?.secondary_instruments || []),
    initials: updates.name ? updates.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : (existing?.initials || 'IB'),
    email: updates.email !== undefined ? updates.email : (existing?.email || ''),
    phone: updates.phone !== undefined ? updates.phone : existing?.phone,
    role: updates.role !== undefined ? updates.role : (existing?.role || 'musician'),
  }

  // Guardar localmente de inmediato
  setStored(STORAGE_KEYS.MUSICIANS, cached.map(m => m.id === id ? { ...m, ...updated } : m))

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const payload: any = { updated_at: new Date().toISOString() }
      if (updates.name !== undefined) {
        payload.name = updates.name
        payload.initials = updates.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      }
      if (updates.instrument !== undefined) payload.instrument = updates.instrument
      if (updates.secondary_instruments !== undefined) payload.secondary_instruments = updates.secondary_instruments
      if (updates.email !== undefined) payload.email = updates.email
      if (updates.phone !== undefined) payload.phone = updates.phone
      if (updates.role !== undefined) payload.role = updates.role

      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .update(payload)
          .eq('id', id)
          .select()
          .single(),
        3500
      )

      if (!error && data) {
        markDatabaseReachable()
      }
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Aviso actualizando músico en Supabase (guardado localmente):', err)
    }
  }

  return updated
}

export async function deleteMusician(id: string): Promise<void> {
  const cached = getStored<Musician[]>(STORAGE_KEYS.MUSICIANS) || INITIAL_MUSICIANS
  setStored(STORAGE_KEYS.MUSICIANS, cached.filter(m => m.id !== id))

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      await withTimeout(supabase.from('profiles').delete().eq('id', id), 3500)
      markDatabaseReachable()
    } catch (err) {
      markDatabaseUnreachable()
      console.warn('Aviso eliminando músico en Supabase (eliminado localmente):', err)
    }
  }
}

export async function updateAttendanceStatus(date: string, mid: string, status: Status): Promise<void> {
  if (!isSupabaseConfigured || !supabase || isDatabaseTemporarilyUnreachable()) {
    return
  }

  try {
    const { data: event } = await withTimeout(
      supabase
        .from('service_events')
        .select('id')
        .eq('date', date)
        .single(),
      2500
    )

    if (!event) return

    await withTimeout(
      supabase
        .from('service_roster')
        .upsert({
          event_id: event.id,
          user_id: mid,
          status,
        }, { onConflict: 'event_id,user_id' }),
      2500
    )
    markDatabaseReachable()
  } catch (err) {
    markDatabaseUnreachable()
    console.warn('Aviso actualizando asistencia en Supabase:', err)
  }
}

// ─── DISPONIBILIDAD DE INTEGRANTES ──────────────────────────────────────────

export type AvailabilityMap = Record<string, Record<string, boolean>> // { [userId]: { [date]: boolean } }

export async function fetchAvailability(): Promise<AvailabilityMap> {
  const cached = getStored<AvailabilityMap>(STORAGE_KEYS.AVAILABILITY)

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('musician_availability')
          .select('user_id, date, available'),
        2500
      )

      if (!error && data) {
        markDatabaseReachable()
        const map: AvailabilityMap = {}
        data.forEach((row: { user_id: string; date: string; available: boolean }) => {
          if (!map[row.user_id]) map[row.user_id] = {}
          map[row.user_id][row.date] = row.available
        })
        setStored(STORAGE_KEYS.AVAILABILITY, map)
        return map
      }
    } catch {
      markDatabaseUnreachable()
      // Fallback a almacenamiento local
    }
  }

  return cached || {}
}

export async function saveMusicianAvailability(userId: string, date: string, available: boolean): Promise<void> {
  const cached = getStored<AvailabilityMap>(STORAGE_KEYS.AVAILABILITY) || {}
  if (!cached[userId]) cached[userId] = {}
  cached[userId][date] = available
  setStored(STORAGE_KEYS.AVAILABILITY, cached)

  if (isSupabaseConfigured && supabase && !isDatabaseTemporarilyUnreachable()) {
    try {
      await withTimeout(
        supabase
          .from('musician_availability')
          .upsert({
            user_id: userId,
            date,
            available,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,date' }),
        2500
      )
      markDatabaseReachable()
    } catch {
      markDatabaseUnreachable()
    }
  }
}

export async function batchSaveMusicianAvailability(userId: string, updates: { date: string; available: boolean }[]): Promise<void> {
  const cached = getStored<AvailabilityMap>(STORAGE_KEYS.AVAILABILITY) || {}
  if (!cached[userId]) cached[userId] = {}
  updates.forEach(u => {
    cached[userId][u.date] = u.available
  })
  setStored(STORAGE_KEYS.AVAILABILITY, cached)

  if (isSupabaseConfigured && supabase && updates.length > 0 && !isDatabaseTemporarilyUnreachable()) {
    try {
      const rows = updates.map(u => ({
        user_id: userId,
        date: u.date,
        available: u.available,
        updated_at: new Date().toISOString(),
      }))

      await withTimeout(
        supabase
          .from('musician_availability')
          .upsert(rows, { onConflict: 'user_id,date' }),
        3000
      )
      markDatabaseReachable()
    } catch {
      markDatabaseUnreachable()
    }
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

function formatCompactCandidateCatalog(
  topic: string,
  catalog: Song[],
  moment: string,
  maxCandidates = 32
): string {
  const cleanTopic = topic.toLowerCase().trim()
  const words = cleanTopic.split(/[\s,.:;/-]+/).filter(w => w.length > 2)

  const scored = catalog.map(song => {
    let score = 0
    const title = (song.title || '').toLowerCase()
    const tags = (song.tags || []).map(t => t.toLowerCase()).join(' ')
    const resumen = (song.resumen_tematico || '').toLowerCase()

    words.forEach(w => {
      if (title.includes(w)) score += 12
      if (resumen.includes(w)) score += 8
      if (tags.includes(w)) score += 6
    })

    if (moment !== 'todos') {
      if (moment === 'Apertura' && (song.tempo === 'rápida' || song.tempo === 'media')) score += 5
      if (moment === 'Adoración' && (song.tempo === 'media' || song.tempo === 'lenta')) score += 5
      if (moment === 'Ministración' && (song.tempo === 'lenta' || song.tempo === 'media')) score += 5
    }

    if (song.is_classic) score += 3

    return { song, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, maxCandidates).map(item => item.song)

  return top
    .map(s => {
      const tags = (s.tags || []).join(', ')
      return `ID: "${s.id}" | ${s.title} (${s.artist}) | Tempo: ${s.tempo} | Tags: ${tags} | ${s.resumen_tematico || ''}`
    })
    .join('\n')
}

async function queryGroqDirectly(
  apiKey: string,
  topic: string,
  currentSetlist: string[],
  catalog: Song[],
  moment: string,
  limit: number
): Promise<AISuggestion[] | null> {
  const CANDIDATE_MODELS = [
    'openai/gpt-oss-20b',
    'qwen/qwen3.6-27b',
    'groq/compound-mini',
    'groq/compound',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'openai/gpt-oss-120b',
  ]

  const compactCatalogText = formatCompactCandidateCatalog(topic, catalog, moment, 32)

  const systemPrompt = `Eres un pastor de adoración y teólogo musical de la iglesia cristiana IBAMI.
Tu tarea es seleccionar exactamente ${limit} canciones del catálogo oficial de IBAMI que mejor se conecten con el tema bíblico o sermón provisto.

REGLAS LITÚRGICAS DE IBAMI:
1. "Apertura": Canciones festivas, rítmicas o de llamado a la alabanza que convocan a la congregación (tempos rápidos o medios).
2. "Adoración": Canciones profundas, cristocéntricas y reverentes que preparan el corazón antes de la predicación (tempos medios o lentos).
3. "Ministración": Canciones de entrega, consagración, fe, sanidad o llamado tras escuchar la Palabra (tempos lentos o íntimos).

${moment !== 'todos' ? `ENFOQUE SOLICITADO: Recomienda únicamente canciones para el momento de "${moment}".` : 'DISTRIBUCIÓN: Proporciona una mezcla equilibrada de Apertura, Adoración y Ministración.'}

REGLAS ESTRICTAS:
- Usa ÚNICAMENTE canciones que existan en el catálogo provisto (utilizando su ID exacto entre comillas).
- No inventes canciones ni cambies los IDs.
- Cero emojis en cualquier parte del texto.
- Justificación: Explica en 1 o 2 oraciones profundas y claras por qué la letra o temática conecta con el mensaje bíblico.
- Devuelve ÚNICAMENTE un JSON con esta estructura exacta:
{
  "suggestions": [
    {
      "songId": "id-exacto-de-la-cancion",
      "moment": "Apertura",
      "reason": "Justificación pastoral fundamentada."
    }
  ]
}`

  const userPrompt = `Tema o pasaje del sermón: "${topic}"
Canciones que ya están en el setlist: ${JSON.stringify(currentSetlist)}

Catálogo de canciones candidatas de IBAMI:
${compactCatalogText}`

  for (const model of CANDIDATE_MODELS) {
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        }),
      })

      if (resp.ok) {
        const data = await resp.json()
        const rawContent = data.choices?.[0]?.message?.content || ''
        let parsedResult: any = { suggestions: [] }
        try {
          const clean = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
          parsedResult = JSON.parse(clean)
        } catch {
          const f = rawContent.indexOf('{')
          const l = rawContent.lastIndexOf('}')
          if (f !== -1 && l !== -1) {
            parsedResult = JSON.parse(rawContent.substring(f, l + 1))
          }
        }
        if (Array.isArray(parsedResult?.suggestions) && parsedResult.suggestions.length > 0) {
          return parsedResult.suggestions
        }
      }
    } catch (e) {
      console.warn(`Error llamando a Groq directo con ${model}:`, e)
    }
  }
  return null
}

export async function suggestSongsWithGroq(
  topic: string,
  currentSetlist: string[],
  catalog: Song[],
  moment: 'todos' | 'Apertura' | 'Adoración' | 'Ministración' = 'todos',
  limit: number = 8
): Promise<AISuggestion[]> {
  // Asegurar que todas las canciones tengan su resumen temático
  const enrichedCatalog = catalog.map(s => ({
    ...s,
    resumen_tematico: s.resumen_tematico || generateSongThematicSummary(s),
  }))

  const compactCatalog = enrichedCatalog.map(s => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    key: s.key,
    tempo: s.tempo,
    tags: s.tags,
    resumen_tematico: s.resumen_tematico,
  }))

  // 1. Intentar llamar a Groq directamente si existe VITE_GROQ_API_KEY en Vercel/.env
  const directKey = (import.meta as any).env?.VITE_GROQ_API_KEY || getStored<string>('acorde_groq_api_key')
  if (directKey) {
    try {
      const directSuggestions = await queryGroqDirectly(
        directKey,
        topic,
        currentSetlist,
        enrichedCatalog,
        moment,
        limit
      )
      if (directSuggestions && directSuggestions.length > 0) {
        return directSuggestions
      }
    } catch (err) {
      console.warn('Fallo llamada directa a Groq:', err)
    }
  }

  // 2. Intentar llamar a la Edge Function de Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('suggest-songs', {
        body: { topic, currentSetlist, moment, limit, songsCatalog: compactCatalog },
      })

      if (!error && data?.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        return data.suggestions
      }
    } catch (err) {
      console.warn('Edge Function no disponible, usando evaluador temático local:', err)
    }
  }

  // ─── EVALUADOR SEMÁNTICO EN DOS PASOS ──────────────────────────────────────────
  // PASO 1: Identificar conceptos y dimensiones del tema o pasaje bíblico
  const cleanTopic = topic.toLowerCase().trim()
  const words = cleanTopic.split(/[\s,.:;/-]+/).filter(w => w.length > 2)

  const activeThemes: { key: string; theme: ThematicCategory; weight: number }[] = []
  for (const [key, themeData] of Object.entries(THEMATIC_KNOWLEDGE_BASE)) {
    const hits = themeData.keywords.filter(k => cleanTopic.includes(k) || words.some(w => k.includes(w)))
    if (hits.length > 0) {
      activeThemes.push({ key, theme: themeData, weight: hits.length })
    }
  }
  activeThemes.sort((a, b) => b.weight - a.weight)

  // PASO 2: Evaluar el catálogo completo contra el resumen temático de cada canción
  const scoredSongs = enrichedCatalog.map(song => {
    let score = 0
    const resumen = (song.resumen_tematico || '').toLowerCase()
    const titleNorm = song.title.toLowerCase()
    const tagsNorm = song.tags.map(t => t.toLowerCase()).join(' ')
    const searchableText = `${titleNorm} ${tagsNorm} ${resumen}`

    // 1. Coincidencia directa de palabras clave del usuario en el resumen temático
    words.forEach(word => {
      if (titleNorm.includes(word)) score += 10
      if (resumen.includes(word)) score += 8
      if (tagsNorm.includes(word)) score += 6
    })

    // 2. Coincidencia teológica profunda
    activeThemes.forEach(({ theme, weight }) => {
      theme.keywords.forEach(kw => {
        if (titleNorm.includes(kw)) score += 6 * weight
        if (resumen.includes(kw)) score += 4 * weight
        if (tagsNorm.includes(kw)) score += 3 * weight
      })
    })

    // 3. Adecuación litúrgica según momento solicitado
    if (moment === 'Apertura') {
      if (song.tempo === 'rápida') score += 7
      if (song.tempo === 'media') score += 3
      if (song.tempo === 'lenta') score -= 5
    } else if (moment === 'Adoración') {
      if (song.tempo === 'media' || song.tempo === 'lenta') score += 6
      if (song.tempo === 'rápida') score -= 3
    } else if (moment === 'Ministración') {
      if (song.tempo === 'lenta') score += 8
      if (song.tempo === 'media') score += 4
      if (song.tempo === 'rápida') score -= 8
    }

    // 4. Bonificación para clásicos congregacionales
    if (song.is_classic) score += 2

    // 5. Descuento si ya está en el setlist
    if (currentSetlist.includes(song.id)) score -= 20

    return { song, score }
  })

  scoredSongs.sort((a, b) => b.score - a.score)
  const topMatches = scoredSongs.slice(0, Math.max(limit, 8))

  // Generar veredicto individualizado y único para cada canción
  return topMatches.map(({ song }, idx) => {
    let songMoment: 'Apertura' | 'Adoración' | 'Ministración' = 'Adoración'
    if (song.tempo === 'rápida' || (moment === 'todos' && idx === 0)) {
      songMoment = 'Apertura'
    } else if (song.tempo === 'lenta' || (moment === 'todos' && idx >= topMatches.length - 2)) {
      songMoment = 'Ministración'
    }

    if (moment !== 'todos') songMoment = moment

    // Construir razón individual basada en el resumen temático de ESTA canción específica
    const resumen = song.resumen_tematico || ''
    const matchTag = song.tags[0] || 'Alabanza'

    let reason = ''
    if (songMoment === 'Apertura') {
      reason = `[Apertura] Proclama con júbilo congregacional el mensaje de "${song.title}". Su dinámica ${song.tempo} y enfoque en ${matchTag} preparan la alabanza para el tema de "${topic}".`
    } else if (songMoment === 'Ministración') {
      reason = `[Ministración] Facilita una respuesta devocional profunda. Su mensaje en ${song.tempo} enfocado en ${matchTag} permite reflexionar e intimar con Dios tras escuchar sobre "${topic}".`
    } else {
      reason = `[Adoración] Profundiza en el corazón del sermón mediante "${song.title}". Conecta con "${topic}" reforzando la fe de la iglesia en un ambiente de reverencia.`
    }

    return {
      songId: song.id,
      moment: songMoment,
      reason,
    }
  })
}
