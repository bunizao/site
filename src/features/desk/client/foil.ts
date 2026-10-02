// The student card catches the light. One WebGL canvas paints the card's M
// as holographic foil, in whichever copy of the card is on screen. The light
// comes from where the frame sits in the column, so the M shimmers as it
// drifts past, and under a mouse also from the pointer, which tilts the card
// on its lanyard. It draws only when the light moves, never on a timer.

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Pearl foil: the M keeps its own pale ink, and one soft streak of pastel
// thin-film colour crosses it where the light lands, so the card catches the
// light rather than glowing. A scatter of flakes flashes at its own angles,
// brightest inside the streak.
const FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_light;
uniform float u_aspect;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Lilac, rose and ice: a narrow cosine palette around a light base.
vec3 pearl(float t) {
  return vec3(0.84, 0.83, 0.94) + vec3(0.16, 0.15, 0.06) * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 q = vec2(v_uv.x * u_aspect, v_uv.y);
  float t = dot(q, vec2(0.55, 0.85)) + (noise(q * 3.0 + u_light * 0.4) - 0.5) * 0.16;
  float centre = 0.55 + u_light.x * 0.45 - u_light.y * 0.35;
  float d = (t - centre) * 4.2;
  float streak = exp(-d * d);
  float h = hash(floor(gl_FragCoord.xy / 2.0));
  float flake = step(0.975, h) * max(0.0, sin(h * 80.0 + u_light.x * 7.0 + u_light.y * 5.0)) * (0.15 + streak);
  float alpha = 0.06 + streak * 0.66;
  gl_FragColor = vec4(min(pearl(t * 1.6 + u_light.x * 0.25) + flake * 0.6, 1.0) * alpha, alpha);
}`;

// The M device is drawn at 100:230 (Badge.astro).
const M_ASPECT = 100 / 230;
// Degrees the card turns at the frame's edge.
const TILT_X_DEG = 14;
const TILT_Y_DEG = 9;
// Time constant of the tilt easing towards the pointer.
const EASE_MS = 110;

interface Light {
  x: number;
  y: number;
}

const clamp = (value: number) => Math.min(1, Math.max(-1, value));

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function link(gl: WebGLRenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

export function initFoil(): () => void {
  const column = document.querySelector<HTMLElement>('[data-mx-col]');
  const tiles = [...document.querySelectorAll<HTMLElement>('.tile--about')];
  if (!column || !tiles.length) return () => {};

  const canvas = document.createElement('canvas');
  canvas.className = 'mo-foil';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  const program = gl && link(gl);
  if (!gl || !program) return () => {};

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  // One triangle that covers the whole canvas.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_aspect'), M_ASPECT);
  const uLight = gl.getUniformLocation(program, 'u_light');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let host: HTMLElement | null = null;
  let drawn: Light = { x: Number.NaN, y: Number.NaN };

  const draw = (light: Light) => {
    if (Math.abs(light.x - drawn.x) < 0.002 && Math.abs(light.y - drawn.y) < 0.002) return;
    gl.uniform2f(uLight, light.x, light.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawn = light;
  };

  // The canvas moves into the card it paints; the copies are far enough apart
  // that only one is ever on screen.
  const attach = (tile: HTMLElement) => {
    if (host === tile) return;
    const photo = tile.querySelector<HTMLElement>('.mo-photo');
    if (!photo) return;
    host?.querySelector<HTMLElement>('.mo-badge')?.style.removeProperty('transform');
    host = tile;
    photo.insertBefore(canvas, photo.querySelector('.mo-hole'));
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.height = Math.round(photo.offsetHeight * dpr);
    canvas.width = Math.round(photo.offsetHeight * M_ASPECT * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    drawn = { x: Number.NaN, y: Number.NaN };
  };

  // The card nearest the middle of the column.
  const nearest = () => {
    const view = column.getBoundingClientRect();
    let best: HTMLElement | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect();
      if (rect.bottom < view.top || rect.top > view.bottom || rect.right < view.left || rect.left > view.right) continue;
      const distance = Math.hypot(rect.left + rect.width / 2 - (view.left + view.width / 2), rect.top + rect.height / 2 - (view.top + view.height / 2));
      if (distance < bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    }
    return best;
  };

  // -1..1 across the column: where the frame is on its way past.
  const passing = (tile: HTMLElement): Light => {
    const view = column.getBoundingClientRect();
    const rect = tile.getBoundingClientRect();
    return {
      x: clamp((view.left + view.width / 2 - (rect.left + rect.width / 2)) / (view.width / 2)),
      y: clamp((view.top + view.height / 2 - (rect.top + rect.height / 2)) / (view.height / 2)),
    };
  };

  let pointer: Light | null = null;
  const tilt: Light = { x: 0, y: 0 };
  let frame = 0;
  let last = 0;

  const render = () => {
    if (!host) return;
    const badge = host.querySelector<HTMLElement>('.mo-badge');
    if (badge && !reduced.matches) {
      badge.style.transform =
        tilt.x || tilt.y ? `perspective(800px) rotateX(${(tilt.y * TILT_Y_DEG).toFixed(2)}deg) rotateY(${(tilt.x * TILT_X_DEG).toFixed(2)}deg)` : '';
    }
    const along = passing(host);
    draw({ x: along.x + tilt.x, y: along.y + tilt.y });
  };

  const step = (now: number) => {
    frame = 0;
    const dt = Math.min(48, now - (last || now));
    last = now;
    const blend = 1 - Math.exp(-dt / EASE_MS);
    const target = pointer ?? { x: 0, y: 0 };
    tilt.x += (target.x - tilt.x) * blend;
    tilt.y += (target.y - tilt.y) * blend;
    const settled = Math.abs(target.x - tilt.x) + Math.abs(target.y - tilt.y) < 0.001;
    if (settled) Object.assign(tilt, target);
    render();
    if (settled) last = 0;
    else frame = requestAnimationFrame(step);
  };

  const ease = () => {
    if (!frame) frame = requestAnimationFrame(step);
  };

  const onScroll = () => {
    const tile = nearest();
    if (!tile) return;
    attach(tile);
    render();
  };

  // Touch has no hover; a finger on the frame is a scroll or a tap.
  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const tile = event.currentTarget as HTMLElement;
    const rect = tile.getBoundingClientRect();
    attach(tile);
    pointer = {
      x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1),
      y: clamp(1 - ((event.clientY - rect.top) / rect.height) * 2),
    };
    ease();
  };

  const onLeave = () => {
    pointer = null;
    ease();
  };

  column.addEventListener('scroll', onScroll, { passive: true });
  tiles.forEach((tile) => {
    tile.addEventListener('pointermove', onMove);
    tile.addEventListener('pointerleave', onLeave);
  });
  canvas.addEventListener('webglcontextlost', () => canvas.remove());
  onScroll();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    column.removeEventListener('scroll', onScroll);
    tiles.forEach((tile) => {
      tile.removeEventListener('pointermove', onMove);
      tile.removeEventListener('pointerleave', onLeave);
    });
    canvas.remove();
  };
}
