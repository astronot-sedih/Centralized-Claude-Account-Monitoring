"use client";

/**
 * Icon — renders a Phosphor icon by name.
 *
 * The canonical icon set for the ExtDS system (https://phosphoricons.com).
 * Renders the Phosphor web font as <i class="ph ph-name">. A Lucide→Phosphor
 * alias map keeps historical kebab-case names (search, trash-2, chevron-down…)
 * working unchanged; pass a native Phosphor name and it's used as-is.
 *
 * @prop {string} name    Lucide-style alias ("search", "trash-2") OR a native
 *                        Phosphor name ("magnifying-glass"). kebab-case.
 * @prop {number} size    pixel size, default 16
 * @prop {'thin'|'light'|'regular'|'bold'|'fill'|'duotone'} weight  default 'regular'
 */

/* Phosphor Regular + Fill font faces ship inside components/bundle.css (no CDN). */

/* Lucide / Feather kebab names → Phosphor names. Anything not listed
   is passed straight through (assumed to already be a Phosphor name).
   Module-internal — not part of the public component surface. */
const PHOSPHOR_ALIAS = {
  // navigation / chevrons
  'chevron-down': 'caret-down', 'chevron-up': 'caret-up',
  'chevron-left': 'caret-left', 'chevron-right': 'caret-right',
  'chevrons-up-down': 'caret-up-down', 'arrow-right': 'arrow-right',
  'arrow-left': 'arrow-left', 'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down',
  'external-link': 'arrow-square-out', 'link-2': 'link', 'link': 'link',
  'more-horizontal': 'dots-three', 'more-vertical': 'dots-three-vertical',
  'menu': 'list', 'grid': 'squares-four', 'grid-3x3': 'squares-four',
  'layout-grid': 'squares-four', 'list': 'list',
  // actions
  'plus': 'plus', 'plus-circle': 'plus-circle', 'minus': 'minus',
  'minus-circle': 'minus-circle', 'x': 'x', 'check': 'check',
  'check-circle': 'check-circle', 'trash': 'trash', 'trash-2': 'trash',
  'edit': 'pencil-simple', 'edit-2': 'pencil-simple', 'edit-3': 'pencil-simple',
  'copy': 'copy', 'save': 'floppy-disk', 'download': 'download-simple',
  'upload': 'upload-simple', 'share': 'share-network', 'share-2': 'share-network',
  'refresh-cw': 'arrow-clockwise', 'refresh-ccw': 'arrow-counter-clockwise',
  'rotate-ccw': 'arrow-counter-clockwise', 'rotate-cw': 'arrow-clockwise',
  'filter': 'funnel', 'filter-x': 'funnel-x', 'sliders': 'sliders-horizontal',
  'send': 'paper-plane-tilt', 'command': 'command', 'code': 'code',
  'maximize': 'arrows-out', 'minimize': 'arrows-in', 'search': 'magnifying-glass',
  'search-x': 'magnifying-glass-minus', 'hash': 'hash',
  // status / alerts
  'info': 'info', 'help-circle': 'question', 'alert-circle': 'warning-circle',
  'circle-alert': 'warning-circle', 'alert-triangle': 'warning',
  'triangle-alert': 'warning', 'alert-octagon': 'warning-octagon',
  'x-circle': 'x-circle', 'x-octagon': 'x-circle', 'check-circle-2': 'check-circle',
  'loader': 'spinner', 'sparkles': 'sparkle', 'zap': 'lightning',
  'zap-off': 'lightning-slash', 'gauge': 'gauge', 'life-buoy': 'lifebuoy',
  // objects
  'user': 'user', 'users': 'users', 'bell': 'bell', 'bell-off': 'bell-slash',
  'mail': 'envelope-simple', 'lock': 'lock-simple', 'unlock': 'lock-simple-open',
  'key': 'key', 'shield': 'shield', 'eye': 'eye', 'eye-off': 'eye-slash',
  'heart': 'heart', 'star': 'star', 'star-half': 'star-half',
  'bookmark': 'bookmark-simple', 'flag': 'flag', 'tag': 'tag',
  'settings': 'gear-six', 'sliders-h': 'sliders-horizontal',
  'home': 'house', 'globe': 'globe-simple', 'compass': 'compass',
  'map-pin': 'map-pin', 'navigation': 'navigation-arrow',
  'calendar': 'calendar-blank', 'clock': 'clock',
  'file': 'file', 'file-text': 'file-text', 'folder': 'folder',
  'folder-open': 'folder-open', 'inbox': 'tray', 'archive': 'archive',
  'package': 'package', 'layers': 'stack', 'palette': 'palette',
  'image': 'image', 'camera': 'camera', 'video': 'video-camera',
  'mic': 'microphone', 'phone': 'phone', 'message-square': 'chat-circle',
  'paperclip': 'paperclip', 'printer': 'printer', 'gift': 'gift',
  'dollar-sign': 'currency-dollar', 'credit-card': 'credit-card',
  'shopping-cart': 'shopping-cart', 'thumbs-up': 'thumbs-up',
  'thumbs-down': 'thumbs-down', 'log-out': 'sign-out', 'log-in': 'sign-in',
  // connectivity / weather
  'cloud': 'cloud', 'cloud-off': 'cloud-slash', 'wifi': 'wifi-high',
  'wifi-off': 'wifi-slash', 'sun': 'sun', 'moon': 'moon',
  // brand logos
  'github': 'github-logo', 'figma': 'figma-logo', 'twitter': 'twitter-logo',
  'bookmark-simple': 'bookmark-simple',
};

function phosphorName(name) {
  if (!name) return '';
  return PHOSPHOR_ALIAS[name] || name;
}

const PH_WEIGHT_CLASS = {
  // Design system ships Phosphor Regular + Fill only; other weights fall back to Regular.
  thin: 'ph', light: 'ph', regular: 'ph', bold: 'ph', fill: 'ph-fill', duotone: 'ph',
};

export function Icon({ name, size = 16, weight = 'regular', className = '', style }) {
  const ph = phosphorName(name);
  const weightClass = PH_WEIGHT_CLASS[weight] || 'ph';
  return (
    <i
      className={('ds-icon ' + weightClass + ' ph-' + ph + ' ' + className).trim()}
      style={{
        fontSize: size, width: size, height: size, lineHeight: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
