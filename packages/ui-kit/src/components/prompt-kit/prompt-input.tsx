import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '../ui/tooltip.js';
import { cn } from '../../lib/utils.js';

type PromptInputContextValue = {
  isLoading: boolean;
  value: string;
  setValue: (next: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

const PromptInputContext = createContext<PromptInputContextValue>({
  isLoading: false,
  value: '',
  setValue: () => {},
  maxHeight: 220,
  onSubmit: undefined,
  disabled: false,
  textareaRef: { current: null },
});

export function bindGlobalPromptListener(
  targetRef: React.RefObject<HTMLTextAreaElement | null>,
): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.length !== 1) return;
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        (active as HTMLElement).isContentEditable)
    ) {
      return;
    }
    targetRef.current?.focus();
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}

export type PromptInputProps = {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
  autoFocusGlobal?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function PromptInput({
  className,
  isLoading = false,
  maxHeight = 220,
  value,
  onValueChange,
  onSubmit,
  disabled = false,
  autoFocusGlobal = false,
  children,
}: PromptInputProps): React.ReactElement {
  const [internalValue, setInternalValue] = useState(value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!autoFocusGlobal) return undefined;
    return bindGlobalPromptListener(textareaRef);
  }, [autoFocusGlobal]);

  function handleChange(nextValue: string): void {
    setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  return (
    <PromptInputContext.Provider
      value={{
        isLoading,
        value: value ?? internalValue,
        setValue: onValueChange ?? handleChange,
        maxHeight,
        onSubmit,
        disabled,
        textareaRef,
      }}
    >
      <div
        onClick={() => textareaRef.current?.focus()}
        className={cn(
          'rounded-xl border border-primary-200 bg-surface p-2.5 shadow-2xs transition-colors focus-within:border-primary-400',
          disabled && 'opacity-60 cursor-not-allowed',
          className,
        )}
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  );
}

export type PromptInputTextareaProps = Omit<
  React.ComponentProps<'textarea'>,
  'value' | 'onChange'
> & {
  disableAutosize?: boolean;
};

export function PromptInputTextarea({
  className,
  onKeyDown,
  disableAutosize = false,
  ...props
}: PromptInputTextareaProps): React.ReactElement {
  const { value, setValue, maxHeight, onSubmit, disabled, textareaRef } =
    useContext(PromptInputContext);

  useEffect(() => {
    if (disableAutosize || !textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    const nextHeight =
      typeof maxHeight === 'number'
        ? `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
        : `min(${textareaRef.current.scrollHeight}px, ${maxHeight})`;
    textareaRef.current.style.height = nextHeight;
  }, [value, maxHeight, disableAutosize, textareaRef]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
    onKeyDown?.(e);
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      rows={1}
      className={cn(
        'w-full resize-none border-0 bg-transparent px-1.5 py-1 text-[13.5px] leading-relaxed text-ink placeholder:text-primary-400 outline-none focus:ring-0',
        className,
      )}
      {...props}
    />
  );
}

export type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>;

export function PromptInputActions({
  children,
  className,
  ...props
}: PromptInputActionsProps): React.ReactElement {
  return (
    <div
      className={cn('mt-2 flex items-center justify-between gap-2 px-1', className)}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}

export type PromptInputActionProps = {
  tooltip: React.ReactNode;
  children: React.ReactElement;
  className?: string;
};

export function PromptInputAction({
  tooltip,
  children,
  className,
}: PromptInputActionProps): React.ReactElement {
  return (
    <TooltipRoot>
      <TooltipTrigger render={children} />
      <TooltipContent className={className}>{tooltip}</TooltipContent>
    </TooltipRoot>
  );
}
