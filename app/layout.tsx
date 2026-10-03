import type { Metadata } from 'next';
import './globals.css';
import AgeGate from '@/components/AgeGate';

export const metadata: Metadata = {
  title: 'MOTIONA Studio — AI Character & Animation Workspace',
  description:
    'MOTIONA Studio is a local-first AI character and animation workspace: design consistent characters, direct storyboarded shots with locked seeds, and render animation through your own ComfyUI installation. Outputs stay on your machine. 18+ creative workspace.',
  applicationName: 'MOTIONA Studio',
  openGraph: {
    title: 'MOTIONA Studio',
    description:
      'Local-first AI character and animation workspace. Consistent characters, storyboarded shots, and ComfyUI-powered rendering — private by design.',
    siteName: 'MOTIONA Studio',
    type: 'website',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' }],
    apple: ['/icons/apple-touch-icon.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="icon" href="/icon.svg" type="image/svg+xml"/><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/><link rel="manifest" href="/manifest.webmanifest"/></head><body><AgeGate>{children}</AgeGate></body></html>;
}
