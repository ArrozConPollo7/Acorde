import { useState, useMemo, useEffect, type ReactNode } from 'react'
import {
  fetchSongs,
  fetchEvents,
  fetchMusicians,
  createSong,
  updateSong,
  deleteSong,
  createMusician,
  updateMusician,
  deleteMusician,
  createServiceEvent,
  updateServiceEvent,
  deleteServiceEvent,
  parseChordProText,
  formatLyricsToChordPro,
  updateAttendanceStatus,
  suggestSongsWithGroq,
  hasRole,
  findMusicianByIdentifier,
  type Song,
  type ServiceEvent,
  type Musician,
  type Status,
  type Instrument,
  type Role,
  type AISuggestion,
  INITIAL_SONGS,
  INITIAL_EVENTS,
  INITIAL_MUSICIANS,
} from './lib/api'
import { generateSongPDF } from './lib/pdf'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Screen = 'login' | 'calendar' | 'day-detail' | 'library' | 'song' | 'admin' | 'profile'
type AIState = 'idle' | 'loading' | 'results' | 'error'
type Theme = 'light' | 'dark'

// ─── CHORD TRANSPOSITION ─────────────────────────────────────────────────────

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_MAP: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' }

function transposeNote(note: string, n: number): string {
  const sharp = FLAT_MAP[note] ?? note
  const idx = CHROMATIC.indexOf(sharp)
  if (idx === -1) return note
  return CHROMATIC[((idx + n) % 12 + 12) % 12]
}

function transposeChord(chord: string, n: number): string {
  if (n === 0) return chord
  const r2 = chord.slice(0, 2)
  const r1 = chord.slice(0, 1)
  if (CHROMATIC.includes(r2) || FLAT_MAP[r2]) return transposeNote(r2, n) + chord.slice(2)
  if (CHROMATIC.includes(r1)) return transposeNote(r1, n) + chord.slice(1)
  return chord
}

// ─── ICONS ────────────────────────────────────────────────────────────────────

function IconFlame({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 56" fill="none" className={className}>
      <path
        d="M20 2C20 2 32 16 32 28C32 35.2 27 40 20 40C13 40 8 35.2 8 28C8 22 11 17 14 12C14 12 13 22 18 25C17 19 18.5 10 20 2Z"
        fill="currentColor"
      />
      <path
        d="M20 40C22.5 40 25 42 25 45C25 49.5 22.5 52.5 20 54C17.5 52.5 15 49.5 15 45C15 42 17.5 40 20 40Z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  )
}

function IconSun({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M6.34 17.66l-1.41 1.41" />
      <path d="M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function IconMoon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function IconCalendar({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconMusic({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function IconSettings({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconChevronLeft({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function IconChevronRight({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function IconSearch({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconUser({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconSparkles({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17z" />
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75L19 3z" />
    </svg>
  )
}

function IconCheck({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconX({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconArrowUp({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function IconArrowDown({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
}

function IconTrash({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

function IconPlus({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconLoader({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function IconFileText({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconEdit({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function IconPlay({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function IconMic({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function IconGuitar({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.11 14.89A4 4 0 1 0 9.11 12.89" />
      <line x1="13.5" y1="10.5" x2="20" y2="4" />
      <line x1="17" y1="4" x2="20" y2="4" />
      <line x1="20" y1="4" x2="20" y2="7" />
    </svg>
  )
}

function IconDrum({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="13" rx="9" ry="4" />
      <path d="M3 13v5a9 4 0 0 0 18 0v-5" />
      <line x1="8" y1="3" x2="5" y2="9" />
      <line x1="16" y1="3" x2="19" y2="9" />
    </svg>
  )
}

function IconPiano({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="7" y1="4" x2="7" y2="12" />
      <line x1="12" y1="4" x2="12" y2="12" />
      <line x1="17" y1="4" x2="17" y2="12" />
    </svg>
  )
}

function IconLogOut({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function IconPhone({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function IconMail({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

const INST_ICON: Record<Instrument, ReactNode> = {
  guitarra: <IconGuitar size={13} />,
  piano: <IconPiano size={13} />,
  bajo: <IconGuitar size={13} />,
  voz: <IconMic size={13} />,
  batería: <IconDrum size={13} />,
}

// ─── THEME TOGGLE ─────────────────────────────────────────────────────────────

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg bg-surface-2 border border-border transition-colors active:scale-95 cursor-pointer"
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
    </button>
  )
}

// ─── BADGES & AVATAR ──────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Status, string> = {
  confirmado: 'bg-surface-2 text-fg border-border font-medium',
  pendiente: 'bg-surface-2 text-fg-muted border-border',
  rechazado: 'bg-surface-2 text-fg-subtle border-border opacity-70',
}
const STATUS_LABELS: Record<Status, string> = {
  confirmado: 'Confirmado',
  pendiente: 'Pendiente',
  rechazado: 'Rechazado',
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function InstrumentChip({ instrument }: { instrument: Instrument }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-surface-2 text-fg-muted border border-border">
      <span className="text-fg-subtle">{INST_ICON[instrument]}</span>
      <span className="capitalize text-fg">{instrument}</span>
    </span>
  )
}

function RoleBadges({ role }: { role?: Role }) {
  if (role === 'both') {
    return (
      <div className="inline-flex items-center gap-1">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-2 text-fg border border-border">Músico</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-2 text-accent border border-border">Admin</span>
      </div>
    )
  }
  if (role === 'admin') {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-2 text-accent border border-border">Admin</span>
  }
  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface-2 text-fg-muted border border-border">Músico</span>
}

function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base font-bold',
    xl: 'w-16 h-16 text-xl font-bold',
  }
  return (
    <div className={`${sizes[size]} bg-surface-3 text-fg border border-border rounded-2xl flex items-center justify-center font-display tracking-wider flex-shrink-0 shadow-xs`}>
      {initials}
    </div>
  )
}

const TEMPO_STYLES: Record<string, string> = {
  rápida: 'bg-surface-2 text-fg border-border',
  media: 'bg-surface-2 text-fg-muted border-border',
  lenta: 'bg-surface-2 text-fg-subtle border-border',
}

// ─── ADD SONG MODAL ───────────────────────────────────────────────────────────

function AddSongModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (song: Omit<Song, 'id'>) => void
}) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [key, setKey] = useState('G')
  const [tempo, setTempo] = useState<'rápida' | 'media' | 'lenta'>('media')
  const [tagsInput, setTagsInput] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [lyricsRaw, setLyricsRaw] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !artist.trim()) return

    const tags = tagsInput
      .split(/[,/]/)
      .map(t => t.trim())
      .filter(Boolean)

    const parsedLyrics = parseChordProText(lyricsRaw)

    onSave({
      title: title.trim(),
      artist: artist.trim(),
      key: key.trim(),
      tempo,
      tags: tags.length > 0 ? tags : ['Alabanza'],
      lyrics: parsedLyrics,
      media_url: mediaUrl.trim() || undefined,
      is_classic: false,
    })

    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-3xl flex flex-col max-h-[90vh] bg-surface border border-border shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex-shrink-0 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl text-fg tracking-wide">AGREGAR NUEVA CANCIÓN</h3>
            <p className="text-fg-muted text-xs">Registra una canción en el repertorio oficial</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg transition-colors cursor-pointer">
            <IconX size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Título de la Canción *</label>
              <input
                type="text"
                required
                placeholder="Ej: Grande es tu Fidelidad"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Artista / Autor *</label>
              <input
                type="text"
                required
                placeholder="Ej: Marcos Witt / Elevation"
                value={artist}
                onChange={e => setArtist(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Tono Original *</label>
              <select
                value={key}
                onChange={e => setKey(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent cursor-pointer"
              >
                {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'].map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Tempo *</label>
              <select
                value={tempo}
                onChange={e => setTempo(e.target.value as 'rápida' | 'media' | 'lenta')}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent cursor-pointer capitalize"
              >
                <option value="lenta">Lenta (Adoración)</option>
                <option value="media">Media</option>
                <option value="rápida">Rápida (Alabanza)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Categorías / Tags</label>
              <input
                type="text"
                placeholder="Ej: Consagración, Gracia"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Enlace de Audio o Video (YouTube)</label>
            <input
              type="url"
              placeholder="https://music.youtube.com/watch?v=..."
              value={mediaUrl}
              onChange={e => setMediaUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Letra y Acordes en ChordPro</label>
              <span className="text-[11px] text-fg-subtle">Formato: [G]Letra o por secciones</span>
            </div>
            <textarea
              rows={8}
              placeholder={`Verso 1\n[G]Tu fidelidad es [D]grande\n[Em]Tu fidelidad incom[C]parable es\n\nCoro\n[G]Grande es tu [D]fidelidad...`}
              value={lyricsRaw}
              onChange={e => setLyricsRaw(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border font-mono text-base md:text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl text-fg-muted border border-border text-sm font-semibold hover:text-fg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3.5 rounded-xl text-accent-fg bg-accent hover:bg-accent-hover text-sm font-semibold shadow-xs cursor-pointer"
            >
              Guardar Canción
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── EDIT SONG MODAL ──────────────────────────────────────────────────────────

function EditSongModal({
  song,
  onClose,
  onSave,
}: {
  song: Song
  onClose: () => void
  onSave: (updates: Partial<Song>) => void
}) {
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist)
  const [key, setKey] = useState(song.key)
  const [tempo, setTempo] = useState<'rápida' | 'media' | 'lenta'>(song.tempo)
  const [tagsInput, setTagsInput] = useState(song.tags.join(', '))
  const [mediaUrl, setMediaUrl] = useState(song.media_url || '')
  const [lyricsRaw, setLyricsRaw] = useState(formatLyricsToChordPro(song.lyrics))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !artist.trim()) return

    const tags = tagsInput
      .split(/[,/]/)
      .map(t => t.trim())
      .filter(Boolean)

    const parsedLyrics = parseChordProText(lyricsRaw)

    onSave({
      title: title.trim(),
      artist: artist.trim(),
      key: key.trim(),
      tempo,
      tags: tags.length > 0 ? tags : ['Alabanza'],
      lyrics: parsedLyrics,
      media_url: mediaUrl.trim() || undefined,
    })

    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-3xl flex flex-col max-h-[90vh] bg-surface border border-border shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex-shrink-0 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl text-fg tracking-wide">EDITAR NOTAS Y ACORDES (CHORDPRO)</h3>
            <p className="text-fg-muted text-xs">Actualiza la partitura, acordes o información de la canción</p>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg transition-colors cursor-pointer">
            <IconX size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Título *</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Artista / Autor *</label>
              <input
                type="text"
                required
                value={artist}
                onChange={e => setArtist(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Tono Original</label>
              <select
                value={key}
                onChange={e => setKey(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent cursor-pointer"
              >
                {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'].map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Tempo</label>
              <select
                value={tempo}
                onChange={e => setTempo(e.target.value as 'rápida' | 'media' | 'lenta')}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent cursor-pointer capitalize"
              >
                <option value="lenta">Lenta</option>
                <option value="media">Media</option>
                <option value="rápida">Rápida</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Enlace YouTube</label>
            <input
              type="url"
              value={mediaUrl}
              onChange={e => setMediaUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Letra y Acordes en ChordPro</label>
              <span className="text-[11px] text-fg-subtle">Inserta acordes entre corchetes ej: [G]Subo mis [D]manos</span>
            </div>
            <textarea
              rows={12}
              value={lyricsRaw}
              onChange={e => setLyricsRaw(e.target.value)}
              placeholder={`Verso 1\n[G]Tu fidelidad es [D]grande\n[Em]Tu fidelidad incom[C]parable es\n\nCoro\n[G]Grande es tu [D]fidelidad`}
              className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border font-mono text-base md:text-sm focus:outline-none focus:border-accent leading-relaxed"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl text-fg-muted border border-border text-sm font-semibold hover:text-fg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3.5 rounded-xl text-accent-fg bg-accent hover:bg-accent-hover text-sm font-semibold shadow-xs cursor-pointer"
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── DESKTOP HEADER & BOTTOM NAV ──────────────────────────────────────────────

function DesktopHeader({
  screen,
  setScreen,
  currentUser,
  theme,
  onToggleTheme,
}: {
  screen: Screen
  setScreen: (s: Screen) => void
  currentUser: Musician
  theme: Theme
  onToggleTheme: () => void
}) {
  const isAdm = hasRole(currentUser, 'admin')

  const isActive = (s: Screen) =>
    (['calendar', 'day-detail'].includes(screen) && s === 'calendar') ||
    (['library', 'song'].includes(screen) && s === 'library') ||
    (screen === 'admin' && s === 'admin') ||
    (screen === 'profile' && s === 'profile')

  const navItems = [
    { id: 'calendar' as Screen, label: 'Inicio', icon: <IconCalendar size={18} /> },
    { id: 'library' as Screen, label: 'Repertorio', icon: <IconMusic size={18} /> },
    ...(isAdm ? [{ id: 'admin' as Screen, label: 'Admin', icon: <IconSettings size={18} /> }] : []),
  ]

  return (
    <header className="hidden md:block sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-border transition-colors">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <button onClick={() => setScreen('calendar')} className="flex items-center gap-3 cursor-pointer">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-2 border border-border text-accent">
              <IconFlame size={20} />
            </div>
            <div>
              <span className="font-display text-lg tracking-wider text-fg leading-none block">IBAMI</span>
              <span className="text-[10px] text-fg-muted uppercase tracking-widest block font-medium">Ministerio de Alabanza</span>
            </div>
          </button>

          <nav className="flex items-center gap-1">
            {navItems.map(item => {
              const active = isActive(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => setScreen(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-accent text-accent-fg shadow-xs'
                      : 'text-fg-muted hover:text-fg hover:bg-surface-2'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            onClick={() => setScreen('profile')}
            className={`flex items-center gap-2.5 pl-3 border-l border-border hover:opacity-80 transition cursor-pointer ${
              screen === 'profile' ? 'opacity-100 font-semibold' : ''
            }`}
          >
            <Avatar initials={currentUser.initials} size="sm" />
            <div className="text-left hidden lg:block">
              <p className="text-xs font-semibold text-fg leading-tight">{currentUser.name}</p>
              <div className="mt-0.5"><RoleBadges role={currentUser.role} /></div>
            </div>
          </button>
        </div>
      </div>
    </header>
  )
}

function BottomNav({ screen, setScreen, currentUser }: { screen: Screen; setScreen: (s: Screen) => void; currentUser: Musician }) {
  const isAdm = hasRole(currentUser, 'admin')

  const isActive = (s: Screen) =>
    (['calendar', 'day-detail'].includes(screen) && s === 'calendar') ||
    (['library', 'song'].includes(screen) && s === 'library') ||
    (screen === 'admin' && s === 'admin') ||
    (screen === 'profile' && s === 'profile')

  const tabs = [
    { id: 'calendar' as Screen, label: 'Inicio', icon: <IconCalendar /> },
    { id: 'library' as Screen, label: 'Repertorio', icon: <IconMusic /> },
    ...(isAdm ? [{ id: 'admin' as Screen, label: 'Admin', icon: <IconSettings /> }] : []),
    { id: 'profile' as Screen, label: 'Perfil', icon: <IconUser /> },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 max-w-lg mx-auto z-50 bg-surface/95 backdrop-blur-md border-t border-border">
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const active = isActive(tab.id as Screen)
          return (
            <button
              key={tab.id}
              onClick={() => setScreen(tab.id as Screen)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors cursor-pointer ${
                active ? 'text-accent font-semibold' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {tab.icon}
              <span className="text-[10px] tracking-wide">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ─── LOGIN SCREEN (SIN CONTRASEÑA, POR CORREO O CELULAR) ──────────────────────

function LoginScreen({
  onLogin,
  musicians,
  theme,
  onToggleTheme,
}: {
  onLogin: (musician: Musician) => void
  musicians: Musician[]
  theme: Theme
  onToggleTheme: () => void
}) {
  const [identifier, setIdentifier] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    const trimmed = identifier.trim()
    if (!trimmed) {
      setErrorMsg('Por favor ingresa tu correo o número de celular.')
      return
    }

    const matched = findMusicianByIdentifier(trimmed, musicians)

    if (matched) {
      onLogin(matched)
    } else {
      if (musicians.length === 0) {
        // Si no hay ningún músico en la base de datos, crear perfil de inicio
        const firstAdmin: Musician = {
          id: `m-${Date.now()}`,
          name: trimmed.includes('@') ? trimmed.split('@')[0] : 'Líder de Alabanza',
          instrument: 'guitarra',
          initials: 'LA',
          email: trimmed.includes('@') ? trimmed : 'pastor@ibami.org',
          phone: !trimmed.includes('@') ? trimmed : '+57 300 000 0000',
          role: 'both',
        }
        onLogin(firstAdmin)
      } else {
        setErrorMsg('No encontramos ningún integrante registrado con ese correo o celular. Solicita a un líder o administrador que te registre en el equipo.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-surface border border-border rounded-3xl p-8 shadow-xl relative">
        <div className="absolute top-6 right-6">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <div className="flex flex-col items-center gap-3 text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-surface-2 border border-border text-accent shadow-sm">
            <IconFlame size={36} />
          </div>
          <div>
            <h1 className="font-display text-4xl text-fg tracking-wider">IBAMI</h1>
            <p className="text-fg-muted text-xs uppercase tracking-widest font-medium mt-0.5">Ministerio de Alabanza</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-fg-muted uppercase tracking-widest">
              Correo o número de celular
            </label>
            <input
              type="text"
              required
              placeholder="Ej: carlos@ibami.org o 3101234567"
              value={identifier}
              onChange={e => { setIdentifier(e.target.value); setErrorMsg(''); }}
              className="w-full px-4 py-3.5 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent transition"
            />
            <p className="text-[11px] text-fg-subtle">
              Ingresa el correo o celular registrado por el líder de alabanza.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-surface-2 border border-accent/40 text-accent text-xs leading-relaxed">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 mt-2 rounded-xl text-accent-fg bg-accent hover:bg-accent-hover font-semibold tracking-wide active:scale-[0.99] transition-all text-sm shadow-sm cursor-pointer"
          >
            Ingresar al Ministerio
          </button>
        </form>

        {/* Sugerencias de acceso para pruebas */}
        {musicians.length > 0 && (
          <div className="mt-8 pt-6 border-t border-border flex flex-col gap-2 text-center">
            <p className="text-[11px] text-fg-muted font-medium">Acceso rápido con integrantes registrados:</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {musicians.slice(0, 3).map(m => (
                <button
                  key={m.id}
                  onClick={() => onLogin(m)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-fg border border-border transition cursor-pointer"
                >
                  {m.name} {hasRole(m, 'admin') ? '(Admin)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PROFILE SCREEN (CON MULTI-ROL Y EDICIÓN) ──────────────────────────────────

function ProfileScreen({
  musician,
  onUpdateMusician,
  onLogout,
  events,
  songs,
  onSelectEvent,
  theme,
  onToggleTheme,
}: {
  musician: Musician
  onUpdateMusician: (updates: Partial<Musician>) => void
  onLogout: () => void
  events: ServiceEvent[]
  songs: Song[]
  onSelectEvent: (date: string) => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(musician.name)
  const [instrument, setInstrument] = useState<Instrument>(musician.instrument)
  const [email, setEmail] = useState(musician.email)
  const [phone, setPhone] = useState(musician.phone || '')
  const [isMusicianRole, setIsMusicianRole] = useState(hasRole(musician, 'musician'))
  const [isAdminRole, setIsAdminRole] = useState(hasRole(musician, 'admin'))

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const computedRole: Role = isMusicianRole && isAdminRole ? 'both' : isAdminRole ? 'admin' : 'musician'
    onUpdateMusician({
      name: name.trim(),
      instrument,
      email: email.trim(),
      phone: phone.trim(),
      role: computedRole,
    })
    setIsEditing(false)
  }

  const assignedEvents = events.filter(e => e.roster.some(r => r.mid === musician.id))

  return (
    <div className="min-h-screen bg-bg text-fg pb-12">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 pt-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl text-fg tracking-wide">MI PERFIL</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              onClick={onLogout}
              className="px-3.5 py-2 rounded-xl text-fg-muted hover:text-accent border border-border bg-surface text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <IconLogOut size={14} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Tarjeta de Información Principal */}
          <div className="md:col-span-5 bg-surface border border-border rounded-3xl p-6 shadow-xs flex flex-col items-center text-center">
            <div className="mb-4">
              <Avatar initials={musician.initials} size="xl" />
            </div>

            <h2 className="font-display text-2xl text-fg tracking-wide">{musician.name}</h2>
            <div className="flex items-center gap-2 mt-2">
              <InstrumentChip instrument={musician.instrument} />
              <RoleBadges role={musician.role} />
            </div>

            <div className="w-full flex flex-col gap-2.5 mt-6 pt-6 border-t border-border text-left text-xs">
              <div className="flex items-center gap-2.5 text-fg-muted">
                <IconMail size={14} />
                <span className="truncate text-fg">{musician.email || 'Sin correo'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-fg-muted">
                <IconPhone size={14} />
                <span className="text-fg">{musician.phone || 'Sin celular registrado'}</span>
              </div>
            </div>

            <button
              onClick={() => setIsEditing(true)}
              className="w-full mt-6 py-3 rounded-xl text-fg bg-surface-2 hover:bg-surface-3 border border-border font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <IconEdit size={14} />
              Editar Información
            </button>

            {/* Alternar Permisos de Administrador al Instante */}
            <div className="w-full mt-3 p-3.5 rounded-2xl bg-surface-2 border border-border flex items-center justify-between">
              <div className="text-left">
                <p className="text-xs font-semibold text-fg">Acceso de Administrador</p>
                <p className="text-[10px] text-fg-muted">
                  {hasRole(musician, 'admin') ? 'Activo (Panel habilitado)' : 'Desactivado (Solo músico)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const currentIsAdmin = hasRole(musician, 'admin')
                  const newRole: Role = currentIsAdmin ? 'musician' : 'both'
                  onUpdateMusician({ role: newRole })
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                  hasRole(musician, 'admin')
                    ? 'bg-surface text-fg-muted border-border hover:text-accent'
                    : 'bg-accent text-accent-fg border-accent shadow-xs'
                }`}
              >
                {hasRole(musician, 'admin') ? 'Quitar Admin' : 'Hacerme Admin'}
              </button>
            </div>
          </div>

          {/* Columna Derecha: Próximos Servicios Asignados */}
          <div className="md:col-span-7 flex flex-col gap-4">
            <h3 className="font-display text-xl text-fg tracking-wide">MIS SERVICIOS ASIGNADOS</h3>
            {assignedEvents.length === 0 ? (
              <div className="bg-surface border border-border rounded-3xl p-8 text-center text-fg-muted text-sm">
                No tienes servicios asignados programados actualmente.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {assignedEvents.map(ev => {
                  const entry = ev.roster.find(r => r.mid === musician.id)
                  const date = new Date(ev.date + 'T12:00:00')
                  return (
                    <button
                      key={ev.date}
                      onClick={() => onSelectEvent(ev.date)}
                      className="bg-surface border border-border hover:border-border-hover rounded-3xl p-5 flex items-center justify-between text-left transition shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center bg-surface-2 border border-border text-fg flex-shrink-0">
                          <span className="text-sm font-bold leading-none">{date.toLocaleDateString('es', { day: '2-digit' })}</span>
                          <span className="text-[10px] uppercase leading-none mt-0.5 opacity-80">{date.toLocaleDateString('es', { month: 'short' })}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-fg text-sm">{ev.label}</p>
                          <p className="text-xs text-fg-muted">{ev.setlist.length} canciones programadas</p>
                        </div>
                      </div>
                      {entry && <StatusBadge status={entry.status} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal para Editar Perfil */}
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setIsEditing(false)} />
            <div className="relative w-full max-w-md rounded-3xl bg-surface border border-border p-6 shadow-2xl">
              <h3 className="font-display text-xl text-fg tracking-wide mb-4">EDITAR PERFIL</h3>
              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-fg-muted uppercase">Nombre</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-fg-muted uppercase">Instrumento Principal</label>
                  <select
                    value={instrument}
                    onChange={e => setInstrument(e.target.value as Instrument)}
                    className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent cursor-pointer capitalize"
                  >
                    {['guitarra', 'piano', 'bajo', 'voz', 'batería'].map(inst => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-fg-muted uppercase">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-fg-muted uppercase">Teléfono / Celular (WhatsApp)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+57 300 000 0000"
                    className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Roles Checkboxes */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-fg-muted uppercase">Roles / Permisos</label>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-2 border border-border flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isMusicianRole}
                        onChange={e => {
                          if (!e.target.checked && !isAdminRole) return
                          setIsMusicianRole(e.target.checked)
                        }}
                        className="w-4 h-4 rounded text-accent accent-accent cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-fg">Músico</span>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-2 border border-border flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAdminRole}
                        onChange={e => {
                          if (!e.target.checked && !isMusicianRole) return
                          setIsAdminRole(e.target.checked)
                        }}
                        className="w-4 h-4 rounded text-accent accent-accent cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-fg">Admin</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-3 rounded-xl text-fg-muted border border-border text-sm font-semibold hover:text-fg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-xl text-accent-fg bg-accent hover:bg-accent-hover text-sm font-semibold shadow-xs cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CALENDAR SCREEN ──────────────────────────────────────────────────────────

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function CalendarScreen({
  events,
  musicians,
  onDaySelect,
  currentUser,
  theme,
  onToggleTheme,
}: {
  events: ServiceEvent[]
  musicians: Musician[]
  onDaySelect: (date: string) => void
  currentUser: Musician
  theme: Theme
  onToggleTheme: () => void
}) {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(7)

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = '2026-08-16'

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }

  return (
    <div className="min-h-screen bg-bg text-fg pb-12">
      {/* Mobile Top bar */}
      <div className="md:hidden px-5 pt-10 pb-5 bg-surface-2 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-fg-muted text-xs font-medium tracking-widest uppercase">IBAMI</p>
            <h1 className="font-display text-2xl text-fg tracking-wide">MINISTERIO</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <Avatar initials={currentUser.initials} size="sm" />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Columna Izquierda: Calendario */}
          <div className="lg:col-span-7 bg-surface border border-border rounded-3xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
              <button onClick={prevMonth} className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg bg-surface-2 border border-border transition-colors cursor-pointer">
                <IconChevronLeft />
              </button>
              <div className="text-center">
                <h2 className="font-display text-2xl text-fg tracking-wide">{MONTH_NAMES[month].toUpperCase()}</h2>
                <p className="text-fg-muted text-xs">{year}</p>
              </div>
              <button onClick={nextMonth} className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg bg-surface-2 border border-border transition-colors cursor-pointer">
                <IconChevronRight />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-3">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-fg-muted uppercase tracking-wider py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5 md:gap-2">
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="min-h-[48px]" />
                const ds = dateStr(day)
                const event = events.find(e => e.date === ds)
                const isToday = ds === today
                const confirmed = event?.roster.filter(r => r.status === 'confirmado').length ?? 0
                const total = event?.roster.length ?? 0

                return (
                  <button
                    key={i}
                    onClick={() => event && onDaySelect(ds)}
                    className={`min-h-[56px] md:min-h-[64px] flex flex-col items-center justify-start p-1.5 rounded-2xl transition-all relative border ${
                      event
                        ? 'border-border hover:border-accent bg-surface-2 cursor-pointer'
                        : 'border-transparent cursor-default'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full text-xs md:text-sm font-medium transition-colors
                        ${isToday ? 'bg-accent text-accent-fg font-bold shadow-xs' : event ? 'text-fg font-semibold' : 'text-fg-subtle opacity-40'}`}
                    >
                      {day}
                    </span>
                    {event && (
                      <div className="flex flex-col items-center gap-0.5 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${event.type === 'domingo' ? 'bg-accent' : 'bg-fg-muted'}`} />
                        <span className="text-[9px] text-fg-muted font-medium hidden md:inline">{confirmed}/{total}</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-6 mt-6 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-accent" />
                <span className="text-xs text-fg-muted">Servicio Dominical</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-fg-muted" />
                <span className="text-xs text-fg-muted">Servicio Entre semana</span>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Próximos Servicios */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <h3 className="font-display text-xl text-fg tracking-wide">PRÓXIMOS SERVICIOS</h3>
            <div className="flex flex-col gap-3">
              {events.filter(e => e.date >= today).slice(0, 4).map(ev => {
                const date = new Date(ev.date + 'T12:00:00')
                const confirmed = ev.roster.filter(r => r.status === 'confirmado').length
                return (
                  <button
                    key={ev.date}
                    onClick={() => onDaySelect(ev.date)}
                    className="rounded-3xl p-5 flex items-center gap-4 text-left active:scale-[0.99] transition-all bg-surface border border-border hover:border-border-hover shadow-xs cursor-pointer"
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 border border-border"
                      style={{ background: ev.type === 'domingo' ? 'var(--accent)' : 'var(--surface-3)', color: ev.type === 'domingo' ? 'var(--accent-fg)' : 'var(--fg)' }}
                    >
                      <span className="text-sm font-bold leading-none">{date.toLocaleDateString('es', { day: '2-digit' })}</span>
                      <span className="text-[10px] uppercase tracking-wide leading-none mt-0.5 opacity-90">{date.toLocaleDateString('es', { month: 'short' })}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-fg text-sm">{ev.label}</p>
                      <p className="text-xs text-fg-muted mt-0.5">{ev.setlist.length} canciones · {confirmed}/{ev.roster.length} confirmados</p>
                    </div>
                    <div className="flex -space-x-2">
                      {ev.roster.slice(0, 3).map(r => {
                        const m = musicians.find(x => x.id === r.mid)
                        return m ? (
                          <div key={r.mid} className="w-7 h-7 rounded-full bg-surface-3 text-fg text-[9px] font-bold flex items-center justify-center border-2 border-surface">
                            {m.initials}
                          </div>
                        ) : null
                      })}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── DAY DETAIL SCREEN ────────────────────────────────────────────────────────

function DayDetailScreen({
  event,
  roster,
  songs,
  musicians,
  currentUser,
  onBack,
  onSongSelect,
  onAttendance,
  theme,
  onToggleTheme,
}: {
  event: ServiceEvent
  roster: { mid: string; status: Status }[]
  songs: Song[]
  musicians: Musician[]
  currentUser: Musician
  onBack: () => void
  onSongSelect: (id: string) => void
  onAttendance: (mid: string, status: Status) => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const date = new Date(event.date + 'T12:00:00')
  const instruments: Instrument[] = ['voz', 'guitarra', 'piano', 'bajo', 'batería']
  const myEntry = roster.find(r => r.mid === currentUser.id)

  return (
    <div className="min-h-screen bg-bg text-fg pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1.5 text-fg-muted text-sm hover:text-fg transition-colors cursor-pointer">
            <IconChevronLeft size={16} />
            <span>Volver al Calendario</span>
          </button>
          <div className="md:hidden">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-3xl p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div>
            <p className="text-fg-muted text-xs tracking-widest uppercase font-medium">
              {date.toLocaleDateString('es', { weekday: 'long' })}
            </p>
            <h1 className="font-display text-3xl md:text-4xl text-fg mt-0.5 tracking-wide">
              {date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}
            </h1>
            <p className="text-fg-muted text-sm mt-1">{event.label}</p>
          </div>
          <span className="self-start md:self-auto text-xs font-semibold px-3.5 py-1.5 rounded-full bg-surface-2 text-fg border border-border">
            {event.type === 'domingo' ? 'Servicio Dominical' : 'Servicio Entre semana'}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Columna Izquierda: Asistencia y Setlist */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {myEntry && (
              <div className="rounded-3xl p-5 bg-surface border border-border shadow-xs">
                <p className="text-sm font-semibold text-fg mb-1">Tu asistencia al servicio</p>
                <p className="text-xs text-fg-muted mb-4">{"¿Puedes servir y tocar en este servicio?"}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => onAttendance(currentUser.id, 'confirmado')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      myEntry.status === 'confirmado'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'bg-surface-2 text-fg border border-border hover:border-border-hover'
                    }`}
                  >
                    <IconCheck size={14} />
                    Confirmar
                  </button>
                  <button
                    onClick={() => onAttendance(currentUser.id, 'rechazado')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      myEntry.status === 'rechazado'
                        ? 'bg-surface-3 text-fg-muted border border-border font-bold'
                        : 'bg-surface-2 text-fg-subtle border border-border hover:border-border-hover'
                    }`}
                  >
                    <IconX size={14} />
                    No puedo
                  </button>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl text-fg tracking-wide">SETLIST DEL SERVICIO</h2>
                <span className="text-xs text-fg-muted">{event.setlist.length} canciones</span>
              </div>
              <div className="flex flex-col gap-3">
                {event.setlist.map((sid, idx) => {
                  const song = songs.find(s => s.id === sid)
                  if (!song) return null
                  return (
                    <button
                      key={sid}
                      onClick={() => onSongSelect(sid)}
                      className="rounded-2xl p-4 flex items-center gap-3.5 text-left active:scale-[0.99] transition-all w-full bg-surface border border-border hover:border-border-hover shadow-xs cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-surface-2 border border-border">
                        <span className="text-fg font-bold text-sm">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-fg text-sm">{song.title}</p>
                        <p className="text-xs text-fg-muted">{song.artist}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-bold text-fg bg-surface-2 px-2.5 py-0.5 rounded-md border border-border">{song.key}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border ${TEMPO_STYLES[song.tempo]}`}>{song.tempo}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Columna Derecha: Músicos Asignados */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <h2 className="font-display text-xl text-fg tracking-wide">EQUIPO ASIGNADO</h2>
            <div className="flex flex-col gap-3">
              {instruments.map(inst => {
                const entries = roster.filter(r => musicians.find(x => x.id === r.mid)?.instrument === inst)
                if (entries.length === 0) return null
                return (
                  <div key={inst} className="rounded-3xl p-5 bg-surface border border-border shadow-xs">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-fg-subtle">{INST_ICON[inst]}</span>
                      <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">{inst}</span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {entries.map(({ mid, status }) => {
                        const m = musicians.find(x => x.id === mid)
                        if (!m) return null
                        return (
                          <div key={mid} className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <Avatar initials={m.initials} size="sm" />
                              <span className="text-sm font-medium text-fg">{m.name}</span>
                            </div>
                            <StatusBadge status={status} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── LIBRARY SCREEN WITH COMPACT DROPDOWNS ────────────────────────────────────

function LibraryScreen({
  songs,
  onSongSelect,
  onAddNewSong,
  theme,
  onToggleTheme,
}: {
  songs: Song[]
  onSongSelect: (id: string) => void
  onAddNewSong: () => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const [query, setQuery] = useState('')
  const [tempoFilter, setTempoFilter] = useState<string>('all')
  const [keyFilter, setKeyFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')

  const allTags = Array.from(new Set(songs.flatMap(s => s.tags)))
    .filter(t => !['rápida', 'media', 'lenta'].includes(t))
    .sort()

  const allKeys = Array.from(new Set(songs.map(s => s.key))).sort()

  const filtered = useMemo(() => songs.filter(s => {
    const q = query.toLowerCase()
    if (q && !s.title.toLowerCase().includes(q) && !s.artist.toLowerCase().includes(q)) return false
    if (tempoFilter !== 'all' && s.tempo !== tempoFilter) return false
    if (keyFilter !== 'all' && s.key !== keyFilter) return false
    if (tagFilter !== 'all' && !s.tags.includes(tagFilter)) return false
    return true
  }), [songs, query, tempoFilter, keyFilter, tagFilter])

  const hasActiveFilters = tempoFilter !== 'all' || keyFilter !== 'all' || tagFilter !== 'all' || query.trim() !== ''

  function clearFilters() {
    setQuery('')
    setTempoFilter('all')
    setKeyFilter('all')
    setTagFilter('all')
  }

  return (
    <div className="min-h-screen bg-bg text-fg pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-6">
        {/* Cabecera del Repertorio */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-3xl text-fg tracking-wide">REPERTORIO OFICIAL</h1>
            <p className="text-xs text-fg-muted mt-0.5">
              {filtered.length} {filtered.length === 1 ? 'canción encontrada' : 'canciones registradas'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-72">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-muted">
                <IconSearch />
              </div>
              <input
                type="text"
                placeholder="Buscar por título o artista..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-fg bg-surface border border-border text-base md:text-sm placeholder:text-fg-subtle focus:outline-none focus:border-accent transition"
              />
            </div>
            <button
              onClick={onAddNewSong}
              className="px-4 py-2.5 rounded-xl bg-accent text-accent-fg hover:bg-accent-hover text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer flex-shrink-0"
            >
              <IconPlus size={14} />
              <span>Nueva Canción</span>
            </button>
            <div className="md:hidden">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
          </div>
        </div>

        {/* Filtros Desplegables Elegantes */}
        <div className="bg-surface border border-border rounded-2xl p-4 mb-6 shadow-xs flex flex-wrap items-center gap-3">
          {/* Desplegable Tempo */}
          <div className="flex-1 min-w-[140px]">
            <label className="text-[10px] font-bold text-fg-muted uppercase tracking-wider block mb-1">Tempo</label>
            <select
              value={tempoFilter}
              onChange={e => setTempoFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-base md:text-xs font-medium text-fg bg-surface-2 border border-border focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="all">Todos los tempos</option>
              <option value="lenta">Lenta (Adoración)</option>
              <option value="media">Media</option>
              <option value="rápida">Rápida (Alabanza)</option>
            </select>
          </div>

          {/* Desplegable Tonalidad */}
          <div className="flex-1 min-w-[130px]">
            <label className="text-[10px] font-bold text-fg-muted uppercase tracking-wider block mb-1">Tono Original</label>
            <select
              value={keyFilter}
              onChange={e => setKeyFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-base md:text-xs font-medium text-fg bg-surface-2 border border-border focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="all">Todos los tonos</option>
              {allKeys.map(k => (
                <option key={k} value={k}>Tono {k}</option>
              ))}
            </select>
          </div>

          {/* Desplegable Categoría / Temática */}
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] font-bold text-fg-muted uppercase tracking-wider block mb-1">Categoría</label>
            <select
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-base md:text-xs font-medium text-fg bg-surface-2 border border-border focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="all">Todas las categorías</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>

          {/* Botón Limpiar Filtros */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="self-end py-2 px-3 rounded-xl bg-surface-2 hover:bg-surface-3 text-accent text-xs font-semibold border border-border transition cursor-pointer flex items-center gap-1"
            >
              <IconX size={12} />
              Limpiar
            </button>
          )}
        </div>

        {/* Cuadrícula de Canciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(song => (
            <button
              key={song.id}
              onClick={() => onSongSelect(song.id)}
              className="rounded-3xl p-5 flex items-center gap-4 text-left active:scale-[0.99] transition-all bg-surface border border-border hover:border-border-hover shadow-xs cursor-pointer group"
            >
              {/* Badge con Tono y Primera Letra */}
              <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex flex-col items-center justify-center flex-shrink-0 group-hover:border-accent transition-colors shadow-xs">
                <span className="font-display text-fg font-bold text-base tracking-wide leading-none">{song.key}</span>
                <span className="text-[10px] text-fg-muted uppercase font-bold mt-0.5 leading-none opacity-80">{song.title.charAt(0)}</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-fg text-base leading-tight truncate">{song.title}</p>
                <p className="text-xs text-fg-muted mt-0.5 truncate">{song.artist}</p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium border ${TEMPO_STYLES[song.tempo]}`}>{song.tempo}</span>
                  {song.tags.slice(0, 2).map(t => (
                    <span key={t} className="text-[10px] px-2.5 py-0.5 rounded-full text-fg-muted bg-surface-2 border border-border capitalize truncate max-w-[120px]">{t}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── SONG VIEW SCREEN ─────────────────────────────────────────────────────────

const INSTRUMENTS_TABS = ['guitarra', 'piano', 'bajo'] as const

function SongViewScreen({
  song,
  onBack,
  onEdit,
  theme,
  onToggleTheme,
}: {
  song: Song
  onBack: () => void
  onEdit: () => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const [transpose, setTranspose] = useState(0)
  const [instTab, setInstTab] = useState<typeof INSTRUMENTS_TABS[number]>('guitarra')

  const displayKey = transposeChord(song.key, transpose)
  const transposedLyrics = song.lyrics.map(line => ({
    ...line,
    segments: line.segments.map(seg => ({
      ...seg,
      chord: seg.chord ? transposeChord(seg.chord, transpose) : undefined,
    })),
  }))

  function handleExportPDF() {
    generateSongPDF({
      title: song.title,
      artist: song.artist,
      key: displayKey,
      tempo: song.tempo,
      lyrics: transposedLyrics,
    })
  }

  return (
    <div className="min-h-screen bg-bg text-fg pb-12">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 pt-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1.5 text-fg-muted text-sm hover:text-fg transition-colors cursor-pointer">
            <IconChevronLeft size={16} />
            <span>Volver al Repertorio</span>
          </button>
          <div className="md:hidden">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-3xl p-6 md:p-8 mb-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6 pb-6 border-b border-border">
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl md:text-4xl text-fg leading-tight tracking-wide">{song.title.toUpperCase()}</h1>
              <p className="text-fg-muted text-base mt-1">{song.artist}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold px-4 py-1.5 rounded-xl text-accent-fg bg-accent shadow-xs">Tono {displayKey}</span>
              <span className={`text-xs font-medium px-3 py-1 rounded-full border ${TEMPO_STYLES[song.tempo]}`}>{song.tempo}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Controlador de Transposición */}
            <div className="flex items-center justify-between rounded-2xl p-4 bg-surface-2 border border-border">
              <span className="text-fg-muted text-xs font-semibold uppercase tracking-wider">Transposición</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTranspose(t => t - 1)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-fg font-bold bg-surface border border-border hover:bg-surface-3 active:scale-95 transition-all text-base cursor-pointer"
                >
                  −
                </button>
                <span className="text-fg font-display text-2xl w-10 text-center tracking-wide">
                  {transpose > 0 ? `+${transpose}` : transpose}
                </span>
                <button
                  onClick={() => setTranspose(t => t + 1)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-fg font-bold bg-surface border border-border hover:bg-surface-3 active:scale-95 transition-all text-base cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Selector de Instrumento */}
            <div className="flex gap-1 p-1 rounded-2xl bg-surface-2 border border-border items-center">
              {INSTRUMENTS_TABS.map(inst => (
                <button
                  key={inst}
                  onClick={() => setInstTab(inst)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    instTab === inst
                      ? 'bg-accent text-accent-fg shadow-xs'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {INST_ICON[inst]}
                  <span className="capitalize">{inst}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Partitura / Hoja de Acordes y Letras */}
        <div className="rounded-3xl p-6 md:p-10 font-mono text-sm md:text-base bg-surface border border-border shadow-xs leading-relaxed">
          {transposedLyrics.map((line, li) => (
            <div key={li} className={li > 0 ? 'mt-6' : ''}>
              {line.label && (
                <p className="font-body text-xs font-bold text-accent uppercase tracking-widest mb-2.5">{line.label}</p>
              )}
              <div className="flex flex-wrap">
                {line.segments.map((seg, si) => (
                  <div key={si} className="flex flex-col mr-1 mb-1.5">
                    <span className="text-accent font-bold text-xs md:text-sm leading-tight min-w-[1ch]">
                      {seg.chord ?? ' '}
                    </span>
                    <span className="text-fg text-sm md:text-base leading-snug whitespace-pre">{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Acciones de la canción */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
          <button
            onClick={onEdit}
            className="py-3.5 px-4 rounded-2xl text-fg bg-surface border border-border hover:bg-surface-2 font-semibold text-sm flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer shadow-xs"
          >
            <IconEdit size={16} />
            Editar Acordes (ChordPro)
          </button>
          <button
            onClick={handleExportPDF}
            className="py-3.5 px-4 rounded-2xl text-fg bg-surface border border-border hover:bg-surface-2 font-semibold text-sm flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer shadow-xs"
          >
            <IconFileText size={16} />
            Exportar PDF
          </button>
          {song.media_url ? (
            <a
              href={song.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3.5 px-4 rounded-2xl text-accent-fg bg-accent hover:bg-accent-hover font-semibold text-sm flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xs cursor-pointer"
            >
              <IconPlay size={14} />
              Ver video
            </a>
          ) : (
            <button
              onClick={onEdit}
              className="py-3.5 px-4 rounded-2xl text-fg-muted bg-surface-2 border border-border hover:text-fg font-semibold text-sm flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xs cursor-pointer"
            >
              <IconPlus size={13} />
              Agregar enlace video
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AI SUGGESTION MODAL ──────────────────────────────────────────────────────

function AISuggestionModal({
  onClose,
  onAddSong,
  currentSetlist,
  songs,
}: {
  onClose: () => void
  onAddSong(id: string): void
  currentSetlist: string[]
  songs: Song[]
}) {
  const [query, setQuery] = useState('')
  const [moment, setMoment] = useState<'todos' | 'Apertura' | 'Adoración' | 'Ministración'>('todos')
  const [limit, setLimit] = useState<number>(8)
  const [state, setState] = useState<AIState>('idle')
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [added, setAdded] = useState<string[]>([])

  async function handleGenerate() {
    if (!query.trim()) return
    setState('loading')
    try {
      const results = await suggestSongsWithGroq(query, currentSetlist, songs, moment, limit)
      setSuggestions(results)
      setState('results')
    } catch {
      setState('error')
    }
  }

  function handleAdd(id: string) {
    onAddSong(id)
    setAdded(prev => [...prev, id])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-3xl flex flex-col max-h-[85vh] bg-surface border border-border shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex-shrink-0 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent text-accent-fg flex items-center justify-center">
                <IconSparkles size={18} />
              </div>
              <div>
                <h3 className="font-display text-lg text-fg tracking-wide">RECOMENDADOR LITÚRGICO CON IA</h3>
                <p className="text-fg-muted text-xs">Selección musical bíblica y coherente con el sermón</p>
              </div>
            </div>
            <button onClick={onClose} className="text-fg-muted hover:text-fg transition-colors cursor-pointer">
              <IconX size={20} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej: Romanos 8:31, La gracia y el sacrificio en la cruz..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                className="flex-1 px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm placeholder:text-fg-subtle focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleGenerate}
                disabled={!query.trim() || state === 'loading'}
                className="px-5 py-3 rounded-xl text-accent-fg bg-accent hover:bg-accent-hover font-semibold text-sm flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                {state === 'loading' ? <IconLoader size={16} /> : <IconSparkles size={16} />}
                <span className="hidden sm:inline">Generar</span>
              </button>
            </div>

            {/* Opciones de filtro litúrgico */}
            <div className="grid grid-cols-2 gap-2">
              <select
                value={moment}
                onChange={e => setMoment(e.target.value as any)}
                className="px-3 py-2 rounded-xl text-base md:text-xs font-medium text-fg bg-surface-2 border border-border focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="todos">Todos los momentos del servicio</option>
                <option value="Apertura">Solo Apertura (Alabanza y júbilo)</option>
                <option value="Adoración">Solo Adoración (Pre-sermón)</option>
                <option value="Ministración">Solo Ministración (Llamado y respuesta)</option>
              </select>

              <select
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
                className="px-3 py-2 rounded-xl text-base md:text-xs font-medium text-fg bg-surface-2 border border-border focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value={6}>Mostrar 6 sugerencias</option>
                <option value={8}>Mostrar 8 sugerencias</option>
                <option value={10}>Mostrar 10 sugerencias</option>
                <option value={12}>Mostrar 12 sugerencias</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 pb-8">
          {state === 'idle' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-surface-2 border border-border text-fg-muted">
                <IconSparkles size={26} />
              </div>
              <p className="text-fg-muted text-sm text-center">
                Ingresa el pasaje bíblico, versículo o tema doctrinal<br />
                para recibir sugerencias litúrgicas estructuradas con justificación pastoral.
              </p>
            </div>
          )}

          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="text-accent">
                <IconLoader size={36} />
              </div>
              <div className="text-center">
                <p className="text-fg text-sm font-medium">Analizando repertorio y coherencia teológica...</p>
                <p className="text-fg-muted text-xs mt-1">Llama 3.3 clasificando canciones por momento pastoral</p>
              </div>
            </div>
          )}

          {state === 'results' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-fg-muted">{suggestions.length} sugerencias para <span className="text-fg font-semibold">{`"${query}"`}</span></p>
                <button
                  onClick={handleGenerate}
                  className="text-xs text-accent underline cursor-pointer font-medium"
                >
                  Regenerar opciones
                </button>
              </div>
              {suggestions.map(({ songId, reason, moment: sMoment }) => {
                const song = songs.find(s => s.id === songId)
                if (!song) return null
                const alreadyIn = currentSetlist.includes(songId)
                const justAdded = added.includes(songId)
                return (
                  <div key={songId} className="rounded-2xl p-4 bg-surface-2 border border-border shadow-xs">
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-surface border border-border text-fg flex items-center justify-center flex-shrink-0">
                        <span className="font-display font-bold text-lg tracking-wide">{song.key}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-fg text-sm leading-tight truncate">{song.title}</p>
                          {sMoment && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface text-accent border border-border flex-shrink-0">
                              {sMoment}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-fg-muted mt-0.5">{song.artist}</p>
                      </div>
                      {alreadyIn || justAdded ? (
                        <span className="text-xs font-semibold text-fg-muted bg-surface px-3 py-1.5 rounded-lg border border-border flex-shrink-0">
                          En setlist
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAdd(songId)}
                          className="text-xs font-semibold text-accent-fg bg-accent hover:bg-accent-hover px-3.5 py-1.5 rounded-lg flex items-center gap-1 flex-shrink-0 active:scale-95 transition-transform cursor-pointer"
                        >
                          <IconPlus size={12} />
                          Añadir
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-fg-muted mt-2.5 leading-relaxed pl-14">{reason}</p>
                  </div>
                )
              })}
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-fg-muted text-sm text-center">No se pudieron obtener sugerencias en este momento.</p>
              <button onClick={() => setState('idle')} className="text-xs text-accent underline cursor-pointer">Reintentar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SETLIST SONG PICKER (CON FILTROS Y PAGINACIÓN CONFIGURABLE) ───────────────

function SetlistSongPicker({
  songs,
  currentSetlist,
  onAddSong,
  onRemoveSong,
}: {
  songs: Song[]
  currentSetlist: string[]
  onAddSong: (id: string) => void
  onRemoveSong: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [tempoFilter, setTempoFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [pageSize, setPageSize] = useState<number>(5)
  const [currentPage, setCurrentPage] = useState(1)

  const allTags = Array.from(new Set(songs.flatMap(s => s.tags)))
    .filter(t => !['rápida', 'media', 'lenta'].includes(t))
    .sort()

  const filtered = useMemo(() => {
    return songs.filter(s => {
      const q = query.toLowerCase()
      if (q && !s.title.toLowerCase().includes(q) && !s.artist.toLowerCase().includes(q)) return false
      if (tempoFilter !== 'all' && s.tempo !== tempoFilter) return false
      if (tagFilter !== 'all' && !s.tags.includes(tagFilter)) return false
      return true
    })
  }, [songs, query, tempoFilter, tagFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedSongs = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  function handleFilterChange(type: 'tempo' | 'tag' | 'query', value: string) {
    if (type === 'tempo') setTempoFilter(value)
    if (type === 'tag') setTagFilter(value)
    if (type === 'query') setQuery(value)
    setCurrentPage(1)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-fg-muted uppercase tracking-widest">
          Buscador de Repertorio ({filtered.length} disponibles)
        </p>
        <div className="flex items-center gap-1 text-xs text-fg-muted">
          <span>Mostrar:</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="px-2 py-1 rounded-lg text-base md:text-xs font-semibold text-fg bg-surface-2 border border-border cursor-pointer"
          >
            <option value={5}>5 por página</option>
            <option value={10}>10 por página</option>
            <option value={15}>15 por página</option>
          </select>
        </div>
      </div>

      {/* Controles de búsqueda y filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-1 relative">
          <input
            type="text"
            placeholder="Buscar canción..."
            value={query}
            onChange={e => handleFilterChange('query', e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-base md:text-xs text-fg bg-surface border border-border focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <select
            value={tempoFilter}
            onChange={e => handleFilterChange('tempo', e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-base md:text-xs font-medium text-fg bg-surface border border-border focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="all">Todos los tempos</option>
            <option value="lenta">Lenta</option>
            <option value="media">Media</option>
            <option value="rápida">Rápida</option>
          </select>
        </div>
        <div>
          <select
            value={tagFilter}
            onChange={e => handleFilterChange('tag', e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-base md:text-xs font-medium text-fg bg-surface border border-border focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="all">Todas las categorías</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de canciones paginadas */}
      <div className="flex flex-col gap-2">
        {paginatedSongs.map(song => {
          const isAdded = currentSetlist.includes(song.id)
          return (
            <div
              key={song.id}
              className={`rounded-2xl p-3.5 flex items-center gap-3 border shadow-xs transition-colors ${
                isAdded ? 'bg-surface-2 border-border' : 'bg-surface border-border'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center flex-shrink-0">
                <span className="font-display text-fg font-bold text-sm">{song.key}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-fg truncate">{song.title}</p>
                <p className="text-xs text-fg-muted truncate">{song.artist} · <span className="capitalize">{song.tempo}</span></p>
              </div>
              {isAdded ? (
                <button
                  onClick={() => onRemoveSong(song.id)}
                  className="text-xs font-semibold text-fg-muted hover:text-accent bg-surface px-3 py-1.5 rounded-xl border border-border transition cursor-pointer flex-shrink-0"
                >
                  Quitar
                </button>
              ) : (
                <button
                  onClick={() => onAddSong(song.id)}
                  className="text-xs font-semibold text-accent-fg bg-accent hover:bg-accent-hover px-3.5 py-1.5 rounded-xl active:scale-95 transition-transform flex-shrink-0 flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <IconPlus size={12} />
                  Añadir
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Paginador */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-border bg-surface text-fg disabled:opacity-40 transition cursor-pointer flex items-center gap-1"
        >
          <IconChevronLeft size={14} />
          Anterior
        </button>
        <span className="text-xs text-fg-muted">
          Página <strong className="text-fg">{safePage}</strong> de {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-border bg-surface text-fg disabled:opacity-40 transition cursor-pointer flex items-center gap-1"
        >
          Siguiente
          <IconChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── ADMIN SCREEN (CON GESTIÓN MULTI-ROL Y PROGRAMACIÓN) ─────────────────────────

type AdminTab = 'usuarios' | 'programación' | 'setlist'

function AdminScreen({
  events,
  musicians,
  songs,
  onDaySelect,
  adminSetlist,
  setAdminSetlist,
  onAddMusician,
  onEditMusician,
  onDeleteMusician,
  onAddService,
  onEditService,
  onDeleteService,
  onAddNewSong,
  theme,
  onToggleTheme,
}: {
  events: ServiceEvent[]
  musicians: Musician[]
  songs: Song[]
  onDaySelect: (date: string) => void
  adminSetlist: string[]
  setAdminSetlist: (sl: string[]) => void
  onAddMusician: (m: { name: string; instrument: Instrument; email: string; phone?: string; role?: Role }) => void
  onEditMusician: (id: string, updates: Partial<Musician>) => void
  onDeleteMusician: (id: string) => void
  onAddService: (ev: ServiceEvent) => void
  onEditService: (date: string, updates: Partial<ServiceEvent>) => void
  onDeleteService: (date: string) => void
  onAddNewSong: () => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const [tab, setTab] = useState<AdminTab>('usuarios')
  const [selectedAdminDate, setSelectedAdminDate] = useState('2026-08-16')
  const [aiModalOpen, setAiModalOpen] = useState(false)

  // Estado para gestión de músicos
  const [musicianModal, setMusicianModal] = useState<{ mode: 'create' | 'edit'; musician?: Musician } | null>(null)
  const [musicianName, setMusicianName] = useState('')
  const [musicianInst, setMusicianInst] = useState<Instrument>('guitarra')
  const [musicianEmail, setMusicianEmail] = useState('')
  const [musicianPhone, setMusicianPhone] = useState('')
  const [musicianIsMusician, setMusicianIsMusician] = useState(true)
  const [musicianIsAdmin, setMusicianIsAdmin] = useState(false)

  // Estado para gestión de servicios
  const [serviceModal, setServiceModal] = useState<{ mode: 'create' | 'edit'; event?: ServiceEvent } | null>(null)
  const [serviceDate, setServiceDate] = useState('')
  const [serviceType, setServiceType] = useState<'domingo' | 'midweek'>('domingo')
  const [serviceLabel, setServiceLabel] = useState('')
  const [serviceRosterMids, setServiceRosterMids] = useState<string[]>([])

  const event = events.find(e => e.date === selectedAdminDate)

  function openCreateMusician() {
    setMusicianName('')
    setMusicianInst('guitarra')
    setMusicianEmail('')
    setMusicianPhone('')
    setMusicianIsMusician(true)
    setMusicianIsAdmin(false)
    setMusicianModal({ mode: 'create' })
  }

  function openEditMusician(m: Musician) {
    setMusicianName(m.name)
    setMusicianInst(m.instrument)
    setMusicianEmail(m.email)
    setMusicianPhone(m.phone || '')
    setMusicianIsMusician(hasRole(m, 'musician'))
    setMusicianIsAdmin(hasRole(m, 'admin'))
    setMusicianModal({ mode: 'edit', musician: m })
  }

  function handleSaveMusician(e: React.FormEvent) {
    e.preventDefault()
    if (!musicianName.trim()) return

    const computedRole: Role = musicianIsMusician && musicianIsAdmin
      ? 'both'
      : musicianIsAdmin
      ? 'admin'
      : 'musician'

    if (musicianModal?.mode === 'create') {
      onAddMusician({
        name: musicianName.trim(),
        instrument: musicianInst,
        email: musicianEmail.trim() || `${musicianName.toLowerCase().replace(/\s+/g, '.')}@ibami.org`,
        phone: musicianPhone.trim(),
        role: computedRole,
      })
    } else if (musicianModal?.mode === 'edit' && musicianModal.musician) {
      onEditMusician(musicianModal.musician.id, {
        name: musicianName.trim(),
        instrument: musicianInst,
        email: musicianEmail.trim(),
        phone: musicianPhone.trim(),
        role: computedRole,
      })
    }
    setMusicianModal(null)
  }

  function openCreateService() {
    setServiceDate(new Date().toISOString().split('T')[0])
    setServiceType('domingo')
    setServiceLabel('Servicio Dominical')
    setServiceRosterMids((musicians || []).slice(0, 4).map(m => m.id))
    setServiceModal({ mode: 'create' })
  }

  function openEditService(ev: ServiceEvent) {
    setServiceDate(ev.date)
    setServiceType(ev.type)
    setServiceLabel(ev.label)
    setServiceRosterMids(ev.roster.map(r => r.mid))
    setServiceModal({ mode: 'edit', event: ev })
  }

  function handleSaveService(e: React.FormEvent) {
    e.preventDefault()
    if (!serviceDate || !serviceLabel.trim()) return

    const roster: RosterEntry[] = serviceRosterMids.map(mid => ({
      mid,
      status: 'pendiente',
    }))

    if (serviceModal?.mode === 'create') {
      onAddService({
        date: serviceDate,
        type: serviceType,
        label: serviceLabel.trim(),
        setlist: [],
        roster,
      })
    } else if (serviceModal?.mode === 'edit' && serviceModal.event) {
      onEditService(serviceModal.event.date, {
        date: serviceDate,
        type: serviceType,
        label: serviceLabel.trim(),
        roster,
      })
    }
    setServiceModal(null)
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...adminSetlist]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setAdminSetlist(next)
  }
  function moveDown(idx: number) {
    if (idx === adminSetlist.length - 1) return
    const next = [...adminSetlist]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setAdminSetlist(next)
  }
  function removeSong(id: string) {
    setAdminSetlist(adminSetlist.filter(s => s !== id))
  }
  function addSong(id: string) {
    if (!adminSetlist.includes(id)) setAdminSetlist([...adminSetlist, id])
  }

  return (
    <div className="min-h-screen bg-bg text-fg pb-12">
      {aiModalOpen && (
        <AISuggestionModal
          onClose={() => setAiModalOpen(false)}
          onAddSong={id => { addSong(id); }}
          currentSetlist={adminSetlist}
          songs={songs}
        />
      )}

      {/* Modal Crear / Editar Músico con Multi-Rol */}
      {musicianModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMusicianModal(null)} />
          <div className="relative w-full max-w-md rounded-3xl bg-surface border border-border p-6 shadow-2xl">
            <h3 className="font-display text-xl text-fg tracking-wide mb-4">
              {musicianModal.mode === 'create' ? 'REGISTRAR INTEGRANTE' : 'EDITAR INTEGRANTE'}
            </h3>
            <form onSubmit={handleSaveMusician} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-fg-muted uppercase">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Daniel Gómez"
                  value={musicianName}
                  onChange={e => setMusicianName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-fg-muted uppercase">Instrumento Principal</label>
                <select
                  value={musicianInst}
                  onChange={e => setMusicianInst(e.target.value as Instrument)}
                  className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent capitalize cursor-pointer"
                >
                  {['guitarra', 'piano', 'bajo', 'voz', 'batería'].map(i => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>

              {/* Checkboxes de Roles Multiples */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-fg-muted uppercase">Roles / Permisos</label>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-2 border border-border flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={musicianIsMusician}
                      onChange={e => {
                        if (!e.target.checked && !musicianIsAdmin) return
                        setMusicianIsMusician(e.target.checked)
                      }}
                      className="w-4 h-4 rounded text-accent accent-accent cursor-pointer"
                    />
                    <div>
                      <p className="text-xs font-semibold text-fg">Músico</p>
                      <p className="text-[10px] text-fg-muted">Toca o canta</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-2 border border-border flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={musicianIsAdmin}
                      onChange={e => {
                        if (!e.target.checked && !musicianIsMusician) return
                        setMusicianIsAdmin(e.target.checked)
                      }}
                      className="w-4 h-4 rounded text-accent accent-accent cursor-pointer"
                    />
                    <div>
                      <p className="text-xs font-semibold text-fg">Admin</p>
                      <p className="text-[10px] text-fg-muted">Gestiona equipo</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-fg-muted uppercase">Correo Electrónico (para login)</label>
                <input
                  type="email"
                  placeholder="ejemplo@ibami.org"
                  value={musicianEmail}
                  onChange={e => setMusicianEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-fg-muted uppercase">Celular / WhatsApp (para login)</label>
                <input
                  type="text"
                  placeholder="Ej: 3101234567"
                  value={musicianPhone}
                  onChange={e => setMusicianPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMusicianModal(null)}
                  className="flex-1 py-3 rounded-xl text-fg-muted border border-border text-sm font-semibold hover:text-fg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl text-accent-fg bg-accent hover:bg-accent-hover text-sm font-semibold shadow-xs cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Servicio */}
      {serviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setServiceModal(null)} />
          <div className="relative w-full max-w-lg rounded-3xl bg-surface border border-border p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-xl text-fg tracking-wide mb-4">
              {serviceModal.mode === 'create' ? 'PROGRAMAR SERVICIO' : 'EDITAR SERVICIO'}
            </h3>
            <form onSubmit={handleSaveService} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-fg-muted uppercase">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={serviceDate}
                    onChange={e => setServiceDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-fg-muted uppercase">Tipo de Servicio</label>
                  <select
                    value={serviceType}
                    onChange={e => setServiceType(e.target.value as 'domingo' | 'midweek')}
                    className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="domingo">Domingo</option>
                    <option value="midweek">Entre semana</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-fg-muted uppercase">Nombre o Etiqueta *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Servicio Dominical - Comunión"
                  value={serviceLabel}
                  onChange={e => setServiceLabel(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-fg bg-surface-2 border border-border text-base md:text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-fg-muted uppercase">Músicos Asignados</label>
                {musicians.length === 0 ? (
                  <p className="text-xs text-fg-muted p-3 bg-surface-2 rounded-xl">No hay músicos registrados para asignar.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-surface-2 border border-border rounded-xl">
                    {musicians.map(m => {
                      const isSelected = serviceRosterMids.includes(m.id)
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => {
                            setServiceRosterMids(prev =>
                              isSelected ? prev.filter(id => id !== m.id) : [...prev, m.id]
                            )
                          }}
                          className={`p-2 rounded-lg text-left text-base md:text-xs font-medium border flex items-center justify-between transition cursor-pointer ${
                            isSelected
                              ? 'bg-surface text-fg border-accent font-semibold shadow-xs'
                              : 'bg-surface-3 text-fg-muted border-transparent hover:text-fg'
                          }`}
                        >
                          <span className="truncate">{m.name}</span>
                          <span className="text-[10px] text-fg-subtle capitalize">({m.instrument})</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setServiceModal(null)}
                  className="flex-1 py-3 rounded-xl text-fg-muted border border-border text-sm font-semibold hover:text-fg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl text-accent-fg bg-accent hover:bg-accent-hover text-sm font-semibold shadow-xs cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-2 border border-border text-accent">
              <IconFlame size={24} />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl text-fg tracking-wide">PANEL DE ADMINISTRACIÓN</h1>
              <p className="text-fg-muted text-xs">IBAMI · Gestión de músicos y servicios</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onAddNewSong}
              className="px-4 py-2 rounded-xl bg-accent text-accent-fg hover:bg-accent-hover text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <IconPlus size={13} />
              <span>Nueva Canción</span>
            </button>
            <div className="md:hidden">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
          </div>
        </div>

        <div className="flex bg-surface border border-border rounded-2xl p-1 mb-8">
          {(['usuarios', 'programación', 'setlist'] as AdminTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs md:text-sm font-semibold capitalize rounded-xl transition-all cursor-pointer ${
                tab === t ? 'bg-accent text-accent-fg shadow-xs' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'usuarios' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl text-fg tracking-wide">EQUIPO DE MÚSICOS</h2>
                <p className="text-xs text-fg-muted">{musicians.length} {musicians.length === 1 ? 'músico registrado' : 'músicos registrados'}</p>
              </div>
              <button
                onClick={openCreateMusician}
                className="text-xs font-semibold text-accent-fg bg-accent hover:bg-accent-hover px-4 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
              >
                <IconPlus size={13} />
                Agregar Músico
              </button>
            </div>

            {musicians.length === 0 ? (
              <div className="rounded-3xl p-10 bg-surface border border-border text-center flex flex-col items-center justify-center gap-3 shadow-xs">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-fg-muted">
                  <IconUser size={26} />
                </div>
                <div>
                  <p className="font-semibold text-fg text-base">No hay músicos registrados</p>
                  <p className="text-xs text-fg-muted mt-1">Has eliminado todos los músicos. Pulsa abajo para registrar un nuevo integrante.</p>
                </div>
                <button
                  onClick={openCreateMusician}
                  className="mt-2 text-xs font-semibold text-accent-fg bg-accent hover:bg-accent-hover px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <IconPlus size={13} />
                  Agregar Músico
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {musicians.map(m => (
                  <div key={m.id} className="rounded-3xl p-5 flex items-start justify-between bg-surface border border-border shadow-xs">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Avatar initials={m.initials} size="md" />
                      <div className="min-w-0">
                        <p className="font-semibold text-fg text-sm truncate">{m.name}</p>
                        <p className="text-xs text-fg-muted truncate">{m.email || m.phone || 'Sin contacto'}</p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <InstrumentChip instrument={m.instrument} />
                          <RoleBadges role={m.role} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditMusician(m)}
                        className="w-8 h-8 rounded-lg text-fg-muted hover:text-fg bg-surface-2 border border-border flex items-center justify-center transition cursor-pointer"
                        title="Editar Músico"
                      >
                        <IconEdit size={14} />
                      </button>
                      <button
                        onClick={() => onDeleteMusician(m.id)}
                        className="w-8 h-8 rounded-lg text-fg-muted hover:text-accent bg-surface-2 border border-border flex items-center justify-center transition cursor-pointer"
                        title="Eliminar Músico"
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'programación' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-fg tracking-wide">CALENDARIO DE SERVICIOS</h2>
              <button
                onClick={openCreateService}
                className="text-xs font-semibold text-accent-fg bg-accent hover:bg-accent-hover px-4 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
              >
                <IconPlus size={13} />
                Nuevo Servicio
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map(ev => {
                const date = new Date(ev.date + 'T12:00:00')
                const confirmed = ev.roster.filter(r => r.status === 'confirmado').length
                const pending = ev.roster.filter(r => r.status === 'pendiente').length
                return (
                  <div
                    key={ev.date}
                    className="rounded-3xl p-5 bg-surface border border-border shadow-xs flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => onDaySelect(ev.date)} className="text-left cursor-pointer flex-1">
                        <p className="font-semibold text-fg text-base">
                          {date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                        <p className="text-xs text-fg-muted mt-0.5">{ev.label}</p>
                      </button>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold px-3 py-1 rounded-xl flex-shrink-0 bg-surface-2 text-fg border border-border">
                          {ev.type === 'domingo' ? 'Domingo' : 'Entre semana'}
                        </span>
                        <button
                          onClick={() => openEditService(ev)}
                          className="w-8 h-8 rounded-lg text-fg-muted hover:text-fg bg-surface-2 border border-border flex items-center justify-center transition cursor-pointer"
                          title="Editar Servicio"
                        >
                          <IconEdit size={14} />
                        </button>
                        <button
                          onClick={() => onDeleteService(ev.date)}
                          className="w-8 h-8 rounded-lg text-fg-muted hover:text-accent bg-surface-2 border border-border flex items-center justify-center transition cursor-pointer"
                          title="Eliminar Servicio"
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border">
                      <div className="flex -space-x-2">
                        {ev.roster.slice(0, 4).map(r => {
                          const m = musicians.find(x => x.id === r.mid)
                          return m ? (
                            <div key={r.mid} className="w-7 h-7 rounded-full bg-surface-3 text-fg text-[9px] font-bold flex items-center justify-center border-2 border-surface">
                              {m.initials}
                            </div>
                          ) : null
                        })}
                      </div>
                      <span className="text-xs text-fg font-medium">{confirmed} confirmados</span>
                      {pending > 0 && <span className="text-xs text-fg-muted font-medium">· {pending} pendientes</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'setlist' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 flex flex-col gap-4">
              <div>
                <h2 className="font-display text-xl text-fg tracking-wide mb-2">SELECCIONAR SERVICIO</h2>
                <select
                  value={selectedAdminDate}
                  onChange={e => setSelectedAdminDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-fg bg-surface border border-border text-base md:text-sm focus:outline-none focus:border-accent cursor-pointer"
                >
                  {events.map(ev => {
                    const date = new Date(ev.date + 'T12:00:00')
                    return (
                      <option key={ev.date} value={ev.date}>
                        {date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })} — {ev.label}
                      </option>
                    )
                  })}
                </select>
              </div>

              <button
                onClick={() => setAiModalOpen(true)}
                className="w-full py-4 rounded-2xl text-accent-fg bg-accent hover:bg-accent-hover font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all shadow-xs cursor-pointer"
              >
                <IconSparkles size={16} />
                Sugerir canciones con IA (Groq)
              </button>

              {event && (
                <div>
                  <p className="text-xs font-bold text-fg-muted uppercase tracking-widest mb-3">Orden de Canciones ({adminSetlist.length})</p>
                  {adminSetlist.length === 0 ? (
                    <div className="rounded-2xl p-6 bg-surface border border-border text-center text-xs text-fg-muted">
                      No hay canciones añadidas al setlist todavía. Selecciona canciones del buscador.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {adminSetlist.map((sid, idx) => {
                        const song = songs.find(s => s.id === sid)
                        if (!song) return null
                        return (
                          <div key={sid} className="rounded-2xl p-4 flex items-center gap-3 bg-surface border border-border shadow-xs">
                            <span className="font-display text-fg-muted font-bold text-sm w-6 text-center">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-fg truncate">{song.title}</p>
                              <p className="text-xs text-fg-muted">{song.key} · {song.tempo}</p>
                            </div>
                            <div className="flex gap-1.5">
                              <button onClick={() => moveUp(idx)} className="w-8 h-8 rounded-xl text-fg-muted flex items-center justify-center bg-surface-2 border border-border hover:text-fg transition-colors cursor-pointer" title="Subir orden">
                                <IconArrowUp size={13} />
                              </button>
                              <button onClick={() => moveDown(idx)} className="w-8 h-8 rounded-xl text-fg-muted flex items-center justify-center bg-surface-2 border border-border hover:text-fg transition-colors cursor-pointer" title="Bajar orden">
                                <IconArrowDown size={13} />
                              </button>
                              <button onClick={() => removeSong(sid)} className="w-8 h-8 rounded-xl text-fg-muted flex items-center justify-center bg-surface-2 border border-border hover:text-accent transition-colors cursor-pointer" title="Quitar del setlist">
                                <IconTrash size={13} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Componente de búsqueda y selección paginada de canciones */}
            <div className="lg:col-span-6 bg-surface border border-border rounded-3xl p-5 shadow-xs">
              <SetlistSongPicker
                songs={songs}
                currentSetlist={adminSetlist}
                onAddSong={addSong}
                onRemoveSong={removeSong}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── THEME INITIALIZATION HELPER ──────────────────────────────────────────────

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved === 'light' || saved === 'dark') {
      return saved
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  }
  return 'dark'
}

// ─── MAIN APP COMPONENT ───────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [screen, setScreen] = useState<Screen>('login')
  const [selectedDate, setSelectedDate] = useState('2026-08-16')
  const [selectedSongId, setSelectedSongId] = useState('notion-1')
  const [prevScreen, setPrevScreen] = useState<Screen>('calendar')
  const [attendance, setAttendance] = useState<Record<string, Status>>({})
  const [adminSetlist, setAdminSetlist] = useState<string[]>(['notion-1', 'notion-2', 'notion-3'])
  const [addSongModalOpen, setAddSongModalOpen] = useState(false)
  const [editingSong, setEditingSong] = useState<Song | null>(null)

  // Database State
  const [songs, setSongs] = useState<Song[]>([])
  const [events, setEvents] = useState<ServiceEvent[]>([])
  const [musicians, setMusicians] = useState<Musician[]>([])
  const [activeUser, setActiveUser] = useState<Musician | null>(null)

  // Carga inicial de datos desde Supabase / LocalCache
  useEffect(() => {
    async function loadData() {
      try {
        const [loadedSongs, loadedEvents, loadedMusicians] = await Promise.all([
          fetchSongs(),
          fetchEvents(),
          fetchMusicians(),
        ])
        if (Array.isArray(loadedSongs)) setSongs(loadedSongs)
        if (Array.isArray(loadedEvents)) setEvents(loadedEvents)
        if (Array.isArray(loadedMusicians)) {
          setMusicians(loadedMusicians)

          // Restaurar sesión activa si existe en localStorage
          const savedUserId = localStorage.getItem('acorde_logged_user_id')
          if (savedUserId) {
            const found = loadedMusicians.find(m => m.id === savedUserId)
            if (found) {
              setActiveUser(found)
              setScreen('calendar')
            }
          }
        }
      } catch (err) {
        console.warn('Carga de datos con fallback:', err)
      }
    }
    loadData()
  }, [])

  // Sincronización de clase de tema y persistencia en localStorage
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.setAttribute('data-theme', 'dark')
    } else {
      root.classList.remove('dark')
      root.setAttribute('data-theme', 'light')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Escuchar cambios de tema del sistema operativo
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem('theme')
      if (!saved) {
        setTheme(e.matches ? 'dark' : 'light')
      }
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }

  // Usuario de respaldo
  const defaultUser: Musician = useMemo(() => ({
    id: 'user-default',
    name: 'Integrante IBAMI',
    instrument: 'guitarra',
    initials: 'IB',
    email: 'pastor@ibami.org',
    phone: '+57 300 000 0000',
    role: 'both',
  }), [])

  const currentMusician: Musician = activeUser || (musicians.length > 0 ? musicians[0] : defaultUser)

  function handleLogin(user: Musician) {
    setActiveUser(user)
    localStorage.setItem('acorde_logged_user_id', user.id)
    nav('calendar')
  }

  function handleLogout() {
    setActiveUser(null)
    localStorage.removeItem('acorde_logged_user_id')
    nav('login')
  }

  function nav(to: Screen, from?: Screen) {
    if (from) setPrevScreen(from)
    setScreen(to)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const currentEvent = events.find(e => e.date === selectedDate) || events[0]
  const mergedRoster = (currentEvent?.roster ?? []).map(r => ({
    ...r,
    status: (attendance[`${selectedDate}:${r.mid}`] as Status) ?? r.status,
  }))

  async function handleAttendance(mid: string, status: Status) {
    setAttendance(prev => ({ ...prev, [`${selectedDate}:${mid}`]: status }))
    await updateAttendanceStatus(selectedDate, mid, status)
  }

  async function handleAddMusician(m: { name: string; instrument: Instrument; email: string; phone?: string; role?: Role }) {
    const created = await createMusician(m)
    setMusicians(prev => [...prev, created])
  }

  async function handleEditMusician(id: string, updates: Partial<Musician>) {
    const updated = await updateMusician(id, updates)
    setMusicians(prev => prev.map(m => m.id === id ? updated : m))
    if (activeUser?.id === id) {
      setActiveUser(updated)
    }
  }

  async function handleDeleteMusician(id: string) {
    await deleteMusician(id)
    setMusicians(prev => prev.filter(m => m.id !== id))
    if (activeUser?.id === id) {
      handleLogout()
    }
  }

  async function handleAddService(ev: ServiceEvent) {
    const created = await createServiceEvent(ev)
    setEvents(prev => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)))
  }

  async function handleEditService(date: string, updates: Partial<ServiceEvent>) {
    await updateServiceEvent(date, updates)
    setEvents(prev => prev.map(e => e.date === date ? { ...e, ...updates } : e))
  }

  async function handleDeleteService(date: string) {
    await deleteServiceEvent(date)
    setEvents(prev => prev.filter(e => e.date !== date))
  }

  async function handleAddSong(newSongData: Omit<Song, 'id'>) {
    const created = await createSong(newSongData)
    setSongs(prev => [created, ...prev])
  }

  async function handleUpdateSong(updates: Partial<Song>) {
    if (!editingSong) return
    const updated = await updateSong(editingSong.id, updates)
    setSongs(prev => prev.map(s => (s.id === updated.id ? updated : s)))
    setEditingSong(null)
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        musicians={musicians}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  }

  return (
    <div className="min-h-screen bg-bg font-body text-fg transition-colors duration-200">
      {/* Modal para agregar canciones */}
      {addSongModalOpen && (
        <AddSongModal
          onClose={() => setAddSongModalOpen(false)}
          onSave={handleAddSong}
        />
      )}

      {/* Modal para editar canciones y notas ChordPro */}
      {editingSong && (
        <EditSongModal
          song={editingSong}
          onClose={() => setEditingSong(null)}
          onSave={handleUpdateSong}
        />
      )}

      {/* Navegación Superior para Desktop */}
      <DesktopHeader
        screen={screen}
        setScreen={s => nav(s)}
        currentUser={currentMusician}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="pb-20 md:pb-8">
        {screen === 'calendar' && (
          <CalendarScreen
            events={events}
            musicians={musicians}
            onDaySelect={date => { setSelectedDate(date); nav('day-detail', 'calendar') }}
            currentUser={currentMusician}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}
        {screen === 'day-detail' && currentEvent && (
          <DayDetailScreen
            event={currentEvent}
            roster={mergedRoster}
            songs={songs}
            musicians={musicians}
            currentUser={currentMusician}
            onBack={() => nav('calendar')}
            onSongSelect={id => { setSelectedSongId(id); nav('song', 'day-detail') }}
            onAttendance={handleAttendance}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}
        {screen === 'library' && (
          <LibraryScreen
            songs={songs}
            onSongSelect={id => { setSelectedSongId(id); nav('song', 'library') }}
            onAddNewSong={() => setAddSongModalOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}
        {screen === 'song' && songs.find(s => s.id === selectedSongId) && (
          <SongViewScreen
            song={songs.find(s => s.id === selectedSongId)!}
            onBack={() => nav(prevScreen)}
            onEdit={() => setEditingSong(songs.find(s => s.id === selectedSongId) || null)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}
        {screen === 'admin' && hasRole(currentMusician, 'admin') && (
          <AdminScreen
            events={events}
            musicians={musicians}
            songs={songs}
            onDaySelect={date => { setSelectedDate(date); nav('day-detail', 'admin') }}
            adminSetlist={adminSetlist}
            setAdminSetlist={setAdminSetlist}
            onAddMusician={handleAddMusician}
            onEditMusician={handleEditMusician}
            onDeleteMusician={handleDeleteMusician}
            onAddService={handleAddService}
            onEditService={handleEditService}
            onDeleteService={handleDeleteService}
            onAddNewSong={() => setAddSongModalOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}
        {screen === 'profile' && (
          <ProfileScreen
            musician={currentMusician}
            onUpdateMusician={updates => handleEditMusician(currentMusician.id, updates)}
            onLogout={handleLogout}
            events={events}
            songs={songs}
            onSelectEvent={date => { setSelectedDate(date); nav('day-detail', 'profile') }}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}
      </main>

      {/* Navegación Inferior para Móviles */}
      <BottomNav screen={screen} setScreen={s => nav(s)} currentUser={currentMusician} />
    </div>
  )
}
