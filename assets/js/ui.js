/* Shared page chrome: header state, beacon toggle, reveal-on-scroll,
   scroll readout. Imported by both index and project pages. */

const SIG_KEY = 'ashuzaifa.sig';

export function initHeader() {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;
  const onScroll = () => hdr.classList.toggle('is-stuck', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

export function initBeacon() {
  const btn = document.getElementById('beacon');
  if (!btn) return;

  // remembered across pages so the site does not flicker back on navigation
  const off = document.documentElement.classList.contains('sig-off');
  apply(off);

  btn.addEventListener('click', () => {
    const next = !document.documentElement.classList.contains('sig-off');
    apply(next);
    writeSig(next ? 'off' : 'on');
  });

  function apply(isOff) {
    document.documentElement.classList.toggle('sig-off', isOff);
    btn.setAttribute('aria-pressed', String(!isOff));
  }
}

/* Applies the stored beacon state before first paint, to avoid a flash.
   Every localStorage touch here is guarded: this runs at module top level on
   both pages, and a browser with site data blocked throws on the read alone,
   which would take the whole page down with it. */
export function preflightSig() {
  if (readSig() === 'off') document.documentElement.classList.add('sig-off');
}

function readSig() {
  try {
    return localStorage.getItem(SIG_KEY);
  } catch (e) {
    return null;
  }
}

function writeSig(v) {
  try {
    localStorage.setItem(SIG_KEY, v);
  } catch (e) {
    /* the toggle still works for this page, it just will not be remembered */
  }
}

export function initReveal(root = document) {
  const targets = root.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  );

  targets.forEach((el) => io.observe(el));
}

/* Bottom-left telemetry: scroll percentage + the section you are in. */
export function initReadout(sections) {
  const bar = document.getElementById('readout-bar');
  const pct = document.getElementById('readout-pct');
  const label = document.getElementById('readout-sec');
  if (!bar || !pct) return;

  let ticking = false;

  function update() {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.width = (p * 100).toFixed(1) + '%';
    pct.textContent = String(Math.round(p * 100)).padStart(3, '0') + '%';

    if (label && sections && sections.length) {
      const mid = window.scrollY + window.innerHeight * 0.35;
      let current = sections[0];
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top + window.scrollY <= mid) current = s;
      }
      if (label.textContent !== current.label) label.textContent = current.label;
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
}

export function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}
