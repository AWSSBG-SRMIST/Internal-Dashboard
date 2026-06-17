'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Mail, KeyRound, ArrowRight, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function sendOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to send OTP');
        return;
      }
      toast.success('OTP sent to your email!');
      setStep('otp');
      startResendCooldown();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Invalid OTP');
        return;
      }
      toast.success('Signed in successfully!');
      window.location.href = '/dashboard';
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function startResendCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function resendOTP() {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to resend'); return; }
      toast.success('New OTP sent!');
      startResendCooldown();
    } catch {
      toast.error('Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-dvh overflow-y-auto bg-slate-950 flex items-center justify-center p-4 relative">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[28rem] h-[28rem] bg-orange-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[34rem] h-[34rem] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-orange-400/5 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }}
        />
      </div>

      <div className="w-full max-w-md relative animate-fadeIn">
        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-orange-500/10 border border-slate-800 overflow-hidden relative">
          <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-orange-500 via-orange-400 to-blue-500" />

          {/* Header */}
          <div className="p-8 pt-10 text-center border-b border-slate-800/80 relative overflow-hidden">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl" />
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-slate-950 border border-slate-700 mb-4 overflow-hidden shadow-lg shadow-orange-500/10 ring-1 ring-orange-500/20 relative">
              <Image src="/logo.png" alt="AWSSBG" width={56} height={56} className="object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Internal Dashboard</h1>
            <p className="text-orange-400/80 text-xs font-medium tracking-wider uppercase mt-1.5">AWS Student Builder Group · SRMIST</p>
          </div>

          {/* Form */}
          <div className="p-8">
            {step === 'email' ? (
              <form onSubmit={sendOTP} className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">Welcome back</h2>
                  <p className="text-slate-400 text-sm mt-1">Enter your official email to sign in</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Official Email Address</Label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@srmist.edu.in"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-9"
                      autoComplete="email"
                      required
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-slate-500">Use your registered SRM email only</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> Sending OTP...</>
                  ) : (
                    <>Send OTP <ArrowRight size={16} /></>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyOTP} className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">Enter OTP</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    We sent a 6-digit code to <span className="font-medium text-slate-300">{email}</span>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otp">One-Time Password</Label>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="pl-9 text-center text-xl font-mono tracking-widest"
                      autoComplete="one-time-code"
                      required
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-slate-500">OTP expires in 5 minutes</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                  ) : (
                    <>Sign In <ArrowRight size={16} /></>
                  )}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setOtp(''); }}
                    className="text-slate-400 hover:text-slate-300"
                  >
                    ← Change email
                  </button>
                  <button
                    type="button"
                    onClick={resendOTP}
                    disabled={resendCooldown > 0 || loading}
                    className="text-orange-500 hover:text-orange-400 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Internal use only · AWS Student Builder Group · SRMIST
        </p>
      </div>
    </div>
  );
}
