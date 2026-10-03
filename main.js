/* Shared site script — loaded on every page. Every block is guarded so a page
   only runs what it contains. Page-specific scripts (e.g. home3d.js) live separately. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- nav ---------- */
  const nav = $('#nav');
  const toggle = $('#navToggle');
  const links = $('#navLinks');

  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (toggle && links) {
    const setMenu = open => {
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      links.classList.toggle('is-open', open);
      nav && nav.classList.toggle('menu-open', open);
    };
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    links.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  }

  // mark the current page in the nav (body[data-page] matches a[data-page])
  const page = document.body.dataset.page;
  if (page) {
    $$(`[data-page="${page}"]`, links || document).forEach(a => {
      a.classList.add('is-current');
      a.setAttribute('aria-current', 'page');
    });
  }

  /* ---------- reveal on scroll ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const revealObs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revealObs.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
      revealObs.observe(el);
    });
  } else {
    reveals.forEach(el => el.classList.add('is-in'));
  }

  /* ---------- counters ---------- */
  const counters = $$('[data-count]');
  if (counters.length) {
    const run = el => {
      const end = +el.dataset.count, t0 = performance.now(), dur = 1400;
      if (reduced) { el.textContent = end; return; }
      const tick = t => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const countObs = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { run(en.target); countObs.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach(el => countObs.observe(el));
  }

  /* ---------- product filter (products page) ---------- */
  const chips = $$('.chip[data-filter]');
  if (chips.length) {
    const products = $$('.product');
    const apply = f => {
      chips.forEach(c => { const on = c.dataset.filter === f; c.classList.toggle('is-active', on); c.setAttribute('aria-selected', on); });
      products.forEach(p => p.classList.toggle('is-hidden', f !== 'all' && p.dataset.cat !== f));
    };
    chips.forEach(chip => chip.addEventListener('click', () => apply(chip.dataset.filter)));
    // deep link: products.html#dronedoot opens that product's details
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target && target.classList.contains('product')) {
      const d = $('details', target); if (d) d.open = true;
    }
  }

  /* ---------- market tabs (markets page) — supports markets.html#m-infra ---------- */
  const tabs = $$('.mtab');
  if (tabs.length) {
    const select = tab => {
      tabs.forEach(t => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) { panel.hidden = !on; panel.classList.toggle('is-active', on); }
      });
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => {
        select(tab);
        history.replaceState(null, '', '#' + tab.getAttribute('aria-controls'));
      });
      tab.addEventListener('keydown', e => {
        const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        const next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus(); next.click();
      });
    });
    const fromHash = location.hash && tabs.find(t => t.getAttribute('aria-controls') === location.hash.slice(1));
    select(fromHash || tabs.find(t => t.classList.contains('is-active')) || tabs[0]);
  }

  /* ---------- contact form (opens mail client) ---------- */
  const form = $('#contactForm');
  if (form) {
    const note = $('#formNote');
    // contact.html?req=brochure preselects the brochure option
    const req = new URLSearchParams(location.search).get('req');
    if (req === 'other') { const r = $('input[name=req][value="Other"]', form); if (r) r.checked = true; }
    form.addEventListener('submit', e => {
      e.preventDefault();
      let ok = true;
      $$('[required]', form).forEach(f => {
        const bad = !f.value.trim() || (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(f.value));
        f.classList.toggle('is-invalid', bad);
        f.setAttribute('aria-invalid', bad);
        if (bad) ok = false;
      });
      if (!ok) { if (note) { note.textContent = 'Please fill in all fields.'; note.style.color = 'var(--red)'; } return; }
      const d = Object.fromEntries(new FormData(form));
      const body = `Name: ${d.first} ${d.last}\nOrganisation: ${d.org}\nEmail: ${d.email}\nPhone: ${d.phone}\nRequest: ${d.req}\n\n${d.msg}`;
      window.location.href = `mailto:info@avgardesystems.com?subject=${encodeURIComponent(`${d.req} request — ${d.org}`)}&body=${encodeURIComponent(body)}`;
      if (note) { note.style.color = 'var(--muted)'; note.textContent = 'Opening your email app…'; }
    });
    form.addEventListener('input', e => { e.target.classList.remove('is-invalid'); e.target.removeAttribute('aria-invalid'); });
  }

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- 2D radar scope (any page with <canvas id="radar">) ---------- */
  const canvas = $('#radar');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    const threatEl = $('#threatCount');
    let W = 0, R = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      canvas.width = canvas.height = W * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = W / 2 - 4;
    };
    resize();
    window.addEventListener('resize', resize);

    const targets = [
      { a: 0.9, r: 0.62, va: 0.0009, vr: -0.0004, kind: 'drone', label: 'DRONE 0.97' },
      { a: 2.6, r: 0.78, va: -0.0006, vr: -0.0002, kind: 'drone', label: 'DRONE 0.93' },
      { a: 4.1, r: 0.45, va: 0.0012, vr: 0.0001, kind: 'bird', label: 'BIRD 0.88' },
      { a: 5.3, r: 0.3, va: -0.0015, vr: 0.0003, kind: 'uav', label: 'IFF · UAV' },
    ];
    targets.forEach(t => (t.lit = reduced ? 1 : 0));
    const colors = { drone: '255,92,108', bird: '255,181,71', uav: '61,220,151' };
    let sweep = 0, last = performance.now(), visible = true;
    const SPEED = 0.0012;

    // pause when off-screen
    new IntersectionObserver(([en]) => {
      const was = visible; visible = en.isIntersecting;
      if (visible && !was && !reduced) { last = performance.now(); requestAnimationFrame(draw); }
    }).observe(canvas);

    function draw(now) {
      const dt = Math.min(50, now - last); last = now;
      const cx = W / 2, cy = W / 2;
      ctx.clearRect(0, 0, W, W);

      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2);
        ctx.strokeStyle = i === 4 ? 'rgba(56,160,255,.45)' : 'rgba(56,160,255,.16)';
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(56,160,255,.12)';
      ctx.beginPath();
      ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
      ctx.stroke();
      for (let d = 0; d < 360; d += 10) {
        const a = (d * Math.PI) / 180, len = d % 30 === 0 ? 10 : 5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
        ctx.strokeStyle = 'rgba(56,160,255,.4)';
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(141,155,176,.6)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ['1.25', '2.5', '3.75'].forEach((l, i) => ctx.fillText(l + 'km', cx + 4, cy - (R * (i + 1)) / 4 + 12));

      const trail = 1.1;
      if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(sweep - trail, cx, cy);
        g.addColorStop(0, 'rgba(46,230,214,0)');
        g.addColorStop(trail / (Math.PI * 2), 'rgba(46,230,214,.28)');
        g.addColorStop(trail / (Math.PI * 2) + 0.0001, 'rgba(46,230,214,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sweep - trail, sweep); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
      ctx.strokeStyle = 'rgba(46,230,214,.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      let threats = 0;
      targets.forEach(t => {
        t.a += t.va * dt; t.r += t.vr * dt * 0.1;
        if (t.r < 0.18 || t.r > 0.9) t.vr *= -1;
        const diff = ((sweep - t.a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (diff < 0.08) t.lit = 1;
        t.lit = Math.max(0.18, t.lit - dt * 0.00035);
        if (t.kind === 'drone') threats++;
        const x = cx + Math.cos(t.a) * t.r * R, y = cy + Math.sin(t.a) * t.r * R;
        const c = colors[t.kind];
        ctx.beginPath(); ctx.arc(x, y, 10 * t.lit + 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c},${0.15 * t.lit})`; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c},${Math.min(1, t.lit + 0.2)})`; ctx.fill();
        if (t.kind === 'drone') {
          const s = 9;
          ctx.strokeStyle = `rgba(${c},${t.lit})`; ctx.lineWidth = 1;
          ctx.strokeRect(x - s, y - s, s * 2, s * 2);
        }
        ctx.fillStyle = `rgba(230,237,246,${t.lit * 0.9})`;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(t.label, x + 13, y + 3);
      });
      if (threatEl) threatEl.textContent = threats;

      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#38a0ff'; ctx.fill();

      sweep = (sweep + SPEED * dt) % (Math.PI * 2);
      if (!reduced && visible) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }
})();
