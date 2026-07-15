/* ════════════════════════════════════════════════════════════════
   ADMIN.JS — Panel de administración VoypatiGestoria
   Vanilla JS + fetch nativo (sin SDK de Supabase, 0 KB de librerías)
════════════════════════════════════════════════════════════════ */

'use strict';

const SESSION_KEY = 'vp_admin_session';
const IMG_MAX_DIM = 900;   // px — lado más largo de la foto ya comprimida
const IMG_QUALITY = 0.8;   // calidad WebP (0–1)

const $ = id => document.getElementById(id);

/* ── ESTADO ─────────────────────────────────────────────────── */
let session   = null;   // { access_token, refresh_token, uid, email }
let productos = [];     // productos del negocio logueado
let editandoId = null;  // id del producto en edición (null = alta nueva)
let archivoSeleccionado = null; // File original elegido en el form

/* ── TOAST ──────────────────────────────────────────────────── */
const showToast = msg => {
  const t = $('admin-toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
};

/* ── SESIÓN: guardar / leer / borrar ───────────────────────────── */
const guardarSesion = s => {
  session = s;
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
};
const leerSesionGuardada = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
};
const borrarSesion = () => {
  session = null;
  localStorage.removeItem(SESSION_KEY);
};

/* Si por lo que sea (sesión vencida, error de carga, etc.) se intenta
   hacer una acción sin sesión activa, avisamos claro y devolvemos al
   login en vez de dejar que reviente con un error críptico. */
const requireSession = () => {
  if (session) return true;
  showToast('Tu sesión no está activa. Inicia sesión de nuevo.');
  $('panel-screen').hidden = true;
  $('form-overlay').hidden = true;
  $('login-screen').hidden = false;
  return false;
};

/* ── LOGIN ──────────────────────────────────────────────────── */
const login = async (email, password) => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Correo o contraseña incorrectos');

  guardarSesion({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    uid:           data.user.id,
    email:         data.user.email,
  });
};

/* Refresca el token cuando expiró (sesiones de más de 1 hora) */
const refrescarSesion = async () => {
  if (!session?.refresh_token) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  guardarSesion({ ...session, access_token: data.access_token, refresh_token: data.refresh_token });
  return true;
};

/* Envoltorio de fetch autenticado: si el token venció (401), refresca
   una vez y reintenta. Evita que al cliente le boten sin avisar. */
const authFetch = async (url, options = {}) => {
  const doFetch = () => fetch(url, {
    ...options,
    headers: { ...supaHeadersAuth(session.access_token), ...(options.headers || {}) },
  });
  let res = await doFetch();
  if (res.status === 401 && await refrescarSesion()) {
    res = await doFetch();
  }
  return res;
};

/* ── NEGOCIO (nombre a mostrar en el header) ───────────────────── */
const cargarNombreNegocio = async () => {
  try {
    const res = await authFetch(
      `${SUPABASE_URL}/rest/v1/negocios?select=nombre_negocio&id=eq.${session.uid}`
    );
    const data = await res.json();
    $('negocio-nombre').textContent = data?.[0]?.nombre_negocio || session.email;
  } catch {
    $('negocio-nombre').textContent = session.email;
  }
};

/* ── PRODUCTOS: leer / crear / editar / borrar ─────────────────── */
const cargarProductos = async () => {
  const res = await authFetch(
    `${SUPABASE_URL}/rest/v1/productos?select=*&cliente_id=eq.${session.uid}&order=created_at.desc`
  );
  if (!res.ok) throw new Error('No se pudieron cargar los productos');
  productos = await res.json();
};

const crearProducto = async payload => {
  const res = await authFetch(`${SUPABASE_URL}/rest/v1/productos`, {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ ...payload, cliente_id: session.uid }),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'No se pudo crear el producto');
  return res.json();
};

const actualizarProducto = async (id, payload) => {
  const res = await authFetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'No se pudo actualizar el producto');
};

const borrarProducto = async producto => {
  const res = await authFetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${producto.id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('No se pudo eliminar el producto');

  // Limpieza best-effort de la foto en Storage (si falla, no bloquea el borrado)
  if (producto.imagen_url) {
    const path = extraerPathStorage(producto.imagen_url);
    if (path) {
      authFetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}`, {
        method: 'DELETE',
        body: JSON.stringify({ prefixes: [path] }),
      }).catch(() => {});
    }
  }
};

const extraerPathStorage = url => {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
};

/* ── COMPRESIÓN DE FOTO A WEBP (canvas, sin librerías) ─────────── */
const comprimirAWebp = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
  reader.onload = e => {
    const img = new Image();
    img.onerror = () => reject(new Error('Archivo de imagen inválido'));
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > IMG_MAX_DIM) {
        height = Math.round(height * (IMG_MAX_DIM / width));
        width = IMG_MAX_DIM;
      } else if (height > IMG_MAX_DIM) {
        width = Math.round(width * (IMG_MAX_DIM / height));
        height = IMG_MAX_DIM;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen')),
        'image/webp',
        IMG_QUALITY
      );
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

/* Sube el blob ya comprimido y devuelve la URL pública */
const subirFoto = async blob => {
  const nombreArchivo = `${crypto.randomUUID()}.webp`;
  const path = `${session.uid}/${nombreArchivo}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'image/webp',
    },
    body: blob,
  });
  if (!res.ok) throw new Error('No se pudo subir la foto');

  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
};

/* ── RENDER: grid de productos del panel ───────────────────────── */
const formatPrice = n => `$${Number(n).toFixed(2)}`;

const renderGrid = () => {
  const grid = $('admin-grid');
  const empty = $('admin-empty');

  if (!productos.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = productos.map(p => `
    <article class="admin-card">
      <img class="admin-card-img" src="${p.imagen_url || ''}" alt="${p.nombre}" loading="lazy" />
      <div class="admin-card-body">
        <span class="admin-card-cat">${p.categoria || '—'}</span>
        <span class="admin-card-name">${p.nombre}</span>
        <span class="admin-card-price">
          ${formatPrice(p.precio)}
          ${p.precio_original ? `<span style="text-decoration:line-through;color:var(--text-muted);font-weight:500;font-size:12px;margin-left:6px;">${formatPrice(p.precio_original)}</span>` : ''}
        </span>
        <div class="admin-card-badges">
          ${p.oferta ? '<span class="admin-badge admin-badge-oferta">Oferta</span>' : ''}
          ${!p.disponible ? '<span class="admin-badge admin-badge-no-disp">No disponible</span>' : ''}
        </div>
        <div class="admin-card-actions">
          <button type="button" data-edit="${p.id}">Editar</button>
          <button type="button" class="admin-btn-danger" data-del="${p.id}">Eliminar</button>
        </div>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!requireSession()) return;
      abrirForm(productos.find(p => String(p.id) === btn.dataset.edit));
    })
  );
  grid.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!requireSession()) return;
      confirmarBorrado(productos.find(p => String(p.id) === btn.dataset.del));
    })
  );
};

const confirmarBorrado = async producto => {
  if (!confirm(`¿Eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    await borrarProducto(producto);
    productos = productos.filter(p => p.id !== producto.id);
    renderGrid();
    showToast('Producto eliminado');
  } catch (err) {
    showToast(err.message);
  }
};

/* ── FORMULARIO: abrir / cerrar / guardar ──────────────────────── */
const abrirForm = (producto = null) => {
  editandoId = producto?.id ?? null;
  archivoSeleccionado = null;

  $('form-title').textContent = producto ? 'Editar producto' : 'Agregar producto';
  $('f-id').value          = producto?.id ?? '';
  $('f-nombre').value      = producto?.nombre ?? '';
  $('f-categoria').value   = producto?.categoria ?? '';
  $('f-precio').value      = producto?.precio ?? '';
  $('f-precio-og').value   = producto?.precio_original ?? '';
  $('f-descripcion').value = producto?.descripcion ?? '';
  $('f-disponible').checked = producto ? !!producto.disponible : true;
  $('f-oferta').checked     = producto ? !!producto.oferta : false;
  $('f-imagen').value = '';
  $('form-error').hidden = true;

  const preview = $('f-preview');
  if (producto?.imagen_url) {
    preview.src = producto.imagen_url;
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }

  $('form-overlay').hidden = false;
};

const cerrarForm = () => {
  $('form-overlay').hidden = true;
};

$('f-imagen').addEventListener('change', e => {
  const file = e.target.files[0];
  archivoSeleccionado = file || null;
  if (file) {
    const preview = $('f-preview');
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  }
});

$('btn-nuevo').addEventListener('click', () => { if (requireSession()) abrirForm(); });
$('form-close').addEventListener('click', cerrarForm);
$('form-cancel').addEventListener('click', cerrarForm);
$('form-overlay').addEventListener('click', e => { if (e.target === $('form-overlay')) cerrarForm(); });

$('producto-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!requireSession()) return;

  const submitBtn = $('form-submit');
  const errorEl = $('form-error');
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando…';

  try {
    const payload = {
      nombre:          $('f-nombre').value.trim(),
      categoria:       $('f-categoria').value,
      precio:          Number($('f-precio').value),
      precio_original: $('f-precio-og').value ? Number($('f-precio-og').value) : null,
      descripcion:     $('f-descripcion').value.trim(),
      disponible:      $('f-disponible').checked,
      oferta:          $('f-oferta').checked,
    };

    if (archivoSeleccionado) {
      submitBtn.textContent = 'Procesando foto…';
      const blob = await comprimirAWebp(archivoSeleccionado);
      submitBtn.textContent = 'Subiendo foto…';
      payload.imagen_url = await subirFoto(blob);
    }

    submitBtn.textContent = 'Guardando…';

    if (editandoId) {
      await actualizarProducto(editandoId, payload);
      showToast('Producto actualizado');
    } else {
      await crearProducto(payload);
      showToast('Producto agregado');
    }

    cerrarForm();
    await cargarProductos();
    renderGrid();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar producto';
  }
});

/* ── LOGIN / LOGOUT: eventos ────────────────────────────────────── */
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-btn');
  const errorEl = $('login-error');
  errorEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Entrando…';

  try {
    await login($('login-email').value.trim(), $('login-password').value);
    await mostrarPanel();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

$('btn-logout').addEventListener('click', () => {
  borrarSesion();
  $('panel-screen').hidden = true;
  $('login-screen').hidden = false;
  $('login-form').reset();
});

/* ── ARRANQUE ───────────────────────────────────────────────────── */
const mostrarPanel = async () => {
  $('login-screen').hidden = true;
  $('panel-screen').hidden = false;
  $('admin-status').hidden = false;
  $('admin-status').textContent = 'Cargando tus productos…';

  await cargarNombreNegocio();
  try {
    await cargarProductos();
    $('admin-status').hidden = true;
    renderGrid();
  } catch (err) {
    $('admin-status').textContent = err.message;
  }
};

const init = () => {
  const guardada = leerSesionGuardada();
  if (guardada) {
    session = guardada;
    mostrarPanel();
  }
};

init();
