// App.js
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

  useEffect(() => {
    setPeerId(generatePeerId());
  }, []);

  const createRoom = () => {
    setIsCreating(true);
    socket.emit('create-room');
    socket.once('room-created', ({ roomId }) => {
      setRoomId(roomId);
      setView('room');
      socket.emit('join-room', { roomId, peerId });
      setIsCreating(false);
    });
  };

  const joinRoom = (code) => {
    const trimmed = code.trim();
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
      <div style={homeStyles.wrapper}>
        <div style={homeStyles.bgGlow1} />
        <div style={homeStyles.bgGlow2} />
        <div style={homeStyles.card}>
          <div style={homeStyles.iconWrap}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" />
            </svg>
          </div>
          <h1 style={homeStyles.title}>P2P Chat & File Share</h1>
          <p style={homeStyles.subtitle}>Secure, direct peer-to-peer communication. No servers store your data.</p>

          <div style={homeStyles.divider} />

          <button onClick={createRoom} style={homeStyles.primaryBtn} disabled={isCreating}>
            {isCreating ? 'Creating…' : '⊕ Create New Room'}
          </button>

          <div style={homeStyles.orRow}>
            <span style={homeStyles.orLine} />
            <span style={homeStyles.orText}>or join existing</span>
            <span style={homeStyles.orLine} />
          </div>

          <div style={homeStyles.joinRow}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Enter 6‑character code"
              maxLength="6"
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom(roomId)}
              style={homeStyles.joinInput}
              value={roomId}
            />
            <button onClick={() => joinRoom(roomId)} style={homeStyles.secondaryBtn}>
              Join
            </button>
          </div>

          {error && <p style={homeStyles.errorText}>{error}</p>}

          <div style={homeStyles.features}>
            <span>🔒 End-to-end encrypted</span>
            <span>📁 File sharing</span>
            <span>⚡ P2P direct</span>
          </div>
        </div>
      </div>
    );
  }

  return <Room roomId={roomId} peerId={peerId} onLeave={leaveRoom} />;
}

const homeStyles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at 20% 50%, #1A1A2E 0%, #0B0B0E 70%)',
    padding: '20px',
    position: 'relative',
    overflow: 'hidden',
  },
  bgGlow1: {
    position: 'absolute',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0, 122, 255, 0.08) 0%, transparent 70%)',
    top: '-100px',
    right: '-100px',
    pointerEvents: 'none',
  },
  bgGlow2: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(52, 199, 89, 0.06) 0%, transparent 70%)',
    bottom: '-80px',
    left: '-80px',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    maxWidth: '440px',
    width: '100%',
    padding: '48px 40px 40px',
    background: 'rgba(24, 24, 28, 0.85)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: '24px',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
    textAlign: 'center',
  },
  iconWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
    color: '#007AFF',
  },
  title: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#F4F4F5',
    letterSpacing: '-0.5px',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#8E8E93',
    lineHeight: '1.5',
    maxWidth: '320px',
    margin: '0 auto 28px',
  },
  divider: {
    height: '1px',
    background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)',
    marginBottom: '28px',
  },
  primaryBtn: {
    width: '100%',
    padding: '14px 0',
    background: 'linear-gradient(135deg, #007AFF, #0055CC)',
    color: '#FFF',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.2s',
    boxShadow: '0 4px 16px rgba(0, 122, 255, 0.25)',
  },
  orRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    margin: '20px 0',
  },
  orLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
  },
  orText: {
    fontSize: '13px',
    color: '#636366',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  joinRow: {
    display: 'flex',
    gap: '10px',
  },
  joinInput: {
    flex: 1,
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    color: '#F4F4F5',
    fontSize: '15px',
    fontWeight: '500',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    fontFamily: 'Inter, sans-serif',
  },
  secondaryBtn: {
    padding: '12px 24px',
    background: 'rgba(255,255,255,0.06)',
    color: '#F4F4F5',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  errorText: {
    color: '#FF453A',
    fontSize: '14px',
    marginTop: '14px',
  },
  features: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    marginTop: '28px',
    fontSize: '13px',
    color: '#636366',
    fontWeight: '500',
    flexWrap: 'wrap',
  },
};