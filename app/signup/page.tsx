'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import AuthShell from '@/components/AuthShell';

export default function SignupPage(){
  const [show,setShow]=useState(false);
  const [status,setStatus]=useState('');
  function submit(e:FormEvent){e.preventDefault();setStatus('Your account form is ready to connect to the authentication service.');}
  return <AuthShell mode="signup">
    <form className="authForm" onSubmit={submit}>
      <label>Display name<input required autoComplete="name" placeholder="Your name"/></label>
      <label>Email address<input type="email" required autoComplete="email" placeholder="you@example.com"/></label>
      <label>Password<div className="passwordField"><input type={show?'text':'password'} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters"/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
      <label className="check terms"><input type="checkbox" required/> <span>I confirm I am 18 or older and agree to the studio terms.</span></label>
      <button className="authSubmit" type="submit"><UserPlus size={17}/> Create account</button>
      {status&&<p className="authStatus">{status}</p>}
    </form>
    <div className="authSwitch">Already have an account? <Link href="/login">Sign in</Link></div>
  </AuthShell>;
}