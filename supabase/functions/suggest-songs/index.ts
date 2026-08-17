import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  topic: string
  currentSetlist?: string[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { topic, currentSetlist = [] }: RequestBody = await req.json()

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
      .select('id, title, artist, key, tempo, tags')

    if (dbError || !songs || songs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No se pudieron recuperar canciones del catálogo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Preparar el prompt para Groq (Llama 3.3 70B Versatile)
    const songsCatalogText = songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      tempo: s.tempo,
      tags: s.tags?.join(', ') || '',
    }))

    const systemPrompt = `Eres un director musical y pastor de alabanza experto para la iglesia cristiana IBAMI.
Tu tarea es recomendar entre 5 y 8 canciones del catálogo provisto que mejor se alineen con el tema de la prédica o contexto litúrgico.

REGLAS ESTRICTAS:
1. SOLO puedes recomendar canciones que existan exactamente en la lista provista (usando su id y título exactos).
2. Proporciona una justificación breve, profunda y pastoral (1 oración) para cada sugerencia.
3. Prioriza variedad de tempos (al menos una rápida y varias lentas/medias para adoración).
4. No uses emojis en ninguna parte de la respuesta.
5. Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{
  "suggestions": [
    {
      "songId": "id-de-la-cancion",
      "reason": "Breve explicación pastoral de por qué conecta con el tema."
    }
  ]
}`

    const userPrompt = `Tema de la prédica o servicio: "${topic}"
Canciones ya en el setlist: ${JSON.stringify(currentSetlist)}

Catálogo disponible:
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
        temperature: 0.3,
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
