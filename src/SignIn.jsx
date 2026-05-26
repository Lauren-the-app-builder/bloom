import { useState } from 'react';
import { supabase } from './lib/supabase';

const c = {
  cream: '#FDF9F9',
  charcoal: '#5A5266',
  muted: '#9A92A6',
  rose: '#C8B4E8',
  rosedeep: '#C97AAE',
  blush: '#F4B8D4',
  line: '#F0E8EE',
  white: '#FFFFFF',
};

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('email'); // email | code
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const sendLink = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setErrMsg('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setStage('code');
    } catch (err) {
      setErrMsg(err?.message || 'Could not send link.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setErrMsg('');
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      // onAuthStateChange in App.jsx will pick this up.
    } catch (err) {
      setErrMsg(err?.message || 'Invalid or expired code.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: 14, borderRadius: 14,
    border: `1px solid ${c.line}`, background: c.white, fontSize: 16,
    outline: 'none', color: c.charcoal, marginBottom: 12,
  };
  const buttonStyle = (disabled) => ({
    width: '100%', background: c.charcoal, color: 'white', border: 'none',
    padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
  });

  return (
    <div style={{ minHeight: '100vh', background: c.cream, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif", color: c.charcoal }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: 40, margin: 0, fontWeight: 800, letterSpacing: -0.8, background: `linear-gradient(90deg, ${c.rosedeep}, ${c.rose})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textAlign: 'center' }}>Bloom</h1>
        <p style={{ fontSize: 14, color: c.muted, textAlign: 'center', margin: '6px 0 28px' }}>
          {stage === 'email' ? 'Sign in with a magic link' : 'Enter the code from your email'}
        </p>

        {stage === 'email' ? (
          <form onSubmit={sendLink}>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
            <button type="submit" disabled={busy} style={buttonStyle(busy)}>
              {busy ? 'Sending…' : 'Send sign-in email'}
            </button>
          </form>
        ) : (
          <>
            <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <p style={{ fontSize: 13, margin: 0, color: c.charcoal, lineHeight: 1.5 }}>
                Check <strong>{email}</strong>. The email contains a link <em>and</em> a 6-digit code.
              </p>
              <p style={{ fontSize: 12, margin: '8px 0 0', color: c.muted, lineHeight: 1.5 }}>
                If the link doesn't open the app, paste the code below instead.
              </p>
            </div>

            <form onSubmit={verifyCode}>
              <input
                type="text"
                required
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                style={{ ...inputStyle, fontSize: 24, textAlign: 'center', letterSpacing: 6, fontVariantNumeric: 'tabular-nums' }}
              />
              <button type="submit" disabled={busy || code.length < 6} style={buttonStyle(busy || code.length < 6)}>
                {busy ? 'Verifying…' : 'Verify code'}
              </button>
            </form>

            <button
              onClick={() => { setStage('email'); setCode(''); setErrMsg(''); }}
              style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: c.rosedeep, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Use a different email
            </button>
          </>
        )}

        {errMsg && (
          <p style={{ fontSize: 12, color: '#c0392b', margin: '14px 0 0', textAlign: 'center' }}>{errMsg}</p>
        )}
      </div>
    </div>
  );
}
