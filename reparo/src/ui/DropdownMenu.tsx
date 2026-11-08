import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import { navigate } from '@/app/router';
import { FloatingPanel, popoverStyles as ps } from './Popover';
import { KbdGroup } from './Kbd';
import type { Align, Side } from './floating';
import { cx, fold, mergeRefs } from './utils';

export type MenuItem =
  | {
      type?: 'item';
      label: string;
      description?: string;
      icon?: ReactNode;
      /** Atajo mostrado a la derecha (p. ej. ['C'] o ['⌘', 'K']). */
      shortcut?: string[];
      danger?: boolean;
      disabled?: boolean;
      /** Acción al elegir. */
      onSelect?: () => void;
      /** Alternativa a onSelect: navega a esta ruta hash. */
      href?: string;
    }
  | { type: 'separator' }
  | { type: 'label'; label: string };

export interface DropdownMenuProps {
  /** Botón que abre el menú. */
  trigger: ReactElement;
  items: MenuItem[];
  side?: Side;
  align?: Align;
  width?: number;
  /** Etiqueta accesible del menú. */
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

type ActionItem = Extract<MenuItem, { label: string; type?: 'item' }>;
const isAction = (i: MenuItem): i is ActionItem => !i.type || i.type === 'item';

/** Menú desplegable con teclado (↑ ↓ Inicio Fin, letras, Enter, Escape), separadores e ítems peligrosos. */
export function DropdownMenu({ trigger, items, side = 'bottom', align = 'start', width = 220, label, open: openProp, onOpenChange, className }: DropdownMenuProps) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setInner(v);
    onOpenChange?.(v);
  };
  const anchorRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const [active, setActive] = useState(-1);
  const typeahead = useRef({ text: '', at: 0 });

  const enabledIdx = items.map((it, i) => (isAction(it) && !it.disabled ? i : -1)).filter((i) => i >= 0);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => menuRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const close = (focusTrigger = true) => {
    setOpen(false);
    setActive(-1);
    if (focusTrigger) anchorRef.current?.focus();
  };

  const run = (i: number) => {
    const it = items[i];
    if (!it || !isAction(it) || it.disabled) return;
    close();
    // Deja que el menú se cierre antes de ejecutar (p. ej. abrir un diálogo).
    setTimeout(() => {
      if (it.onSelect) it.onSelect();
      else if (it.href) navigate(it.href);
    }, 0);
  };

  const move = (dir: 1 | -1) => {
    if (!enabledIdx.length) return;
    const pos = enabledIdx.indexOf(active);
    const next = pos === -1 ? (dir === 1 ? 0 : enabledIdx.length - 1) : (pos + dir + enabledIdx.length) % enabledIdx.length;
    setActive(enabledIdx[next]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        return;
      case 'Home':
        e.preventDefault();
        setActive(enabledIdx[0] ?? -1);
        return;
      case 'End':
        e.preventDefault();
        setActive(enabledIdx[enabledIdx.length - 1] ?? -1);
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        run(active);
        return;
      case 'Tab':
        e.preventDefault();
        close();
        return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const t = typeahead.current;
      const now = Date.now();
      t.text = now - t.at > 600 ? e.key : t.text + e.key;
      t.at = now;
      const q = fold(t.text);
      const hit = enabledIdx.find((i) => fold((items[i] as ActionItem).label).startsWith(q));
      if (hit !== undefined) setActive(hit);
    }
  };

  if (!isValidElement(trigger)) return null;
  type AnyProps = Record<string, unknown> & { ref?: Ref<HTMLElement> };
  const tp = trigger.props as AnyProps;
  const triggerEl = cloneElement(trigger as ReactElement<AnyProps>, {
    ref: mergeRefs(tp.ref, anchorRef),
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    onClick: (e: unknown) => {
      if (typeof tp.onClick === 'function') (tp.onClick as (ev: unknown) => void)(e);
      if (open) close();
      else {
        setOpen(true);
        setActive(-1);
      }
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (typeof tp.onKeyDown === 'function') (tp.onKeyDown as (ev: unknown) => void)(e);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
        setActive(e.key === 'ArrowDown' ? (enabledIdx[0] ?? -1) : (enabledIdx[enabledIdx.length - 1] ?? -1));
      }
    },
  });

  return (
    <>
      {triggerEl}
      <FloatingPanel open={open} onClose={() => close()} onOutside={() => close(false)} anchorRef={anchorRef} side={side} align={align} width={width} className={className}>
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          className={ps.list}
          aria-activedescendant={active >= 0 ? `${id}-item-${active}` : undefined}
          onKeyDown={onKeyDown}
        >
          {items.map((it, i) => {
            if (it.type === 'separator') return <div key={i} role="separator" className={ps.separator} />;
            if (it.type === 'label')
              return (
                <div key={i} role="presentation" className={ps.groupLabel}>
                  {it.label}
                </div>
              );
            return (
              <div
                key={i}
                id={`${id}-item-${i}`}
                role="menuitem"
                aria-disabled={it.disabled || undefined}
                data-active={active === i}
                data-danger={it.danger || undefined}
                className={cx(ps.option)}
                onPointerMove={() => !it.disabled && active !== i && setActive(i)}
                onPointerLeave={() => setActive(-1)}
                onClick={() => run(i)}
              >
                {it.icon && <span className={ps.optionIcon}>{it.icon}</span>}
                <span className={ps.optionBody}>
                  <span className={ps.optionLabel}>{it.label}</span>
                  {it.description && <span className={ps.optionDesc}>{it.description}</span>}
                </span>
                {it.shortcut && (
                  <span className={ps.optionMeta}>
                    <KbdGroup keys={it.shortcut} size="sm" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </FloatingPanel>
    </>
  );
}
