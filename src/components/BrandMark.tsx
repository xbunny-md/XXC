import { useState } from 'react';
import { Shield } from 'lucide-react';
import { BRAND } from '../types/luga';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtext?: boolean;
}

const ENHANCED_LOGO_SRC = BRAND.officialLogoUrl;
const BACKUP_LOGO_SRC = BRAND.backupLogoUrl;

export function BrandMark({ size = 'md', showSubtext = false }: BrandMarkProps) {
  const [srcStage, setSrcStage] = useState<'enhanced' | 'backup' | 'fallback'>('enhanced');

  const boxSize =
    size === 'sm'
      ? 'h-8 w-8 rounded-lg'
      : size === 'lg'
        ? 'h-12 w-12 rounded-xl'
        : 'h-9 w-9 rounded-lg';

  const titleClass =
    size === 'sm'
      ? 'text-base font-bold tracking-tight'
      : size === 'lg'
        ? 'text-2xl font-extrabold tracking-tight'
        : 'text-lg font-bold tracking-tight';

  const handleImageError = () => {
    setSrcStage((prev) => (prev === 'enhanced' ? 'backup' : 'fallback'));
  };

  return (
    <div className="flex items-center gap-3 shrink-0">
      <div
        className={`${boxSize} overflow-hidden bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 p-0.5`}
      >
        {srcStage !== 'fallback' ? (
          <img
            src={srcStage === 'enhanced' ? ENHANCED_LOGO_SRC : BACKUP_LOGO_SRC}
            alt="Mwanalugali Secondary School Official Logo"
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className="h-full w-full object-contain"
          />
        ) : (
          <Shield className="h-5 w-5 text-emerald-800" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <span
          className={`font-display block leading-none text-slate-900 dark:text-slate-50 whitespace-nowrap ${titleClass}`}
        >
          {BRAND.platformName}
        </span>
        {showSubtext && (
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400 truncate">
            {BRAND.schoolShortName}
          </span>
        )}
      </div>
    </div>
  );
}
