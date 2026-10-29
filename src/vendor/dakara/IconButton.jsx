"use client";

/**
 * IconButton — square or pill button with a single icon.
 *
 * @prop {string}              icon       Lucide icon name (required)
 * @prop {'xs'|'sm'|'md'|'lg'} size       default 'md'
 * @prop {'pill'|'square'}     shape      default 'pill' (matches Figma p-2 rounded-full)
 * @prop {boolean}             flat       no background/border by default
 * @prop {boolean}             disabled
 * @prop {string}              label      accessible label; shown in the DS Tooltip (never the native title tooltip, §35)
 * @prop {boolean}             tooltip    show the DS Tooltip with the label, default true (false when an outer Tooltip is used)
 * @prop {function}            onClick
 */
import { Icon } from './Icon.jsx';
import { Tooltip } from './Tooltip.jsx';

export function IconButton({
  icon,
  size = 'md',
  shape = 'pill',
  flat = false,
  disabled = false,
  label,
  tooltip = true,
  onClick,
  className = '',
}) {
  const IB_ICON_SIZE = { xs: 12, sm: 13, md: 15, lg: 17 };
  const classes = [
    'ds-iconbtn',
    'ds-iconbtn--' + size,
    shape === 'square' ? 'ds-iconbtn--square' : '',
    flat ? 'ds-iconbtn--flat' : '',
    className,
  ].filter(Boolean).join(' ');

  const btn = (
    <button
      type="button"
      className={classes}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      <Icon name={icon} size={IB_ICON_SIZE[size] || 15} />
    </button>
  );
  return label && tooltip && !disabled ? <Tooltip label={label}>{btn}</Tooltip> : btn;
}
