import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  topic: string
  currentSetlist?: string[]
  moment?: 'todos' | 'Apertura' | 'Adoración' | 'Ministración'
  limit?: number
  songsCatalog?: any[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      topic,
      currentSetlist = [],
      moment = 'todos',
      limit = 8,
      songsCatalog = [],
    }: RequestBody = await req.json()

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'El parámetro topic es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) {
      return new Response(
        JSON.stringify({ error: 'GROQ_API_KEY no configurada en las variables de entorno de Supabase' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Obtener canciones disponibles (del catálogo enviado o desde la base de datos)
    let finalSongs = Array.isArray(songsCatalog) && songsCatalog.length > 0 ? songsCatalog : []

    if (finalSongs.length === 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data } = await supabase
          .from('songs')
          .select('id, title, artist, key, tempo, tags, resumen_tematico')
        if (data && data.length > 0) {
          finalSongs = data
        }
      }
    }

    if (finalSongs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No se pudieron recuperar canciones del catálogo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Preparar el catálogo compacto con resúmenes temáticos para Groq
    const songsCatalogText = finalSongs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      tempo: s.tempo,
      tags: Array.isArray(s.tags) ? s.tags.join(', ') : (s.tags || ''),
      resumen_tematico: s.resumen_tematico || '',
    }))

    const systemPrompt = `Eres un pastor de adoración y teólogo musical de la iglesia cristiana IBAMI.
Tu tarea es seleccionar exactamente ${limit} canciones del catálogo oficial de IBAMI que mejor se conecten con el tema bíblico o sermón provisto.

REGLAS LITÚRGICAS DE IBAMI:
1. "Apertura": Canciones festivas, rítmicas o de llamado a la alabanza que convocan a la congregación (tempos rápidos o medios).
2. "Adoración": Canciones profundas, cristocéntricas y reverentes que preparan el corazón antes de la predicación (tempos medios o lentos).
3. "Ministración": Canciones de entrega, consagración, fe, sanidad o llamado tras escuchar la Palabra (tempos lentos o íntimos).

${moment !== 'todos' ? `ENFOQUE SOLICITADO: Recomienda únicamente canciones para el momento de "${moment}".` : 'DISTRIBUCIÓN: Proporciona una mezcla equilibrada de Apertura, Adoración y Ministración.'}

REGLAS ESTRICTAS:
- Usa ÚNICAMENTE canciones que existan en el catálogo provisto (utilizando su id exacto).
- No inventes canciones ni cambies los IDs.
- Cero emojis en cualquier parte del texto.
- Justificación: Explica en 1 o 2 oraciones profundas y claras por qué la letra o temática conecta con el mensaje bíblico.
- Devuelve ÚNICAMENTE un JSON con esta estructura exacta:
{
  "suggestions": [
    {
      "songId": "id-de-la-cancion",
      "moment": "Apertura",
      "reason": "Justificación pastoral fundamentada."
    }
  ]
}`

    const userPrompt = `Tema o pasaje del sermón: "${topic}"
Canciones que ya están en el setlist: ${JSON.stringify(currentSetlist)}

Catálogo oficial de canciones de IBAMI:
${JSON.stringify(songsCatalogText, null, 2)}`

    // 3. Llamada a Groq API con cascada de modelos compatibles
    // 3. Llamada a Groq API con modelos optimizados por velocidad y eficiencia
    const CANDIDATE_MODELS = [
      'openai/gpt-oss-20b',     // Modelo ideal: rápido, ligero y eficiente
      'qwen/qwen3.6-27b',       // Excelente balance de razonamiento y velocidad
      'groq/compound-mini',     // Mini router ultra rápido
      'groq/compound',
      'openai/gpt-oss-120b',    // Modelo pesado como respaldo
      'allam-2-7b',
    ]

    let groqData = null
    let usedModel = ''
    let lastError = ''

    for (const model of CANDIDATE_MODELS) {
      try {
        const bodyPayload: Record<string, unknown> = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        }

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        })

        if (groqResponse.ok) {
          groqData = await groqResponse.json()
          usedModel = model
          break
        } else {
          lastError = await groqResponse.text()
          console.warn(`Groq error con modelo ${model}:`, lastError)
        }
      } catch (e) {
        lastError = (e as Error).message
        console.warn(`Fallo request con modelo ${model}:`, e)
      }
    }

    if (!groqData) {
      console.error('Ningún modelo de Groq estuvo disponible:', lastError)
      return new Response(
        JSON.stringify({ error: 'No se pudo conectar con los modelos de Groq', details: lastError }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rawContent = groqData.choices?.[0]?.message?.content || ''
    let parsedResult = { suggestions: [] }
    try {
      const cleanContent = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
      parsedResult = JSON.parse(cleanContent)
    } catch (_parseErr) {
      const firstBrace = rawContent.indexOf('{')
      const lastBrace = rawContent.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) {
        parsedResult = JSON.parse(rawContent.substring(firstBrace, lastBrace + 1))
      }
    }

    return new Response(JSON.stringify({ ...parsedResult, model: usedModel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error procesando recomendación:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
