// The student card's M catches the light as pearl security foil. The card
// gets one WebGL canvas, cut to the foil's shape by a mask painted once. The
// light comes from where the card sits on the easel and, under a mouse, from
// the pointer, which tilts the card. It draws only when the light moves, never
// on a timer.

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Thin film: one soft streak of pastel colour where the light lands, and a
// scatter of flakes flashing at their own angles, laid over the M's own pale
// ink.
const FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_mask;
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
  float mask = texture2D(u_mask, v_uv).a;
  vec2 q = vec2(v_uv.x * u_aspect, v_uv.y);
  float t = dot(q, vec2(0.55, 0.85)) + (noise(q * 3.0 + u_light * 0.4) - 0.5) * 0.16;
  float centre = 0.55 + u_light.x * 0.45 - u_light.y * 0.35;
  float h = hash(floor(gl_FragCoord.xy / 2.0));
  float flake = step(0.975, h) * max(0.0, sin(h * 80.0 + u_light.x * 7.0 + u_light.y * 5.0));
  vec3 film = pearl(t * 1.6 + u_light.x * 0.25);
  float d = (t - centre) * 4.2;
  float streak = exp(-d * d);
  float alpha = (0.06 + streak * 0.66) * mask;
  gl_FragColor = vec4(min(film + flake * (0.15 + streak) * 0.6, 1.0) * alpha, alpha);
}`;

// The M device (Badge.astro), drawn at 100:230.
const M_PATH = 'M0 0 H44 L50 74 L56 0 H100 V230 H72.8 V136 L64.4 230 H35.6 L27.2 136 V230 H0 Z';
const M_ASPECT = 100 / 230;
// Time constant of the tilt easing towards the pointer.
const EASE_MS = 110;

interface Light {
  x: number;
  y: number;
}

type Paint = (ctx: CanvasRenderingContext2D, host: HTMLElement, scale: number) => void;

interface Surface {
  /** The elements holding the object. */
  tiles: string;
  /** The element the canvas covers, inside one of them. */
  host: string;
  /** The child of the host the canvas goes in front of. */
  before?: string;
  /** The canvas's width over its height; the host's own box when omitted. */
  aspect?: number;
  paint: Paint;
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

const paintM: Paint = (ctx, host, scale) => {
  const height = host.offsetHeight * scale;
  ctx.scale((height * M_ASPECT) / 100, height / 230);
  ctx.fill(new Path2D(M_PATH));
};

function foil(column: HTMLElement, surface: Surface): () => void {
  const tiles = [...document.querySelectorAll<HTMLElement>(surface.tiles)];
  if (!tiles.length) return () => {};

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
  const uAspect = gl.getUniformLocation(program, 'u_aspect');
  const uLight = gl.getUniformLocation(program, 'u_light');

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // The mask is painted top down; the shader reads bottom up.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const mask = document.createElement('canvas');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let host: HTMLElement | null = null;
  let drawn: Light = { x: Number.NaN, y: Number.NaN };

  const draw = (light: Light) => {
    if (Math.abs(light.x - drawn.x) < 0.002 && Math.abs(light.y - drawn.y) < 0.002) return;
    gl.uniform2f(uLight, light.x, light.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawn = light;
  };

  const release = () => {
    host?.style.removeProperty('--tilt-x');
    host?.style.removeProperty('--tilt-y');
    host?.classList.remove('has-foil');
  };

  // The canvas moves into the copy it paints; the copies are far enough apart
  // that only one is ever on screen.
  const attach = (tile: HTMLElement) => {
    if (host === tile) return;
    const target = tile.querySelector<HTMLElement>(surface.host);
    if (!target) return;
    release();
    host = tile;
    target.insertBefore(canvas, surface.before ? target.querySelector(surface.before) : null);
    const scale = Math.min(devicePixelRatio, 2);
    canvas.height = mask.height = Math.round(target.offsetHeight * scale);
    canvas.width = mask.width = Math.round((surface.aspect ? target.offsetHeight * surface.aspect : target.offsetWidth) * scale);
    const ctx = mask.getContext('2d');
    if (ctx) surface.paint(ctx, target, scale);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, gl.ALPHA, gl.UNSIGNED_BYTE, mask);
    gl.uniform1f(uAspect, canvas.width / canvas.height);
    gl.viewport(0, 0, canvas.width, canvas.height);
    tile.classList.add('has-foil');
    drawn = { x: Number.NaN, y: Number.NaN };
  };

  // The copy nearest the middle of the column.
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

  // The object's CSS turns it by the tilt; the light follows either way.
  const render = () => {
    if (!host) return;
    if (!reduced.matches) {
      host.style.setProperty('--tilt-x', tilt.x.toFixed(3));
      host.style.setProperty('--tilt-y', tilt.y.toFixed(3));
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

  // A lost context takes the canvas with it, and the flat foil comes back.
  const onLost = () => {
    release();
    canvas.remove();
  };

  column.addEventListener('scroll', onScroll, { passive: true });
  tiles.forEach((tile) => {
    tile.addEventListener('pointermove', onMove);
    tile.addEventListener('pointerleave', onLeave);
  });
  canvas.addEventListener('webglcontextlost', onLost);
  onScroll();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    column.removeEventListener('scroll', onScroll);
    tiles.forEach((tile) => {
      tile.removeEventListener('pointermove', onMove);
      tile.removeEventListener('pointerleave', onLeave);
    });
    onLost();
  };
}

export function initFoil(): () => void {
  const frame = document.querySelector<HTMLElement>('[data-easel-frame]');
  if (!frame) return () => {};
  return foil(frame, { tiles: '.ab-badge', host: '.mo-photo', before: '.mo-hole', aspect: M_ASPECT, paint: paintM });
}
