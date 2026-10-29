"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * ErrorState — block-level error / empty state for content regions.
 *
 * Centered icon + title + description + optional actions. Use it when a
 * panel, table, or page region has no content to show — a failed fetch,
 * an empty list, an offline socket, a 404. (For inline field errors use
 * TextField's `errorText` instead.)
 *
 * @prop {'error'|'warning'|'empty'|'offline'|'not-found'} variant  default 'error' — sets default icon + tone
 * @prop {string}   title         headline (falls back to a per-variant default)
 * @prop {string}   description   supporting copy
 * @prop {string}   icon          Lucide name override (kebab-case)
 * @prop {string}   code          optional monospace detail line (error code, request id)
 * @prop {'sm'|'md'} size         default 'md'
 * @prop {'none'|'bordered'|'card'} surface  default 'none' — wrap in dashed/solid container
 * @prop {{label,icon,onClick}} primaryAction    renders a primary Button
 * @prop {{label,icon,onClick}} secondaryAction  renders a secondary Button
 * @prop {ReactNode} children     custom action area (overrides the action props)
 */
import { Icon } from './Icon.jsx';
import { Button } from './Button.jsx';

const ERROR_STATE_PRESETS = {
  'error':     { tone: 'error',   icon: 'circle-alert',   title: 'Something went wrong',
                 description: 'We couldn’t load this content. Try again, and if it keeps happening, contact support.' },
  'warning':   { tone: 'warning', icon: 'triangle-alert', title: 'Action needs attention',
                 description: 'This view loaded with warnings. Review the details before continuing.' },
  'empty':     { tone: 'neutral', icon: 'inbox',          title: 'Nothing here yet',
                 description: 'When there’s data to show, it’ll appear in this space.' },
  'offline':   { tone: 'offline', icon: 'cloud-off',      title: 'You’re offline',
                 description: 'Check your connection — we’ll reconnect and sync automatically.' },
  'not-found': { tone: 'neutral', icon: 'search-x',       title: 'No results found',
                 description: 'Try adjusting your filters or search terms.' },
};

export function ErrorState({
  variant = 'error',
  title,
  description,
  icon,
  code,
  size = 'md',
  surface = 'none',
  primaryAction,
  secondaryAction,
  children,
  className = '',
}) {
  const preset = ERROR_STATE_PRESETS[variant] || ERROR_STATE_PRESETS.error;
  const toneClass = preset.tone === 'neutral' ? '' : `ds-state--${preset.tone}`;
  const classes = [
    'ds-state',
    toneClass,
    size === 'sm' ? 'ds-state--sm' : '',
    surface === 'bordered' ? 'ds-state--bordered' : '',
    surface === 'card' ? 'ds-state--card' : '',
    className,
  ].filter(Boolean).join(' ');

  const iconSize = size === 'sm' ? 20 : 26;

  const hasActionProps = primaryAction || secondaryAction;

  return (
    <div className={classes} role={preset.tone === 'error' ? 'alert' : 'status'}>
      <div className="ds-state__icon">
        <Icon name={icon || preset.icon} size={iconSize} strokeWidth={1.75} />
      </div>
      <div className="ds-state__title">{title || preset.title}</div>
      {(description || preset.description) && (
        <p className="ds-state__desc">{description || preset.description}</p>
      )}
      {code && <div className="ds-state__code">{code}</div>}

      {children ? (
        <div className="ds-state__actions">{children}</div>
      ) : hasActionProps ? (
        <div className="ds-state__actions">
          {primaryAction && (
            <Button
              variant="primary"
              size={size === 'sm' ? 'sm' : 'md'}
              icon={primaryAction.icon}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="secondary"
              size={size === 'sm' ? 'sm' : 'md'}
              icon={secondaryAction.icon}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
