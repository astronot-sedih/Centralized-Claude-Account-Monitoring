"use client";

/**
 * Tabs — segmented control or underlined tab bar.
 *
 * @prop {Array<{value:string,label:string,icon?:string}>} items
 * @prop {string}   value
 * @prop {function} onChange                       (nextValue) => void
 * @prop {'segment'|'underline'} variant           default 'segment'
 */
import { Icon } from './Icon.jsx';

export function Tabs({ items = [], value, onChange, variant = 'segment', className = '' }) {
  const classes = [
    'ds-tabs',
    variant === 'underline' ? 'ds-tabs--underline' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <div className={classes} role="tablist">
      {items.map(item => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={'ds-tabs__item' + (item.value === value ? ' ds-tabs__item--active' : '')}
          onClick={() => onChange && onChange(item.value)}
        >
          {item.icon && <Icon name={item.icon} size={12} style={{ marginRight: 6, verticalAlign: '-2px' }} />}
          {item.label}
        </button>
      ))}
    </div>
  );
}
