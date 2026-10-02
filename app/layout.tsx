import type { Metadata } from 'next';
import './globals.css';
import AgeGate from '@/components/AgeGate';

export const metadata: Metadata = {
  title: 'MOTIONA — AI Character & Animation Studio',
  description: 'MOTIONA is a local-first AI character and animation studio for creating characters, scenes, voice-driven direction and ComfyUI workflows. 18+ only.',
  applicationName: 'MOTIONA',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="icon" href="/icon.svg" type="image/svg+xml"/><link rel="apple-touch-icon" href="/icon.svg"/></head><body><AgeGate>{children}</AgeGate></body></html>;
}
