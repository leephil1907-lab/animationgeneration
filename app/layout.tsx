import type { Metadata } from 'next';
import './globals.css';
import AgeGate from '@/components/AgeGate';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'MOTIONA Studio — AI Character & Animation Workspace',
  description:
    'MOTIONA is a creative workspace for developing characters, shaping storyboards and directing AI-assisted animation with a connected creative workflow.',
  applicationName: 'MOTIONA Studio',
  openGraph: {
    title: 'MOTIONA Studio',
    description:
      'Shape the idea, build the keyframe and direct the motion in one connected creative workspace.',
    siteName: 'MOTIONA Studio',
    type: 'website',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#101310" />
      </head>
      <body>
        <AgeGate>{children}</AgeGate>
        <ThemeToggle />
      </body>
    </html>
  );
}
