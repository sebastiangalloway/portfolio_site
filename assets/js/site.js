/* sgalloway.net — hand-rolled interactions. No frameworks. */
(() => {
  "use strict";

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================================================================
     1. WebGL2 shader hero — domain-warped FBM "aurora"
     ================================================================ */
  const canvas = document.getElementById("gl");

  function initShader() {
    if (reducedMotion || !canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return; // .hero-fallback gradient shows instead

    const vsSrc = `#version 300 es
    layout(location=0) in vec2 p;
    void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

    const fsSrc = `#version 300 es
    precision highp float;
    out vec4 o;
    uniform vec2 u_res;
    uniform float u_time;
    uniform vec2 u_mouse;   // normalized, eased
    uniform float u_light;  // 0 = dark theme, 1 = light theme

    // --- hash & simplex-style value noise ---
    vec2 hash(vec2 p){
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }
    float noise(vec2 p){
      const float K1 = 0.366025404;
      const float K2 = 0.211324865;
      vec2 i = floor(p + (p.x + p.y) * K1);
      vec2 a = p - i + (i.x + i.y) * K2;
      vec2 s = step(a.yx, a.xy);
      vec2 b = a - s + K2;
      vec2 c = a - 1.0 + 2.0 * K2;
      vec3 h = max(0.5 - vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0);
      vec3 n = h*h*h*h * vec3(dot(a, hash(i)), dot(b, hash(i + s)), dot(c, hash(i + 1.0)));
      return dot(n, vec3(70.0));
    }
    float fbm(vec2 p){
      float f = 0.0, w = 0.5;
      mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 5; i++){
        f += w * noise(p);
        p = m * p;
        w *= 0.5;
      }
      return f;
    }

    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
      float t = u_time * 0.05;

      // mouse parallax drift
      vec2 drift = (u_mouse - 0.5) * 0.35;
      vec2 p = uv * 1.4 + drift;

      // domain warping: q -> r -> final field
      vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
      vec2 r = vec2(fbm(p + 2.6*q + vec2(1.7, 9.2) + 0.30*t),
                    fbm(p + 2.6*q + vec2(8.3, 2.8) - 0.22*t));
      float f = fbm(p + 2.2 * r);

      // dark theme palette: deep space -> cyan -> violet
      vec3 deep   = vec3(0.024, 0.024, 0.070);
      vec3 cyan   = vec3(0.15, 0.62, 0.85);
      vec3 violet = vec3(0.48, 0.28, 0.86);
      vec3 warm   = vec3(0.90, 0.55, 0.35);

      vec3 col = deep;
      col = mix(col, violet * 0.7, smoothstep(0.05, 0.75, f));
      col = mix(col, cyan * 0.75, smoothstep(0.35, 0.95, length(q) * 0.9));
      col = mix(col, warm * 0.5, smoothstep(0.75, 1.05, abs(r.x)) * 0.35);
      col *= 0.55 + 0.65 * smoothstep(-0.4, 1.1, f + 0.4);

      // light theme: soft pastel sky
      vec3 lDeep   = vec3(0.94, 0.95, 0.99);
      vec3 lCyan   = vec3(0.62, 0.82, 0.95);
      vec3 lViolet = vec3(0.80, 0.72, 0.96);
      vec3 lcol = lDeep;
      lcol = mix(lcol, lViolet, smoothstep(0.05, 0.85, f) * 0.8);
      lcol = mix(lcol, lCyan, smoothstep(0.35, 0.95, length(q) * 0.9) * 0.7);

      col = mix(col, lcol, u_light);

      // twinkling star field (dark theme only)
      vec2 sp = gl_FragCoord.xy / u_res.y * 60.0;
      vec2 cell = floor(sp);
      vec2 cf = fract(sp) - 0.5;
      vec2 rnd = hash(cell);
      float star = smoothstep(0.985, 1.0, 1.0 - length(cf - rnd * 0.35))
                 * (0.5 + 0.5 * sin(u_time * (1.0 + fract(rnd.x * 7.0) * 2.0) + rnd.y * 6.28));
      col += star * 0.55 * (1.0 - u_light);

      // vignette
      float vig = smoothstep(1.5, 0.35, length(uv));
      col *= mix(0.85, 1.0, vig);

      o = vec4(col, 1.0);
    }`;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // fullscreen triangle
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uLight = gl.getUniformLocation(prog, "u_light");

    const DPR = Math.min(devicePixelRatio || 1, 1.5);
    function resize() {
      const w = Math.floor(innerWidth * DPR);
      const h = Math.floor(innerHeight * DPR);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    addEventListener("resize", resize, { passive: true });
    resize();

    // eased mouse
    let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5;
    addEventListener("pointermove", (e) => {
      tx = e.clientX / innerWidth;
      ty = 1 - e.clientY / innerHeight;
    }, { passive: true });

    // theme uniform, eased for a smooth crossfade
    let light = 0, lightTarget = 0;
    function syncTheme() {
      const t = document.documentElement.dataset.theme
        || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      lightTarget = t === "light" ? 1 : 0;
    }
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", syncTheme);
    syncTheme();
    light = lightTarget;

    // render only while hero area is on screen & tab visible
    let visible = true, hidden = false, raf = 0;
    const start = performance.now();

    function frame(now) {
      raf = 0;
      if (!visible || hidden) return;
      mx += (tx - mx) * 0.045;
      my += (ty - my) * 0.045;
      light += (lightTarget - light) * 0.08;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uLight, light);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && visible && !hidden) raf = requestAnimationFrame(frame); }

    // canvas is fixed & fades out via CSS; stop drawing once hero is well past
    const hero = document.getElementById("hero");
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    }, { rootMargin: "60% 0px 60% 0px" }).observe(hero);

    document.addEventListener("visibilitychange", () => {
      hidden = document.hidden;
      kick();
    });

    kick();
  }
  initShader();

  /* ================================================================
     2. Theme toggle — View Transitions API circular reveal
     ================================================================ */
  const toggle = document.getElementById("theme-toggle");
  const root = document.documentElement;

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) root.dataset.theme = savedTheme;

  toggle?.addEventListener("click", (e) => {
    const current = root.dataset.theme
      || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = current === "light" ? "dark" : "light";

    const apply = () => {
      root.dataset.theme = next;
      localStorage.setItem("theme", next);
    };

    if (!document.startViewTransition || reducedMotion) { apply(); return; }

    const x = e.clientX, y = e.clientY;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(apply);
    vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 550, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(() => {});
  });

  /* ================================================================
     3. Typed roles in hero
     ================================================================ */
  const typedEl = document.getElementById("typed");
  if (typedEl && !reducedMotion) {
    const items = JSON.parse(typedEl.dataset.items || "[]");
    let i = 0, pos = 0, deleting = false;
    (function tick() {
      const word = items[i % items.length];
      pos += deleting ? -1 : 1;
      typedEl.textContent = word.slice(0, pos);
      let delay = deleting ? 40 : 75;
      if (!deleting && pos === word.length) { delay = 1900; deleting = true; }
      else if (deleting && pos === 0) { deleting = false; i++; delay = 350; }
      setTimeout(tick, delay);
    })();
  } else if (typedEl) {
    typedEl.textContent = "Software Engineer";
  }

  /* ================================================================
     4. Scrollspy — highlight nav link for the section in view
     ================================================================ */
  const navLinks = [...document.querySelectorAll(".nav-links a")];
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const spy = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        navLinks.forEach((a) =>
          a.setAttribute("aria-current",
            entry.target.id !== "hero" && a.getAttribute("href") === `#${entry.target.id}`)
        );
      }
    }, { rootMargin: "-40% 0px -55% 0px" });
    const hero = document.getElementById("hero");
    if (hero) spy.observe(hero);
    sections.forEach((s) => spy.observe(s));
  }

  /* ================================================================
     5. Fallback reveals + ring fills for browsers without
        CSS scroll-driven animations
     ================================================================ */
  const supportsSDA = CSS.supports("animation-timeline: view()");
  if (!supportsSDA) {
    const revealables = document.querySelectorAll(
      ".section-head, .about-grid, .tl-item, .skill-meter, .chip-row, .project-card, .edu-card"
    );
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    revealables.forEach((el) => io.observe(el));
  }

  /* ================================================================
     6. 3D tilt + pointer glow on cards
     ================================================================ */
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reducedMotion) {
    document.querySelectorAll(".card-3d").forEach((card) => {
      let raf = 0;
      card.addEventListener("pointermove", (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          card.style.setProperty("--glow-x", `${px * 100}%`);
          card.style.setProperty("--glow-y", `${py * 100}%`);
          const tiltX = (0.5 - py) * 7;
          const tiltY = (px - 0.5) * 7;
          card.style.transform =
            `perspective(900px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateZ(0)`;
        });
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
        card.style.transition = "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)";
        setTimeout(() => (card.style.transition = ""), 600);
      });
    });
  }

  /* ================================================================
     7. Magnetic buttons
     ================================================================ */
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reducedMotion) {
    document.querySelectorAll(".magnetic").forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${dx * 0.18}px, ${dy * 0.22}px)`;
      });
      btn.addEventListener("pointerleave", () => {
        btn.style.transform = "";
      });
    });
  }

  /* ================================================================
     8. Footer year
     ================================================================ */
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
