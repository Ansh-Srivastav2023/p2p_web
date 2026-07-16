// Room.js
import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { createPeer } from './peer';

const CHUNK_SIZE = 64 * 1024;

function getInitials(name) {
    return name.replace('peer-', '').slice(0, 2).toUpperCase();
}

function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function Room({ roomId, peerId, onLeave }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [activeUsers, setActiveUsers] = useState([]);
    const [isSendingFile, setIsSendingFile] = useState(false);
    const [fileProgress, setFileProgress] = useState(null);

    const peersRef = useRef({});
    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const chatAreaRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = (text) => {
        const msg = { type: 'text', text, from: peerId, timestamp: Date.now() };
        Object.values(peersRef.current).forEach(peer => {
            try { peer.send(JSON.stringify(msg)); } catch (_) { }
        });
        setMessages(prev => [...prev, { ...msg, local: true }]);
    };

    const sendFile = (file) => {
        const reader = new FileReader();
        const fileName = file.name;
        const fileSize = file.size;
        let offset = 0;
        let chunkIndex = 0;
        const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

        setIsSendingFile(true);
        setFileProgress(0);

        const readChunk = () => {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        reader.onload = (e) => {
            const chunkData = new Uint8Array(e.target.result);
            const message = {
                type: 'file',
                fileName,
                fileSize,
                chunkIndex,
                totalChunks,
                data: Array.from(chunkData),
                from: peerId,
                timestamp: Date.now()
            };

            Object.values(peersRef.current).forEach(peer => {
                try { peer.send(JSON.stringify(message)); } catch (_) { }
            });

            offset += CHUNK_SIZE;
            chunkIndex++;
            const progress = Math.min(100, Math.round((offset / fileSize) * 100));
            setFileProgress(progress);

            if (offset < fileSize) {
                readChunk();
            } else {
                setIsSendingFile(false);
                setFileProgress(null);
                setMessages(prev => [...prev, {
                    type: 'file',
                    fileName,
                    fileSize,
                    from: peerId,
                    local: true,
                    complete: true,
                    timestamp: Date.now()
                }]);
            }
        };

        readChunk();
    };

    const handlePeerData = (data, socketId) => {
        try {
            // FIX: Safely decode binary data package back into a plain text string
            let decodedString;
            if (data instanceof Uint8Array || Buffer.isBuffer(data) || data.buffer) {
                decodedString = new TextDecoder("utf-8").decode(data);
            } else {
                decodedString = data;
            }

            const msg = JSON.parse(decodedString);

            if (msg.type === 'text') {
                setMessages(prev => [...prev, { ...msg, fromSocketId: socketId }]);
            } else if (msg.type === 'file') {
                const key = `${msg.fileName}-${msg.from}`;
                if (!window._fileChunks) window._fileChunks = new Map();
                if (!window._fileChunks.has(key)) {
                    window._fileChunks.set(key, {
                        chunks: [],
                        total: msg.totalChunks,
                        fileName: msg.fileName,
                        from: msg.from,
                        size: msg.fileSize,
                        timestamp: msg.timestamp
                    });
                }
                const entry = window._fileChunks.get(key);
                entry.chunks[msg.chunkIndex] = new Uint8Array(msg.data);

                if (entry.chunks.length === entry.total && entry.chunks.every(c => c !== undefined)) {
                    const fullBuffer = new Uint8Array(entry.size);
                    let pos = 0;
                    for (const chunk of entry.chunks) {
                        fullBuffer.set(chunk, pos);
                        pos += chunk.length;
                    }
                    const blob = new Blob([fullBuffer]);
                    const url = URL.createObjectURL(blob);

                    setMessages(prev => [...prev, {
                        type: 'file',
                        fileName: entry.fileName,
                        fileSize: entry.size,
                        from: entry.from,
                        fromSocketId: socketId,
                        downloadUrl: url,
                        complete: true,
                        timestamp: entry.timestamp || Date.now()
                    }]);
                    window._fileChunks.delete(key);
                }
            }
        } catch (err) {
            // Log errors explicitly while debugging
            console.error("Data parsing error:", err);
        }
    };

    useEffect(() => {
        const onUserJoined = ({ peerId: newPeerId, socketId: newSocketId }) => {
            if (newSocketId === socket.id) return;
            const peer = createPeer(
                true,
                null,
                (signal) => socket.emit('signal', { toSocketId: newSocketId, signal }),
                () => { },
                (data) => handlePeerData(data, newSocketId),
                () => { }
            );
            peersRef.current[newSocketId] = peer;
            setActiveUsers(Object.keys(peersRef.current));
            setMessages(prev => [...prev, {
                type: 'system',
                text: `${newPeerId.replace('peer-', '')} joined`,
                timestamp: Date.now()
            }]);
        };

        const onExistingPeers = ({ peers: existing }) => {
            existing.forEach(({ peerId: existingPeerId, socketId: existingSocketId }) => {
                const peer = createPeer(
                    false,
                    null,
                    (signal) => socket.emit('signal', { toSocketId: existingSocketId, signal }),
                    () => { },
                    (data) => handlePeerData(data, existingSocketId),
                    () => { }
                );
                peersRef.current[existingSocketId] = peer;
            });
            setActiveUsers(Object.keys(peersRef.current));
        };

        const onSignal = ({ fromSocketId, signal }) => {
            const peer = peersRef.current[fromSocketId];
            if (peer) peer.signal(signal);
        };

        const onUserLeft = ({ socketId }) => {
            const peer = peersRef.current[socketId];
            if (peer) { peer.destroy(); delete peersRef.current[socketId]; }
            setActiveUsers(Object.keys(peersRef.current));
            setMessages(prev => [...prev, {
                type: 'system',
                text: 'A peer disconnected',
                timestamp: Date.now()
            }]);
        };

        socket.on('user-joined', onUserJoined);
        socket.on('existing-peers', onExistingPeers);
        socket.on('signal', onSignal);
        socket.on('user-left', onUserLeft);

        return () => {
            socket.off('user-joined', onUserJoined);
            socket.off('existing-peers', onExistingPeers);
            socket.off('signal', onSignal);
            socket.off('user-left', onUserLeft);
            Object.values(peersRef.current).forEach(p => p.destroy());
        };
    }, []);

    const handleSend = (e) => {
        e.preventDefault();
        if (input.trim()) {
            sendMessage(input.trim());
            setInput('');
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            sendFile(file);
            e.target.value = '';
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend(e);
        }
    };

    return (
        <div style={roomStyles.container}>
            {/* Header */}
            <header style={roomStyles.header}>
                <div style={roomStyles.headerLeft}>
                    <div style={roomStyles.roomBadge}>
                        <span style={roomStyles.roomIcon}>●</span>
                        <span style={roomStyles.roomCode}>{roomId}</span>
                    </div>
                    <div style={roomStyles.onlineBadge}>
                        <span style={roomStyles.onlineDot} />
                        <span>{activeUsers.length + 1} online</span>
                    </div>
                </div>
                <button onClick={onLeave} style={roomStyles.leaveBtn}>
                    <span style={{ marginRight: '4px' }}>✕</span> Leave
                </button>
            </header>

            {/* Chat */}
            <div style={roomStyles.chatArea} ref={chatAreaRef}>
                {messages.length === 0 && (
                    <div style={roomStyles.emptyState}>
                        <div style={roomStyles.emptyIcon}>💬</div>
                        <p style={roomStyles.emptyTitle}>No messages yet</p>
                        <p style={roomStyles.emptySub}>Say hello or share a file to start the conversation.</p>
                    </div>
                )}

                {messages.map((msg, idx) => {
                    if (msg.type === 'system') {
                        return (
                            <div key={idx} style={roomStyles.systemMsg}>
                                <span>{msg.text}</span>
                                <span style={roomStyles.systemTime}>{msg.timestamp ? formatTime(msg.timestamp) : ''}</span>
                            </div>
                        );
                    }

                    const isLocal = msg.local;
                    const senderName = isLocal ? 'You' : (msg.from || 'Peer').replace('peer-', '');
                    const initials = isLocal ? 'Y' : getInitials(msg.from || 'P');
                    const color = isLocal ? '#007AFF' : '#8B5CF6';

                    return (
                        <div key={idx} style={{
                            ...roomStyles.msgRow,
                            justifyContent: isLocal ? 'flex-end' : 'flex-start'
                        }}>
                            {!isLocal && (
                                <div style={{ ...roomStyles.avatar, background: color }}>
                                    {initials}
                                </div>
                            )}
                            <div style={{
                                ...roomStyles.bubble,
                                background: isLocal ? 'linear-gradient(135deg, #007AFF, #0055CC)' : 'rgba(38, 38, 43, 0.9)',
                                color: isLocal ? '#FFF' : '#E4E4E7',
                                borderTopRightRadius: isLocal ? '4px' : '16px',
                                borderTopLeftRadius: isLocal ? '16px' : '4px',
                            }}>
                                <div style={roomStyles.bubbleHeader}>
                                    <span style={roomStyles.bubbleName}>{senderName}</span>
                                    <span style={roomStyles.bubbleTime}>{formatTime(msg.timestamp)}</span>
                                </div>

                                {msg.type === 'text' ? (
                                    <div style={roomStyles.bubbleText}>{msg.text}</div>
                                ) : (
                                    <div style={roomStyles.fileCard}>
                                        <span style={roomStyles.fileIcon}>📄</span>
                                        <div style={roomStyles.fileInfo}>
                                            <div style={roomStyles.fileName}>{msg.fileName}</div>
                                            <div style={roomStyles.fileSize}>{formatFileSize(msg.fileSize)}</div>
                                        </div>
                                        {msg.downloadUrl ? (
                                            <a href={msg.downloadUrl} download={msg.fileName} style={roomStyles.downloadBtn}>
                                                ⬇
                                            </a>
                                        ) : isLocal ? (
                                            <span style={roomStyles.fileCheck}>✓</span>
                                        ) : (
                                            <span style={roomStyles.fileLoading}>⏳</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            {isLocal && (
                                <div style={{ ...roomStyles.avatar, background: color }}>
                                    {initials}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* File upload progress */}
                {isSendingFile && (
                    <div style={roomStyles.progressWrap}>
                        <span style={roomStyles.progressLabel}>Uploading…</span>
                        <div style={roomStyles.progressTrack}>
                            <div style={{ ...roomStyles.progressFill, width: `${fileProgress || 0}%` }} />
                        </div>
                        <span style={roomStyles.progressPercent}>{fileProgress || 0}%</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} style={roomStyles.inputForm}>
                <label style={roomStyles.attachBtn}>
                    <span>⊕</span>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
                </label>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message…"
                    style={roomStyles.inputField}
                />
                <button type="submit" style={roomStyles.sendBtn} disabled={!input.trim()}>
                    <span>▶</span>
                </button>
            </form>
        </div>
    );
}

const roomStyles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0B0B0E',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 24px',
        background: 'rgba(18, 18, 22, 0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
        zIndex: 10,
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
    },
    roomBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(255,255,255,0.05)',
        padding: '6px 14px 6px 10px',
        borderRadius: '20px',
        border: '1px solid rgba(255,255,255,0.06)',
    },
    roomIcon: { fontSize: '14px', color: '#007AFF' },
    roomCode: {
        fontSize: '15px',
        fontWeight: '600',
        color: '#F4F4F5',
        letterSpacing: '0.5px',
    },
    onlineBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        color: '#8E8E93',
        fontWeight: '500',
    },
    onlineDot: {
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: '#34C759',
        display: 'inline-block',
        boxShadow: '0 0 8px rgba(52, 199, 89, 0.3)',
    },
    leaveBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        background: 'rgba(255, 69, 58, 0.12)',
        color: '#FF453A',
        border: '1px solid rgba(255, 69, 58, 0.15)',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'background 0.2s',
    },
    chatArea: {
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    emptyState: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#636366',
        textAlign: 'center',
        gap: '8px',
    },
    emptyIcon: { fontSize: '48px', opacity: 0.3, marginBottom: '8px' },
    emptyTitle: { fontSize: '18px', fontWeight: '600', color: '#8E8E93' },
    emptySub: { fontSize: '14px', color: '#636366', maxWidth: '280px' },
    systemMsg: {
        textAlign: 'center',
        fontSize: '12px',
        color: '#636366',
        padding: '6px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    },
    systemTime: {
        fontSize: '10px',
        color: '#4A4A50',
    },
    msgRow: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: '10px',
        width: '100%',
    },
    avatar: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: '700',
        color: '#FFF',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    },
    bubble: {
        maxWidth: '72%',
        padding: '12px 16px',
        borderRadius: '16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        wordBreak: 'break-word',
    },
    bubbleHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '4px',
    },
    bubbleName: {
        fontSize: '11px',
        fontWeight: '600',
        opacity: 0.7,
    },
    bubbleTime: {
        fontSize: '10px',
        opacity: 0.5,
        fontWeight: '400',
    },
    bubbleText: {
        fontSize: '15px',
        lineHeight: '1.5',
    },
    fileCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'rgba(0,0,0,0.2)',
        padding: '10px 14px',
        borderRadius: '10px',
        minWidth: '200px',
    },
    fileIcon: { fontSize: '24px' },
    fileInfo: {
        flex: 1,
        overflow: 'hidden',
    },
    fileName: {
        fontSize: '14px',
        fontWeight: '500',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    fileSize: {
        fontSize: '11px',
        opacity: 0.6,
    },
    downloadBtn: {
        padding: '6px 10px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color: '#FFF',
        textDecoration: 'none',
        fontSize: '14px',
        transition: 'background 0.2s',
        border: 'none',
        cursor: 'pointer',
    },
    fileCheck: { fontSize: '16px', opacity: 0.6 },
    fileLoading: { fontSize: '16px', opacity: 0.6 },
    progressWrap: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '12px',
        marginTop: '4px',
    },
    progressLabel: { fontSize: '13px', color: '#8E8E93', fontWeight: '500' },
    progressTrack: {
        flex: 1,
        height: '4px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '10px',
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #007AFF, #5AC8FA)',
        borderRadius: '10px',
        transition: 'width 0.3s ease',
    },
    progressPercent: { fontSize: '13px', color: '#8E8E93', fontWeight: '500', minWidth: '36px' },
    inputForm: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '14px 24px 18px',
        background: 'rgba(18, 18, 22, 0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
    },
    attachBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.05)',
        cursor: 'pointer',
        fontSize: '18px',
        transition: 'background 0.2s',
        flexShrink: 0,
        color: '#8E8E93',
    },
    inputField: {
        flex: 1,
        padding: '10px 16px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '24px',
        color: '#F4F4F5',
        fontSize: '15px',
        outline: 'none',
        transition: 'border-color 0.2s',
        fontFamily: 'Inter, sans-serif',
    },
    sendBtn: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        border: 'none',
        background: 'linear-gradient(135deg, #007AFF, #0055CC)',
        color: '#FFF',
        fontSize: '18px',
        cursor: 'pointer',
        transition: 'opacity 0.2s, transform 0.15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 4px 16px rgba(0, 122, 255, 0.25)',
    },
};