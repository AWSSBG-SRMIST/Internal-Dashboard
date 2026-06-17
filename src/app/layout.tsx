import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'Internal Dashboard | @AWSSBG-at-SRMIST',
  description: 'Internal operations dashboard for AWS Student Builder Group at SRMIST',
  icons: { icon: '/logo.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-right" richColors />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
