/* ════════════════════════════════════════════════════════════════
   SUPABASE-CONFIG.JS
   Config compartida por script.js (catálogo público) y admin.js (panel).

   ⚠️ ESTE ARCHIVO ES ÚNICO POR CADA CLIENTE/DEPLOY.
   Cuando clones esta plantilla para un cliente nuevo, cambia SOLO
   estas dos constantes: NEGOCIO_SLUG y CLIENTE_ID.
   Todo lo demás (URL y ANON_KEY) es igual para todos tus clientes,
   porque viven en el mismo proyecto de Supabase.
════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://wyxmesvhfwrcknccbqrn.supabase.co';

// Clave pública (anon). Es SEGURO que esté visible en el navegador:
// la protección real la da RLS en la base de datos, no esta clave.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5eG1lc3ZoZndyY2tuY2NicXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMjE0MTksImV4cCI6MjA5OTY5NzQxOX0.pCP7P3bdJRA7d6T1sZbt33nD44t3w-RPTDQGpl84v_Q';

// Identifica a QUÉ cliente pertenece este deploy en particular.
const NEGOCIO_SLUG = 'voypatigestoria';
const CLIENTE_ID   = '2e923041-7ac9-4b2a-83b3-2bc8e0c52753';

// Bucket de Storage donde se guardan las fotos.
const STORAGE_BUCKET = 'productos';

/* ── HELPERS DE PETICIÓN (fetch nativo, sin SDK, 0 KB extra) ───── */

// Cabeceras para lectura pública (catálogo de clientes finales)
const supaHeadersPublic = () => ({
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
});

// Cabeceras para peticiones autenticadas (panel admin), con el token
// de sesión del dueño del negocio logueado.
const supaHeadersAuth = accessToken => ({
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
});
