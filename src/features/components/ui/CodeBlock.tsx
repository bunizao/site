import * as React from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  lang?: string;
}

/**
 * Framed code box in the shadcn register: a header bar carrying the language
 * label and a copy button, above a monochrome code body. The copy button
 * reuses the install bar's masked icon crossfade so both share one interaction
 * dialect. The <pre> renders server-side, so code is readable without JS —
 * only the copy button needs hydration.
 */
export function CodeBlock({ code, lang = 'text' }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-block-lang">{lang}</span>
        <button
          type="button"
          className="copy-command-btn code-block-copy"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          data-copied={copied ? '' : undefined}
        >
          <span className="copy-command-icons" aria-hidden="true">
            <Copy className="copy-command-icon copy-command-icon--copy" />
            <Check className="copy-command-icon copy-command-icon--check" />
          </span>
          {copied ? <span className="copy-command-tip" role="status">Copied</span> : null}
        </button>
      </div>
      <pre className="code-block-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default CodeBlock;
