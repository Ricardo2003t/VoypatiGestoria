/* ════════════════════════════════════════════════════════════════
   VOYPATIGESTORIA — script.js
   Vanilla ES6+ · Mobile-First · PWA
════════════════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIGURACIÓN ──────────────────────────────────────────── */
const CONFIG = {
  WA_NUMBER:    '5358474565',  // ← número de contacto
  PAGE_SIZE:    8,             // tarjetas por lote
  SEARCH_DELAY: 400,           // ms debounce búsqueda
  CAROUSEL_MAX: 10,
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

/* ── PLACEHOLDER DE IMAGEN (SVG inline, sin depender de fotos reales) ── */
const svgPlaceholder = (bg, emoji) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>
    <rect width='400' height='400' fill='${bg}'/>
    <text x='200' y='230' font-size='150' text-anchor='middle' dominant-baseline='middle'>${emoji}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect fill='%23fff1e3' width='400' height='400'/%3E%3C/svg%3E`;

/* ── ESTADO DEL CATÁLOGO (se llena desde Supabase, ver cargarProductos) ── */
let productos = [];

/* Clave de caché local — permite mostrar el último catálogo conocido
   aunque el cliente entre sin señal o con conexión muy inestable. */
const CACHE_KEY = `vp-catalogo-${CLIENTE_ID}`;

/* Convierte una fila de la tabla `productos` (snake_case, Postgres)
   al formato que usa el resto del script (camelCase, con array de imágenes) */
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
});

/* Trae el catálogo del cliente de este deploy (CLIENTE_ID, ver supabase-config.js).
   Si falla (sin señal, Supabase caído, etc.) usa el último catálogo guardado
   en localStorage para que el sitio nunca se quede en blanco. */
const cargarProductos = async () => {
  const url =
    `${SUPABASE_URL}/rest/v1/productos?select=*` +
    `&cliente_id=eq.${CLIENTE_ID}&order=created_at.desc`;

  try {
    const res = await fetch(url, { headers: supaHeadersPublic() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    productos = data.map(mapProducto);
    localStorage.setItem(CACHE_KEY, JSON.stringify(productos));
  } catch (err) {
    const cached = localStorage.getItem(CACHE_KEY);
    productos = cached ? JSON.parse(cached) : [];
  }
};


/* ── ESTADO GLOBAL ──────────────────────────────────────────── */
const state = {
  filteredProducts: [],   // se llena en init(), después de cargarProductos()
  currentPage:      0,
  isLoading:        false,
  modalProduct:     null,
  modalImgIdx:      0,
};

/* ── REFS DOM ───────────────────────────────────────────────── */
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

/* ── HISTORIAL URL ──────────────────────────────────────────── */
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
  renderCatalogo();
};

/* ── FILTROS UI ─────────────────────────────────────────────── */
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

/* ── FILTRAR PRODUCTOS ──────────────────────────────────────── */
const filterByCategoria = categoria => {
  state.filteredProducts = categoria === 'todos'
    ? [...productos]
    : productos.filter(p => p.categoria === categoria);
  renderCatalogo();
};

/* ── BÚSQUEDA FUZZY ─────────────────────────────────────────── */
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
    renderCatalogo();
    return;
  }
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
  ['buscador-desktop', 'buscador-mobile'].forEach(id => {
    const el = $(id);
    if (el && el.id !== origenId) el.value = valor;
  });
  $('clear-desktop').hidden = !$('buscador-desktop').value;
  $('clear-mobile').hidden  = !$('buscador-mobile').value;
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

/* ── LAZY LOAD / INFINITE SCROLL ────────────────────────────── */
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

/* ── RENDER CATÁLOGO ────────────────────────────────────────── */
let lastSearchQuery = '';

const renderCatalogo = () => {
  state.currentPage = 0;
  $('catalogo-grid').innerHTML = '';
  $('sentinel').style.display  = 'flex';

  $('total-badge').textContent = `${state.filteredProducts.length} producto${state.filteredProducts.length !== 1 ? 's' : ''}`;

  if (!state.filteredProducts.length) {
    $('sentinel').style.display = 'none';
    return;
  }

  loadNextPage();
};

/* ── CARRUSEL DE OFERTAS ────────────────────────────────────── */
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
    return (firstCard.offsetWidth + 10) * 2;
  };

  $('btn-prev').addEventListener('click', () =>
    track.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' })
  );
  $('btn-next').addEventListener('click', () =>
    track.scrollBy({ left:  getScrollAmount(), behavior: 'smooth' })
  );
};

/* ── MODAL ──────────────────────────────────────────────────── */
let modalTouchStartX = 0;

const openModal = p => {
  state.modalProduct = p;
  state.modalImgIdx  = 0;

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
  document.body.style.overflow = 'hidden';

  setTimeout(() => $('modal').focus(), 50);
};

const closeModal = () => {
  const overlay = $('modal-overlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.modalProduct = null;
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
$('buscador-mobile').addEventListener('keyup', function () {
  handleSearch(this.value, this.id);
});

$('clear-desktop').addEventListener('click', () => {
  $('buscador-desktop').value = '';
  handleSearch('', 'buscador-desktop');
  $('buscador-desktop').focus();
});
$('clear-mobile').addEventListener('click', () => {
  $('buscador-mobile').value = '';
  handleSearch('', 'buscador-mobile');
  $('buscador-mobile').focus();
});

['buscador-desktop', 'buscador-mobile'].forEach(id => {
  $(id).addEventListener('input', function () {
    const clearId = id === 'buscador-desktop' ? 'clear-desktop' : 'clear-mobile';
    $(clearId).hidden = !this.value;
  });
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

/* ── BUSCADOR MÓVIL TOGGLE ──────────────────────────────────── */
$('btn-search-mobile').addEventListener('click', function () {
  const bar    = $('mobile-search-bar');
  const isOpen = bar.classList.toggle('open');
  this.setAttribute('aria-expanded', isOpen);
  bar.setAttribute('aria-hidden', !isOpen);
  if (isOpen) setTimeout(() => $('buscador-mobile').focus(), 320);
});

/* ── MENÚ HAMBURGER ─────────────────────────────────────────── */
const openMenu = () => {
  $('mobile-menu').classList.add('open');
  $('menu-overlay').classList.add('open');
  $('mobile-menu').setAttribute('aria-hidden', 'false');
  $('menu-overlay').setAttribute('aria-hidden', 'false');
  $('btn-menu').classList.add('open');
  $('btn-menu').setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
};
const closeMenu = () => {
  $('mobile-menu').classList.remove('open');
  $('menu-overlay').classList.remove('open');
  $('mobile-menu').setAttribute('aria-hidden', 'true');
  $('menu-overlay').setAttribute('aria-hidden', 'true');
  $('btn-menu').classList.remove('open');
  $('btn-menu').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
};

$('btn-menu').addEventListener('click', () =>
  $('mobile-menu').classList.contains('open') ? closeMenu() : openMenu()
);
$('btn-close-menu').addEventListener('click', closeMenu);
$('menu-overlay').addEventListener('click', closeMenu);
$('mobile-menu').querySelectorAll('.menu-link').forEach(l =>
  l.addEventListener('click', closeMenu)
);

/* ── BACK BUTTON / POPSTATE ─────────────────────────────────── */
window.addEventListener('popstate', () => {
  if ($('modal-overlay').classList.contains('open')) {
    closeModal();
    return;
  }
  applyStateFromURL();
});

/* ── SCROLL TO TOP ──────────────────────────────────────────── */
window.addEventListener('scroll', () => {
  const btn = $('scroll-top');
  if (window.scrollY > 450) btn.removeAttribute('hidden');
  else btn.setAttribute('hidden', '');
}, { passive: true });

$('scroll-top').addEventListener('click', () =>
  window.scrollTo({ top: 0, behavior: 'smooth' })
);

/* ── DARK MODE ───────────────────────────────────────────────── */
const applyTheme = theme => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('vp-theme', theme);

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
  if (!localStorage.getItem('vp-theme')) {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

/* ── APPLE MAPS — solo visible en iOS ───────────────────────── */
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const btnApple = $('btn-apple-maps');
if (btnApple && isIOS) {
  btnApple.classList.add('visible');
  btnApple.href = 'maps://?q=VoypatiGestoria&ll=23.076917,-82.429631&z=16';
}

/* ── INIT ───────────────────────────────────────────────────── */
const init = async () => {
  await cargarProductos();
  state.filteredProducts = [...productos];
  buildCarousel();
  applyStateFromURL(); // leer URL al cargar (links compartidos)
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
