import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inos — Bioluminescent Graph Canvas',
  description: 'Deep-ocean inspired knowledge graph visualization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
