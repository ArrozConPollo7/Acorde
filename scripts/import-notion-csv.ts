import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

interface SongSegment {
  chord?: string
  text: string
}

interface LyricLine {
  label?: string
  segments: SongSegment[]
}

interface ParsedSong {
  title: string
  artist: string
  key: string
  tempo: 'rápida' | 'media' | 'lenta'
  tags: string[]
  lyrics: LyricLine[]
  media_url?: string
  is_classic?: boolean
}

// ─── CSV PARSER SENCILLO Y ROBUSTO ────────────────────────────────────────────

function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }

  function splitLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const rawHeaders = splitLine(lines[0])
  const headers = rawHeaders.map(h => h.replace(/^["']|["']$/g, '').trim())

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = splitLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').replace(/^["']|["']$/g, '').trim()
    })
    rows.push(row)
  }

  return { headers, rows }
}

// ─── CONVERTIDOR DE TEXTO / CHORDPRO A LYRICLINE[] ────────────────────────────

function parseLyricsText(text: string): LyricLine[] {
  if (!text || !text.trim()) {
    return [{ segments: [{ text: 'Letra disponible próximamente.' }] }]
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const result: LyricLine[] = []

  let currentLabel: string | undefined

  for (const line of lines) {
    if (/^(verso|estrofa|coro|puente|intro|outro|pre-coro|tag|coda|final)/i.test(line)) {
      currentLabel = line
      continue
    }

    // Detectar acordes entre corchetes [G] [Em] o acordes intercalados
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

// ─── MAPEO DE TEMPO ───────────────────────────────────────────────────────────

function inferTempo(tipoMusical?: string): 'rápida' | 'media' | 'lenta' {
  if (!tipoMusical) return 'media'
  const t = tipoMusical.toLowerCase()
  if (t.includes('celebración') || t.includes('rítmica') || t.includes('rapida') || t.includes('rápida')) {
    return 'rápida'
  }
  if (t.includes('balada') || t.includes('lenta') || t.includes('íntima') || t.includes('intima')) {
    return 'lenta'
  }
  return 'media'
}

// ─── LECTURA DE ARCHIVOS MARKDOWN COMPLEMENTARIOS ──────────────────────────────

function stripAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function findMarkdownLyrics(cancionesDir: string, songTitle: string): { lyrics?: string; key?: string } {
  try {
    if (!fs.existsSync(cancionesDir)) return {}
    const files = fs.readdirSync(cancionesDir)
    const normalizedTitle = stripAccents(songTitle)

    const matchedFile = files.find(f => {
      if (!f.endsWith('.md')) return false
      const baseName = stripAccents(f.replace(/\.md$/, ''))
      return baseName.includes(normalizedTitle) || normalizedTitle.includes(baseName.slice(0, 12))
    })

    if (!matchedFile) return {}

    const content = fs.readFileSync(path.join(cancionesDir, matchedFile), 'utf-8')
    let lyricsText = ''
    let key = ''

    // Extraer sección ## Letra
    const letraMatch = content.match(/## Letra\s*([\s\S]*?)(?=##|$)/i)
    if (letraMatch && letraMatch[1].trim()) {
      lyricsText = letraMatch[1].trim()
    }

    // Extraer Tono si existe
    const tonoMatch = content.match(/Tono.*?:\s*([A-G][b#]?m?)/i)
    if (tonoMatch) {
      key = tonoMatch[1].trim()
    }

    return { lyrics: lyricsText, key }
  } catch {
    return {}
  }
}

// ─── SCRIPT PRINCIPAL ─────────────────────────────────────────────────────────

async function main() {
  console.log('\n=============================================================')
  console.log('   IBAMI - Migrador de Repertorio desde Notion a Supabase    ')
  console.log('=============================================================\n')

  const args = process.argv.slice(2)
  const isConfirm = args.includes('--confirm')
  const csvArg = args.find(a => a.endsWith('.csv'))

  const defaultCsvPath = path.resolve('Canciones/Repertorio general f53b0c35567283dc815e816bc316d0e7.csv')
  const csvPath = csvArg ? path.resolve(csvArg) : defaultCsvPath

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: No se encontró el archivo CSV en: ${csvPath}`)
    process.exit(1)
  }

  console.log(`Archivo CSV detectado: ${csvPath}`)
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const { headers, rows } = parseCSV(csvContent)

  console.log(`Columnas encontradas en el CSV (${headers.length}):`)
  console.log(`[ ${headers.map(h => `"${h}"`).join(', ')} ]\n`)

  // 1. Mostrar mapeo de columnas
  console.log('─── MAPEO DE COLUMNAS A ESQUEMA SUPABASE ───────────────────')
  console.log('  • Canción / Título       -> title')
  console.log('  • Artista / Grupo        -> artist')
  console.log('  • Categoría              -> tags (array de strings)')
  console.log('  • Tipo musical           -> tempo (rápida / media / lenta)')
  console.log('  • Link                   -> media_url')
  console.log('  • Clásicos IBAMI         -> is_classic (boolean)')
  console.log('  • Archivos Markdown (.md)-> lyrics (LyricLine[] con acordes)')
  console.log('────────────────────────────────────────────────────────────\n')

  const cancionesDir = path.dirname(csvPath)

  // 2. Procesar filas
  const parsedSongs: ParsedSong[] = []

  for (const row of rows) {
    const title = (row['Canción'] || row['Nombre'] || row['Title'] || row['Name'] || '').trim()
    if (!title) continue

    const artist = (row['Artista / Grupo'] || row['Artista'] || row['Artist'] || row['Autor'] || 'IBAMI').trim()
    const rawCategory = row['Categoría '] || row['Categoría'] || row['Category'] || ''
    const tags = rawCategory
      ? rawCategory.split(/[,/]/).map(t => t.trim()).filter(Boolean)
      : ['alabanza']

    const tipoMusical = row['Tipo musical'] || row['Tipo'] || ''
    const tempo = inferTempo(tipoMusical)

    const media_url = (row['Link'] || row['Enlace'] || row['Url'] || '').trim() || undefined
    const is_classic = (row['Clásicos IBAMI'] || '').toLowerCase() === 'yes'

    // Buscar letra y tono en los archivos Markdown
    const mdData = findMarkdownLyrics(cancionesDir, title)
    const key = mdData.key || 'G'
    const lyrics = parseLyricsText(mdData.lyrics || `Letra de ${title}`)

    parsedSongs.push({
      title,
      artist,
      key,
      tempo,
      tags,
      lyrics,
      media_url,
      is_classic,
    })
  }

  console.log(`Total de canciones procesadas: ${parsedSongs.length}`)

  // 3. Vista previa de las primeras 3 canciones
  console.log('\n─── VISTA PREVIA (Primeras 3 canciones) ───────────────────')
  parsedSongs.slice(0, 3).forEach((song, idx) => {
    console.log(`\n[${idx + 1}] "${song.title}" — ${song.artist}`)
    console.log(`    Tono: ${song.key} | Tempo: ${song.tempo} | Tags: ${song.tags.join(', ')}`)
    console.log(`    Enlace: ${song.media_url || 'N/A'} | Clásico IBAMI: ${song.is_classic ? 'Sí' : 'No'}`)
    console.log(`    Líneas de letra procesadas: ${song.lyrics.length}`)
  })
  console.log('\n────────────────────────────────────────────────────────────')

  // 4. Guardar archivo local JSON listo para seed
  const outputPath = path.resolve('supabase/songs-seed.json')
  fs.writeFileSync(outputPath, JSON.stringify(parsedSongs, null, 2), 'utf-8')
  console.log(`\nCopia de seguridad y seed guardada en: ${outputPath}`)

  // 5. Inserción en Supabase si se pasa --confirm y están las credenciales
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (isConfirm && supabaseUrl && supabaseKey && !supabaseUrl.includes('tu-proyecto')) {
    console.log(`\nConectando a Supabase (${supabaseUrl})...`)
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log(`Consultando canciones existentes en la base de datos...`)
    const { data: existingSongs, error: fetchErr } = await supabase
      .from('songs')
      .select('id, title')

    if (fetchErr) {
      console.warn('Aviso al consultar canciones existentes:', fetchErr.message)
    }

    const existingMap = new Map<string, string>()
    if (existingSongs) {
      existingSongs.forEach(s => {
        if (s.title) existingMap.set(s.title.toLowerCase().trim(), s.id)
      })
    }

    console.log(`Canciones ya existentes en Supabase: ${existingMap.size}`)

    const toInsert: any[] = []
    const toUpdate: { id: string; data: any }[] = []

    for (const s of parsedSongs) {
      const existingId = existingMap.get(s.title.toLowerCase().trim())
      const payload = {
        title: s.title,
        artist: s.artist,
        key: s.key,
        tempo: s.tempo,
        tags: s.tags,
        lyrics: s.lyrics,
        media_url: s.media_url,
        is_classic: s.is_classic,
      }

      if (existingId) {
        toUpdate.push({ id: existingId, data: payload })
      } else {
        toInsert.push(payload)
      }
    }

    // Insertar nuevas canciones en lotes de 50
    let insertedCount = 0
    if (toInsert.length > 0) {
      console.log(`Insertando ${toInsert.length} canciones nuevas...`)
      const batchSize = 50
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize)
        const { error: insertErr } = await supabase.from('songs').insert(batch)
        if (insertErr) {
          console.error(`Error en lote de inserción (${i + 1}-${i + batch.length}):`, insertErr.message)
          if (insertErr.message.includes('row-level security')) {
            console.log('\n[!] Consejo de RLS: Para ejecutar migraciones administrativas con permisos totales, agrega tu SUPABASE_SERVICE_ROLE_KEY al archivo .env')
            console.log('    O ejecuta en el SQL Editor de Supabase:')
            console.log('    CREATE POLICY "Permitir importacion" ON public.songs FOR ALL TO public USING (true) WITH CHECK (true);\n')
          }
        } else {
          insertedCount += batch.length
          console.log(`  ✓ Insertadas ${insertedCount}/${toInsert.length} canciones`)
        }
      }
    }

    // Actualizar canciones existentes
    let updatedCount = 0
    if (toUpdate.length > 0) {
      console.log(`Actualizando ${toUpdate.length} canciones existentes...`)
      for (const item of toUpdate) {
        const { error: updateErr } = await supabase
          .from('songs')
          .update(item.data)
          .eq('id', item.id)

        if (!updateErr) {
          updatedCount++
        }
      }
      console.log(`  ✓ Actualizadas ${updatedCount}/${toUpdate.length} canciones`)
    }

    console.log('\n=============================================================')
    console.log(` Migración completada: ${insertedCount} nuevas, ${updatedCount} actualizadas`)
    console.log('=============================================================\n')
  } else {
    console.log('\nModo de prueba (Dry-run).')
    console.log('Para insertar directamente en Supabase, configura tu .env y ejecuta:')
    console.log('  npm run import:notion -- --confirm\n')
  }
}

main().catch(err => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
