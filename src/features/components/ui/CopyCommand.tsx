import * as React from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyCommandProps {
  command: string;
}

/**
 * Inked command bar + copy button. The icon crossfades copy → check behind a
 * 2px blur mask; the "Copied" tooltip appears instantly (no fade-in) so the
 * confirmation reads as immediate. The button presses with scale(0.97).
 */
export function CopyCommand({ command }: CopyCommandProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="copy-command">
      <code className="copy-command-text">{command}</code>
      <button
        type="button"
        className="copy-command-btn"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy command'}
        data-copied={copied ? '' : undefined}
      >
        <span className="copy-command-icons" aria-hidden="true">
          <Copy className="copy-command-icon copy-command-icon--copy" />
          <Check className="copy-command-icon copy-command-icon--check" />
        </span>
        {copied ? <span className="copy-command-tip" role="status">Copied</span> : null}
      </button>
    </div>
  );
}

export default CopyCommand;
