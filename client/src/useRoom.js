// useRoom.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from './socket';
import { createPeer } from './peer';

const CHUNK_SIZE = 16 * 1024; // 16KB is the safest maximum baseline size across all platforms/browsers
const BUFFER_THRESHOLD = 64 * 1024; // 64KB backpressure threshold

export function useRoom(roomId, peerId) {
    const [messages, setMessages] = useState([]);
    const [activeUsers, setActiveUsers] = useState([]);
    const [isSendingFile, setIsSendingFile] = useState(false);
    const [fileProgress, setFileProgress] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    const peersRef = useRef({});
    const fileChunksRef = useRef(new Map());

    const sendMessage = useCallback((text) => {
        const msg = { type: 'text', text, from: peerId, timestamp: Date.now() };
        Object.values(peersRef.current).forEach(peer => {
            try { peer.send(JSON.stringify(msg)); } catch (_) { }
        });
        setMessages(prev => [...prev, { ...msg, local: true }]);
    }, [peerId]);

    // Robust file sender with backpressure and rate limiting logic built-in
    const sendFile = useCallback(async (file) => {
        const fileName = file.name;
        const fileSize = file.size;
        let offset = 0;
        let chunkIndex = 0;
        const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

        setIsSendingFile(true);
        setFileProgress(0);

        const readSlice = (start, end) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(new Uint8Array(e.target.result));
                reader.onerror = (err) => reject(err);
                reader.readAsArrayBuffer(file.slice(start, end));
            });
        };

        try {
            while (offset < fileSize) {
                const chunkData = await readSlice(offset, offset + CHUNK_SIZE);
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

                const serializedMsg = JSON.stringify(message);

                // Handle backpressure for every peer connection
                for (const peer of Object.values(peersRef.current)) {
                    try {
                        // If simple-peer's underlying data channel buffer is full, wait for it to clear
                        const channel = peer._channel; 
                        if (channel && channel.bufferedAmount > BUFFER_THRESHOLD) {
                            await new Promise((resolve) => {
                                const checkBuffer = () => {
                                    if (channel.bufferedAmount <= BUFFER_THRESHOLD) {
                                        resolve();
                                    } else {
                                        setTimeout(checkBuffer, 20); // Poll every 20ms until buffer clears
                                    }
                                };
                                checkBuffer();
                            });
                        }
                        peer.send(serializedMsg);
                    } catch (e) {
                        console.error("Failed to send chunk to a peer:", e);
                    }
                }

                offset += CHUNK_SIZE;
                chunkIndex++;
                const progress = Math.min(100, Math.round((offset / fileSize) * 100));
                setFileProgress(progress);
                
                // Yield thread control back to browser loop momentarily to process networking events
                await new Promise(r => setTimeout(r, 0)); 
            }
        } catch (error) {
            console.error("File transfer error:", error);
        } finally {
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
    }, [peerId]);

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

                // Validate all parts arrived intact
                if (entry.chunks.filter(Boolean).length === entry.total) {
                    const fullBuffer = new Uint8Array(entry.size);
                    let pos = 0;
                    for (let i = 0; i < entry.total; i++) {
                        const chunk = entry.chunks[i];
                        if (chunk) {
                            fullBuffer.set(chunk, pos);
                            pos += chunk.length;
                        }
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
    }, [handlePeerData]);

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