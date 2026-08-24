type MermaidApi = (typeof import('mermaid'))['default'];
type MermaidTheme = 'light' | 'dark';

let initialized = false;
let renderIndex = 0;
let renderQueue = Promise.resolve();
let mermaidPromise: Promise<MermaidApi> | null = null;

function currentTheme(): MermaidTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function themeVariables(theme: MermaidTheme) {
  if (theme === 'dark') {
    return {
      background: '#111111',
      primaryColor: '#252525',
      primaryTextColor: '#f5f5f5',
      primaryBorderColor: '#737373',
      lineColor: '#a3a3a3',
      secondaryColor: '#1c1c1c',
      tertiaryColor: '#171717',
      clusterBkg: '#171717',
      clusterBorder: '#525252',
      edgeLabelBackground: '#111111',
      noteBkgColor: '#252525',
      noteBorderColor: '#737373',
      noteTextColor: '#f5f5f5',
    };
  }

  return {
    background: '#ffffff',
    primaryColor: '#f5f5f4',
    primaryTextColor: '#1c1917',
    primaryBorderColor: '#a8a29e',
    lineColor: '#78716c',
    secondaryColor: '#fafaf9',
    tertiaryColor: '#ffffff',
    clusterBkg: '#fafaf9',
    clusterBorder: '#d6d3d1',
    edgeLabelBackground: '#ffffff',
    noteBkgColor: '#f5f5f4',
    noteBorderColor: '#a8a29e',
    noteTextColor: '#1c1917',
  };
}

async function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((module) => module.default);

  try {
    return await mermaidPromise;
  } catch (error) {
    mermaidPromise = null;
    throw error;
  }
}

async function renderDiagrams(): Promise<void> {
  const theme = currentTheme();
  const diagrams = Array.from(document.querySelectorAll<HTMLElement>('[data-mermaid-diagram]'))
    .filter((diagram) => diagram.dataset.mermaidTheme !== theme);

  if (diagrams.length === 0) return;

  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'base',
    themeVariables: themeVariables(theme),
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
    },
  });

  for (const diagram of diagrams) {
    const source = diagram.querySelector<HTMLElement>('[data-mermaid-source]')?.textContent?.trim();
    const canvas = diagram.querySelector<HTMLElement>('[data-mermaid-canvas]');
    if (!source || !canvas) continue;

    diagram.dataset.mermaidState = 'loading';
    canvas.replaceChildren();
    canvas.setAttribute('aria-hidden', 'true');

    try {
      const id = `mermaid-${++renderIndex}`;
      const { svg, bindFunctions } = await mermaid.render(id, source);
      canvas.innerHTML = svg;
      canvas.removeAttribute('aria-hidden');
      bindFunctions?.(canvas);
      diagram.dataset.mermaidState = 'rendered';
      diagram.dataset.mermaidTheme = theme;
    } catch (error) {
      canvas.replaceChildren();
      diagram.dataset.mermaidState = 'error';
      delete diagram.dataset.mermaidTheme;
      console.warn('Unable to render Mermaid diagram.', error);
    }
  }
}

function queueRender(): void {
  renderQueue = renderQueue.then(renderDiagrams).catch((error) => {
    console.warn('Unable to load Mermaid.', error);
  });
}

export function initMermaidDiagrams(): void {
  if (initialized) {
    queueRender();
    return;
  }

  initialized = true;
  let theme = currentTheme();

  const observer = new MutationObserver(() => {
    const nextTheme = currentTheme();
    if (nextTheme === theme) return;
    theme = nextTheme;
    queueRender();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  document.addEventListener('astro:page-load', queueRender);
  queueRender();
}
