// useRoom.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from './socket';
import { createPeer } from './peer';

const CHUNK_SIZE = 64 * 1024;

export function useRoom(roomId, peerId) {
    const [messages, setMessages] = useState([]);
    const [activeUsers, setActiveUsers] = useState([]);
    const [isSendingFile, setIsSendingFile] = useState(false);
    const [fileProgress, setFileProgress] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    const peersRef = useRef({});
    const fileChunksRef = useRef(new Map()); // store in‑progress file chunks

    // ---------- Helpers (data logic) ----------
    const sendMessage = useCallback((text) => {
        const msg = { type: 'text', text, from: peerId, timestamp: Date.now() };
        Object.values(peersRef.current).forEach(peer => {
            try { peer.send(JSON.stringify(msg)); } catch (_) { }
        });
        setMessages(prev => [...prev, { ...msg, local: true }]);
    }, [peerId]);

    const sendFile = useCallback((file) => {
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
    }, [peerId]);

    // ---------- Peer data handler ----------
    const handlePeerData = useCallback((data, socketId) => {
        try {
            let decodedString;
            if (data instanceof Uint8Array || data.buffer) {
                decodedString = new TextDecoder("utf-8").decode(data);
            } else {
                decodedString = data;
            }

            const msg = JSON.parse(decodedString);

            if (msg.type === 'text') {
                setMessages(prev => [...prev, { ...msg, fromSocketId: socketId }]);
            } else if (msg.type === 'file') {
                const key = `${msg.fileName}-${msg.from}`;
                if (!fileChunksRef.current.has(key)) {
                    fileChunksRef.current.set(key, {
                        chunks: [],
                        total: msg.totalChunks,
                        fileName: msg.fileName,
                        from: msg.from,
                        size: msg.fileSize,
                        timestamp: msg.timestamp
                    });
                }
                const entry = fileChunksRef.current.get(key);
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
                    fileChunksRef.current.delete(key);
                }
            }
        } catch (err) {
            console.error("Data parsing error:", err);
        }
    }, []);

    // ---------- Socket & Peer effects ----------
    useEffect(() => {
        const onUserJoined = ({ peerId: newPeerId, socketId: newSocketId }) => {
            if (newSocketId === socket.id) return;
            const peer = createPeer(
                true,
                null,
                (signal) => socket.emit('signal', { toSocketId: newSocketId, signal }),
                () => setIsConnected(true),
                (data) => handlePeerData(data, newSocketId),
                () => setIsConnected(false)
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
                    () => setIsConnected(true),
                    (data) => handlePeerData(data, existingSocketId),
                    () => setIsConnected(false)
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
            setIsConnected(Object.keys(peersRef.current).length > 0);
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
            fileChunksRef.current.clear();
        };
    }, [handlePeerData]); // handlePeerData is stable due to useCallback

    // ---------- Expose UI state & actions ----------
    return {
        messages,
        activeUsers,
        isConnected,
        isSendingFile,
        fileProgress,
        sendMessage,
        sendFile,
    };
}