"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@/lib/utils";
import * as React from "react";

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    (ref as { current: T | null }).current = value;
  }
}

export function Checkbox({
  className,
  inputRef: forwardedInputRef,
  onCheckedChange,
  ...props
}: CheckboxPrimitive.Root.Props): React.ReactElement {
  // Bridge Base UI's data-checked/data-unchecked to the shadcn-style
  // data-state used by the admin e2e suite. Only meaningful for controlled
  // usage (all portal checkboxes pass `checked`), harmless otherwise.
  const dataState =
    props.indeterminate
      ? 'indeterminate'
      : props.checked === true
        ? 'checked'
        : props.checked === false
          ? 'unchecked'
          : undefined;
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const syncInputState = React.useCallback((checked?: boolean) => {
    const input = inputRef.current;
    if (!input) return;

    input.dataset.state = input.indeterminate
      ? "indeterminate"
      : (checked ?? input.checked)
        ? "checked"
        : "unchecked";
  }, []);

  const handleInputRef = React.useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    assignRef(forwardedInputRef, input);
    syncInputState();
  }, [forwardedInputRef, syncInputState]);

  React.useEffect(() => {
    syncInputState(props.checked);
  }, [props.checked, props.indeterminate, syncInputState]);

  const handleCheckedChange = React.useCallback<NonNullable<CheckboxPrimitive.Root.Props["onCheckedChange"]>>(
    (checked, eventDetails) => {
      syncInputState(checked);
      onCheckedChange?.(checked, eventDetails);
    },
    [onCheckedChange, syncInputState],
  );

  return (
    <CheckboxPrimitive.Root
      className={cn(
        "relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-[.25rem] border border-input bg-background not-dark:bg-clip-padding shadow-xs/5 outline-none ring-ring transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[3px] not-data-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-invalid:border-destructive/36 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/48 data-disabled:cursor-not-allowed data-disabled:opacity-64 sm:size-4 dark:not-data-checked:bg-input/32 dark:aria-invalid:ring-destructive/24 dark:not-data-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)] [[data-disabled],[data-checked],[aria-invalid]]:shadow-none",
        className,
      )}
      data-slot="checkbox"
      data-state={dataState}
      inputRef={handleInputRef}
      onCheckedChange={handleCheckedChange}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="absolute -inset-px flex items-center justify-center rounded-[.25rem] text-primary-foreground data-unchecked:hidden data-checked:bg-primary data-indeterminate:text-foreground"
        data-slot="checkbox-indicator"
        render={(
          props: React.ComponentProps<"span">,
          state: CheckboxPrimitive.Indicator.State,
        ) => (
          <span {...props}>
            {state.indeterminate ? (
              <svg
                aria-hidden="true"
                className="size-3.5 sm:size-3"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M5.252 12h13.496" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                className="size-3.5 sm:size-3"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
              </svg>
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}

export { CheckboxPrimitive };
