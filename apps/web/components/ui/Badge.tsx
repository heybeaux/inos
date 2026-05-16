'use client';

interface BadgeProps {
  label: string;
  color?: string;
}

export function Badge({ label, color = 'var(--bio-cyan)' }: BadgeProps) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs rounded-full font-medium"
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  );
}
