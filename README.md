# ACORDE · IBAMI Ministerio de Alabanza

Plataforma integral para la gestión de repertorio musical, programación de servicios, asignación de músicos y generación de partituras/letras con acordes interactivos (ChordPro) y sugerencias pastorales con IA.

---

## Características Principales

- **Gestión de Repertorio:** 150+ canciones organizadas por tonalidad, tempo, temática y enlaces de referencia.
- **Partituras Interactivas (ChordPro):** Transposición dinámica de tono (+1/-1 semitono) en tiempo real para cualquier instrumento.
- **Edición de Acordes por Miembros:** Cualquier músico del equipo puede subir o corregir los acordes en formato ChordPro directamente en la web.
- **Exportación a PDF:** Descarga de hojas de acordes maquetadas profesionalmente con el tono seleccionado listas para atril.
- **Calendario y Roster:** Programación de servicios dominicales y entre semana con confirmación de asistencia en vivo.
- **Sugerencias con IA (Groq):** Recomendación de canciones del catálogo según la temática de la prédica mediante Llama 3.3.
- **Diseño Responsive y Temas:** Interfaz adaptada para smartphones, tablets y pantallas de escritorio con modo oscuro y claro.

---

## Stack Tecnológico

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, jsPDF
- **Backend & Base de Datos:** Supabase (PostgreSQL, Row Level Security, Auth)
- **Edge Computing & IA:** Supabase Edge Functions + Groq API (`llama-3.3-70b-versatile`)
- **Despliegue:** Vercel

---

## Configuración Local

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Copia el archivo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
   Y completa tus credenciales de Supabase:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-public-key
   SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
   ```

3. **Inicializar la base de datos:**
   Ejecuta el script SQL en [`supabase/schema.sql`](./supabase/schema.sql) desde el SQL Editor de tu panel de Supabase.

4. **Importar canciones de Notion:**
   ```bash
   npm run import:notion -- --confirm
   ```

5. **Iniciar servidor de desarrollo:**
   ```bash
   npm run dev
   ```

---

## Despliegue en Vercel

1. Importa este repositorio en [Vercel](https://vercel.com).
2. En la sección **Environment Variables**, agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Presiona **Deploy**.
