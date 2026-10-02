import * as React from 'react';
import { cn } from '@/lib/utils';
import { TOUCH_TARGET } from './touch-target';

/* The moderation screens' segmented switch, apart from the rest of ui.tsx
   so a screen that only needs the switch (Home's site-wide mode) does not
   load the whole vocabulary. */

/* A small switch of our own instead of coss ToggleGroup: a switch pressed
   many times a minute should change in the frame it is pressed. */
export interface SwitchOption<T extends string> {
  value: T;
  label: string;
}

function arrowTo<T extends string>(event: React.KeyboardEvent, options: SwitchOption<T>[], value: T, onChange: (value: T) => void): void {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.preventDefault();
  const index = options.findIndex((option) => option.value === value);
  const next = options[(index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
  onChange(next.value);
  const group = event.currentTarget.parentElement;
  requestAnimationFrame(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
}

export function Segmented<T extends string>({ label, value, options, onChange, onIntent, className }: {
  label: string;
  value: T;
  options: SwitchOption<T>[];
  onChange: (value: T) => void;
  /** Pointer-down on an option: time to start fetching what it will show. */
  onIntent?: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border p-0.5', className)}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onPointerDown={() => onIntent?.(option.value)}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => arrowTo(event, options, value, onChange)}
            className={cn(
              'relative h-full rounded-md px-2.5 text-muted-foreground text-xs tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent aria-checked:bg-accent aria-checked:text-foreground',
              TOUCH_TARGET,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
