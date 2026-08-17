import { jsPDF } from 'jspdf'

interface SongSegment {
  chord?: string
  text: string
}

interface LyricLine {
  label?: string
  segments: SongSegment[]
}

interface PDFSongData {
  title: string
  artist: string
  key: string
  tempo: string
  lyrics: LyricLine[]
}

export function generateSongPDF(song: PDFSongData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2

  let y = margin
  let currentPage = 1

  function addHeader() {
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(120, 117, 109)
    doc.text('IBAMI · MINISTERIO DE ALABANZA', margin, y)

    const dateStr = new Date().toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
    doc.setFont('Helvetica', 'normal')
    doc.text(dateStr, pageWidth - margin, y, { align: 'right' })

    y += 3
    doc.setDrawColor(220, 215, 205)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8
  }

  function addFooter(pageNum: number) {
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 137, 129)
    doc.text(`Página ${pageNum}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
  }

  // Página 1: Encabezado general
  addHeader()

  // Título de la Canción
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(28, 27, 24)
  doc.text(song.title.toUpperCase(), margin, y)
  y += 7

  // Artista e Información
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(100, 97, 89)
  doc.text(song.artist, margin, y)

  // Caja de Tono y Tempo
  const metaText = `Tono: ${song.key}   |   Tempo: ${song.tempo.toUpperCase()}`
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(184, 71, 44) // Color acento terracota
  doc.text(metaText, pageWidth - margin, y, { align: 'right' })

  y += 6
  doc.setDrawColor(200, 195, 185)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // Contenido de la Canción (Secciones, Acordes y Letras)
  doc.setFont('Courier', 'normal')

  for (let i = 0; i < song.lyrics.length; i++) {
    const line = song.lyrics[i]

    // Si nos acercamos al final de la página, creamos una nueva
    if (y > pageHeight - 25) {
      addFooter(currentPage)
      doc.addPage()
      currentPage++
      y = margin
      addHeader()
    }

    // Etiqueta de Sección (Verso, Coro, Puente)
    if (line.label) {
      y += 3
      if (y > pageHeight - 25) {
        addFooter(currentPage)
        doc.addPage()
        currentPage++
        y = margin
        addHeader()
      }

      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(184, 71, 44)
      doc.text(line.label.toUpperCase(), margin, y)
      y += 5
    }

    // Construcción de la línea de acordes y la línea de letra
    let chordLine = ''
    let textLine = ''

    for (const seg of line.segments) {
      const chord = seg.chord || ''
      const text = seg.text || ''

      const textLen = text.length
      const chordLen = chord.length

      if (chord) {
        chordLine += chord.padEnd(Math.max(textLen, chordLen + 1), ' ')
      } else {
        chordLine += ' '.repeat(textLen)
      }
      textLine += text.padEnd(Math.max(textLen, chordLen + 1), ' ')
    }

    const hasChords = chordLine.trim().length > 0

    // Renderizar línea de acordes
    if (hasChords) {
      doc.setFont('Courier', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(184, 71, 44) // Terracota para acordes
      doc.text(chordLine, margin, y)
      y += 4.5
    }

    // Renderizar línea de letra
    doc.setFont('Courier', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(35, 34, 31)
    doc.text(textLine, margin, y)
    y += 5.5
  }

  addFooter(currentPage)

  // Sanitizar nombre de archivo y descargar
  const cleanTitle = song.title.replace(/[/\\?%*:|"<>]/g, '').trim()
  const cleanArtist = song.artist.replace(/[/\\?%*:|"<>]/g, '').trim()
  doc.save(`${cleanTitle} - ${cleanArtist} (Tono ${song.key}).pdf`)
}
