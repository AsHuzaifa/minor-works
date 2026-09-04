import { site, about, posters, projects, contact } from './data.js';
import { mountCanvas } from './art.js';
import { initHeader, initBeacon, preflightSig, initReveal, initReadout, esc, pad2 } from './ui.js';

preflightSig();

/* ---- 01 · about --------------------------------------------------------- */

function renderAbout() {
  const host = document.getElementById('about-body');
  if (!host) return;
  host.innerHTML = about.body.map((p) => '<p>' + esc(p) + '</p>').join('');
}

/* ---- 02 · posters ------------------------------------------------------- */

function renderPosters() {
  const host = document.getElementById('poster-list');
  if (!host) return;

  host.innerHTML = posters
    .map(
      (p) => `
      <article class="poster" data-art="${esc(p.art)}" data-seed="${esc(p.seed)}">
        <canvas aria-hidden="true"></canvas>
        <div class="poster__body">
          <div class="poster__top">
            <span class="poster__n">${esc(p.n)}</span>
            <span class="poster__label">poster / ${esc(p.n)}</span>
          </div>
          <div class="poster__bottom">
            <h3 class="poster__title">${esc(p.title)}</h3>
            <p class="poster__line">${esc(p.line)}</p>
            <p class="poster__sub">${esc(p.sub)}</p>
          </div>
        </div>
      </article>`
    )
    .join('');

  host.querySelectorAll('.poster').forEach((el) => {
    mountCanvas(el.querySelector('canvas'), el.dataset.art, {
      seed: Number(el.dataset.seed),
      maxDpr: 1.5,
      fps: 24,          // ambient background - 60fps buys nothing here
      px: 3,
      step: 10,
    });
  });
}

/* ---- 03 · index grid ---------------------------------------------------- */

function renderIndex() {
  const host = document.getElementById('index-grid');
  if (!host) return;

  host.innerHTML = projects
    .map(
      (p, i) => `
      <a class="card" href="project.html?id=${encodeURIComponent(p.slug)}" data-reveal
         style="transition-delay:${Math.min(i, 6) * 55}ms">
        <div class="card__art" data-art="${esc(p.art)}" data-seed="${esc(p.seed)}">
          <canvas aria-hidden="true"></canvas>
          <span class="card__n">/${pad2(i + 1)}</span>
          <span class="card__status">${esc(p.status)}</span>
        </div>
        <div class="card__meta">
          <h3 class="card__title">
            <span>${esc(p.title)}</span>
            <span class="card__year">${esc(p.year)}</span>
          </h3>
          <p class="card__blurb">${esc(p.blurb)}</p>
          <div class="tags">${(p.tags || []).map((t) => '<span class="tag">' + esc(t) + '</span>').join('')}</div>
          <span class="card__go">open <span aria-hidden="true">→</span></span>
        </div>
      </a>`
    )
    .join('');

  // thumbnails are static stills - one frame each, no animation loop
  host.querySelectorAll('.card__art').forEach((el, i) => {
    mountCanvas(el.querySelector('canvas'), el.dataset.art, {
      seed: Number(el.dataset.seed),
      animate: false,
      t: 2 + i,
      maxDpr: 1.5,
      px: 3,
      step: 7,
      size: 10,
    });
  });

  const count = document.getElementById('proj-count');
  if (count) count.textContent = pad2(projects.length);
}

/* ---- footer ------------------------------------------------------------- */

function renderContact() {
  const host = document.getElementById('contact-links');
  if (host) {
    host.innerHTML = contact.links
      .map(
        (l) => `
        <a href="${esc(l.url)}"${l.url.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>
          <span class="l-label">${esc(l.label)}</span>
          <span class="l-handle">${esc(l.handle)}</span>
        </a>`
      )
      .join('');
  }
  const y = document.getElementById('year');
  if (y) y.textContent = site.year;
}

/* ---- hero --------------------------------------------------------------- */

function initHero() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const handle = mountCanvas(canvas, 'lattice', {
    seed: 20260902,
    count: 230,
    panels: 7,
    maxDpr: 1.75,
  });

  // gentle parallax: the lattice leans away from the cursor
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener(
      'pointermove',
      (e) => {
        const dx = (e.clientX / window.innerWidth - 0.5) * -46;
        const dy = (e.clientY / window.innerHeight - 0.5) * -30;
        handle.setParallax(dx, dy);
      },
      { passive: true }
    );
  }
}

/* ---- boot --------------------------------------------------------------- */

renderAbout();
renderPosters();
renderIndex();
renderContact();
initHero();

initHeader();
initBeacon();
initReveal();
initReadout([
  { id: 'top', label: '00 / hero' },
  { id: 'about', label: '01 / about' },
  { id: 'posters', label: '02 / posters' },
  { id: 'index', label: '03 / index' },
  { id: 'contact', label: '04 / contact' },
]);
