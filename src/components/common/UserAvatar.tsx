interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  rounded?: 'full' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'h-7 w-7 text-xs',
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

export function UserAvatar({
  name,
  avatarUrl,
  size = 'md',
  online = false,
  rounded = 'full',
  className = '',
}: UserAvatarProps) {
  const initial = (name || 'L').trim().charAt(0).toUpperCase();
  const radiusClass = rounded === 'lg' ? 'rounded-xl' : 'rounded-full';

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className={`${SIZE_CLASSES[size]} ${radiusClass} object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800`}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`${SIZE_CLASSES[size]} ${radiusClass} bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 font-display font-bold flex items-center justify-center border border-emerald-200/80 dark:border-emerald-900/60`}
        >
          {initial}
        </div>
      )}
      {online && (
        <span
          title="Online"
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
        />
      )}
    </div>
  );
}
