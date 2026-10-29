/**
 * audit — finds UI that bypasses the design system (DESIGN-SYSTEM.md §35; §37.2 warna logo via opts.brandColors).
 * For developers and design review: run auditDesignSystem() in the console, or set
 * <html data-ds-audit> to outline offenders. Read-only unless { mark: true }.
 */
const DS_FONTS = /Space Grotesk|Outfit|Manrope|Fira Code|Phosphor/i;

const RULES = [
  ['select', 'Select native (popup OS tidak ikut tema, scroll bawaan)', 'Komponen Select'],
  ['input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"]', 'Pemilih tanggal/waktu native', 'TextField + Popover kalender DS'],
  ['input[type="color"]', 'Pemilih warna native', 'Popover dengan swatch token'],
  ['input[type="range"]', 'Slider native', 'Komponen Slider', el => !el.classList.contains('ds-range') && !el.closest('[class*="ds-"]')],
  ['input[type="file"]', 'Input file native', '.ds-file (tombol) / .ds-dropzone', el => !el.closest('.ds-file, .ds-dropzone')],
  ['input[type="checkbox"],input[type="radio"]', 'Checkbox/radio native', 'Checkbox / Radio / Switch', el => !el.closest('[class*="ds-"]')],
  ['progress,meter', 'Progress/meter native', '.ds-progress'],
  ['dialog', 'Dialog native', '.ds-overlay + .ds-modal', el => !el.classList.contains('ds-modal')],
  ['datalist', 'Saran input native', 'Select dengan searchable'],
  ['button[title],a[title],[role="button"][title]', 'Tooltip native (title) di elemen interaktif', 'Tooltip / IconButton / data-ds-tooltip'],
  ['[style*="#"]', 'Warna hex langsung di style', 'var(--token)', el => /#[0-9a-f]{3,8}\b/i.test(el.getAttribute('style') || '')],
];

export function auditDesignSystem(root = document, opts = {}) {
  const { mark = false, fonts = true, brandColors = [], limit = 3000 } = opts;
  const out = [];
  for (const [sel, rule, fix, test] of RULES) {
    root.querySelectorAll(sel).forEach(el => { if (!test || test(el)) out.push({ element: el, rule, fix }); });
  }
  if (fonts && typeof getComputedStyle === 'function') {
    let n = 0;
    const walker = (root.body || root).querySelectorAll('*');
    for (const el of walker) {
      if (++n > limit) break;
      if (!el.childNodes.length || ![...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) continue;
      const ff = getComputedStyle(el).fontFamily;
      if (!DS_FONTS.test(ff)) out.push({ element: el, rule: 'Font di luar DS: ' + ff.split(',')[0], fix: 'var(--font-body) / --font-display / --font-mono' });
    }
  }
  if (brandColors.length && typeof getComputedStyle === 'function') {
    // §37.2: warna logo organisasi (mis. ['#E30613']) hanya boleh di aset logo resmi, bukan warna UI.
    const toRgb = (hex) => { const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; return 'rgb(' + [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)).join(', ') + ')'; };
    const BRAND = brandColors.map((c) => (c.startsWith('#') ? toRgb(c) : c));
    let n = 0;
    for (const el of (root.body || root).querySelectorAll('*')) {
      if (++n > limit) break;
      if (el.closest('.ds-topbar__logo--official, .ds-login__logo, [data-ds-brand-asset]')) continue;
      const cs = getComputedStyle(el);
      if ([cs.color, cs.backgroundColor, cs.borderTopColor, cs.outlineColor, cs.fill, cs.stroke].some((v) => BRAND.some((b) => (v || '').startsWith(b))))
        out.push({ element: el, rule: 'Warna logo organisasi dipakai sebagai warna UI', fix: 'Token netral / tone-* / sev-* (§37.2)' });
    }
  }
  if (mark) {
    document.documentElement.setAttribute('data-ds-audit', '');
    out.forEach(v => v.element.setAttribute('data-ds-violation', v.rule));
  }
  return out;
}

/** Dev only: warns when window.alert/confirm/prompt are used (use .ds-modal / toast instead). Returns an undo fn. */
export function guardNativeDialogs() {
  const orig = {};
  ['alert', 'confirm', 'prompt'].forEach(k => {
    orig[k] = window[k];
    window[k] = function (...a) { console.warn('[Dakara DS] window.' + k + ' dilarang — pakai .ds-modal / toast (§35).'); return orig[k].apply(window, a); };
  });
  return () => Object.assign(window, orig);
}
