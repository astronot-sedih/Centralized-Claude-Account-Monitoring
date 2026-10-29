"use client";

/**
 * Avatar — circular user image with fallback initials.
 *
 * @prop {string}                name        used for initials
 * @prop {string}                src         optional image url
 * @prop {'xs'|'sm'|'md'|'lg'|'xl'} size    default 'md'
 * @prop {'success'|'warning'|'danger'|'info'|'accent'|null} status   tiny dot in bottom-right
 */
/* Initials sit on accent-soft (spec § Avatar). Sizes: 24 inline · 30 topbar · 38 row · 64 profile. */
function avatarInitials(name) { return (name || '?').split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase(); }

export function Avatar({ name = '?', src, size = 'md', status, className = '' }) {
  return (
    <span className={'ds-avatar ds-avatar--' + size + ' ' + className}>
      {src ? <img src={src} alt={name} /> : avatarInitials(name)}
      {status && <span className="ds-avatar__status" style={{ background: 'var(--' + status + ')' }} />}
    </span>
  );
}
/**
 * AvatarGroup — overlapping stack of avatars with optional overflow count.
 *
 * @prop {string[]} names
 * @prop {number}   max          max avatars to show before "+N"; default 4
 * @prop {'xs'|'sm'|'md'|'lg'|'xl'} size   default 'sm'
 */
export function AvatarGroup({ names = [], max = 4, size = 'sm', className = '' }) {
  const visible = names.slice(0, max);
  const overflow = names.length - visible.length;
  return (
    <span className={'ds-avatar-group ' + className}>
      {visible.map((n, i) => <Avatar key={i} name={n} size={size} />)}
      {overflow > 0 && (
        <span className={'ds-avatar ds-avatar--' + size + ' ds-avatar-group__more'}>+{overflow}</span>
      )}
    </span>
  );
}
