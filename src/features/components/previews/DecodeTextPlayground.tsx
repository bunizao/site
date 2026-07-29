import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import {
  prepareDecode,
  type DecodeController,
  type DecodeLayout,
  type DecodeOrder,
} from '@bunizao/decode-text';

// The package's demo playground, rehomed onto /components/decode-text so the
// knobs sit next to the install command. Every control maps to exactly one
// option — no derived presets, so what you tune is what the snippet pastes.

// Copy that shows the effect off: enough lines for the top-to-bottom cascade to
// read, short enough that none of them wrap, and highlights placed where the
// resolve front arrives late so you actually watch them land.
const DEFAULT_TEXT = [
  'Type is not decoration — it is **the interface**.',
  'This paragraph is boiling in place: every glyph',
  'picks a cursor, then a scramble, then **the truth**,',
  'sweeping left to right, one character at a time.',
  'Nothing snaps. Nothing arrives out of order.',
  'Tune it until it reads like **your** software.',
].join('\n');

const DEFAULT_CHARSET = '__-—/\\|<>';
const TEXT_COMMIT_MS = 500;
const COPIED_MS = 1600;

interface Settings {
  layout: DecodeLayout;
  order: DecodeOrder;
  mono: boolean;
  charset: string;
  /** Milliseconds per character — `durationPerChar` in ms, which is easier to feel. */
  speed: number;
  boil: number;
  settleStart: number;
  settleCurve: number;
}

const DEFAULTS: Settings = {
  layout: 'grow',
  order: 'shuffle',
  mono: true,
  charset: DEFAULT_CHARSET,
  speed: 19,
  boil: 18,
  settleStart: 0.52,
  settleCurve: 0.8,
};

/**
 * Rebuild the stage from the raw text: newlines become <br>, `**chunks**` become
 * highlighted spans. Rebuilding from scratch each run matters — the engine
 * rewrites its host into .dt-line blocks, so replaying over the previous output
 * would re-flatten every visual line onto one over-wide line.
 *
 * The highlight has to be a COLOUR difference. The engine bakes only color,
 * font-weight and font-style onto each cell before re-homing it into a line
 * block; anything else (underline, background) is dropped with the original
 * span, and weight would break the 1ch cell grid that `grow` layout depends on.
 */
const renderStage = (stage: HTMLElement, text: string): void => {
  const p = document.createElement('p');
  p.style.margin = '0';
  text.split('\n').forEach((line, i) => {
    if (i > 0) p.appendChild(document.createElement('br'));
    line.split('**').forEach((segment, j) => {
      if (j % 2 === 1) {
        const mark = document.createElement('span');
        mark.className = 'playground-mark';
        mark.textContent = segment;
        p.appendChild(mark);
      } else {
        p.appendChild(document.createTextNode(segment));
      }
    });
  });
  stage.replaceChildren(p);
};

interface SegmentProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Segment<T extends string>({ label, value, options, onChange }: SegmentProps<T>) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <div className="playground-field">
      <span className="playground-label">{label}</span>
      <div
        className="playground-seg"
        role="group"
        aria-label={label}
        style={{ '--seg-count': options.length, '--seg-index': index } as React.CSSProperties}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="playground-seg-item"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  display: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

function Slider({ label, display, min, max, value, onChange }: SliderProps) {
  return (
    <label className="playground-field">
      <span className="playground-label">
        {label}
        <output className="playground-value">{display}</output>
      </span>
      <input
        className="playground-range"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

/**
 * The snippet is generated per keystroke, so Shiki (build-time, in CodeBox)
 * can't touch it. It is also a known shape — one call, string and number
 * literals — so tokenizing it by hand costs six spans and keeps the page free
 * of a runtime highlighter. Colours live in code-box.css alongside the real one.
 */
type Token = [className: string, text: string];

const optionLine = (key: string, value: string, quoted: boolean): Token[] => [
  ['cb-t-prop', `  ${key}`],
  ['cb-t-punc', ': '],
  quoted ? ['cb-t-str', `'${value}'`] : ['cb-t-num', value],
  ['cb-t-punc', ','],
];

const snippetLines = (settings: Settings): Token[][] => [
  [
    ['cb-t-fn', 'decodeText'],
    ['cb-t-punc', '('],
    ['cb-t-var', 'el'],
    ['cb-t-punc', ', {'],
  ],
  optionLine('layout', settings.layout, true),
  optionLine('order', settings.order, true),
  optionLine('durationPerChar', (settings.speed / 1000).toFixed(3), false),
  optionLine('mutationHz', String(settings.boil), false),
  optionLine('settleStart', settings.settleStart.toFixed(2), false),
  optionLine('settleCurve', settings.settleCurve.toFixed(2), false),
  [['cb-t-punc', '});']],
];

export function DecodeTextPlayground() {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const controller = React.useRef<DecodeController | null>(null);
  const commitTimer = React.useRef<number | undefined>(undefined);
  const copiedTimer = React.useRef<number | undefined>(undefined);

  const [settings, setSettings] = React.useState<Settings>(DEFAULTS);
  const [text, setText] = React.useState(DEFAULT_TEXT);
  // Typing shouldn't restart the reveal on every keystroke; the run reads this.
  const [committedText, setCommittedText] = React.useState(DEFAULT_TEXT);
  // Bumped by Replay so an unchanged config still re-runs.
  const [run, setRun] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    setSettings((current) => ({ ...current, [key]: value }));

  const onTextChange = (value: string): void => {
    setText(value);
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => setCommittedText(value), TEXT_COMMIT_MS);
  };

  const reset = (): void => {
    window.clearTimeout(commitTimer.current);
    setSettings(DEFAULTS);
    setText(DEFAULT_TEXT);
    setCommittedText(DEFAULT_TEXT);
    setRun((n) => n + 1);
  };

  const lines = snippetLines(settings);

  const copy = async (): Promise<void> => {
    const plain = lines.map((line) => line.map(([, t]) => t).join('')).join('\n');
    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let cancelled = false;
    controller.current?.cancel();
    renderStage(stage, committedText);
    // Prepare blanks every slot; stay hidden until then so the full text never
    // paints between rebuild and reveal.
    stage.style.visibility = 'hidden';

    void prepareDecode(stage, {
      layout: settings.layout,
      order: settings.order,
      charset: settings.charset || undefined,
      durationPerChar: settings.speed / 1000,
      mutationHz: settings.boil,
      settleStart: settings.settleStart,
      settleCurve: settings.settleCurve,
      maxLineDuration: 3,
    }).then((next) => {
      stage.style.visibility = '';
      if (cancelled) {
        next.cancel();
        return;
      }
      controller.current = next;
      next.start();
    });

    return () => {
      cancelled = true;
      controller.current?.cancel();
      controller.current = null;
    };
  }, [settings, committedText, run]);

  React.useEffect(
    () => () => {
      window.clearTimeout(commitTimer.current);
      window.clearTimeout(copiedTimer.current);
    },
    []
  );

  return (
    <div className="playground">
      <div className="playground-instrument">
        <div className="playground-stage-wrap">
          <div
            ref={stageRef}
            className={`playground-stage${settings.mono ? '' : ' playground-stage--sans'}`}
          />
          {/* Pinned to the stage they act on, not stranded in a footer. */}
          <div className="playground-actions">
            <button type="button" className="playground-action" onClick={reset}>
              Reset
            </button>
            <button
              type="button"
              className="playground-action"
              onClick={() => setRun((n) => n + 1)}
            >
              Replay <span aria-hidden="true">↻</span>
            </button>
          </div>
        </div>

        <div className="playground-panel">
          <div className="playground-row playground-row--controls">
            <Segment
              label="Layout"
              value={settings.layout}
              options={[
                { value: 'grow', label: 'grow' },
                { value: 'static', label: 'static' },
              ]}
              onChange={(value) => set('layout', value)}
            />
            <Segment
              label="Order"
              value={settings.order}
              options={[
                { value: 'shuffle', label: 'shuffle' },
                { value: 'ltr', label: 'ltr' },
              ]}
              onChange={(value) => set('order', value)}
            />
            <Segment
              label="Typeface"
              value={settings.mono ? 'mono' : 'sans'}
              options={[
                { value: 'mono', label: 'mono' },
                { value: 'sans', label: 'sans' },
              ]}
              onChange={(value) => set('mono', value === 'mono')}
            />
            <label className="playground-field playground-field--charset">
              <span className="playground-label">Charset</span>
              <input
                className="playground-input"
                type="text"
                value={settings.charset}
                onChange={(event) => set('charset', event.target.value)}
              />
            </label>
          </div>

          <div className="playground-row playground-row--sliders">
            <Slider
              label="Speed"
              display={`${settings.speed}ms/char`}
              min={8}
              max={60}
              value={settings.speed}
              onChange={(value) => set('speed', value)}
            />
            <Slider
              label="Boil"
              display={`${settings.boil}Hz`}
              min={2}
              max={30}
              value={settings.boil}
              onChange={(value) => set('boil', value)}
            />
            <Slider
              label="Settle start"
              display={settings.settleStart.toFixed(2)}
              min={10}
              max={85}
              value={Math.round(settings.settleStart * 100)}
              onChange={(value) => set('settleStart', value / 100)}
            />
            <Slider
              label="Settle curve"
              display={settings.settleCurve.toFixed(2)}
              min={50}
              max={200}
              value={Math.round(settings.settleCurve * 100)}
              onChange={(value) => set('settleCurve', value / 100)}
            />
          </div>

          <label className="playground-field">
            <span className="playground-label playground-label--inline">
              Text
              <span className="playground-value">**highlight**</span>
            </span>
            <textarea
              className="playground-input playground-textarea"
              spellCheck={false}
              rows={6}
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      {/* Same frame as the Usage block below, so the readout reads as code. */}
      <figure className="code-box">
        <figcaption className="code-box-head">
          <span className="code-box-lang">TypeScript</span>
          <button
            type="button"
            className="code-box-copy"
            onClick={() => void copy()}
            data-copied={copied ? '' : undefined}
            aria-label="Copy snippet"
          >
            <span className="code-box-icons" aria-hidden="true">
              <Copy className="code-box-icon code-box-icon--copy" />
              <Check className="code-box-icon code-box-icon--check" />
            </span>
          </button>
        </figcaption>
        <div className="code-box-body">
          <pre className="playground-code">
            <code>
              {lines.map((line, i) => (
                <React.Fragment key={i}>
                  {i > 0 && '\n'}
                  {line.map(([className, value], j) => (
                    <span key={j} className={className}>
                      {value}
                    </span>
                  ))}
                </React.Fragment>
              ))}
            </code>
          </pre>
        </div>
      </figure>
    </div>
  );
}

export default DecodeTextPlayground;
