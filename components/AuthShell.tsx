'use client';

import Link from 'next/link';
import { Sparkles, ArrowLeft, ShieldCheck } from 'lucide-react';
import { ReactNode } from 'react';
import BrandMark from '@/components/BrandMark';

export default function AuthShell({mode,children}:{mode:'login'|'signup';children:ReactNode}){
  return <main className="authPage">
    <div className="authGlow authGlowOne"/><div className="authGlow authGlowTwo"/>
    <Link href="/" className="authBack"><ArrowLeft size={15}/> Back to studio</Link>
    <section className="authLayout">
      <div className="authBrand">
        <div className="authMark"><BrandMark size={44}/></div>
        <p className="eyebrow">MOTIONA STUDIO</p>
        <h1>{mode==='login'?'Welcome back.':'Build your creative workspace.'}</h1>
        <p>Keep your characters, generation settings and creative sessions organized in one private studio.</p>
        <div className="authFeature"><ShieldCheck size={17}/><span>Your account layer is designed to sit in front of the studio without changing the local-first generation flow.</span></div>
      </div>
      <div className="authCard">
        <div className="authCardHead">
          <span>{mode==='login'?'SIGN IN':'CREATE ACCOUNT'}</span>
          <small>{mode==='login'?'Access your studio':'Start your studio workspace'}</small>
        </div>
        {children}
      </div>
    </section>
    <p className="authFooter">MOTIONA Studio · 18+ · Creative AI workspace</p>
  </main>;
}