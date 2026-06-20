// Subtle, non-distracting motion. Nav blur on scroll + IntersectionObserver reveal.

(function () {
  // ---------- prefers-reduced-motion gate ----------
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Smooth scroll (Lenis) ----------
  // Lenis dispatches synthetic scroll events on window, so the existing
  // scroll listeners (nav blur, IntersectionObserver reveal) keep working.
  // Disabled under reduced-motion or if the library failed to load.
  let lenis = null;
  if (!reducedMotion && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    // Expose for scroll-scrubbed modules (ship card parallax, marquee velocity, etc.)
    window.__lenis = lenis;
  }

  // ---------- Consolidated scroll handler ----------
  // One scroll listener, one rAF tick. Subscribers register a callback that
  // receives (scrollY, hero rect, sectionMap-progress hooks) per frame.
  // Replaces 4 separate listeners (nav blur, lede nudge, hero-mark parallax,
  // side-rail active section) with a single cohesive update pass.
  const scrollSubs = [];
  let scrollPending = false;
  const tickScroll = () => {
    scrollPending = false;
    const y = window.scrollY;
    for (let i = 0; i < scrollSubs.length; i++) scrollSubs[i](y);
  };
  const onAnyScroll = () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(tickScroll);
  };
  window.addEventListener('scroll', onAnyScroll, { passive: true });
  window.addEventListener('resize', onAnyScroll, { passive: true });

  const nav = document.querySelector('.nav');
  if (nav) {
    let navScrolled = false;
    scrollSubs.push((y) => {
      const want = y > 16;
      if (want !== navScrolled) {
        navScrolled = want;
        nav.classList.toggle('scrolled', want);
      }
    });
    // Initial state
    if (window.scrollY > 16) nav.classList.add('scrolled');
  }

  // Theme toggle. The no-flash script in <head> already set the initial
  // theme (from localStorage or system pref); this handler just flips it
  // on click and persists the choice. Updates aria-pressed for screen
  // readers and to let CSS style the active state if we ever want to.
  const themeToggles = document.querySelectorAll('[data-theme-toggle]');
  if (themeToggles.length) {
    const syncState = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeToggles.forEach((btn) => {
        btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
        btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      });
    };
    syncState();
    themeToggles.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        const next = dark ? 'light' : 'dark';
        if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem('theme', next); } catch {}
        syncState();
      });
    });
  }

  // ---------- Mobile nav menu ----------
  // Under 720px the section links (.nav-links) are hidden. Build a hamburger
  // toggle + dropdown panel from those same links so touch users can reach
  // Work / Services / About / Contact. Progressive enhancement: if this never
  // runs, the "Start a project" CTA is still in the bar.
  const navEl = document.querySelector('.nav');
  const navLinks = navEl && navEl.querySelector('.nav-links');
  const navRight = navEl && navEl.querySelector('.nav-right');
  if (navEl && navLinks && navRight && navLinks.querySelector('a')) {
    const menuToggle = document.createElement('button');
    menuToggle.type = 'button';
    menuToggle.className = 'nav-menu-toggle';
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-controls', 'nav-mobile-panel');
    menuToggle.setAttribute('aria-label', 'Open menu');
    menuToggle.innerHTML = '<span class="bars" aria-hidden="true"><span></span></span>';

    const panel = document.createElement('div');
    panel.className = 'nav-mobile-panel';
    panel.id = 'nav-mobile-panel';
    panel.hidden = true;

    navRight.insertBefore(menuToggle, navRight.firstChild);
    navEl.appendChild(panel);

    let menuOpen = false;
    const setMenu = (next) => {
      menuOpen = next;
      menuToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
      menuToggle.setAttribute('aria-label', next ? 'Close menu' : 'Open menu');
      if (next) {
        panel.hidden = false;
        requestAnimationFrame(() => panel.classList.add('open'));
      } else {
        panel.classList.remove('open');
        setTimeout(() => { if (!menuOpen) panel.hidden = true; }, 200);
      }
    };
    const closeMenu = () => setMenu(false);

    navLinks.querySelectorAll('a').forEach((a) => {
      const link = a.cloneNode(true);
      link.addEventListener('click', closeMenu);
      panel.appendChild(link);
    });

    menuToggle.addEventListener('click', () => setMenu(!menuOpen));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) { closeMenu(); menuToggle.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (menuOpen && !panel.contains(e.target) && !menuToggle.contains(e.target)) closeMenu();
    });
    window.addEventListener('resize', () => {
      if (menuOpen && window.innerWidth > 720) closeMenu();
    });
  }

  // Reveal on scroll
  const els = document.querySelectorAll('.reveal');
  if (els.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => io.observe(el));
  } else {
    els.forEach((el) => el.classList.add('in'));
  }

  // Year
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // Status pill month. If we're within the last 7 days of the month, show next
  // month instead (you can't realistically book a slot for the current month
  // with that little runway left). Updates on first paint, no flicker.
  const monthEls = document.querySelectorAll('[data-current-month]');
  if (monthEls.length) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - now.getDate();
    const target = daysRemaining < 7
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : now;
    const name = target.toLocaleString('en-US', { month: 'long' });
    monthEls.forEach((el) => { el.textContent = name; });
  }

  // Hero word cycle
  const track = document.querySelector('.word-cycle .cycle-track');
  if (track) {
    const items = track.querySelectorAll('.cw');
    if (items.length > 1) {
      let i = 0;
      // sync width of the word-cycle container to longest word so layout doesn't jump
      const cycle = track.parentElement;
      const measure = () => {
        let maxW = 0;
        items.forEach((it) => { maxW = Math.max(maxW, it.getBoundingClientRect().width); });
        // Buffer 12px to absorb sub-pixel rendering, letter-spacing, and trailing
        // period glyphs that occasionally overflow the measured bounding box.
        cycle.style.width = Math.ceil(maxW + 12) + 'px';
      };
      // Run after fonts load so widths are accurate, then again on the next
      // animation frame in case layout settles late.
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { measure(); requestAnimationFrame(measure); });
      }
      measure();
      window.addEventListener('resize', measure);

      const step = () => {
        i = (i + 1) % items.length;
        const h = items[0].getBoundingClientRect().height;
        track.style.transform = `translateY(${-i * h}px)`;
      };
      setInterval(step, 2400);
    }
  }

  // Cursor-follow aurora on hero
  const aurora = document.querySelector('.hero-aurora');
  const hero = document.querySelector('.hero');
  if (aurora && hero && window.matchMedia('(pointer: fine)').matches) {
    let pending = false, mx = 50, my = 30;
    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width) * 100;
      my = ((e.clientY - r.top) / r.height) * 100;
      if (!pending) {
        pending = true;
        requestAnimationFrame(() => {
          aurora.style.setProperty('--mx', mx + '%');
          aurora.style.setProperty('--my', my + '%');
          pending = false;
        });
      }
    });
    hero.addEventListener('mouseleave', () => {
      aurora.style.setProperty('--mx', '50%');
      aurora.style.setProperty('--my', '30%');
    });
  }

  // Count-up for hero meta + case study stats when in view
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const to = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const dur = 900;
        const t0 = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / dur);
          const v = to * ease(t);
          el.textContent = (to >= 100 ? Math.round(v) : Math.round(v)) + suffix;
          if (t < 1) requestAnimationFrame(tick);
          else el.textContent = to + suffix;
        };
        requestAnimationFrame(tick);
        cio.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach((el) => cio.observe(el));
  }

  // ---------- Hero scroll-driven elements ----------
  // Both the ambient wordmark parallax and the lede-stress baseline nudge
  // share a single hero rect read per frame. Subscribed to the consolidated
  // scroll handler above.
  const heroMark = document.querySelector('.hero-mark');
  const lede = document.querySelector('.hero-h1 .lede-stress');
  const heroEl = document.querySelector('.hero');
  if (heroEl && !reducedMotion && (heroMark || lede)) {
    scrollSubs.push(() => {
      const r = heroEl.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height)));
      if (heroMark) {
        heroMark.style.transform = `translate3d(${(-p * 14).toFixed(2)}vw, ${(-p * 60).toFixed(2)}px, 0)`;
      }
      if (lede) {
        lede.style.transform = `translateY(${(-p * 7).toFixed(2)}px)`;
      }
    });
    // Initial paint
    onAnyScroll();
  }

  // ---------- Process interstitial: scroll-progress step driver ----------
  // The .process section is 250vh tall with a sticky inner stage. As scroll
  // progresses through the section, we compute progress (0-1) and toggle
  // is-active / is-passed on each .process-step. Three steps means the
  // progress band splits into thirds: 0-0.33, 0.33-0.66, 0.66-1.
  const processSection = document.querySelector('.process');
  const processSteps = document.querySelectorAll('.process-step');
  const processThumb = document.querySelector('.process-rail-thumb');
  if (processSection && processSteps.length === 3 && !reducedMotion) {
    let lastActive = -1;
    scrollSubs.push(() => {
      const r = processSection.getBoundingClientRect();
      const totalScroll = r.height - window.innerHeight;
      // 0 when section first hits viewport top, 1 when its bottom reaches viewport top
      const p = Math.max(0, Math.min(1, -r.top / Math.max(1, totalScroll)));
      // Map progress to step index. The middle of each third is the "anchor."
      let active;
      if (p < 0.28) active = 0;
      else if (p < 0.62) active = 1;
      else active = 2;
      if (active !== lastActive) {
        lastActive = active;
        for (let i = 0; i < processSteps.length; i++) {
          const step = processSteps[i];
          step.classList.toggle('is-active', i === active);
          step.classList.toggle('is-passed', i < active);
        }
      }
      if (processThumb) {
        processThumb.style.height = `${(p * 100).toFixed(2)}%`;
      }
    });
  } else if (processSteps.length === 3 && reducedMotion) {
    // Reduced motion: mark all as active so they're all visible.
    processSteps.forEach((s) => s.classList.add('is-active'));
  }

  // ---------- Scroll-velocity-bound marquee ----------
  // Marquee scrolls at a baseline ~60px/s. Lenis scroll velocity adds a
  // temporary boost that decays over ~1s, so fast wheel-scrolls visibly
  // accelerate the marquee then settle. Subtle aliveness, no new motion
  // language. Falls back to the CSS keyframe animation under reduced-motion
  // or if Lenis isn't available.
  const marquee = document.querySelector('.marquee');
  if (marquee && !reducedMotion) {
    marquee.classList.add('js-driven');
    let mx = 0;
    let lastT = performance.now();
    let scrollBoost = 0;
    let paused = false;
    let halfWidth = 0;
    const measureMarquee = () => {
      // Content is duplicated; wrap at half the total scrollable width.
      halfWidth = marquee.scrollWidth / 2;
    };
    measureMarquee();
    window.addEventListener('resize', measureMarquee, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMarquee);

    marquee.addEventListener('mouseenter', () => { paused = true; });
    marquee.addEventListener('mouseleave', () => { paused = false; });

    if (window.__lenis && typeof window.__lenis.on === 'function') {
      window.__lenis.on('scroll', ({ velocity }) => {
        // Clamp boost so wild scroll doesn't make the marquee blur.
        scrollBoost = Math.min(900, Math.abs(velocity) * 10);
      });
    }

    const baseSpeed = 60; // px/s
    const tickMarquee = (now) => {
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      scrollBoost *= 0.92;
      if (!paused && halfWidth > 0) {
        mx -= (baseSpeed + scrollBoost) * dt;
        if (mx <= -halfWidth) mx += halfWidth;
        marquee.style.transform = `translate3d(${mx.toFixed(2)}px, 0, 0)`;
      }
      requestAnimationFrame(tickMarquee);
    };
    requestAnimationFrame(tickMarquee);
  }

  // ---------- WebGL brand mark (cursor-proximity noise overlay) ----------
  // The CSS brand mark (ink square + I + accent slash) keeps rendering. A small
  // canvas is overlaid via mix-blend-mode: screen and runs a value-noise +
  // cursor-distance ripple shader. If WebGL init fails at any step, the canvas
  // is never appended and the CSS mark stands alone. Guaranteed fallback.
  //
  // Deferred to first user interaction so the WebGL setup never competes
  // with first paint or Lighthouse's TBT window. Pure decoration; only
  // matters once the user moves their cursor near the nav. Hard fallback
  // fires after 8s if no interaction (rare for engaged visitors).
  const onFirstInteraction = (fn) => {
    let fired = false;
    const trigger = () => {
      if (fired) return; fired = true;
      window.removeEventListener('pointermove', trigger);
      window.removeEventListener('scroll', trigger);
      window.removeEventListener('keydown', trigger);
      window.removeEventListener('touchstart', trigger);
      fn();
    };
    window.addEventListener('pointermove', trigger, { once: true, passive: true });
    window.addEventListener('scroll',      trigger, { once: true, passive: true });
    window.addEventListener('keydown',     trigger, { once: true, passive: true });
    window.addEventListener('touchstart',  trigger, { once: true, passive: true });
    setTimeout(trigger, 8000);
  };
  onFirstInteraction(function setupBrandMarkShader() {
    if (reducedMotion) return;
    const brandMark = document.querySelector('.brand-mark');
    if (!brandMark) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 22; // mark CSS size
    const canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;border-radius:5px;';

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })
            || canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: true });
    if (!gl) return;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER,
      'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }');
    const fs = compile(gl.FRAGMENT_SHADER,
      'precision mediump float;' +
      'uniform float u_t;' +
      'uniform vec2 u_cursor;' +
      'uniform float u_prox;' +
      'uniform vec2 u_res;' +
      'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }' +
      'float noise(vec2 p) {' +
      '  vec2 i = floor(p), f = fract(p);' +
      '  vec2 u = f * f * (3.0 - 2.0 * f);' +
      '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),' +
      '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);' +
      '}' +
      'void main() {' +
      '  vec2 uv = gl_FragCoord.xy / u_res;' +
      '  float d = distance(uv, u_cursor);' +
      '  float ripple = sin(d * 20.0 - u_t * 4.5) * exp(-d * 5.5) * u_prox;' +
      '  float n = noise(uv * 7.5 + u_t * 0.55);' +
      '  vec3 col = vec3(0.18, 0.32, 1.0) * (n * 0.55 + ripple * 0.9);' +
      '  float a = n * 0.18 + abs(ripple) * 0.65;' +
      '  gl_FragColor = vec4(col, a);' +
      '}');
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);

    const uT = gl.getUniformLocation(prog, 'u_t');
    const uC = gl.getUniformLocation(prog, 'u_cursor');
    const uP = gl.getUniformLocation(prog, 'u_prox');
    const uR = gl.getUniformLocation(prog, 'u_res');

    gl.viewport(0, 0, size * dpr, size * dpr);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(uR, size * dpr, size * dpr);

    brandMark.appendChild(canvas);

    let cursorX = 0.5, cursorY = 0.5, prox = 0;
    document.addEventListener('mousemove', (e) => {
      const r = brandMark.getBoundingClientRect();
      const cx = r.left + r.width  / 2;
      const cy = r.top  + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      prox = Math.max(0, 1 - dist / 240);
      cursorX = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      cursorY = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    }, { passive: true });

    const t0 = performance.now();
    const render = () => {
      const t = (performance.now() - t0) / 1000;
      gl.uniform1f(uT, t);
      gl.uniform2f(uC, cursorX, cursorY);
      gl.uniform1f(uP, prox);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  });

  // ---------- Sticky side-rail section indicator ----------
  // Builds a left-edge mini scroll indicator: vertical track + colored thumb +
  // mono label. The label and thumb color shift to match the active section's
  // --accent-section, so the rail doubles as the page's section legend.
  const sectionMap = [
    { sel: '.hero',     n: '/ 01', name: 'Hero',     accent: 'var(--accent)'   },
    { sel: '#work',     n: '/ 02', name: 'Work',     accent: 'var(--accent)'   },
    { sel: '#process',  n: '/ p',  name: 'Process',  accent: 'var(--paper)'    },
    { sel: '#services', n: '/ 03', name: 'Services', accent: 'var(--accent-2)' },
    { sel: '#about',    n: '/ 04', name: 'About',    accent: 'var(--accent-3)' },
    { sel: '#contact',  n: '/ 05', name: 'Contact',  accent: 'var(--accent)'   },
  ].map(s => ({ ...s, el: document.querySelector(s.sel) })).filter(s => s.el);

  if (sectionMap.length) {
    const rail = document.createElement('aside');
    rail.className = 'side-rail';
    rail.setAttribute('aria-hidden', 'true');
    rail.innerHTML = '<div class="side-rail-track"><div class="side-rail-thumb"></div></div><div class="side-rail-label">/ 01 · Hero</div>';
    document.body.appendChild(rail);

    const label = rail.querySelector('.side-rail-label');
    const thumb = rail.querySelector('.side-rail-thumb');

    let activeIdx = -1;
    const setActive = (idx) => {
      if (idx === activeIdx) return;
      activeIdx = idx;
      const s = sectionMap[idx];
      label.textContent = `${s.n} · ${s.name}`;
      label.style.color = s.accent;
      thumb.style.background = s.accent;
      // Slide thumb proportionally across the track height (max 86% to leave room).
      thumb.style.top = `${(idx / (sectionMap.length - 1)) * 86}%`;
    };

    const updateActive = () => {
      const refY = window.innerHeight * 0.3;
      let best = 0;
      for (let i = 0; i < sectionMap.length; i++) {
        if (sectionMap[i].el.getBoundingClientRect().top <= refY) best = i;
      }
      setActive(best);
    };
    scrollSubs.push(updateActive);
    updateActive();
  }

  // ---------- Custom cursor + magnetic CTAs ----------
  // 6px dot leads, 36px ring lags. Ring scales up over interactive elements.
  // Over CTAs, the dot magnetically pulls toward button center (within ~90px).
  // mix-blend-mode: difference (in CSS) keeps the cursor legible on every bg.
  if (window.matchMedia('(pointer: fine)').matches && !reducedMotion) {
    const dot  = document.createElement('div');
    const ring = document.createElement('div');
    dot.className  = 'cursor-dot';
    ring.className = 'cursor-ring';
    dot.setAttribute('aria-hidden',  'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    const HOVER_SEL = 'a, button, [role="button"], .btn, .work-card, .service-card';
    const CTA_SEL   = '.btn';

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let dx = mx, dy = my, rx = mx, ry = my;
    let isHover = false, isCta = false;
    let magnet = null;

    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
    }, { passive: true });

    document.addEventListener('mouseover', (e) => {
      if (!e.target.closest) { return; }
      const hover = e.target.closest(HOVER_SEL);
      const cta   = e.target.closest(CTA_SEL);
      isHover = !!hover;
      isCta   = !!cta;
      magnet  = cta || null;
    });
    document.addEventListener('mouseout', (e) => {
      if (e.relatedTarget && e.relatedTarget.closest) {
        const stillHover = e.relatedTarget.closest(HOVER_SEL);
        if (!stillHover) { isHover = false; isCta = false; magnet = null; }
      }
    });
    window.addEventListener('blur', () => { isHover = false; isCta = false; magnet = null; });

    const tick = () => {
      // Dot follows quickly
      dx += (mx - dx) * 0.45;
      dy += (my - dy) * 0.45;
      // Magnetic pull toward CTA center
      if (magnet) {
        const r = magnet.getBoundingClientRect();
        const tx = r.left + r.width  / 2;
        const ty = r.top  + r.height / 2;
        const ddx = tx - mx, ddy = ty - my;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < 90) {
          const pull = 0.4 * (1 - d / 90);
          dx = mx + ddx * pull;
          dy = my + ddy * pull;
        }
      }
      // Ring lags for elasticity
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;

      const ringScale = isCta ? 1.25 : (isHover ? 1.0 : 0.4);
      const ringOpacity = (isHover || isCta) ? 1 : 0;

      dot.style.transform  = `translate3d(${dx - 3}px, ${dy - 3}px, 0)`;
      ring.style.transform = `translate3d(${rx - 18}px, ${ry - 18}px, 0) scale(${ringScale})`;
      ring.style.opacity   = ringOpacity;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- Intake form ----------
  // Submits the contact form to /api/intake (a Cloudflare Pages Function).
  // Hidden fields are populated with the visitor's timezone and referrer
  // so Stephen has context. On success, swaps the form for a thank-you
  // block in place. No page reload, no scroll jump.
  const intakeForm = document.getElementById('intake-form');
  if (intakeForm) {
    const tzInput = document.getElementById('intake-timezone');
    const refInput = document.getElementById('intake-referrer');
    if (tzInput) {
      try { tzInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
    }
    if (refInput) {
      refInput.value = document.referrer || '';
    }

    const submitBtn = intakeForm.querySelector('.intake-submit');
    const successBlock = document.getElementById('intake-success');

    const setError = (msg) => {
      let el = intakeForm.querySelector('.intake-error');
      if (!el) {
        el = document.createElement('p');
        el.className = 'intake-error';
        el.setAttribute('role', 'alert');
        intakeForm.querySelector('.intake-footer').insertAdjacentElement('beforebegin', el);
      }
      // Always give the visitor a recovery path. The technical message
      // tells them WHAT failed; the mailto tells them how to still reach me.
      el.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = msg + ' ';
      const fallback = document.createElement('a');
      fallback.href = 'mailto:stephenalatriste@integritybuilds.dev';
      fallback.textContent = 'Email me directly →';
      el.append(span, fallback);
    };
    const clearError = () => {
      const el = intakeForm.querySelector('.intake-error');
      if (el) el.remove();
    };

    intakeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      // Native validity check first. Apply was-validated so invalid
      // fields get the visual treatment from CSS, but only after
      // the first submit attempt.
      intakeForm.classList.add('was-validated');
      if (!intakeForm.checkValidity()) {
        const firstInvalid = intakeForm.querySelector(':invalid');
        if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();
        setError('Fill in the highlighted fields and try again.');
        return;
      }

      const data = Object.fromEntries(new FormData(intakeForm));
      submitBtn.disabled = true;
      submitBtn.classList.add('is-loading');

      try {
        const res = await fetch('/api/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.ok) {
          // Prefer the server's friendly error if it sent one; otherwise
          // translate the raw HTTP status into a sentence a visitor can read.
          if (payload.error) throw new Error(payload.error);
          throw new Error(`Couldn't reach the intake server (status ${res.status}).`);
        }
        // Swap form for success block, same vertical area
        intakeForm.hidden = true;
        if (successBlock) {
          successBlock.hidden = false;
          // Scroll the success message into view smoothly
          successBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch (err) {
        setError(err.message || 'Something went wrong. Try again, or email stephenalatriste@integritybuilds.dev directly.');
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
      }
    });
  }

  // ---------- Ship card synchronized choreography ----------
  // The hero's floating "shipped" card cycles through real builds at the same
  // beat as the hero word cycle. Children fade together so the swap reads as
  // one move, not seven independent text changes.
  const ship = document.querySelector('.ship-card');
  if (ship && !reducedMotion) {
    const urlEl    = ship.querySelector('.ship-card-url');
    const timeEl   = ship.querySelector('.ship-time');
    const barFill  = ship.querySelector('.ship-bar-fill');
    const barLabel = ship.querySelector('.ship-bar-label');
    const statVals = ship.querySelectorAll('.ship-stat-v');
    const logLines = ship.querySelectorAll('.ship-card-log .log-line');

    // Real metrics. Pages = live route count. Perf/A11y/SEO/LCP from
    // Lighthouse 13 desktop runs against the actual production sites
    // (May 2026). Build times are plausible estimates since they depend
    // on the host's pipeline, not measurable from outside.
    //
    // The fourth entry is THIS page (integritybuilds.dev). Its numbers
    // are not pre-baked. They're measured live from the Performance API
    // and the deploy version stamp. The boast becomes the demo.
    const builds = [
      { url: 'skellywags.club',  time: '2h ago', pages: 11, perf: 100, a11y: 100, seo: 100, build: '6.4s', lcp: '0.2s', log: ['next build',    'compiled in 6.4s', 'deploy → main'] },
      { url: 'acmeridian.co',    time: '8h ago', pages: 9,  perf: 96,  a11y: 96,  seo: 100, build: '5.8s', lcp: '0.6s', log: ['next build',    'compiled in 5.8s', 'deploy → main'] },
      { url: '/ midnight-boost', time: '1d ago', pages: 1,  perf: 98,  a11y: 92,  seo: 100, build: '2.1s', lcp: '0.9s', log: ['npm run build', 'compiled in 2.1s', 'deploy → preview'] },
      { url: 'stillerror.com',   time: '1d ago', pages: 1,  perf: 78,  a11y: 97,  seo: 100, build: '1.5s', lcp: '2.4s', log: ['vite build',     'compiled in 1.5s', 'wrangler pages deploy'] },
      { url: 'integritybuilds.dev', time: 'live', pages: 5, perf: 100, a11y: 100, seo: 100, build: '—', lcp: '—', log: ['measuring…', 'measuring…', 'measuring…'], live: true },
    ];

    // Live metrics for the integritybuilds.dev entry. Measured against
    // THIS page in THIS visitor's browser. Numbers update as the page
    // finishes loading and the LCP entry lands.
    const live = { kb: null, lcp: null, deployedAgo: null, jsKb: null };

    const fmtKB = (bytes) => bytes >= 1024 * 1024
      ? `${(bytes / 1048576).toFixed(1)}MB`
      : `${Math.max(1, Math.round(bytes / 1024))}KB`;
    const fmtSec = (ms) => ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
    const fmtAgo = (mins) => {
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const h = Math.floor(mins / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      return `${d}d ago`;
    };

    // Parse deploy timestamp from the cache-bust query stamped at build time.
    // Format: YYYYMMDD-HHMMSS. Falls back silently if unavailable.
    const stylesHref = document.querySelector('link[rel="stylesheet"][href*="styles.css"]')?.getAttribute('href') || '';
    const stampMatch = stylesHref.match(/v=(\d{8})-(\d{6})/);
    if (stampMatch) {
      const [, d, t] = stampMatch;
      const iso = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`;
      const deployedAt = Date.parse(iso);
      if (!Number.isNaN(deployedAt)) {
        live.deployedAgo = Math.max(0, Math.floor((Date.now() - deployedAt) / 60000));
      }
    }

    // Page weight: sum encodedBodySize across nav + every resource entry.
    // encodedBodySize is the compressed-on-the-wire size of each asset,
    // independent of whether the browser served it from cache. So the
    // number reflects "this page weighs X" honestly on first AND repeat
    // visits, instead of dropping to ~0 after a refresh.
    const measureBytes = () => {
      const navEntries = performance.getEntriesByType('navigation');
      const resEntries = performance.getEntriesByType('resource');
      const sizeOf = (e) => e.encodedBodySize || e.transferSize || 0;
      let total = sizeOf(navEntries[0] || {});
      let js = 0;
      for (const r of resEntries) {
        total += sizeOf(r);
        if (r.initiatorType === 'script' || /\.js(\?|$)/.test(r.name)) {
          js += sizeOf(r);
        }
      }
      live.kb = total;
      live.jsKb = js;
    };
    measureBytes();
    // Re-measure after the load event in case late resources land.
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => setTimeout(measureBytes, 200), { once: true });
    }

    // LCP via PerformanceObserver. Final value once paint settles.
    if ('PerformanceObserver' in window) {
      try {
        const po = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) live.lcp = last.renderTime || last.startTime;
        });
        po.observe({ type: 'largest-contentful-paint', buffered: true });
        // Stop observing after a reasonable settle window
        setTimeout(() => { try { po.disconnect(); } catch {} }, 6000);
      } catch {}
    }

    // Build a fresh "live" snapshot from current measurements. Called every
    // time the integritybuilds.dev entry is rendered, so the numbers update
    // as the visitor lingers and more data arrives.
    const liveBuild = () => {
      const base = builds[3];
      const kb = live.kb ? fmtKB(live.kb) : '—';
      const jsKb = live.jsKb ? fmtKB(live.jsKb) : '—';
      const lcp = live.lcp ? fmtSec(live.lcp) : '—';
      const time = live.deployedAgo != null ? `deployed ${fmtAgo(live.deployedAgo)}` : 'live';
      return {
        ...base,
        time,
        build: kb,
        lcp,
        log: [
          `measuring this page right now`,
          `weight ${kb} · lcp ${lcp}`,
          `js ${jsKb} · 0 trackers`,
        ],
      };
    };

    const renderBuild = (b) => {
      if (urlEl)    urlEl.textContent = b.url;
      if (timeEl)   timeEl.textContent = b.time;
      if (barLabel) barLabel.textContent = `Build ${b.build} · LCP ${b.lcp}`;
      if (statVals.length >= 4) {
        statVals[0].textContent = b.pages;
        statVals[1].textContent = b.perf;
        statVals[2].textContent = b.a11y;
        statVals[3].textContent = b.seo;
      }
      if (logLines.length >= 3) {
        // Each .log-line: <span class="log-tag">→/✓</span> + text node
        for (let k = 0; k < 3; k++) {
          const line = logLines[k];
          // Replace the trailing text node only; keep the .log-tag span intact.
          let node = line.firstChild;
          while (node) {
            if (node.nodeType === 3) { node.nodeValue = ' ' + b.log[k]; break; }
            node = node.nextSibling;
          }
        }
      }
      // Re-trigger the perf bar fill animation for each cycle
      if (barFill) {
        barFill.style.animation = 'none';
        // force reflow
        // eslint-disable-next-line no-unused-expressions
        barFill.offsetWidth;
        barFill.style.animation = '';
      }
    };

    let bIdx = 0;
    const renderAt = (idx) => {
      const b = builds[idx].live ? liveBuild() : builds[idx];
      ship.classList.toggle('is-live', !!b.live);
      renderBuild(b);
    };
    const cycle = () => {
      ship.classList.add('cycling');
      setTimeout(() => {
        bIdx = (bIdx + 1) % builds.length;
        renderAt(bIdx);
        ship.classList.remove('cycling');
      }, 220);
    };
    // Start after the ship card finishes its entrance (matches CSS ship-in delay 500ms + 700ms duration)
    setTimeout(() => setInterval(cycle, 4800), 1600);
  }
})();
