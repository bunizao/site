/* eslint-disable */
const { useState, useEffect, useRef } = React;

// ========== Pixel render primitive ==========
// Renders a 0/1/2/3 grid into a tiny canvas (1 pixel per cell), then upscales
// crisply via image-rendering: pixelated. 1 = body, 2 = eye, 3 = accent (oklch).
const Mascot = ({ id, size = 96, mono = false }) => {
  const ref = useRef(null);
  useEffect(() => {
    const def = window.PIXEL_MASCOTS[id];
    if (!def || !ref.current) return;
    const grid = def.grid;
    const h = grid.length, w = grid[0].length;
    const cv = ref.current;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(cv).color;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = grid[y][x];
        if (!v) continue;
        if (v === 1) {
          ctx.fillStyle = fg;
        } else if (v === 2) {
          // eye = "hole" — draw bg color so it punches through
          // we just skip filling and rely on the body around it
          // but actually we need to mark a hole — handled below
          continue;
        } else if (v === 3) {
          ctx.fillStyle = mono ? fg : def.accent;
        }
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Pass 2: draw eyes as transparent holes — fill nothing (already empty)
    // The grid already has 0 where eye should be a hole; but we encoded eyes as 2.
    // For eyes-as-holes we want to NOT draw on those cells, so reset them to bg.
    // (we already skipped them above) — done.
  }, [id, size, mono]);
  return (
    <canvas
      ref={ref}
      style={{
        width: size, height: size,
        imageRendering: 'pixelated',
        display: 'block',
      }}
      aria-hidden="true"
    />
  );
};

// ========== Animated Mascot (frame player) ==========
// Renders an animation (array of grids) as a tiny canvas, cycling at a fps.
// Uses the same encoding as Mascot. paused = freeze on first frame.
const MascotAnim = ({ mascotId, animKey, size = 120, paused = false, accentOverride }) => {
  const ref = useRef(null);
  const [frame, setFrame] = useState(0);
  const def = window.PIXEL_MASCOTS[mascotId];
  const anim = window.MASCOT_ANIMS[mascotId]?.[animKey];

  useEffect(() => {
    setFrame(0);
    if (!anim || paused) return;
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % anim.frames.length);
    }, 1000 / anim.fps);
    return () => clearInterval(id);
  }, [mascotId, animKey, paused, anim]);

  useEffect(() => {
    if (!anim || !ref.current) return;
    const grid = anim.frames[frame];
    const h = grid.length, w = grid[0].length;
    const cv = ref.current;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(cv).color;
    const accent = accentOverride || def.accent;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = grid[y][x];
        if (!v) continue;
        if (v === 1) ctx.fillStyle = fg;
        else if (v === 2) continue;          // eye = transparent
        else if (v === 3) ctx.fillStyle = accent;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [frame, anim, def, accentOverride]);

  if (!anim) return null;
  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
      aria-hidden="true"
    />
  );
};

// ========== Peek Look renderer ==========
// Extends the encoding with extra colors for costumes/expressions.
//   1 = body · 2 = eye (transparent) · 3 = mascot accent
//   4 = red · 5 = white · 6 = gold · 7 = green · 8 = ink (auto-inverts on dark)
const PEEK_PALETTE_LIGHT = {
  4: '#d23b2e',  // red
  5: '#fafaf7',  // white
  6: '#f0b73a',  // gold
  7: '#3a6b4a',  // green
  8: '#1a1a1a',  // ink
  9: '#6b4ba8',  // purple (wizard)
  10:'#7a4a2b',  // brown (detective)
};
const PEEK_PALETTE_DARK = {
  4: '#e85a4f',
  5: '#fafaf7',
  6: '#f0c14b',
  7: '#6aa07c',
  8: '#fafaf7',
  9: '#9b80d8',
  10:'#b48662',
};

const PeekLook = ({ lookId, size = 120, theme = 'auto', accent, source = 'small' }) => {
  const ref = useRef(null);
  const lib = source === 'full' ? window.PEEK_FULL_LOOKS : window.PEEK_LOOKS;
  const def = lib[lookId];
  useEffect(() => {
    if (!def || !ref.current) return;
    const grid = def.grid;
    const h = grid.length, w = grid[0].length;
    const cv = ref.current;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(cv).color;
    // Detect dark by reading the parent's bg luminance — fallback to attr.
    const themeMode = theme === 'auto'
      ? (cv.closest('[data-theme="dark"]') ? 'dark' : 'light')
      : theme;
    const palette = themeMode === 'dark' ? PEEK_PALETTE_DARK : PEEK_PALETTE_LIGHT;
    const accentColor = accent || window.PIXEL_MASCOTS.peek.accent;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = grid[y][x];
        if (!v) continue;
        if (v === 1) ctx.fillStyle = fg;
        else if (v === 2) continue;
        else if (v === 3) ctx.fillStyle = accentColor;
        else if (palette[v]) ctx.fillStyle = palette[v];
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [lookId, size, theme, accent, source]);
  if (!def) return null;
  const grid = def.grid;
  const aspect = grid[0].length / grid.length;
  return (
    <canvas
      ref={ref}
      style={{
        width: size,
        height: size / aspect,
        imageRendering: 'pixelated',
        display: 'block',
      }}
      aria-hidden="true"
    />
  );
};

// ========== Peek Lookbook (sticker grid of looks) ==========
const LookTile = ({ lookId, size = 92, theme = 'light', onClick, active, source = 'small' }) => {
  const lib = source === 'full' ? window.PEEK_FULL_LOOKS : window.PEEK_LOOKS;
  const def = lib[lookId];
  return (
    <button
      type="button"
      className={`look-tile ${active ? 'is-active' : ''}`}
      data-theme={theme}
      onClick={onClick}
      aria-pressed={!!active}
    >
      <div className="look-stage">
        <PeekLook lookId={lookId} size={size} theme={theme} source={source} />
      </div>
      <div className="look-meta">
        <span className="look-name">{def.label}</span>
        <span className="look-blurb">{def.blurb}</span>
      </div>
    </button>
  );
};

const Lookbook = ({ theme, source = 'small' }) => {
  const lib = source === 'full' ? window.PEEK_FULL_LOOKS : window.PEEK_LOOKS;
  const ids = Object.keys(lib);
  const expressions = ids.filter((id) => lib[id].kind === 'expression');
  const costumes    = ids.filter((id) => lib[id].kind === 'costume');
  return (
    <div className="lookbook">
      <div className="lookbook-row">
        <div className="lookbook-row-h">
          <span className="type-section-label">expressions</span>
          <span className="type-meta">10 × 7 · drop-in for any peek slot</span>
        </div>
        <div className="lookbook-grid">
          {expressions.map((id) => (
            <LookTile key={id} lookId={id} theme={theme} source={source} />
          ))}
        </div>
      </div>
      <div className="lookbook-row">
        <div className="lookbook-row-h">
          <span className="type-section-label">costumes</span>
          <span className="type-meta">10 × 12 · seasonal & themed</span>
        </div>
        <div className="lookbook-grid">
          {costumes.map((id) => (
            <LookTile key={id} lookId={id} theme={theme} source={source} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ========== 404 mockup ==========
const NotFoundMock = ({ theme = 'light' }) => (
  <div className="mock mock-404" data-theme={theme}>
    <div className="mock-bar">
      <span className="mock-dot r" /><span className="mock-dot y" /><span className="mock-dot g" />
      <span className="mock-url">buxx.me<span className="mock-url-path">/wandered-here</span></span>
    </div>
    <div className="mock-404-body">
      <div className="mock-404-stage">
        <span className="mock-404-q" aria-hidden="true">?</span>
        <PeekLook lookId="confused" size={220} theme={theme} />
        <span className="mock-404-q small" aria-hidden="true">?</span>
      </div>
      <div className="mock-404-text">
        <span className="type-meta">/404</span>
        <h2 className="mock-404-title">page not found</h2>
        <p className="mock-404-blurb">
          peek tried to find this page. peek could not. peek is sorry.
          go back, or try the index.
        </p>
        <div className="mock-404-actions">
          <span className="mock-btn primary">← go home</span>
          <span className="mock-btn">/index</span>
        </div>
      </div>
    </div>
  </div>
);

// ========== Hero mockup (peek peeks up from bottom edge) ==========
const HeroMock = ({ theme = 'light' }) => (
  <div className="mock mock-hero" data-theme={theme}>
    <div className="mock-bar">
      <span className="mock-dot r" /><span className="mock-dot y" /><span className="mock-dot g" />
      <span className="mock-url">buxx.me</span>
    </div>
    <div className="mock-hero-body">
      <span className="type-meta">welcome</span>
      <h2 className="mock-hero-title">
        a small place<br/>on the internet<span className="blink">▮</span>
      </h2>
      <p className="mock-hero-blurb">
        notes, projects, mood feed. nothing scrolls forever.
      </p>
      <div className="mock-hero-peek">
        <span className="mock-hero-hi">hi</span>
        <PeekLook lookId="wink" size={140} theme={theme} />
      </div>
    </div>
  </div>
);

// ========== Holiday navbar variants ==========
const HolidayNav = ({ lookId, label, sub, theme = 'light' }) => (
  <div className="hnav" data-theme={theme}>
    <div className="hnav-cap">
      <span className="type-meta">{label}</span>
      <span className="type-meta dim">{sub}</span>
    </div>
    <div className="hnav-bar">
      <a href="#" className="hnav-brand" onClick={(e) => e.preventDefault()}>
        <span className="hnav-mark">
          <PeekLook lookId={lookId} size={36} theme={theme} />
        </span>
        <span className="hnav-word">buxx.me</span>
      </a>
      <nav className="hnav-links">
        <a href="#" onClick={(e) => e.preventDefault()}>projects</a>
        <span>/</span>
        <a href="#" onClick={(e) => e.preventDefault()}>writing</a>
        <span>/</span>
        <a href="#" onClick={(e) => e.preventDefault()}>moods</a>
      </nav>
      <div className="hnav-r">
        <span className="s-dot" />
        <span>building</span>
      </div>
    </div>
  </div>
);

// ========== Animation showcase section ==========
const AnimShow = ({ mascotId }) => {
  const def = window.PIXEL_MASCOTS[mascotId];
  const anims = window.MASCOT_ANIMS[mascotId] || {};
  const keys = Object.keys(anims);
  const [pausedKey, setPausedKey] = useState(null);

  return (
    <div className="anim-show" style={{ '--accent': def.accent }}>
      <div className="anim-show-h">
        <div className="anim-show-titlewrap">
          <span className="m-name" style={{ fontSize: 14 }}>
            <span className="swatch" />
            {def.name}
          </span>
          <span className="m-tagline" style={{ marginLeft: 10 }}>{def.tagline}</span>
        </div>
        <span className="type-meta">
          {keys.length} actions · click any tile to pause
        </span>
      </div>
      <div className="anim-grid">
        {keys.map((k) => {
          const a = anims[k];
          const paused = pausedKey === k;
          return (
            <button
              key={k}
              type="button"
              className={`anim-tile ${paused ? 'is-paused' : ''}`}
              onClick={() => setPausedKey(paused ? null : k)}
            >
              <div className="anim-stage">
                <div className="anim-glow" />
                <MascotAnim mascotId={mascotId} animKey={k} size={140} paused={paused} />
              </div>
              <div className="anim-meta">
                <span className="anim-name">{a.name}</span>
                <span className="type-meta">
                  {a.frames.length}f · {a.fps}fps {paused ? '· paused' : ''}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ========== Section ==========
const Sec = ({ label, children, right }) => (
  <section className="lab-section">
    <header className="lab-section-h">
      <span className="type-section-label">{label}</span>
      {right}
    </header>
    {children}
  </section>
);

// ========== Mascot card ==========
const MCard = ({ id, selected, onSelect }) => {
  const def = window.PIXEL_MASCOTS[id];
  // size class: lg = larger card, md = med, sm = small
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`m-card size-${def.size} ${selected ? 'is-selected' : ''}`}
      style={{ '--accent': def.accent }}
      aria-pressed={selected}
    >
      <div className="m-stage">
        <div className="accent-glow" />
        <Mascot id={id} size={def.size === 'lg' ? 156 : def.size === 'md' ? 120 : 96} />
      </div>
      <div className="m-meta">
        <div className="m-name">
          <span className="swatch" />
          {def.name}
          <span className="m-tagline" style={{ marginLeft: 'auto' }}>{def.tagline}</span>
        </div>
        <div className="m-blurb">{def.blurb}</div>
      </div>
    </button>
  );
};

// ========== Favicon row ==========
const FavRow = ({ id, theme }) => {
  const sizes = [16, 24, 32, 48, 64];
  return (
    <div className="fav-row" data-theme={theme}>
      <div className="fav-row-l">{theme === 'dark' ? 'dark' : 'light'}</div>
      <div className="fav-row-items">
        {sizes.map((s) => (
          <div className="fav-cell" key={s}>
            <div className="fav-chip" style={{
              width: s + 8, height: s + 8,
              background: theme === 'dark' ? 'hsl(0 0% 4%)' : 'hsl(0 0% 100%)',
              color: theme === 'dark' ? 'hsl(0 0% 100%)' : 'hsl(0 0% 0%)',
            }}>
              <Mascot id={id} size={s} />
            </div>
            <span className="type-meta">{s}px</span>
          </div>
        ))}
        <div className="fav-cell">
          <div className="fav-tab" style={{
            background: theme === 'dark' ? 'hsl(0 0% 8%)' : 'hsl(0 0% 96%)',
            color: theme === 'dark' ? 'hsl(0 0% 100%)' : 'hsl(0 0% 0%)',
          }}>
            <Mascot id={id} size={14} />
            <span className="fav-tab-title">buxx.me</span>
            <span className="fav-tab-x">×</span>
          </div>
          <span className="type-meta">browser tab</span>
        </div>
      </div>
    </div>
  );
};

// ========== Navbar mockup ==========
const NavMock = ({ id, theme = 'light' }) => {
  const def = window.PIXEL_MASCOTS[id];
  const items = [
    { id: 'projects', l: 'Projects' },
    { id: 'writing',  l: 'Writing'  },
    { id: 'moods',    l: 'Moods'    },
  ];
  const [active, setActive] = useState('projects');
  return (
    <div className="nav-mock" data-theme={theme} style={{ '--accent': def.accent }}>
      <div className="nav-mock-bg" />
      <div className="nav-mock-tl">
        <a href="#" className="brand-lockup" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark"><Mascot id={id} size={22} /></span>
          <span className="brand-word">buxx.me</span>
          <span className="brand-caret" aria-hidden="true">▮</span>
        </a>
      </div>
      <nav className="nav-mock-center">
        {items.map((it, i) => (
          <React.Fragment key={it.id}>
            <a
              href={`#${it.id}`}
              className={`nav-link ${active === it.id ? 'is-active' : ''}`}
              onClick={(e) => { e.preventDefault(); setActive(it.id); }}
            >
              {it.l}
            </a>
            {i < items.length - 1 && <span className="nav-sep">/</span>}
          </React.Fragment>
        ))}
      </nav>
      <div className="nav-mock-tr">
        <div className="h-action">
          <span className="s-dot" />
          <span>Building</span>
        </div>
        <div className="h-action">
          {theme === 'dark' ? <Moon /> : <Sun />}
        </div>
      </div>
      <div className="nav-mock-content">
        <div className="nm-line w70" />
        <div className="nm-line w55" />
        <div className="nm-line w62" />
      </div>
    </div>
  );
};

const Sun = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  </svg>
);
const Moon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// ========== Construction grid ==========
const ConGrid = ({ id }) => {
  const def = window.PIXEL_MASCOTS[id];
  const grid = def.grid;
  const h = grid.length, w = grid[0].length;
  const cell = Math.min(28, Math.floor(560 / w));
  return (
    <div className="con" style={{ '--accent': def.accent }}>
      <div className="con-grid"
           style={{
             gridTemplateColumns: `repeat(${w}, ${cell}px)`,
             gridTemplateRows: `repeat(${h}, ${cell}px)`,
           }}>
        {grid.flatMap((row, y) =>
          row.map((v, x) => (
            <div key={`${x}-${y}`} className={`cg-cell ${v === 1 ? 'body' : v === 3 ? 'accent-c' : v === 2 ? 'eye-c' : ''}`}/>
          ))
        )}
      </div>
      <div className="con-side">
        <div className="con-name">{def.name} <span className="m-tagline">{def.tagline}</span></div>
        <div className="type-meta">{w} × {h} grid</div>
        <p className="dossier-blurb">{def.blurb}</p>
        <div className="con-rules">
          <div><span className="type-meta">render</span><code>image-rendering: pixelated</code></div>
          <div><span className="type-meta">body</span><code>hsl(var(--foreground))</code></div>
          <div><span className="type-meta">accent</span><code>{def.accent}</code></div>
          <div><span className="type-meta">eyes</span><code>transparent (cuts through body)</code></div>
        </div>
      </div>
    </div>
  );
};

// ========== Sticker sheet ==========
const Stickers = () => {
  const ids = Object.keys(window.PIXEL_MASCOTS);
  return (
    <div className="sticker-sheet">
      {ids.map((id) => {
        const def = window.PIXEL_MASCOTS[id];
        return (
          <div className="sticker" key={id} style={{ '--accent': def.accent }}>
            <span className="accent-bar" />
            <Mascot id={id} size={64} />
            <div className="sticker-name">{def.name.split('·')[1]?.trim() || id}</div>
          </div>
        );
      })}
    </div>
  );
};

// ========== Dossier ==========
const Dossier = ({ id }) => {
  const def = window.PIXEL_MASCOTS[id];
  return (
    <div className="dossier" style={{ '--accent': def.accent }}>
      <div className="dossier-portrait">
        <Mascot id={id} size={220} />
      </div>
      <div className="dossier-info">
        <div>
          <span className="dossier-tagline">{def.tagline}</span>
          <h3 className="dossier-name">{def.name}</h3>
        </div>
        <p className="dossier-blurb">{def.blurb}</p>
        <div className="dossier-stats">
          <div className="dossier-stat"><span className="dossier-stat-k">grid</span><span className="dossier-stat-v">{def.grid[0].length} × {def.grid.length}</span></div>
          <div className="dossier-stat"><span className="dossier-stat-k">accent</span><span className="dossier-stat-v accent">{def.accent.replace('oklch(', '').replace(')', '')}</span></div>
          <div className="dossier-stat"><span className="dossier-stat-k">scale</span><span className="dossier-stat-v">{def.size === 'lg' ? 'hero' : def.size === 'md' ? 'standard' : 'compact'}</span></div>
          <div className="dossier-stat"><span className="dossier-stat-k">slot</span><span className="dossier-stat-v">favicon · navbar · OG</span></div>
        </div>
      </div>
    </div>
  );
};

// ========== App ==========
const App = () => {
  const ids = Object.keys(window.PIXEL_MASCOTS);
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "selected": "tutu",
    "useAccent": true
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const selected = tweaks.selected;
  const def = window.PIXEL_MASCOTS[selected];

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', def.accent);
  }, [selected]);

  return (
    <div className="lab">
      <header className="lab-hero">
        <div className="lab-hero-row">
          <span className="type-section-label">Mascot Lab</span>
          <span className="type-meta">buxx.me · 6 pixel creatures · craft-do flavored</span>
        </div>
        <h1 className="lab-title">
          a small <em>cast</em> for buxx.me<span className="blink">▮</span>
        </h1>
        <p className="lab-lede">
          six pixel creatures, each with a different silhouette and personality —
          not six takes on a logo. picked by their job: who lives in the favicon,
          who waves from the navbar, who stars on the OG card. eyes blink only on
          hover. accent colors are muted oklch — one per character, never neon.
        </p>
      </header>

      <Sec
        label="01 · the cast"
        right={<span className="type-meta">click to pick · {ids.length} characters</span>}
      >
        <div className="mascot-grid">
          {ids.map((id) => (
            <MCard key={id} id={id} selected={selected === id} onSelect={(x) => setTweak('selected', x)} />
          ))}
        </div>
      </Sec>

      <Sec label="02 · dossier" right={<span className="type-meta">selected · {def.name}</span>}>
        <Dossier id={selected} />
      </Sec>

      <Sec label="03 · favicon — every render size">
        <div className="fav-stack">
          <FavRow id={selected} theme="light" />
          <FavRow id={selected} theme="dark" />
        </div>
      </Sec>

      <Sec label="04 · navbar — in situ" right={<span className="type-meta">hover the brand to make it blink</span>}>
        <div className="nav-stack">
          <div>
            <div className="nav-cap"><span className="type-meta">light</span></div>
            <NavMock id={selected} theme="light" />
          </div>
          <div>
            <div className="nav-cap"><span className="type-meta">dark</span></div>
            <NavMock id={selected} theme="dark" />
          </div>
        </div>
      </Sec>

      <Sec label="05 · sticker sheet" right={<span className="type-meta">all six together</span>}>
        <Stickers />
      </Sec>

      <Sec label="06 · construction grid">
        <ConGrid id={selected} />
      </Sec>

      <Sec
        label="07 · motion — tutu & peek"
        right={<span className="type-meta">tiny pixel actions · loops at 3–6 fps</span>}
      >
        <div className="anim-stack">
          <AnimShow mascotId="tutu" />
          <AnimShow mascotId="peek" />
        </div>
      </Sec>

      <Sec
        label="08 · peek · lookbook"
        right={<span className="type-meta">{Object.keys(window.PEEK_LOOKS).length} looks · expressions + costumes</span>}
      >
        <div className="lookbook-stack">
          <div className="lookbook-cap"><span className="type-meta">light</span></div>
          <Lookbook theme="light" />
          <div className="lookbook-cap"><span className="type-meta">dark</span></div>
          <Lookbook theme="dark" />
        </div>
      </Sec>

      <Sec
        label="09 · peek · in situ"
        right={<span className="type-meta">404 page · homepage hero</span>}
      >
        <div className="mock-stack">
          <NotFoundMock theme="light" />
          <HeroMock theme="dark" />
        </div>
      </Sec>

      <Sec
        label="10 · peek · seasonal navbar"
        right={<span className="type-meta">a different look every quarter</span>}
      >
        <div className="hnav-stack">
          <HolidayNav lookId="confused"   label="lost user"      sub="route /404"        theme="light" />
          <HolidayNav lookId="headphones" label="now listening"  sub="/listening online" theme="light" />
          <HolidayNav lookId="lantern"    label="春节"           sub="lunar new year"    theme="light" />
          <HolidayNav lookId="santa"      label="december"       sub="dec 1 — jan 1"     theme="dark"  />
          <HolidayNav lookId="witch"      label="halloween"      sub="oct 25 — nov 1"    theme="dark"  />
          <HolidayNav lookId="party"      label="launch day"     sub="release banners"   theme="dark"  />
        </div>
      </Sec>

      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Cast">
          <window.TweakSelect
            label="Selected mascot"
            value={tweaks.selected}
            onChange={(v) => setTweak('selected', v)}
            options={ids.map((id) => ({ value: id, label: window.PIXEL_MASCOTS[id].name }))}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
