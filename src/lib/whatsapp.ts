import type { ServiceEvent, Musician, Song, RosterEntry } from './api'

/**
 * Limpia y estandariza números de teléfono para la API de WhatsApp
 * Soporta números de Colombia (10 dígitos empezando en 3 -> +57) y números con código internacional
 */
export function cleanPhoneForWhatsApp(rawPhone?: string): string {
  if (!rawPhone) return ''
  const digits = rawPhone.replace(/\D/g, '')
  if (!digits) return ''
  // Si tiene 10 dígitos y empieza por 3 (formato móvil Colombia), agregar código 57
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`
  }
  return digits
}

/**
 * Obtiene la URL base de la aplicación para los enlaces de WhatsApp
 */
export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'https://acorde-five.vercel.app'
}

/**
 * Genera el enlace directo con parámetros para auto-login y foco en el servicio
 */
export function generateDirectServiceLink(date: string, mid?: string): string {
  const base = getAppBaseUrl()
  const params = new URLSearchParams()
  params.set('date', date)
  if (mid) {
    params.set('user', mid)
  }
  return `${base}/?${params.toString()}`
}

/**
 * Formatea una fecha de servicio a texto legible en español
 */
export function formatServiceDateText(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/**
 * Genera el mensaje personalizado individual para un músico convocado
 */
export function generateIndividualMusicianMessage({
  event,
  musician,
  entry,
  songs,
}: {
  event: ServiceEvent
  musician: Musician
  entry?: RosterEntry
  songs: Song[]
}): string {
  const serviceDate = formatServiceDateText(event.date)
  const primaryRole = entry?.instrument || musician.instrument || 'Músico'
  const secondaries = entry?.secondary_instruments && entry.secondary_instruments.length > 0
    ? entry.secondary_instruments.join(', ')
    : ''

  const directLink = generateDirectServiceLink(event.date, musician.id)

  const songList = Array.isArray(event.setlist) ? event.setlist : []
  const scheduledSongs = songList
    .map((sid, idx) => {
      const s = songs.find(x => x.id === sid || String(x.id) === String(sid) || x.title.toLowerCase() === String(sid).toLowerCase())
      if (!s) return `${idx + 1}. *${sid}*`
      return `${idx + 1}. *${s.title}* (${s.key || 'N/A'}${s.tempo ? ` - ${s.tempo}` : ''})`
    })
    .join('\n')

  const lines = [
    `*IBAMI - MINISTERIO DE ALABANZA*`,
    ``,
    `Hola *${musician.name}*, has sido convocado(a) para ministrar en el siguiente servicio:`,
    ``,
    `*Servicio:* ${event.label}`,
    `*Fecha:* ${serviceDate}`,
    `*Rol Principal:* ${primaryRole.toUpperCase()}`,
    secondaries ? `*Instrumentos Secundarios:* ${secondaries}` : '',
    ``,
    `*SETLIST PROGRAMADO (${songList.length} Canciones):*`,
    scheduledSongs || '_Setlist en preparación_',
    ``,
    `*Por favor confirma o actualiza tu asistencia en el siguiente enlace:*`,
    directLink,
    ``,
    `_Bendiciones y gracias por tu servicio al Señor._`,
  ].filter(line => line !== null && line !== undefined)

  return lines.join('\n')
}

/**
 * Genera el mensaje consolidado para el grupo general de WhatsApp del ministerio
 */
export function generateGroupServiceMessage({
  event,
  musicians,
  songs,
}: {
  event: ServiceEvent
  musicians: Musician[]
  songs: Song[]
}): string {
  const serviceDate = formatServiceDateText(event.date)
  const directLink = generateDirectServiceLink(event.date)

  // Agrupación litúrgica
  const leadership: string[] = []
  const vocals: string[] = []
  const band: string[] = []

  const rosterList = Array.isArray(event.roster) ? event.roster : []
  rosterList.forEach(entry => {
    const m = musicians.find(x => x.id === entry.mid || String(x.id) === String(entry.mid))
    if (!m) return
    const inst = (entry.instrument || m.instrument || '').toLowerCase()
    const desc = `${m.name} (${(entry.instrument || m.instrument).toUpperCase()})`
    if (inst.includes('direc') || inst.includes('líder') || inst.includes('lider')) {
      leadership.push(desc)
    } else if (inst.includes('voz') || inst.includes('coro')) {
      vocals.push(desc)
    } else {
      band.push(desc)
    }
  })

  const songList = Array.isArray(event.setlist) ? event.setlist : []
  const scheduledSongs = songList
    .map((sid, idx) => {
      const s = songs.find(x => x.id === sid || String(x.id) === String(sid) || x.title.toLowerCase() === String(sid).toLowerCase())
      if (!s) return `${idx + 1}. *${sid}*`
      return `${idx + 1}. *${s.title}* - ${s.artist || 'IBAMI'} [Tono: ${s.key || 'N/A'}${s.tempo ? ` / ${s.tempo}` : ''}]`
    })
    .join('\n')

  const lines = [
    `*IBAMI - PROGRAMACIÓN DE ALABANZA*`,
    ``,
    `*Servicio:* ${event.label}`,
    `*Fecha:* ${serviceDate}`,
    ``,
    `*EQUIPO CONVOCADO:*`,
    leadership.length > 0 ? `*Dirección:* ${leadership.join(', ')}` : '',
    vocals.length > 0 ? `*Voces:* ${vocals.join(', ')}` : '',
    band.length > 0 ? `*Banda:* ${band.join(', ')}` : '',
    leadership.length === 0 && vocals.length === 0 && band.length === 0 ? '_Equipo por definir_' : '',
    ``,
    `*SETLIST DEL SERVICIO:*`,
    scheduledSongs || '_Repertorio en selección_',
    ``,
    `*Accede al repertorio, notas y confirmaciones:*`,
    directLink,
  ].filter(line => line !== '')

  return lines.join('\n')
}

/**
 * Abre WhatsApp con el número y mensaje especificados
 */
export function openWhatsAppChat(phone: string, message: string): void {
  const cleanPhone = cleanPhoneForWhatsApp(phone)
  const encodedText = encodeURIComponent(message)
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
