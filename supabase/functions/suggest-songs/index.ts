import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      topic,
      currentSetlist = [],
      moment = 'todos',
      limit = 8,
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
        JSON.stringify({ error: 'GROQ_API_KEY no configurada en las variables de entorno' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Obtener canciones disponibles de Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: songs, error: dbError } = await supabase
      .from('songs')
      .select('id, title, artist, key, tempo, tags, resumen_tematico')

    if (dbError || !songs || songs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No se pudieron recuperar canciones del catálogo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Preparar el catálogo compacto con resúmenes temáticos para Groq (Llama 3.3 70B)
    const songsCatalogText = songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      tempo: s.tempo,
      tags: s.tags?.join(', ') || '',
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

    // 3. Llamada a Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })

    if (!groqResponse.ok) {
      const errText = await groqResponse.text()
      console.error('Error de Groq API:', errText)
      return new Response(
        JSON.stringify({ error: 'Error al comunicarse con el modelo de IA' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const groqData = await groqResponse.json()
    const content = groqData.choices?.[0]?.message?.content

    const parsedResult = JSON.parse(content || '{"suggestions":[]}')

    return new Response(JSON.stringify(parsedResult), {
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
