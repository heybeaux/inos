'use client';

import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{
        background: 'var(--surface-glass)',
        border: '1px solid var(--surface-glass-border)',
        backdropFilter: 'blur(12px)',
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
