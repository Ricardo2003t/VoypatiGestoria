/* ════════════════════════════════════════════════════════════════
    SUPABASE-CONFIG.JS
    Config compartida por script.js (catálogo público) y admin.js (panel).
════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://wyxmesvhfwrcknccbqrn.supabase.co';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5eG1lc3ZoZndyY2tuY2NicXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMjE0MTksImV4cCI6MjA5OTY5NzQxOX0.pCP7P3bdJRA7d6T1sZbt33nD44t3w-RPTDQGpl84v_Q';

const NEGOCIO_SLUG = 'voypatigestoria';
const CLIENTE_ID   = '2e923041-7ac9-4b2a-83b3-2bc8e0c52753';

const STORAGE_BUCKET = 'Productos';

const supaHeadersPublic = () => ({
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
});

const supaHeadersAuth = accessToken => ({
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
});
