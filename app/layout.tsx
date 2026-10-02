import type { Metadata } from 'next';
import './globals.css';
import AgeGate from '@/components/AgeGate';

export const metadata: Metadata = {
  title: 'Animation Generation Studio',
  description: 'Create consistent AI characters from prompts or reference images, then prepare them for animation workflows. 18+ only.',
  applicationName: 'Animation Generation Studio',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AgeGate>{children}</AgeGate></body></html>;
}
