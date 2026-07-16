import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import Room from './Room';

function generatePeerId() {
  return 'peer-' + Math.random().toString(36).substr(2, 6);
}

export default function App() {
  const [view, setView] = useState('home');
  const [roomId, setRoomId] = useState('');
  const [peerId, setPeerId] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setPeerId(generatePeerId()); }, []);

  const createRoom = () => {
    setIsCreating(true);
    setError('');
    socket.emit('create-room');
    socket.once('room-created', ({ roomId }) => {
      setRoomId(roomId);
      setView('room');
      socket.emit('join-room', { roomId, peerId });
      setIsCreating(false);
    });
  };

  const joinRoom = (code) => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }
    setRoomId(trimmed);
    setView('room');
    socket.emit('join-room', { roomId: trimmed, peerId });
    socket.once('error', (err) => {
      setError(err.message);
      setView('home');
    });
  };

  const leaveRoom = () => {
    setView('home');
    setRoomId('');
    window.location.reload();
  };

  if (view === 'home') {
    return (
      <div style={s.wrapper}>
        <div style={s.bgMesh} />
        <div style={s.bgNoise} />
        <div style={s.grid} />
        
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');
          @keyframes pulseGlow { 0%{transform:scale(1); opacity:0.4} 50%{transform:scale(1.1); opacity:0.2} 100%{transform:scale(1); opacity:0.4} }
          @keyframes float { 0%{transform:translateY(0)} 50%{transform:translateY(-4px)} 100%{transform:translateY(0)} }
        `}</style>

        <div style={s.card}>
          {/* Top Orb */}
          <div style={s.orbWrap}>
            <div style={s.orbGlow} />
            <div style={s.orb}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </div>
          </div>

          <h1 style={s.title}>P2P Chat & File Share</h1>
          <p style={s.subtitle}>Secure, direct peer-to-peer. No servers store your data. Encrypted, ephemeral, fast.</p>

          <div style={s.divider} />

          <button onClick={createRoom} style={{...s.primaryBtn, opacity: isCreating? 0.7 : 1}} disabled={isCreating}>
            <span style={s.btnIcon}>⊕</span>
            {isCreating ? 'Creating secure room…' : 'Create New Room'}
          </button>

          <div style={s.orRow}>
            <span style={s.orLine} />
            <span style={s.orText}>or join existing</span>
            <span style={s.orLine} />
          </div>

          <div style={s.joinRow}>
            <div style={s.inputWrap}>
              <input
                ref={inputRef}
                type="text"
                placeholder="ABCDEF"
                maxLength={6}
                onChange={(e) => { setRoomId(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom(roomId)}
                style={{...s.joinInput, borderColor: error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}}
                value={roomId}
              />
              <span style={s.inputLabel}>ROOM CODE</span>
            </div>
            <button onClick={() => joinRoom(roomId)} style={s.secondaryBtn}>
              Join
            </button>
          </div>

          {error && <div style={s.errorBox}><span>⚠</span> {error}</div>}

          <div style={s.features}>
            <div style={s.featPill}><div style={s.featDotGreen}/> Encrypted</div>
            <div style={s.featPill}>◩ File sharing</div>
            <div style={s.featPill}>⚡ P2P direct</div>
          </div>

          <div style={s.footerHint}>P2P • Encrypted • No logs • Open source</div>
        </div>
      </div>
    );
  }

  return <Room roomId={roomId} peerId={peerId} onLeave={leaveRoom} />;
}

const s = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#070708',
    padding: '20px',
    position: 'relative',
    overflow: 'hidden',
    isolation: 'isolate',
    fontFamily: 'Inter, sans-serif'
  },
  bgMesh: {
    position: 'absolute', inset: 0, zIndex: -3,
    background: `radial-gradient(1100px 600px at 20% -10%, rgba(110,106,248,0.18), transparent), radial-gradient(900px 500px at 80% 10%, rgba(139,92,246,0.14), transparent), radial-gradient(800px 600px at 50% 120%, rgba(59,130,246,0.08), transparent)`
  },
  bgNoise: {
    position: 'absolute', inset: 0, zIndex: -2, opacity: 0.025,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
  },
  grid: {
    position: 'absolute', inset: 0, zIndex: -1, opacity: 0.03,
    backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
    backgroundSize: '32px 32px'
  },
  card: {
    position: 'relative',
    maxWidth: '440px',
    width: '100%',
    padding: '36px 32px 28px',
    background: 'rgba(18,18,22,0.85)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    borderRadius: '28px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 1px 0 rgba(255,255,255,0.06) inset',
    textAlign: 'center',
  },
  orbWrap: { position: 'relative', width: 56, height: 56, margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  orbGlow: { position: 'absolute', inset: -8, borderRadius: 24, background: 'rgba(110,106,248,0.3)', filter: 'blur(12px)', animation: 'pulseGlow 3s infinite' },
  orb: { position: 'relative', width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(135deg, #6E6AF8 0%, #8B5CF6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(110,106,248,0.35), 0 1px 0 rgba(255,255,255,0.2) inset', animation: 'float 4s ease-in-out infinite' },
  title: { fontSize: '26px', fontWeight: 700, color: '#FAFAFA', letterSpacing: '-0.03em', margin: '0 0 8px', lineHeight: 1.2 },
  subtitle: { fontSize: '14.5px', color: '#9F9FA9', lineHeight: 1.6, maxWidth: '320px', margin: '0 auto 28px', fontWeight: 400 },
  divider: { height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)', marginBottom: '24px' },
  primaryBtn: { width: '100%', padding: '14px 0', background: 'linear-gradient(135deg, #6E6AF8 0%, #8B5CF6 100%)', color: '#FFF', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '14px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 20px rgba(110,106,248,0.3), 0 1px 0 rgba(255,255,255,0.2) inset', transition: 'all 0.2s' },
  btnIcon: { fontSize: '16px' },
  orRow: { display: 'flex', alignItems: 'center', gap: '14px', margin: '22px 0' },
  orLine: { flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' },
  orText: { fontSize: '11px', color: '#52525B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Geist Mono, monospace' },
  joinRow: { display: 'flex', gap: '10px', alignItems: 'flex-start' },
  inputWrap: { flex: 1, position: 'relative' },
  joinInput: { width: '100%', padding: '13px 14px 13px 14px', background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#FAFAFA', fontSize: '15px', fontWeight: 600, outline: 'none', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'Geist Mono, monospace', boxSizing: 'border-box', transition: 'all 0.2s' },
  inputLabel: { position: 'absolute', top: -7, left: 12, fontSize: '9px', letterSpacing: '0.08em', background: '#1E1E26', padding: '0 6px', color: '#71717A', fontFamily: 'Geist Mono, monospace', fontWeight: 600, borderRadius: 4 },
  secondaryBtn: { padding: '13px 22px', background: 'rgba(255,255,255,0.06)', color: '#FAFAFA', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  errorBox: { marginTop: '12px', padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '10px', color: '#FCA5A5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' },
  features: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '26px', flexWrap: 'wrap' },
  featPill: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 999, fontSize: '12px', color: '#A1A1AA', fontWeight: 500 },
  featDotGreen: { width: 6, height: 6, borderRadius: 99, background: '#22C55E', boxShadow: '0 0 8px rgba(34,197,94,0.4)' },
  footerHint: { marginTop: '22px', fontFamily: 'Geist Mono, monospace', fontSize: '10px', letterSpacing: '0.08em', color: '#3F3F46' }
};