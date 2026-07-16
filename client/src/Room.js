import React, { useState, useRef, useEffect } from 'react';
import { useRoom } from './useRoom';

function getInitials(name) { return name.replace('peer-', '').slice(0, 2).toUpperCase(); }
function formatTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function formatFileSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

const RECEIVER_SUBTLE = true;

function MessageBubble({ msg, isLocal, senderName, initials, color }) {
    const [copied, setCopied] = useState(false);

    const receiverStyles = RECEIVER_SUBTLE ? {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.04)',
        boxShadow: 'none',
        backdropFilter: 'blur(4px)',
        color: '#A1A1AA',
    } : {
        background: 'rgba(24,24,28,0.9)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        color: '#E4E4E7',
    };

    return (
        <div style={{
            ...s.msgRow,
            justifyContent: isLocal ? 'flex-end' : 'flex-start',
            animation: 'msgIn 0.3s ease'
        }}>
            {!isLocal && <div style={{ ...s.avatar, background: color }}>{initials}</div>}
            <div style={{
                ...s.bubble,
                ...(isLocal ? {
                    background: 'linear-gradient(135deg, #6E6AF8 0%, #8B5CF6 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 8px 24px rgba(110,106,248,0.25), 0 2px 8px rgba(0,0,0,0.3)',
                    color: '#fff',
                } : receiverStyles),
                borderTopRightRadius: isLocal ? '6px' : '20px',
                borderTopLeftRadius: isLocal ? '20px' : '6px',
            }}>
                <div style={s.bubbleHeader}>
                    <span style={{
                        ...s.bubbleName,
                        color: isLocal ? 'rgba(255,255,255,0.7)' : (RECEIVER_SUBTLE ? '#71717A' : '#A1A1AA')
                    }}>{senderName}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                            ...s.bubbleTime,
                            color: isLocal ? 'rgba(255,255,255,0.5)' : (RECEIVER_SUBTLE ? '#52525B' : '#52525B')
                        }}>{formatTime(msg.timestamp)}</span>

                        <button onClick={() => {
                            const copyText = msg.type === 'text' ? msg.text : `${msg.fileName} (${formatFileSize(msg.fileSize)})`;
                            navigator.clipboard.writeText(copyText).then(() => {
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            });
                        }} style={{
                            ...s.copyBtn,
                            opacity: isLocal ? 0.6 : (RECEIVER_SUBTLE ? 0.4 : 0.5),
                        }}>
                            {copied ? (
                                <span style={s.copiedFeedbackText}>Copied!</span>
                            ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                    <rect x="8" y="2" width="8" height="4" rx="1" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>

                {msg.type === 'text' ? (
                    <div style={{
                        ...s.bubbleText,
                        color: isLocal ? '#fff' : (RECEIVER_SUBTLE ? '#D4D4D8' : '#E4E4E7')
                    }}>{msg.text}</div>
                ) : (
                    <div style={{
                        ...s.fileCard,
                        background: isLocal ? 'rgba(0,0,0,0.15)' : (RECEIVER_SUBTLE ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.22)')
                    }}>
                        <div style={s.fileIconBox}><span>◩</span></div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ ...s.fileName, color: isLocal ? '#fff' : (RECEIVER_SUBTLE ? '#A1A1AA' : '#fff') }}>{msg.fileName}</div>
                            <div style={s.fileSize}>{formatFileSize(msg.fileSize)}</div>
                        </div>
                        {msg.downloadUrl ? (
                            <a href={msg.downloadUrl} download={msg.fileName} style={{
                                ...s.downloadBtn,
                                background: isLocal ? 'rgba(255,255,255,0.15)' : (RECEIVER_SUBTLE ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)')
                            }}>↓</a>
                        ) : <span style={s.fileCheck}>✓</span>}
                    </div>
                )}
            </div>
            {isLocal && <div style={{ ...s.avatar, background: '#6E6AF8' }}>{initials}</div>}
        </div>
    );
}

export default function Room({ roomId, peerId, onLeave }) {
    const [input, setInput] = useState('');
    const [roomCopied, setRoomCopied] = useState(false);

    const fileInputRef = useRef(null);
    const endRef = useRef(null);
    const textareaRef = useRef(null);

    const { messages, activeUsers, isConnected, isSendingFile, fileProgress, sendMessage, sendFile } = useRoom(roomId, peerId);

    useEffect(() => {
        if (endRef.current) {
            endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [messages]);

    const handleCopyRoom = () => {
        navigator.clipboard.writeText(roomId).then(() => {
            setRoomCopied(true);
            setTimeout(() => setRoomCopied(false), 2000);
        });
    };

    const handleSend = (e) => {
        e?.preventDefault();
        if (input.trim() && isConnected) {
            sendMessage(input.trim());
            setInput('');
            if (textareaRef.current) {
                textareaRef.current.style.height = '40px'; // Reset to new thicker height
            }
        }
    };

    const handleInput = (e) => {
        setInput(e.target.value);
        e.target.style.height = '40px'; // Set base cushion to 40px
        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div style={s.container}>
            <div style={s.bgMesh} />
            <div style={s.bgNoise} />
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap'); @keyframes msgIn { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } } ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08); border-radius:10px}`}</style>

            <header style={s.header}>
                <div style={s.headerLeft}>
                    <div style={s.roomBadge}>
                        <div style={s.liveDot}><div style={s.livePulse} /></div>
                        <span style={s.roomCode}>{roomId}</span>

                        <button onClick={handleCopyRoom} style={s.roomCopyBtn}>
                            {roomCopied ? (
                                <span style={s.copiedFeedbackText}>Copied!</span>
                            ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                    <rect x="8" y="2" width="8" height="4" rx="1" />
                                </svg>
                            )}
                        </button>
                    </div>
                    <div style={s.onlineStack}>
                        <div style={s.avatarStack}><div style={{ ...s.miniAvatar, background: '#6E6AF8', zIndex: 2 }}>Y</div><div style={{ ...s.miniAvatar, background: '#EC4899', marginLeft: -8, zIndex: 1 }}>A</div></div>
                        <span style={s.onlineText}>{activeUsers.length + 1} online • P2P Encrypted</span>
                    </div>
                </div>
                <button onClick={onLeave} style={s.leaveBtn}>Leave</button>
            </header>

            <div style={s.chatArea}>
                <div style={s.chatInner}>
                    {messages.length === 0 && (
                        <div style={s.emptyState}>
                            <div style={s.emptyOrb}><div style={s.emptyOrbInner} /></div>
                            <p style={s.emptyTitle}>Secure room ready</p>
                            <p style={s.emptySub}>Messages are end-to-end encrypted and never stored. Share a file or say hello.</p>
                        </div>
                    )}
                    {messages.map((msg, i) => msg.type === 'system' ? (
                        <div key={i} style={s.systemPill}><span>{msg.text}</span><span style={{ opacity: 0.5, marginLeft: 8 }}>{formatTime(msg.timestamp)}</span></div>
                    ) : (
                        <MessageBubble key={i} msg={msg} isLocal={msg.local} senderName={msg.local ? 'You' : (msg.from || 'Peer').replace('peer-', '')} initials={msg.local ? 'Y' : getInitials(msg.from || 'P')} color={msg.local ? '#6E6AF8' : '#27272A'} />
                    ))}
                    {isSendingFile && (
                        <div style={s.progressWrap}><div style={s.progressTrack}><div style={{ ...s.progressFill, width: `${fileProgress}%` }} /></div><span style={s.progressTxt}>{fileProgress}%</span></div>
                    )}
                    {/* Increased bottom buffer from 1px to 60px so the last message clears the dock */}
                    <div ref={endRef} style={{ height: 60, flexShrink: 0 }} />
                </div>
            </div>

            <div style={s.inputDockWrap}>
                <form onSubmit={handleSend} style={s.inputDock}>
                    <label style={s.attachBtn}>
                        <input type="file" ref={fileInputRef} onChange={e => { if (e.target.files[0]) sendFile(e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} disabled={!isConnected} />
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
                    </label>

                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder={isConnected ? "Message..." : "Establishing secure connection..."}
                        style={s.inputField}
                        disabled={!isConnected}
                        rows={1}
                    />

                    <button type="submit" disabled={!input.trim() || !isConnected} style={{ ...s.sendBtn, opacity: input.trim() && isConnected ? 1 : 0.35 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" /><path d="M22 2L15 22L11 13L2 9L22 2Z" fill="white" fillOpacity="0.9" /></svg>
                    </button>
                </form>
                <div style={s.dockHint}>P2P • Encrypted • No logs</div>
            </div>
        </div>
    );
}

const s = {
    container: { position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh', background: '#070708', fontFamily: 'Inter, sans-serif', overflow: 'hidden', isolation: 'isolate' },
    bgMesh: { position: 'absolute', inset: 0, zIndex: -2, background: `radial-gradient(1200px 600px at 20% -10%, rgba(110,106,248,0.18), transparent), radial-gradient(900px 500px at 80% 0%, rgba(139,92,246,0.15), transparent), radial-gradient(800px 600px at 50% 120%, rgba(59,130,246,0.10), transparent)` },
    bgNoise: { position: 'absolute', inset: 0, zIndex: -1, opacity: 0.025, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: 'rgba(14,14,18,0.72)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 10 },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 18 },
    roomBadge: { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', padding: '6px 8px 6px 12px', borderRadius: 999 },
    liveDot: { width: 8, height: 8, borderRadius: 999, background: '#6E6AF8', position: 'relative' },
    livePulse: { position: 'absolute', inset: -4, borderRadius: 999, background: 'rgba(110,106,248,0.4)', animation: 'pulse 2s infinite' },
    roomCode: { fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 500, color: '#FAFAFA', letterSpacing: '0.02em', paddingRight: 4 },
    roomCopyBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#A1A1AA', borderRadius: 999, padding: '4px 8px', cursor: 'pointer', transition: 'background 0.2s', minWidth: 24, minHeight: 24 },
    copiedFeedbackText: { fontSize: 10, fontWeight: 600, color: '#A5B4FC', animation: 'msgIn 0.2s ease', fontFamily: 'Inter' },
    onlineStack: { display: 'flex', alignItems: 'center', gap: 10 },
    avatarStack: { display: 'flex' },
    miniAvatar: { width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', border: '2px solid #0E0E12' },
    onlineText: { fontSize: 12.5, color: '#71717A', fontWeight: 500 },
    leaveBtn: { padding: '7px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 999, color: '#A1A1AA', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    chatArea: { flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' },
    chatInner: { width: '100%', maxWidth: 820, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 14 },
    emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, textAlign: 'center' },
    emptyOrb: { width: 64, height: 64, borderRadius: 24, background: 'linear-gradient(180deg, rgba(110,106,248,0.15), rgba(110,106,248,0.02))', border: '1px solid rgba(110,106,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyOrbInner: { width: 24, height: 24, borderRadius: 999, background: 'radial-gradient(circle at 30% 30%, #A5B4FC, #6E6AF8)', boxShadow: '0 0 20px rgba(110,106,248,0.5)' },
    emptyTitle: { fontSize: 18, fontWeight: 600, color: '#FAFAFA', margin: 0 },
    emptySub: { fontSize: 14, color: '#71717A', maxWidth: 320, lineHeight: 1.5, marginTop: 8 },
    systemPill: { alignSelf: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)', color: '#71717A', fontSize: 11.5, padding: '5px 12px', borderRadius: 999, fontFamily: 'Geist Mono, monospace' },
    msgRow: { display: 'flex', alignItems: 'flex-end', gap: 10, width: '100%' },
    avatar: { width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)' },
    bubble: { maxWidth: '68%', padding: '12px 14px 10px', borderRadius: 20, position: 'relative' },
    bubbleHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 4 },
    bubbleName: { fontSize: 11, fontWeight: 600 },
    bubbleTime: { fontSize: 10, fontFamily: 'Geist Mono' },
    bubbleText: { fontSize: 14.5, lineHeight: 1.55, letterSpacing: '-0.01em', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
    copyBtn: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.2s', minWidth: 20 },
    fileCard: { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.22)', padding: '10px 12px', borderRadius: 12, marginTop: 4 },
    fileIconBox: { width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg, #6E6AF8, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 },
    fileName: { fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    fileSize: { fontSize: 11, opacity: 0.5, marginTop: 2, fontFamily: 'Geist Mono' },
    downloadBtn: { width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textDecoration: 'none' },
    fileCheck: { fontSize: 14, opacity: 0.6 },
    progressWrap: { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: 12 },
    progressTrack: { flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' },
    progressFill: { height: '100%', background: 'linear-gradient(90deg, #6E6AF8, #A5B4FC)', borderRadius: 10, transition: 'width 0.2s' },
    progressTxt: { fontFamily: 'Geist Mono', fontSize: 11, color: '#A1A1AA' },
    inputDockWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px 20px', background: 'linear-gradient(to top, rgba(7,7,8,1) 20%, rgba(7,7,8,0))' },
    inputDock: { width: '100%', maxWidth: 820, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '8px 8px 8px 10px', background: 'rgba(20,20,24,0.85)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset' },
    attachBtn: { width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A1A1AA', cursor: 'pointer', flexShrink: 0, marginBottom: 2 },
    // Updated padding and base height here for the thicker box
    inputField: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#FAFAFA', fontSize: 15, fontFamily: 'Inter', resize: 'none', height: 40, maxHeight: 120, padding: '9px 8px', overflowY: 'auto', lineHeight: 1.4 },
    sendBtn: { width: 38, height: 38, borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #6E6AF8, #7C3AED)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(110,106,248,0.3)', flexShrink: 0, marginBottom: 1 },
    dockHint: { fontFamily: 'Geist Mono', fontSize: 10, letterSpacing: '0.08em', color: '#3F3F46', marginTop: 10 },
};