import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { feedback } from '@/lib/feedback';

interface CopyCommandProps {
  command: string;
}

/**
 * Inked command bar + the site's shared copy button (styles/copy-button.css):
 * a bare icon that crossfades copy → check and pops a "Copied" bubble.
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
    feedback.success();
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="copy-command">
      <code className="copy-command-text">{command}</code>
      <button
        type="button"
        className="copy-btn"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy command'}
        data-copied={copied ? '' : undefined}
      >
        <span className="copy-btn-icons" aria-hidden="true">
          <Copy className="copy-btn-icon copy-btn-icon--copy" />
          <Check className="copy-btn-icon copy-btn-icon--check" />
        </span>
        <span className="copy-btn-tip" role="status">Copied</span>
      </button>
    </div>
  );
}

export default CopyCommand;
