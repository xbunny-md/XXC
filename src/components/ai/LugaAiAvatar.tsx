import { BadgeCheck } from 'lucide-react';

interface LugaAiAvatarProps {
  size?: 'xs' | 'sm' | 'md';
  showBadge?: boolean;
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-10 w-10 text-xs',
  md: 'h-11 w-11 text-xs',
};

/**
 * Temporary neutral placeholder avatar for LUGA AI until a custom image is supplied.
 */
export function LugaAiAvatar({ size = 'sm', showBadge = true }: LugaAiAvatarProps) {
  return (
    <div className="relative inline-flex shrink-0">
      <div
        aria-label="LUGA AI avatar placeholder"
        className={`${SIZE_CLASSES[size]} rounded-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-display font-bold flex items-center justify-center select-none`}
      >
        AI
      </div>
      {showBadge && (
        <span
          title="Verified AI"
          className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center"
        >
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </span>
      )}
    </div>
  );
}
