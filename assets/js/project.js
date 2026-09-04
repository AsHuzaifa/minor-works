import { projects, site } from './data.js';
import { mountCanvas } from './art.js';
import { initHeader, initBeacon, preflightSig, initReveal, initReadout, esc, pad2 } from './ui.js';

preflightSig();

const root = document.getElementById('project-root');
const slug = new URLSearchParams(location.search).get('id');
const i = projects.findIndex((p) => p.slug === slug);

if (i === -1) {
  renderMissing();
} else {
  renderProject(projects[i], i);
}

initHeader();
initBeacon();
initReveal();
initReadout([{ id: 'p-hero', label: slug ? esc(slug) : 'not found' }]);

/* ------------------------------------------------------------------------- */

function renderMissing() {
  document.title = 'Not found / ' + site.name;
  root.innerHTML = `
    <section class="p-empty" id="p-hero">
      <p class="eyebrow" style="margin:0 0 18px">/404</p>
      <h1 class="p-title">No such<br>entry</h1>
      <p class="p-blurb">
        ${slug ? 'Nothing in the index matches <b>' + esc(slug) + '</b>.' : 'No project was requested.'}
        It may have been renamed, or it never existed.
      </p>
      <a class="btn" href="index.html#index"><span aria-hidden="true">←</span> back to the index</a>
    </section>`;
}

function renderProject(p, idx) {
  document.title = p.title + ' / ' + site.name;

  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', p.blurb);

  const prev = projects[idx - 1];
  const next = projects[idx + 1];

  root.innerHTML = `
    <section class="p-hero" id="p-hero">
      <canvas aria-hidden="true"></canvas>
      <div class="p-hero__inner">
        <a class="p-back" href="index.html#index"><span aria-hidden="true">←</span> index</a>

        <p class="eyebrow" style="margin:0 0 16px">/${pad2(idx + 1)} minor work</p>
        <h1 class="p-title">${esc(p.title)}</h1>
        <p class="p-blurb">${esc(p.blurb)}</p>

        <div class="p-strip">
          <span>year <b>${esc(p.year)}</b></span>
          <span>status <b>${esc(p.status)}</b></span>
          <span>stack <b>${(p.stack || []).map(esc).join(' · ')}</b></span>
        </div>
      </div>
    </section>

    <div class="p-body">
      <div class="p-main">
        ${(p.sections || [])
          .map(
            (s) => `
          <section class="p-sec" data-reveal>
            <h2>${esc(s.h)}</h2>
            <p>${esc(s.p)}</p>
            ${
              s.a
                ? `<a class="btn" href="${esc(s.a.href)}">${esc(s.a.label)} <span aria-hidden="true">&#8594;</span></a>`
                : ''
            }
          </section>`
          )
          .join('')}
      </div>

      <aside class="p-side">
        <div class="block" data-reveal>
          <h2>Specs</h2>
          ${Object.entries(p.specs || {})
            .map(
              ([k, v]) => `
            <div class="spec"><span>${esc(k)}</span><span>${esc(v)}</span></div>`
            )
            .join('')}
        </div>

        <div class="block" data-reveal>
          <h2>Tags</h2>
          <div class="tags" style="margin-top:12px">
            ${(p.tags || []).map((t) => '<span class="tag">' + esc(t) + '</span>').join('')}
          </div>
        </div>

        ${
          p.repo
            ? `<div class="block" data-reveal>
                 <a class="btn" href="${esc(p.repo)}" target="_blank" rel="noopener noreferrer">
                   source <span aria-hidden="true">↗</span>
                 </a>
               </div>`
            : `<div class="block" data-reveal>
                 <h2>Source</h2>
                 <div class="spec"><span>repository</span><span>not published</span></div>
               </div>`
        }
      </aside>
    </div>

    <nav class="p-nav">
      ${navLink(prev, 'prev', '←')}
      ${navLink(next, 'next', '→')}
    </nav>`;

  const canvas = root.querySelector('.p-hero canvas');
  if (canvas) {
    mountCanvas(canvas, p.art, {
      seed: p.seed, maxDpr: 1.5, fps: 20, px: 3, step: 10, size: 11,
    });
  }
}

function navLink(p, dir, arrow) {
  if (!p) {
    return `<a class="${dir}" href="index.html#index">
      <span class="dir">${dir === 'prev' ? arrow + ' start of index' : 'end of index ' + arrow}</span>
      <span class="ttl">Back to all works</span>
    </a>`;
  }
  return `<a class="${dir}" href="project.html?id=${encodeURIComponent(p.slug)}">
    <span class="dir">${dir === 'prev' ? arrow + ' previous' : 'next ' + arrow}</span>
    <span class="ttl">${esc(p.title)}</span>
  </a>`;
}
