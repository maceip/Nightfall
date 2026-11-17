// Feature-detected DOM shims for headless/jsdom test environments where native
// <dialog>, Popover API, ResizeObserver, or matchMedia are absent. No-ops in Chromium/Electron.

function installNightfallDomCompat(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverShim {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserverShim }).ResizeObserver =
      ResizeObserverShim;
  }

  if (typeof HTMLDialogElement !== 'undefined') {
    if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
      HTMLDialogElement.prototype.showModal = function showModalShim(this: HTMLDialogElement): void {
        this.setAttribute('open', '');
        this.open = true;
      };
    }
    if (typeof HTMLDialogElement.prototype.show !== 'function') {
      HTMLDialogElement.prototype.show = function showShim(this: HTMLDialogElement): void {
        this.setAttribute('open', '');
        this.open = true;
      };
    }
    if (typeof HTMLDialogElement.prototype.close !== 'function') {
      HTMLDialogElement.prototype.close = function closeShim(
        this: HTMLDialogElement,
        returnValue?: string,
      ): void {
        if (returnValue !== undefined) {
          this.returnValue = returnValue;
        }
        this.removeAttribute('open');
        this.open = false;
        this.dispatchEvent(new Event('close'));
      };
    }
  }

  if (typeof HTMLElement !== 'undefined') {
    const proto = HTMLElement.prototype as HTMLElement & {
      showPopover?: () => void;
      hidePopover?: () => void;
      togglePopover?: (force?: boolean) => boolean;
    };
    if (typeof proto.showPopover !== 'function') {
      proto.showPopover = function showPopoverShim(this: HTMLElement): void {
        this.setAttribute('data-popover-open', 'true');
      };
    }
    if (typeof proto.hidePopover !== 'function') {
      proto.hidePopover = function hidePopoverShim(this: HTMLElement): void {
        this.removeAttribute('data-popover-open');
      };
    }
    if (typeof proto.togglePopover !== 'function') {
      proto.togglePopover = function togglePopoverShim(
        this: HTMLElement,
        force?: boolean,
      ): boolean {
        const isOpen = this.hasAttribute('data-popover-open');
        const next = force ?? !isOpen;
        if (next) this.setAttribute('data-popover-open', 'true');
        else this.removeAttribute('data-popover-open');
        return next;
      };
    }
  }
}

installNightfallDomCompat();
export {};
