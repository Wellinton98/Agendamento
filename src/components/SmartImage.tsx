import { useState } from 'react';
import { Scissors, User } from 'lucide-react';

interface SmartImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackType?: 'avatar' | 'banner';
  initials?: string;
}

export function SmartImage({
  src,
  alt,
  className = '',
  fallbackType = 'avatar',
  initials = '',
}: SmartImageProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    if (fallbackType === 'banner') {
      return (
        <div
          className={`flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-teal-950 text-slate-300 ${className}`}
          role="img"
          aria-label={alt}
        >
          <Scissors className="w-8 h-8 opacity-60" />
        </div>
      );
    }

    return (
      <div
        className={`flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-700 font-semibold ${className}`}
        role="img"
        aria-label={alt}
      >
        {initials ? (
          <span className="text-sm tracking-tight">{initials}</span>
        ) : (
          <User className="w-5 h-5 text-slate-400" />
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
