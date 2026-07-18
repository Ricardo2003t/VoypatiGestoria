/* ════════════════════════════════════════════════════════════════
     VOYPATIGESTORIA — script.js
     Vanilla ES6+ · Mobile-First · PWA
════════════════════════════════════════════════════════════════ */

'use strict';

/* ── POLYFILL: crypto.randomUUID para Safari < 15.4 ───────────── */
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
}

/* ── CONFIGURACIÓN ──────────────────────────────────────────── */
const CONFIG = {
  WA_NUMBER:    '5358474565',
  PAGE_SIZE:    8,
  SEARCH_DELAY: 400,
  CAROUSEL_MAX: 10,
  NUEVOS_DIAS:  7,
};

/* ── DETECCIÓN DE CONEXIÓN LENTA ────────────────────────────── */
const isSlowConnection = (() => {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  return conn.saveData ||
         (conn.effectiveType && ['slow-2g','2g'].includes(conn.effectiveType)) ||
         (conn.downlink && conn.downlink < 1);
})();

/* ── CATEGORÍAS ─────────────────────────────────────────────── */
const CATEGORIAS = {
  ferreteria:         { label: 'Ferretería',            color: '#8d6748' },
  celulares:          { label: 'Celulares y accesorios', color: '#2563eb' },
  transporte:         { label: 'Transporte',            color: '#0f766e' },
  hogar:              { label: 'Útiles del hogar',      color: '#c026d3' },
  tecnologia:         { label: 'Tecnología',             color: '#4f46e5' },
  electrodomesticos:  { label: 'Electrodomésticos',      color: '#059669' },
  deportivos:         { label: 'Deportivos',             color: '#dc2626' },
};

/* ── PLACEHOLDER DE IMAGEN ──────────────────────────────────── */
const svgPlaceholder = (bg, emoji) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>
    <rect width='400' height='400' fill='${bg}'/>
    <text x='200' y='230' font-size='150' text-anchor='middle' dominant-baseline='middle'>${emoji}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect fill='%23FFFFFF' width='400' height='400'/%3E%3C/svg%3E`;

/* ── ESTADO DEL CATÁLOGO ───────────────────────────────────── */
let productos = [];

const CACHE_KEY = `vp-catalogo-${CLIENTE_ID}`;

const mapProducto = row => ({
  id:             row.id,
  categoria:      row.categoria,
  nombre:         row.nombre,
  precio:         Number(row.precio),
  precioOriginal: row.precio_original != null ? Number(row.precio_original) : null,
  imagenes:       row.imagen_url ? [row.imagen_url] : [PLACEHOLDER],
  descripcion:    row.descripcion || '',
  oferta:         !!row.oferta,
  disponible:     row.disponible !== false,
  createdAt:      row.created_at || null,
});

/* Trae el catálogo del cliente de este deploy (CLIENTE_ID, ver supabase-config.js).
   Si falla (sin señal, Supabase caído, etc.) usa el último catálogo guardado
   en localStorage para que el sitio nunca se quede en blanco. */
const CATEGORIA_ORDER = ['ferreteria','celulares','transporte','hogar','tecnologia','electrodomesticos','deportivos'];

const cargarProductos = async () => {
  const url =
    `${SUPABASE_URL}/rest/v1/productos?select=*` +
    `&cliente_id=eq.${CLIENTE_ID}&order=created_at.desc`;

  try {
    const res = await fetch(url, {
      headers: supaHeadersPublic(),
      mode: 'cors',
      cache: 'no-store'
    });
    console.log('[index] cargarProductos status:', res.status);
    if (!res.ok) {
      const txt = await res.text();
      console.error('[index] cargarProductos error:', res.status, txt);
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    console.log('[index] cargarProductos count:', data.length);
    productos = data.map(mapProducto);
    productos.sort((a, b) => {
      const ca = CATEGORIA_ORDER.indexOf(a.categoria);
      const cb = CATEGORIA_ORDER.indexOf(b.categoria);
      if (ca !== cb) return ca - cb;
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(productos)); } catch (e) { console.warn('[index] localStorage setItem failed:', e); }
  } catch (err) {
    console.error('[index] cargarProductos fallback:', err.message);
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      productos = cached ? JSON.parse(cached) : [];
    } catch (e) { productos = []; }
  }
};

/* ── ESTADO GLOBAL ─────────────────────────────────────────── */
const state = {
  filteredProducts: [],
  currentPage:      0,
  isLoading:        false,
  showSeparators:   false,
  modalProduct:     null,
  modalImgIdx:      0,
  lastFocusedCard:  null,
};

/* ── REFS DOM ──────────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── UTILIDADES ─────────────────────────────────────────────── */
const formatPrice = n => `$${Number(n).toFixed(2)}`;

const normalize = str =>
  String(str).toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const categoriaLabel = cat => (CATEGORIAS[cat] && CATEGORIAS[cat].label) || cat;

const showToast = msg => {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
};

const buildWAMessage = ({ nombre, categoria, precio }) => {
  return encodeURIComponent(
    `Hola VoypatiGestoria! 👋\n\nMe interesa este producto:\n\n` +
    `🛒 *${nombre}*\n` +
    `📂 Categoría: ${categoriaLabel(categoria)}\n` +
    `💰 Precio: ${formatPrice(precio)}\n\n` +
    `¿Está disponible?`
  );
};

/* ── LAZY LOAD IMÁGENES ─────────────────────────────────────── */
const lazyObserver = new IntersectionObserver((entries, obs) => {
  entries.forEach(({ isIntersecting, target }) => {
    if (!isIntersecting) return;
    const src = target.dataset.src;
    if (!src) return;
    target.src = src;
    target.removeAttribute('data-src');
    obs.unobserve(target);
  });
}, { rootMargin: isSlowConnection ? '50px 0px' : '200px 0px', threshold: 0 });

const observeLazyImages = () => {
  $$('img[data-src]').forEach(img => lazyObserver.observe(img));
};

/* ── PRECARGA DE IMÁGENES POR BÚSQUEDA ─────────────────────── */
const preloadSearchImages = query => {
  if (!query || query.length < 2) return;
  const normalized = normalize(query);
  const words = normalized.split(/\s+/).filter(Boolean);

  const toPreload = productos
    .filter(p => {
      const haystack = normalize(`${p.nombre} ${categoriaLabel(p.categoria)}`);
      return words.some(w => haystack.includes(w));
    })
    .slice(0, 6)
    .flatMap(p => p.imagenes);

  toPreload.forEach(src => {
    if (!src) return;
    const img = new Image();
    img.src = src;
  });
};

/* ── HISTORIAL URL ─────────────────────────────────────────── */
const pushState = (params = {}) => {
  const url = new URL(window.location);
  ['categoria', 'q'].forEach(k => url.searchParams.delete(k));
  if (params.categoria && params.categoria !== 'todos') url.searchParams.set('categoria', params.categoria);
  if (params.q) url.searchParams.set('q', params.q);
  history.pushState(params, '', url.toString());
};

const applyStateFromURL = () => {
  const url       = new URL(window.location);
  const categoria = url.searchParams.get('categoria');
  const q         = url.searchParams.get('q');

  if (q) {
    syncBuscadores(q, '');
    filterBySearch(q);
    return;
  }
  if (categoria) {
    const chip = document.querySelector(`.chip[data-categoria="${categoria}"]`);
    if (chip) { activateChip(chip); filterByCategoria(categoria); return; }
  }
  resetFiltersUI();
  state.filteredProducts = [...productos];
  state.showSeparators = true;
  renderCatalogo();
};

/* ── FILTROS UI ────────────────────────────────────────────── */
const activateChip = chip => {
  $$('.chip').forEach(c => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });
  chip.classList.add('active');
  chip.setAttribute('aria-pressed', 'true');
};

const resetFiltersUI = () => {
  $$('.chip').forEach(c => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });
  const todos = document.querySelector('.chip[data-categoria="todos"]');
  if (todos) { todos.classList.add('active'); todos.setAttribute('aria-pressed', 'true'); }
};

/* ── FILTRAR PRODUCTOS ─────────────────────────────────────── */
const filterByCategoria = categoria => {
  state.filteredProducts = categoria === 'todos'
    ? [...productos]
    : productos.filter(p => p.categoria === categoria);
  state.showSeparators = categoria === 'todos';
  renderCatalogo();
};

/* ── BÚSQUEDA FUZZY ────────────────────────────────────────── */
const fuzzyScore = (p, query) => {
  const words    = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(`${p.nombre} ${categoriaLabel(p.categoria)} ${p.descripcion}`);
  let score = 0;
  words.forEach(w => {
    if (haystack.includes(w)) score += 3;
    else {
      const chars = [...new Set(w.split(''))];
      chars.forEach(c => { if (haystack.includes(c)) score += 0.3; });
    }
  });
  return score;
};

const getSimilarProducts = query => {
  const normalizedQuery = normalize(query);
  const chars = [...new Set(normalizedQuery.split(''))];
  return productos
    .map(p => {
      const haystack = normalize(`${p.nombre} ${categoriaLabel(p.categoria)} ${p.descripcion}`);
      let score = 0;
      chars.forEach(c => { if (haystack.includes(c)) score += 1; });
      normalizedQuery.split(/\s+/).forEach(w => {
        if (w.length >= 2 && haystack.includes(w.substring(0, w.length - 1))) score += 3;
      });
      return { p, score };
    })
    .filter(({ score }) => score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
};

const filterBySearch = query => {
  if (!query.trim()) {
    state.filteredProducts = [...productos];
    state.showSeparators = true;
    renderCatalogo();
    return;
  }
  state.showSeparators = false;
  const results = productos
    .map(p => ({ p, score: fuzzyScore(p, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p);

  if (results.length === 0) {
    const similar = getSimilarProducts(query);
    if (similar.length > 0) {
      state.filteredProducts = similar.map(x => x.p);
      renderCatalogo();
      showToast('Mostrando productos similares');
      return;
    }
  }
  state.filteredProducts = results;
  renderCatalogo();
};

/* ── SINCRONIZAR BUSCADORES ─────────────────────────────────── */
const syncBuscadores = (valor, origenId) => {
  const desktop = $('buscador-desktop');
  if (desktop && desktop.id !== origenId) desktop.value = valor;
  const clearDesktop = $('clear-desktop');
  if (clearDesktop) clearDesktop.hidden = !valor;
};

/* ── RENDER TARJETA PRODUCTO ────────────────────────────────── */
const createCard = p => {
  const article = document.createElement('article');
  article.className = 'p-card';
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '0');
  article.setAttribute('aria-label', `${p.nombre}, ${formatPrice(p.precio)}`);

  const precioHTML = p.precioOriginal
    ? `<span class="p-card-precio">${formatPrice(p.precio)}</span>
       <span class="p-card-precio-og">${formatPrice(p.precioOriginal)}</span>`
    : `<span class="p-card-precio">${formatPrice(p.precio)}</span>`;

  article.innerHTML = `
    <div class="p-card-img-wrap">
      <img
        class="p-card-img"
        data-src="${p.imagenes[0]}"
        src="${PLACEHOLDER}"
        alt="${p.nombre}"
        width="400" height="400"
        loading="lazy"
      />
      ${esNuevo(p) ? '<span class="p-card-badge-nuevo" aria-label="Producto nuevo">Nuevo</span>' : ''}
      ${p.oferta ? '<span class="p-card-badge-oferta" aria-label="Producto en oferta">Oferta</span>' : ''}
      ${!p.disponible ? `<div class="p-card-no-disp-overlay" aria-hidden="true"><span>No Disponible</span></div>` : ''}
    </div>
    <div class="p-card-body">
      <div class="p-card-categoria">${categoriaLabel(p.categoria)}</div>
      <div class="p-card-nombre">${p.nombre}</div>
      <div class="p-card-precio-wrap">${precioHTML}</div>
      <span class="p-card-disp ${p.disponible ? 'si' : 'no'}" aria-label="${p.disponible ? 'Disponible' : 'No disponible'}">
        ${p.disponible ? 'Disponible' : 'No Disponible'}
      </span>
    </div>
  `;

  const open = () => openModal(p);
  article.addEventListener('click', open);
  article.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));

  return article;
};

/* ── LAZY LOAD / INFINITE SCROLL ───────────────────────────── */
const loadNextPage = () => {
  if (state.isLoading) return;
  const start = state.currentPage * CONFIG.PAGE_SIZE;
  const slice = state.filteredProducts.slice(start, start + CONFIG.PAGE_SIZE);
  if (!slice.length) { $('sentinel').style.display = 'none'; return; }

  state.isLoading = true;
  const grid = $('catalogo-grid');
  const frag = document.createDocumentFragment();
  slice.forEach(p => frag.appendChild(createCard(p)));
  grid.appendChild(frag);
  observeLazyImages();

  state.currentPage++;
  state.isLoading = false;

  if (state.currentPage * CONFIG.PAGE_SIZE >= state.filteredProducts.length) {
    $('sentinel').style.display = 'none';
  }
};

const sentinelObserver = new IntersectionObserver(
  entries => { if (entries[0].isIntersecting) loadNextPage(); },
  { rootMargin: '300px' }
);
sentinelObserver.observe($('sentinel'));

/* ── RENDER CATÁLOGO ───────────────────────────────────────── */
let lastSearchQuery = '';

/* Encabezado de sección (separador) por categoría, con un id para
   localizarlo al hacer scroll y marcar la sección activa. */
const createSectionHeader = cat => {
  const meta = CATEGORIAS[cat] || { label: cat, color: 'var(--accent)' };
  const header = document.createElement('div');
  header.className = 'catalogo-seccion';
  header.id = `seccion-${cat}`;
  header.dataset.categoria = cat;
  header.innerHTML = `
    <span class="catalogo-seccion-dot" style="background:${meta.color}"></span>
    <h3 class="catalogo-seccion-titulo">${meta.label}</h3>
    <span class="catalogo-seccion-linea"></span>
  `;
  return header;
};

const renderCatalogo = () => {
  state.currentPage = 0;
  const grid = $('catalogo-grid');
  grid.innerHTML = '';
  $('sentinel').style.display  = 'flex';

  $('total-badge').textContent = `${state.filteredProducts.length} producto${state.filteredProducts.length !== 1 ? 's' : ''}`;

  if (!state.filteredProducts.length) {
    $('sentinel').style.display = 'none';
    return;
  }

  /* Con separadores: agrupamos por categoría (en orden lógico) y pintamos
     un encabezado antes de cada grupo. Se renderiza de una vez porque el
     catálogo es acotado y así evitamos saltos de layout. */
  if (state.showSeparators) {
    const frag = document.createDocumentFragment();
    CATEGORIA_ORDER.forEach(cat => {
      const grupo = state.filteredProducts.filter(p => p.categoria === cat);
      if (!grupo.length) return;
      frag.appendChild(createSectionHeader(cat));
      grupo.forEach(p => frag.appendChild(createCard(p)));
    });
    grid.appendChild(frag);
    observeLazyImages();
    $('sentinel').style.display = 'none';
    setupSeccionObserver();
    return;
  }

  setupSeccionObserver.clear();
  loadNextPage();
};

/* Barra de sección activa: resalta en qué categoría se encuentra el
   usuario al bajar por el catálogo. Se calcula con scroll + rAF (sin
   getBoundingClientRect por elemento en cada frame, evitando lag). */
const setupSeccionObserver = () => {
  const barra = $('seccion-actual');
  const texto = barra.querySelector('.seccion-actual-texto');
  const dot   = barra.querySelector('.seccion-actual-dot');

  const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 62;
  const sat = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
  const top = headerH + sat + 60;

  let ticking = false;
  const update = () => {
    ticking = false;
    const headers = $$('.catalogo-seccion');
    if (!headers.length) {
      barra.hidden = true;
      barra.classList.remove('visible');
      return;
    }
    const y = window.scrollY + top;
    let activa = headers[0];
    for (const h of headers) {
      if (h.offsetTop <= y) activa = h; else break;
    }
    const meta = CATEGORIAS[activa.dataset.categoria] || { label: activa.dataset.categoria, color: 'var(--accent)' };
    texto.textContent = meta.label;
    dot.style.background = meta.color;

    if (window.scrollY < top - 20) {
      barra.classList.remove('visible');
      barra.hidden = true;
    } else {
      barra.hidden = false;
      barra.classList.add('visible');
    }
  };

  if (!setupSeccionObserver._bound) {
    setupSeccionObserver._bound = true;
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }
  update();
};

/* Oculta la barra de sección activa (cuando no hay separadores por
   categoría, p. ej. al filtrar por una sola categoría o al buscar). */
setupSeccionObserver.clear = () => {
  const barra = $('seccion-actual');
  if (barra) { barra.hidden = true; barra.classList.remove('visible'); }
};

/* ── SECCIÓN "NUEVOS" (productos de la última semana) ─────────── */
/* No se guarda ningún flag: un producto es "nuevo" si su created_at
   tiene menos de NUEVOS_DIAS días. Pasado ese tiempo deja de aparecer
   aquí automáticamente, pero sigue en el catálogo normal. */
const esNuevo = p => {
  if (!p.createdAt) return false;
  const diffMs = Date.now() - new Date(p.createdAt).getTime();
  return diffMs >= 0 && diffMs < CONFIG.NUEVOS_DIAS * 24 * 60 * 60 * 1000;
};

const buildNuevos = () => {
  const section = $('nuevos-section');
  const track   = $('nuevos-track');

  const nuevos = productos
    .filter(esNuevo)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, CONFIG.CAROUSEL_MAX);

  if (!nuevos.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  track.innerHTML = nuevos.map((p, i) => {
    const precioOgHTML = p.precioOriginal
      ? `<span class="c-card-price-original">${formatPrice(p.precioOriginal)}</span>`
      : '';
    return `
      <article class="c-card" role="listitem" tabindex="0"
               aria-label="${p.nombre}, ${formatPrice(p.precio)}${p.precioOriginal ? ', antes ' + formatPrice(p.precioOriginal) : ''}"
               data-idx="${i}">
        <div class="c-card-img-wrap">
          <img class="c-card-img"
               data-src="${p.imagenes[0]}"
               src="${PLACEHOLDER}"
               alt="${p.nombre}"
               width="400" height="400" loading="lazy" />
          ${esNuevo(p) ? '<span class="c-card-badge c-card-badge-nuevo">Nuevo</span>' : ''}
        </div>
        <div class="c-card-body">
          <div class="c-card-name">${p.nombre}</div>
          <div>
            <span class="c-card-price">${formatPrice(p.precio)}</span>${precioOgHTML}
          </div>
          <span class="c-card-badge">Ver</span>
        </div>
      </article>
    `;
  }).join('');

  track.querySelectorAll('.c-card').forEach((card, i) => {
    const open = () => openModal(nuevos[i]);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));
  });

  observeLazyImages();

  const getScrollAmount = () => {
    const firstCard = track.querySelector('.c-card');
    if (!firstCard) return 200;
    return (firstCard.offsetWidth + 8) * 2;
  };

  $('nuevos-prev').addEventListener('click', () =>
    track.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' })
  );
  $('nuevos-next').addEventListener('click', () =>
    track.scrollBy({ left:  getScrollAmount(), behavior: 'smooth' })
  );
};

/* ── CARRUSEL DE OFERTAS ───────────────────────────────────── */
const buildCarousel = () => {
  const ofertas = productos
    .filter(p => p.oferta)
    .sort(() => Math.random() - .5)
    .slice(0, CONFIG.CAROUSEL_MAX);

  if (!ofertas.length) {
    $('ofertas-section').hidden = true;
    return;
  }

  const track = $('carousel-track');
  track.innerHTML = ofertas.map((p, i) => {
    const precioOgHTML = p.precioOriginal
      ? `<span class="c-card-price-original">${formatPrice(p.precioOriginal)}</span>`
      : '';
    return `
      <article class="c-card" role="listitem" tabindex="0"
               aria-label="${p.nombre}, ${formatPrice(p.precio)}${p.precioOriginal ? ', antes ' + formatPrice(p.precioOriginal) : ''}"
               data-idx="${i}">
        <div class="c-card-img-wrap">
          <img class="c-card-img"
               data-src="${p.imagenes[0]}"
               src="${PLACEHOLDER}"
               alt="${p.nombre}"
               width="400" height="400" loading="lazy" />
        </div>
        <div class="c-card-body">
          <div class="c-card-name">${p.nombre}</div>
          <div>
            <span class="c-card-price">${formatPrice(p.precio)}</span>${precioOgHTML}
          </div>
          <span class="c-card-badge">Oferta</span>
        </div>
      </article>
    `;
  }).join('');

  track.querySelectorAll('.c-card').forEach((card, i) => {
    const open = () => openModal(ofertas[i]);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));
  });

  observeLazyImages();

  const getScrollAmount = () => {
    const firstCard = track.querySelector('.c-card');
    if (!firstCard) return 200;
    return (firstCard.offsetWidth + 8) * 2;
  };

  $('btn-prev').addEventListener('click', () =>
    track.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' })
  );
  $('btn-next').addEventListener('click', () =>
    track.scrollBy({ left:  getScrollAmount(), behavior: 'smooth' })
  );
};

const lockScroll = () => {
  scrollY = window.scrollY;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.classList.add('modal-open');
};
const unlockScroll = () => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  document.body.classList.remove('modal-open');
  window.scrollTo(0, scrollY);
};
let modalTouchStartX = 0;

const openModal = p => {
  state.modalProduct = p;
  state.modalImgIdx  = 0;
  state.lastFocusedCard = document.activeElement;

  $('modal-img').src = p.imagenes[0];
  $('modal-img').alt = p.nombre;

  const dotsEl = $('modal-dots');
  dotsEl.innerHTML = p.imagenes.length > 1
    ? p.imagenes.map((_, i) => `
        <button class="m-dot ${i === 0 ? 'active' : ''}"
                data-i="${i}"
                role="tab"
                aria-label="Imagen ${i + 1} de ${p.imagenes.length}"
                aria-selected="${i === 0}">
        </button>
      `).join('')
    : '';

  dotsEl.querySelectorAll('.m-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      state.modalImgIdx = +dot.dataset.i;
      $('modal-img').src = p.imagenes[state.modalImgIdx];
      dotsEl.querySelectorAll('.m-dot').forEach((d, i) => {
        d.classList.toggle('active', i === state.modalImgIdx);
        d.setAttribute('aria-selected', i === state.modalImgIdx);
      });
    });
  });

  $('modal-categoria').textContent = categoriaLabel(p.categoria);

  const dispEl = $('modal-disp');
  dispEl.textContent = p.disponible ? 'Disponible' : 'No disponible';
  dispEl.className   = `modal-disponibilidad ${p.disponible ? 'si' : 'no'}`;

  $('modal-nombre').textContent = p.nombre;

  const preciosEl = $('modal-precios');
  if (p.precioOriginal) {
    const pct = Math.round((1 - p.precio / p.precioOriginal) * 100);
    preciosEl.innerHTML = `
      <span class="modal-precio-actual">${formatPrice(p.precio)}</span>
      <span class="modal-precio-og">${formatPrice(p.precioOriginal)}</span>
      <span class="modal-descuento">-${pct}%</span>
    `;
  } else {
    preciosEl.innerHTML = `<span class="modal-precio-actual">${formatPrice(p.precio)}</span>`;
  }

  $('modal-desc').textContent = p.descripcion || '—';

  $('btn-whatsapp').href = `https://wa.me/${CONFIG.WA_NUMBER}?text=${buildWAMessage(p)}`;

  const overlay = $('modal-overlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  lockScroll();
  /* Agregamos un estado al historial para interceptar el botón de
     retroceso del móvil. Al presionar "atrás", popstate cerrará el
     modal en lugar de salir de la página. */
  history.pushState({ modal: true }, '');
};

const closeModal = () => {
  const overlay = $('modal-overlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  state.modalProduct = null;

  const restore = () => {
    unlockScroll();
    if (state.lastFocusedCard && typeof state.lastFocusedCard.focus === 'function') {
      state.lastFocusedCard.focus({ preventScroll: true });
    }
    overlay.removeEventListener('transitionend', restore);
  };
  overlay.addEventListener('transitionend', restore);
  setTimeout(() => {
    overlay.removeEventListener('transitionend', restore);
    unlockScroll();
    if (state.lastFocusedCard && typeof state.lastFocusedCard.focus === 'function') {
      state.lastFocusedCard.focus({ preventScroll: true });
    }
  }, 400);

};

$('modal-close').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', e => {
  if (e.target === $('modal-overlay')) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

$('modal').addEventListener('touchstart', e => {
  modalTouchStartX = e.touches[0].clientX;
}, { passive: true });

$('modal').addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - modalTouchStartX;
  const p  = state.modalProduct;
  if (!p || p.imagenes.length < 2 || Math.abs(dx) < 50) return;

  if (dx < 0 && state.modalImgIdx < p.imagenes.length - 1) state.modalImgIdx++;
  else if (dx > 0 && state.modalImgIdx > 0) state.modalImgIdx--;
  else return;

  $('modal-img').src = p.imagenes[state.modalImgIdx];
  $('modal-dots').querySelectorAll('.m-dot').forEach((d, i) => {
    d.classList.toggle('active', i === state.modalImgIdx);
    d.setAttribute('aria-selected', i === state.modalImgIdx);
  });
});

/* ── EVENTOS BUSCADORES ─────────────────────────────────────── */
let searchTimer;

const handleSearch = (valor, id) => {
  clearTimeout(searchTimer);
  syncBuscadores(valor, id);

  if (!valor.trim()) {
    lastSearchQuery = '';
    resetFiltersUI();
    pushState({});
    state.filteredProducts = [...productos];
    state.showSeparators = true;
    renderCatalogo();
    return;
  }

  searchTimer = setTimeout(() => {
    lastSearchQuery = valor.trim();
    resetFiltersUI();
    pushState({ q: valor.trim() });
    filterBySearch(valor.trim());
    preloadSearchImages(valor.trim());
  }, CONFIG.SEARCH_DELAY);
};

$('buscador-desktop').addEventListener('keyup', function () {
  handleSearch(this.value, this.id);
});

$('clear-desktop').addEventListener('click', () => {
  $('buscador-desktop').value = '';
  handleSearch('', 'buscador-desktop');
  $('buscador-desktop').focus();
});

$('buscador-desktop').addEventListener('input', function () {
  $('clear-desktop').hidden = !this.value;
});

/* ── EVENTOS FILTROS ────────────────────────────────────────── */
$('filters-scroll').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;

  activateChip(chip);
  syncBuscadores('', '');
  $$('.buscador').forEach(b => b.value = '');
  $$('[id^="clear-"]').forEach(b => b.hidden = true);

  const categoria = chip.dataset.categoria;
  if (categoria) {
    pushState(categoria !== 'todos' ? { categoria } : {});
    filterByCategoria(categoria);
  }
});

/* ── MENÚ HAMBURGER ─────────────────────────────────────────── */
const openMenu = () => {
  $('mobile-menu').classList.add('open');
  $('menu-overlay').classList.add('open');
  $('mobile-menu').setAttribute('aria-hidden', 'false');
  $('menu-overlay').setAttribute('aria-hidden', 'false');
  $('btn-menu').classList.add('open');
  $('btn-menu').setAttribute('aria-expanded', 'true');
  lockScroll();
  document.body.classList.add('menu-open');
};
const closeMenu = () => {
  $('mobile-menu').classList.remove('open');
  $('menu-overlay').classList.remove('open');
  $('mobile-menu').setAttribute('aria-hidden', 'true');
  $('menu-overlay').setAttribute('aria-hidden', 'true');
  $('btn-menu').classList.remove('open');
  $('btn-menu').setAttribute('aria-expanded', 'false');
  unlockScroll();
  document.body.classList.remove('menu-open');
};

$('btn-menu').addEventListener('click', () =>
  $('mobile-menu').classList.contains('open') ? closeMenu() : openMenu()
);
$('btn-close-menu').addEventListener('click', closeMenu);
$('menu-overlay').addEventListener('click', closeMenu);
$('mobile-menu').querySelectorAll('.menu-link').forEach(l =>
  l.addEventListener('click', closeMenu)
);

/* ── BACK BUTTON / POPSTATE ────────────────────────────────── */
window.addEventListener('popstate', () => {
  if ($('modal-overlay').classList.contains('open')) {
    /* Cerramos el modal y restauramos el scroll INMEDIATAMENTE,
       sin esperar transiciones CSS, para que el botón de retroceso
       del móvil nos devuelva exactamente a donde estábamos. */
    const overlay = $('modal-overlay');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    state.modalProduct = null;
    unlockScroll();
    if (state.lastFocusedCard && typeof state.lastFocusedCard.focus === 'function') {
      state.lastFocusedCard.focus({ preventScroll: true });
    }
    return;
  }
  applyStateFromURL();
});

/* ── SCROLL TO TOP ─────────────────────────────────────────── */
window.addEventListener('scroll', () => {
  const btn = $('scroll-top');
  if (window.scrollY > 450) btn.removeAttribute('hidden');
  else btn.setAttribute('hidden', '');
}, { passive: true });

$('scroll-top').addEventListener('click', () =>
  window.scrollTo({ top: 0, behavior: 'smooth' })
);

/* ── DARK MODE ──────────────────────────────────────────────── */
const applyTheme = theme => {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('vp-theme', theme); } catch (e) { /* modo privado: no persiste, no pasa nada */ }

  const btn = $('btn-theme');
  if (!btn) return;
  if (theme === 'dark') {
    btn.setAttribute('aria-label', 'Cambiar a modo claro');
    btn.title = 'Modo claro';
  } else {
    btn.setAttribute('aria-label', 'Cambiar a modo oscuro');
    btn.title = 'Modo oscuro';
  }
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
};

const btnTheme = $('btn-theme');
if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  let saved = null;
  try { saved = localStorage.getItem('vp-theme'); } catch (err) { /* modo privado */ }
  if (!saved) {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

/* ── APPLE MAPS — solo visible en iOS ──────────────────────── */
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const btnApple = $('btn-apple-maps');
if (btnApple && isIOS) {
  btnApple.classList.add('visible');
  btnApple.href = 'maps://?q=VoypatiGestoria&ll=23.076917,-82.429631&z=16';
}

/* ── BUSCADOR STICKY (desactivado: el filtro quedó estático) ───── */
const stickyInput = $('buscador-sticky');
const stickyClear = $('clear-sticky');

if (stickyInput) {
  stickyInput.addEventListener('input', e => {
    const valor = e.target.value;
    syncBuscadores(valor, stickyInput.id);
  });
}
if (stickyClear) {
  stickyClear.addEventListener('click', () => {
    stickyInput.value = '';
    stickyClear.hidden = true;
    syncBuscadores('', stickyInput.id);
    stickyInput.focus();
  });
}

/* ── INIT ──────────────────────────────────────────────────── */
const init = async () => {
  await cargarProductos();
  state.filteredProducts = [...productos];
  buildNuevos();
  buildCarousel();
  applyStateFromURL(); // leer URL al cargar (links compartidos)
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
