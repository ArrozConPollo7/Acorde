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

    // 2. Preparar el catálogo y prompt para Groq (Llama 3.3 70B)
    const songsCatalogText = songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      tempo: s.tempo,
      tags: s.tags?.join(', ') || '',
    }))

    const systemPrompt = `Eres un pastor de adoración y teólogo musical con más de 20 años de experiencia dirigiendo el ministerio de alabanza en la iglesia cristiana IBAMI.
Tu misión es seleccionar y recomendar exactamente entre 4 y 6 canciones del catálogo proporcionado que construyan un orden de servicio (setlist) coherente y bíblicamente sólido en torno al tema de la prédica o pasaje bíblico.

PRINCIPIOS LITÚRGICOS DE IBAMI:
1. APERTURA (1-2 canciones): De tempo alegre/rápido o proclamación festiva que congregue y enfoque la atención en el Señor.
2. ADORACIÓN & ENFOQUE (2-3 canciones): De tempo medio o lento, cristocéntricas, que preparen el corazón de la iglesia para la predicación de la Palabra.
3. MINISTRACIÓN & RESPUESTA (1-2 canciones): De tempo lento/íntimo, de consagración, entrega, fe o clamor para sellar el mensaje pastoral.

REGLAS ESTRICTAS:
- Usa ÚNICAMENTE canciones que estén en la lista provista (usando su id y título exactos).
- Para cada canción indica en qué momento del servicio encaja ("Apertura", "Adoración" o "Ministración") y una justificación teológico-pastoral clara y concisa (1 o 2 oraciones).
- No inventes canciones ni títulos externos.
- Cero emojis en cualquier parte del texto.
- Devuelve ÚNICAMENTE un JSON válido con el siguiente formato exacto:

{
  "suggestions": [
    {
      "songId": "id-exacto",
      "moment": "Apertura",
      "reason": "Explicación teológica y litúrgica de por qué conecta con el tema."
    }
  ]
}`

    const userPrompt = `Tema o pasaje del sermón: "${topic}"
Canciones ya seleccionadas en el setlist: ${JSON.stringify(currentSetlist)}

Catálogo disponible de canciones de IBAMI:
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
