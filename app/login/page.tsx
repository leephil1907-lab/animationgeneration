'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import AuthShell from '@/components/AuthShell';

export default function LoginPage(){
  const [show,setShow]=useState(false);
  const [status,setStatus]=useState('');
  function submit(e:FormEvent){e.preventDefault();setStatus('Account authentication is ready for your backend provider.');}
  return <AuthShell mode="login">
    <form className="authForm" onSubmit={submit}>
      <label>Email address<input type="email" required autoComplete="email" placeholder="you@example.com"/></label>
      <label>Password<div className="passwordField"><input type={show?'text':'password'} required minLength={8} autoComplete="current-password" placeholder="••••••••"/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
      <div className="authMeta"><label className="check"><input type="checkbox"/> Remember me</label><button type="button" className="authLink">Forgot password?</button></div>
      <button className="authSubmit" type="submit"><LogIn size={17}/> Sign in</button>
      {status&&<p className="authStatus">{status}</p>}
    </form>
    <div className="authSwitch">New here? <Link href="/signup">Create an account</Link></div>
  </AuthShell>;
}