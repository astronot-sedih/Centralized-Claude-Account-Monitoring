"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * TreeView — hierarki dengan semantik ARIA tree (DESIGN-SYSTEM.md §40.1, v1.18; WAI-ARIA APG Tree View).
 *
 * Keyboard: ↑/↓ pindah node · → buka / ke anak pertama · ← tutup / ke induk · Home/End · Enter/Space pilih ·
 * huruf = lompat ke label berawalan huruf itu · * buka semua saudara. Fokus (ring) dibedakan dari pilihan (latar select).
 * Satu tab stop (roving tabindex). Anak dimuat malas: node dengan hasChildren tanpa children memanggil onLoadChildren.
 *
 * @prop {Array}    nodes        [{ id, label, icon?, count?, children?, hasChildren?, loading?, error?, disabled? }]
 * @prop {string}   selected     id terpilih (terkontrol) ; atau defaultSelected
 * @prop {string[]} expanded     id terbuka (terkontrol) ; atau defaultExpanded
 * @prop {function} onSelect     (id, node) => void
 * @prop {function} onExpandedChange (ids) => void
 * @prop {function} onLoadChildren (node) => void   dipanggil sekali saat node malas dibuka
 * @prop {string}   label        nama aksesibel pohon (wajib)
 */
import { Icon } from './Icon.jsx';
const { useState, useRef, useMemo, useEffect } = React;

function flatten(nodes, open, level = 1, parent = null, out = []) {
  nodes.forEach((n, i) => {
    out.push({ n, level, parent, pos: i + 1, size: nodes.length });
    const kids = n.children && n.children.length;
    if ((kids || n.hasChildren) && open.has(n.id) && n.children) flatten(n.children, open, level + 1, n.id, out);
  });
  return out;
}

export function TreeView({
  nodes = [], selected, defaultSelected = null, expanded, defaultExpanded = [],
  onSelect, onExpandedChange, onLoadChildren, label, className = '',
}) {
  const [selIn, setSelIn] = useState(defaultSelected);
  const [openIn, setOpenIn] = useState(() => new Set(defaultExpanded));
  const sel = selected !== undefined ? selected : selIn;
  const open = expanded !== undefined ? new Set(expanded) : openIn;
  const rows = useMemo(() => flatten(nodes, open), [nodes, expanded, openIn]);
  const [focusId, setFocusId] = useState(sel || (rows[0] && rows[0].n.id));
  const refs = useRef({});
  const typed = useRef({ s: '', t: 0 });
  const asked = useRef(new Set());

  useEffect(() => { if (!rows.some((r) => r.n.id === focusId) && rows[0]) setFocusId(rows[0].n.id); }, [rows]);

  const setOpen = (next) => { if (expanded === undefined) setOpenIn(next); onExpandedChange && onExpandedChange([...next]); };
  const toggle = (n, force) => {
    const next = new Set(open), isOpen = next.has(n.id), want = force === undefined ? !isOpen : force;
    if (want) { next.add(n.id); if (n.hasChildren && !n.children && onLoadChildren && !asked.current.has(n.id)) { asked.current.add(n.id); onLoadChildren(n); } }
    else next.delete(n.id);
    setOpen(next);
  };
  const choose = (n) => { if (n.disabled) return; if (selected === undefined) setSelIn(n.id); onSelect && onSelect(n.id, n); };
  const focus = (id) => { setFocusId(id); requestAnimationFrame(() => refs.current[id] && refs.current[id].focus()); };
  const hasKids = (n) => !!((n.children && n.children.length) || n.hasChildren);

  const onKey = (e, r, idx) => {
    const n = r.n;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (rows[idx + 1]) focus(rows[idx + 1].n.id); break;
      case 'ArrowUp': e.preventDefault(); if (rows[idx - 1]) focus(rows[idx - 1].n.id); break;
      case 'Home': e.preventDefault(); focus(rows[0].n.id); break;
      case 'End': e.preventDefault(); focus(rows[rows.length - 1].n.id); break;
      case 'ArrowRight': e.preventDefault();
        if (hasKids(n)) { if (!open.has(n.id)) toggle(n, true); else if (rows[idx + 1] && rows[idx + 1].parent === n.id) focus(rows[idx + 1].n.id); }
        break;
      case 'ArrowLeft': e.preventDefault();
        if (hasKids(n) && open.has(n.id)) toggle(n, false); else if (r.parent) focus(r.parent);
        break;
      case 'Enter': case ' ': e.preventDefault(); choose(n); break;
      case '*': { e.preventDefault(); const sibs = rows.filter((x) => x.parent === r.parent && hasKids(x.n)); const next = new Set(open); sibs.forEach((x) => next.add(x.n.id)); setOpen(next); break; }
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const now = Date.now(); typed.current.s = (now - typed.current.t > 600 ? '' : typed.current.s) + e.key.toLowerCase(); typed.current.t = now;
          const order = rows.slice(idx + 1).concat(rows.slice(0, idx + 1));
          const hit = order.find((x) => String(x.n.label).toLowerCase().startsWith(typed.current.s));
          if (hit) focus(hit.n.id);
        }
    }
  };

  return (
    <ul className={('ds-tree ' + className).trim()} role="tree" aria-label={label}>
      {rows.map((r, idx) => {
        const n = r.n, kids = hasKids(n), isOpen = kids && open.has(n.id), isSel = sel === n.id;
        return (
          <li key={n.id} role="treeitem" ref={(el) => (refs.current[n.id] = el)}
            className={'ds-tree__item' + (isSel ? ' is-selected' : '') + (n.disabled ? ' is-disabled' : '')}
            aria-level={r.level} aria-setsize={r.size} aria-posinset={r.pos}
            aria-expanded={kids ? isOpen : undefined} aria-selected={isSel} aria-disabled={n.disabled || undefined}
            aria-busy={n.loading || undefined}
            tabIndex={focusId === n.id ? 0 : -1} style={{ '--lvl': r.level - 1 }}
            onKeyDown={(e) => onKey(e, r, idx)} onFocus={() => setFocusId(n.id)}
            onClick={(e) => { e.stopPropagation(); setFocusId(n.id); choose(n); }}>
            <span className="ds-tree__row">
              {kids
                ? <span className="ds-tree__twisty" aria-hidden="true" onClick={(e) => { e.stopPropagation(); toggle(n); }}><Icon name="caret-right" size={12} /></span>
                : <span className="ds-tree__twisty ds-tree__twisty--leaf" aria-hidden="true" />}
              <span className="ds-tree__icon" aria-hidden="true"><Icon name={n.icon || (kids ? (isOpen ? 'folder-open' : 'folder') : 'file')} size={16} /></span>
              <span className="ds-tree__label">{n.label}</span>
              {n.loading && <span className="ds-loading__spin" aria-hidden="true" />}
              {n.error && <span className="ds-tree__meta ds-tree__meta--error">{n.error}</span>}
              {n.count != null && !n.loading && <span className="ds-tree__meta">{Number(n.count).toLocaleString('id-ID')}</span>}
            </span>
            {n.loading && <span className="ds-sr-only">Memuat isi {n.label}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Path of labels from the root to id (for breadcrumbs). */
export function treePath(nodes, id, trail = []) {
  for (const n of nodes) {
    if (n.id === id) return trail.concat([n]);
    if (n.children) { const p = treePath(n.children, id, trail.concat([n])); if (p) return p; }
  }
  return null;
}
