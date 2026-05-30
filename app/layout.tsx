import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LVPT Event Command Center 2026',
  description: 'Las Vegas Poker Training 2026 event tracking, quote builder, staffing, compliance, payments, and partner reporting dashboard.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
