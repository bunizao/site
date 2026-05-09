/* eslint-disable */
const { useState, useEffect, useRef } = React;

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
        else if (v === 2) continue;
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

const PEEK_PALETTE_LIGHT = {
  4: '#d23b2e',
  5: '#fafaf7',
  6: '#f0b73a',
  7: '#3a6b4a',
  8: '#1a1a1a',
  9: '#6b4ba8',
  10: '#7a4a2b',
};
const PEEK_PALETTE_DARK = {
  4: '#e85a4f',
  5: '#fafaf7',
  6: '#f0c14b',
  7: '#6aa07c',
  8: '#fafaf7',
  9: '#9b80d8',
  10: '#b48662',
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

const LookTile = ({ lookId, size = 92, theme = 'light', source = 'small' }) => {
  const lib = source === 'full' ? window.PEEK_FULL_LOOKS : window.PEEK_LOOKS;
  const def = lib[lookId];
  return (
    <div className="look-tile" data-theme={theme}>
      <div className="look-stage">
        <PeekLook lookId={lookId} size={size} theme={theme} source={source} />
      </div>
      <div className="look-meta">
        <span className="look-name">{def.label}</span>
        <span className="look-blurb">{def.blurb}</span>
      </div>
    </div>
  );
};

const Lookbook = ({ theme, source = 'small' }) => {
  const lib = source === 'full' ? window.PEEK_FULL_LOOKS : window.PEEK_LOOKS;
  const ids = Object.keys(lib);
  const expressions = ids.filter((id) => lib[id].kind === 'expression');
  const costumes = ids.filter((id) => lib[id].kind === 'costume');
  const metaLabel = source === 'full' ? '20 × 24+ · character pieces' : '10 × 7 / 10 × 12 · slot looks';
  return (
    <div className="lookbook">
      <div className="lookbook-row">
        <div className="lookbook-row-h">
          <span className="type-section-label">expressions</span>
          <span className="type-meta">{metaLabel}</span>
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
          <span className="type-meta">{metaLabel}</span>
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

const AnimShow = () => {
  const def = window.PIXEL_MASCOTS.peek;
  const anims = window.MASCOT_ANIMS.peek || {};
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
        <span className="type-meta">{keys.length} actions · click any tile to pause</span>
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
                <MascotAnim mascotId="peek" animKey={k} size={140} paused={paused} />
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

const Sec = ({ label, children, right }) => (
  <section className="lab-section">
    <header className="lab-section-h">
      <span className="type-section-label">{label}</span>
      {right}
    </header>
    {children}
  </section>
);

const App = () => {
  const smallLooks = Object.keys(window.PEEK_LOOKS).length;
  const fullLooks = Object.keys(window.PEEK_FULL_LOOKS).length;
  return (
    <div className="lab">
      <header className="lab-hero">
        <div className="lab-hero-row">
          <span className="type-section-label">Peek Lab</span>
          <span className="type-meta">buxx.me · peek only · expressions + works</span>
        </div>
        <h1 className="lab-title">
          the <em>peek</em> system<span className="blink">▮</span>
        </h1>
        <p className="lab-lede">
          the lurker’s motion, expressions, costumes, and in-situ uses. this page keeps only the
          `peek` design work from mascot lab, not the whole cast.
        </p>
      </header>

      <Sec
        label="01 · peek motion"
        right={<span className="type-meta">existing animated behavior preserved</span>}
      >
        <AnimShow />
      </Sec>

      <Sec
        label="02 · peek lookbook"
        right={<span className="type-meta">{smallLooks} slot looks · expressions + costumes</span>}
      >
        <div className="lookbook-stack">
          <div className="lookbook-cap"><span className="type-meta">light</span></div>
          <Lookbook theme="light" />
          <div className="lookbook-cap"><span className="type-meta">dark</span></div>
          <Lookbook theme="dark" />
        </div>
      </Sec>

      <Sec
        label="03 · peek full looks"
        right={<span className="type-meta">{fullLooks} expanded looks · character pieces</span>}
      >
        <div className="lookbook-stack">
          <div className="lookbook-cap"><span className="type-meta">light</span></div>
          <Lookbook theme="light" source="full" />
          <div className="lookbook-cap"><span className="type-meta">dark</span></div>
          <Lookbook theme="dark" source="full" />
        </div>
      </Sec>

      <Sec
        label="04 · peek in situ"
        right={<span className="type-meta">404 page · homepage hero</span>}
      >
        <div className="mock-stack">
          <NotFoundMock theme="light" />
          <HeroMock theme="dark" />
        </div>
      </Sec>

      <Sec
        label="05 · seasonal navbar"
        right={<span className="type-meta">work samples using the added looks</span>}
      >
        <div className="hnav-stack">
          <HolidayNav lookId="confused" label="lost user" sub="route /404" theme="light" />
          <HolidayNav lookId="headphones" label="now listening" sub="/listening online" theme="light" />
          <HolidayNav lookId="lantern" label="春节" sub="lunar new year" theme="light" />
          <HolidayNav lookId="santa" label="december" sub="dec 1 — jan 1" theme="dark" />
          <HolidayNav lookId="witch" label="halloween" sub="oct 25 — nov 1" theme="dark" />
          <HolidayNav lookId="party" label="launch day" sub="release banners" theme="dark" />
        </div>
      </Sec>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
