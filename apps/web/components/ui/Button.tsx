'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

export function Button({ variant = 'primary', children, className = '', style, ...props }: ButtonProps) {
  const base =
    'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]';

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? { background: 'var(--bio-cyan)', color: 'var(--abyss-deepest)' }
      : variant === 'secondary'
      ? { background: 'transparent', color: 'var(--bio-cyan)', border: '1px solid var(--bio-cyan)' }
      : { background: 'transparent', color: 'var(--text-secondary)' };

  const combinedStyle = { ...variantStyle, ...(style as React.CSSProperties) };

  return (
    <button
      className={`${base} ${className}`}
      style={combinedStyle}
      {...props}
    >
      {children}
    </button>
  );
}
