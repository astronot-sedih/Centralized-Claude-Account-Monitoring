"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Select — themed dropdown. Renders its own option list (never the OS popup),
 * so the menu follows the dark-first theme and is fully keyboard driven.
 *
 * The popup is `position: fixed`, positioned from the trigger's
 * getBoundingClientRect() at open time, so it escapes ancestors with
 * overflow:hidden/auto (modals, scroll panels) and flips up when the space
 * below is tight. Motion (§23): popup fades + scales .96 from the trigger,
 * 160 ms in / 120 ms out.
 *
 * @prop {string}   value
 * @prop {Array<string|{value,label,icon?,disabled?}>} options
 * @prop {function} onChange           (value) => void
 * @prop {string}   placeholder
 * @prop {string}   icon               icon name shown in the trigger
 * @prop {boolean}  disabled
 * @prop {'sm'|'md'} size              32px / 40px, default 'md'
 * @prop {boolean}  searchable         filter input above the list (auto when options > 8)
 * @prop {number|string} width         default '100%'
 * @prop {string}   label, helperText, errorText, name, id
 */
import { Icon } from './Icon.jsx';
import { usePresence, EXIT_MS } from './layer.js';

const { useState, useRef, useEffect, useMemo, useCallback } = React;

const POPUP_OFFSET = 6;
const POPUP_MAX_H = 240;

function normalize(options) {
  return (options || []).map(o =>
    typeof o === 'string' ? { value: o, label: o } : { ...o, label: o.label ?? o.value }
  );
}

export function Select({
  value,
  options = [],
  onChange,
  placeholder = 'Pilih…',
  icon,
  disabled = false,
  size = 'md',
  searchable,
  width = '100%',
  label, helperText, errorText,
  name, id,
  className = '',
}) {
  const items = useMemo(() => normalize(options), [options]);
  const selectedIndex = items.findIndex(o => o.value === value);
  const selected = selectedIndex > -1 ? items[selectedIndex] : null;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(null);
  const [mounted, state] = usePresence(open, EXIT_MS.layer);

  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const typeahead = useRef({ buf: '', t: 0 });

  const showSearch = searchable ?? items.length > 8;
  const visible = useMemo(() => {
    if (!showSearch || !query) return items;
    const q = query.toLowerCase();
    return items.filter(o => String(o.label).toLowerCase().includes(q));
  }, [items, query, showSearch]);

  const fieldId = id || (name ? 'sel-' + name : undefined);
  const listId = (fieldId || 'ds-select') + '-listbox';

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - POPUP_OFFSET;
    const above = r.top - POPUP_OFFSET;
    const needed = Math.min(POPUP_MAX_H, visible.length * 34 + 10 + (showSearch ? 42 : 0));
    const flip = below < needed && above > below;
    setPos({
      left: r.left,
      width: r.width,
      top: flip ? undefined : r.bottom + POPUP_OFFSET,
      bottom: flip ? window.innerHeight - r.top + POPUP_OFFSET : undefined,
      maxHeight: Math.min(POPUP_MAX_H, Math.max(120, flip ? above : below)),
    });
  }, [visible.length, showSearch]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    place();
    setQuery('');
    setActive(selectedIndex > -1 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, place, selectedIndex]);

  const closeMenu = useCallback((refocus = true) => {
    setOpen(false);
    setActive(-1);
    if (refocus && triggerRef.current) triggerRef.current.focus();
  }, []);

  const commit = (opt) => {
    if (!opt || opt.disabled) return;
    onChange && onChange(opt.value, opt);
    closeMenu();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } };
    const reposition = () => place();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    if (showSearch && searchRef.current) searchRef.current.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, place, closeMenu, showSearch]);

  useEffect(() => {
    if (!open || active < 0 || !listRef.current) return;
    const node = listRef.current.querySelector('[data-idx="' + active + '"]');
    if (!node) return;
    const box = listRef.current;
    if (node.offsetTop < box.scrollTop) box.scrollTop = node.offsetTop - 4;
    else if (node.offsetTop + node.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = node.offsetTop + node.offsetHeight - box.clientHeight + 4;
  }, [open, active]);

  const step = (dir) => {
    if (!visible.length) return;
    let i = active;
    for (let n = 0; n < visible.length; n++) {
      i = (i + dir + visible.length) % visible.length;
      if (!visible[i].disabled) break;
    }
    setActive(i);
  };

  const edge = (which) => {
    const list = which === 'home' ? visible : [...visible].reverse();
    const found = list.findIndex(o => !o.disabled);
    if (found < 0) return;
    setActive(which === 'home' ? found : visible.length - 1 - found);
  };

  const onTriggerKey = (e) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); step(1); break;
      case 'ArrowUp': e.preventDefault(); step(-1); break;
      case 'Home': e.preventDefault(); edge('home'); break;
      case 'End': e.preventDefault(); edge('end'); break;
      case 'Enter': e.preventDefault(); commit(visible[active]); break;
      case 'Tab': closeMenu(false); break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !(showSearch && document.activeElement === searchRef.current)) {
          const now = Date.now();
          const ta = typeahead.current;
          ta.buf = now - ta.t < 700 ? ta.buf + e.key : e.key;
          ta.t = now;
          const hit = visible.findIndex(o => !o.disabled && String(o.label).toLowerCase().startsWith(ta.buf.toLowerCase()));
          if (hit > -1) setActive(hit);
        }
    }
  };

  const triggerClasses = [
    'ds-input', 'ds-input--' + size, 'ds-select',
    open ? 'ds-select--open' : '',
    errorText ? 'ds-input--error' : '',
    disabled ? 'ds-input--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      id={fieldId}
      className={triggerClasses}
      style={{ width }}
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-haspopup="listbox"
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => (open ? closeMenu() : openMenu())}
      onKeyDown={onTriggerKey}
    >
      {icon && <Icon name={icon} size={16} />}
      <span className={'ds-select__value' + (selected ? '' : ' ds-select__value--placeholder')}>
        {selected ? selected.label : placeholder}
      </span>
      <Icon name={open ? 'caret-up' : 'caret-down'} size={12} className="ds-select__caret" />
    </button>
  );

  const popup = mounted && pos && (
    <>
      {open && <div className="ds-select__overlay" onMouseDown={() => closeMenu(false)} />}
      <div
        className="ds-select__popup"
        data-state={state}
        data-side={pos.bottom !== undefined ? 'top' : 'bottom'}
        style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
      >
        {showSearch && (
          <div className="ds-select__search">
            <Icon name="magnifying-glass" size={16} />
            <input
              ref={searchRef}
              value={query}
              placeholder="Cari…"
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onTriggerKey}
            />
          </div>
        )}
        <div
          className="ds-select__list"
          id={listId}
          role="listbox"
          ref={listRef}
          style={{ maxHeight: pos.maxHeight }}
        >
          {visible.map((opt, i) => {
            const isSel = opt.value === value;
            return (
              <div
                key={opt.value}
                data-idx={i}
                role="option"
                aria-selected={isSel}
                aria-disabled={opt.disabled || undefined}
                className={[
                  'ds-select__opt',
                  i === active ? 'ds-select__opt--active' : '',
                  isSel ? 'ds-select__opt--selected' : '',
                  opt.disabled ? 'ds-select__opt--disabled' : '',
                ].filter(Boolean).join(' ')}
                onMouseEnter={() => !opt.disabled && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(opt)}
              >
                {opt.icon && <Icon name={opt.icon} size={16} />}
                <span className="ds-select__opt-label">{opt.label}</span>
                {isSel && <Icon name="check" size={14} className="ds-select__opt-check" />}
              </div>
            );
          })}
          {!visible.length && <div className="ds-select__empty">Tidak ada hasil</div>}
        </div>
      </div>
    </>
  );

  return (
    <span className="ds-field" style={{ width }}>
      {label && <span className="ds-field__label">{label}</span>}
      {trigger}
      {popup}
      {(errorText || helperText) && (
        <span className={'ds-field__hint ' + (errorText ? 'ds-field__hint--error' : '')}>
          {errorText && <Icon name="warning-circle" size={12} />}
          <span>{errorText || helperText}</span>
        </span>
      )}
    </span>
  );
}
