// An awaitable dialog, so calling code reads the way Alert.alert() never did.
//
// Alert.alert() takes callbacks, which turns "ask, then act on the answer" into
// nested functions and makes a confirm-then-do sequence hard to follow. These
// return promises instead:
//
//   await dialog.error('Take off failed', 'The drone refused the command.', raw);
//   if (await dialog.confirm('Delete flight', '...')) { ... }
//
// One dialog is shown at a time, which is deliberate: two stacked dialogs about
// the same fault is how an app ends up telling the operator the same thing
// twice with different wording.

import AppDialog, { DialogAction, DialogSpec, DialogVariant } from '@/components/AppDialog';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

interface DialogApi {
  /** Shows a message with a single OK. Resolves when it is dismissed. */
  notify: (
    title: string,
    message?: string,
    options?: { variant?: DialogVariant; detail?: string }
  ) => Promise<void>;
  /** Shorthand for a fault, with the raw text kept in its own block. */
  error: (title: string, message?: string, detail?: string) => Promise<void>;
  /** Resolves true only if the operator chose the confirming action. */
  confirm: (
    title: string,
    message?: string,
    options?: {
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
      variant?: DialogVariant;
      detail?: string;
    }
  ) => Promise<boolean>;
  /** Full control, for anything the shorthands do not cover. */
  show: (spec: DialogSpec) => Promise<DialogAction | undefined>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [spec, setSpec] = useState<DialogSpec | null>(null);
  const resolverRef = useRef<((action?: DialogAction) => void) | null>(null);

  const show = useCallback((next: DialogSpec) => {
    // A dialog arriving while one is open resolves the old one rather than
    // leaking its promise -- an awaited call that never settles would hang the
    // caller forever, and callers here sit in the middle of flight sequences.
    resolverRef.current?.(undefined);
    setSpec(next);
    return new Promise<DialogAction | undefined>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleDismiss = useCallback((action?: DialogAction) => {
    setSpec(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    // The action's own handler runs first, then the promise settles, so
    // `await` sees a world in which the side effect has already happened.
    action?.onPress?.();
    resolve?.(action);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      show,
      notify: async (title, message, options) => {
        await show({
          title,
          message,
          variant: options?.variant ?? 'info',
          detail: options?.detail,
          actions: [{ label: 'OK', cancel: true }],
        });
      },
      error: async (title, message, detail) => {
        await show({
          title,
          message,
          detail,
          variant: 'error',
          actions: [{ label: 'OK', cancel: true }],
        });
      },
      confirm: async (title, message, options) => {
        const chosen = await show({
          title,
          message,
          detail: options?.detail,
          variant: options?.variant ?? (options?.destructive ? 'warn' : 'info'),
          actions: [
            { label: options?.cancelLabel ?? 'Cancel', cancel: true },
            {
              label: options?.confirmLabel ?? 'Confirm',
              destructive: options?.destructive,
            },
          ],
        });
        // Anything other than an explicit press of the confirming action counts
        // as "no" -- including the back gesture and being displaced by another
        // dialog. Defaulting a confirm to yes is how data gets deleted by
        // accident.
        return !!chosen && !chosen.cancel;
      },
    }),
    [show]
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      <AppDialog spec={spec} onDismiss={handleDismiss} />
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside a DialogProvider');
  return ctx;
}
