import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import { createPeer } from './peer';

const CHUNK_SIZE = 16 * 1024;
const HIGH_WATER_MARK = 512 * 1024;
const LOW_WATER_MARK = 128 * 1024;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function transferId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function decodePeerData(data) {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
    return String(data);
}

async function waitForWritable(peer) {
    if (!peer || peer.destroyed || !peer.connected) throw new Error('Peer is not connected.');
    const channel = peer._channel;
    if (!channel || channel.readyState !== 'open') throw new Error('Data channel is not open.');
    if (channel.bufferedAmount < HIGH_WATER_MARK) return;

    channel.bufferedAmountLowThreshold = LOW_WATER_MARK;
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            channel.removeEventListener('bufferedamountlow', onLow);
            reject(new Error('Timed out waiting for the receiver.'));
        }, 20000);
        const onLow = () => {
            clearTimeout(timeout);
            channel.removeEventListener('bufferedamountlow', onLow);
            resolve();
        };
        channel.addEventListener('bufferedamountlow', onLow, { once: true });
    });
}

export function useRoom(roomId, peerId) {
    const [messages, setMessages] = useState([]);
    const [activeUsers, setActiveUsers] = useState([]);
    const [pendingOffers, setPendingOffers] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isSendingFile, setIsSendingFile] = useState(false);
    const [fileProgress, setFileProgress] = useState(null);

    const peersRef = useRef(new Map());
    const namesRef = useRef(new Map());
    const incomingRef = useRef(new Map());
    const outgoingRef = useRef(new Map());
    const objectUrlsRef = useRef(new Set());

    const refreshPeers = useCallback(() => {
        const connected = [...peersRef.current.entries()]
            .filter(([, peer]) => peer && peer.connected && !peer.destroyed)
            .map(([socketId]) => ({ socketId, peerId: namesRef.current.get(socketId) || 'Peer' }));
        setActiveUsers(connected);
        setIsConnected(connected.length > 0);
    }, []);

    const safeSend = useCallback((socketId, payload) => {
        const peer = peersRef.current.get(socketId);
        if (!peer || !peer.connected || peer.destroyed) return false;
        try {
            peer.send(JSON.stringify(payload));
            return true;
        } catch (error) {
            console.error(`Send failed for ${socketId}:`, error);
            return false;
        }
    }, []);

    const sendFileToPeer = useCallback(async (socketId, record) => {
        const peer = peersRef.current.get(socketId);
        if (!peer || !peer.connected || peer.destroyed) throw new Error('Receiver disconnected.');

        const { file, id, offeredAt } = record;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        setIsSendingFile(true);

        for (let index = 0; index < totalChunks; index += 1) {
            await waitForWritable(peer);
            const start = index * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());

            peer.send(JSON.stringify({
                type: 'file-chunk',
                transferId: id,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type || 'application/octet-stream',
                chunkIndex: index,
                totalChunks,
                data: Array.from(bytes),
                from: peerId,
                timestamp: offeredAt
            }));

            setFileProgress(Math.round(((index + 1) / totalChunks) * 100));
            await delay(2);
        }

        safeSend(socketId, { type: 'file-complete', transferId: id });
        setMessages(previous => [...previous, {
            type: 'system',
            text: `${file.name} sent successfully`,
            timestamp: Date.now()
        }]);
    }, [peerId, safeSend]);

    const handlePeerData = useCallback(async (rawData, socketId) => {
        try {
            const msg = JSON.parse(decodePeerData(rawData));

            if (msg.type === 'text') {
                setMessages(previous => [...previous, { ...msg, local: false }]);
                return;
            }

            if (msg.type === 'file-offer') {
                setPendingOffers(previous => previous.some(item => item.transferId === msg.transferId)
                    ? previous
                    : [...previous, { ...msg, socketId }]);
                return;
            }

            if (msg.type === 'file-response') {
                const record = outgoingRef.current.get(msg.transferId);
                if (!record) return;

                if (!msg.accepted) {
                    setMessages(previous => [...previous, {
                        type: 'system',
                        text: `${namesRef.current.get(socketId) || 'A device'} declined ${record.file.name}`,
                        timestamp: Date.now()
                    }]);
                    return;
                }

                try {
                    await sendFileToPeer(socketId, record);
                } catch (error) {
                    console.error(error);
                    setMessages(previous => [...previous, {
                        type: 'system',
                        text: `Transfer failed: ${error.message}`,
                        timestamp: Date.now()
                    }]);
                } finally {
                    setIsSendingFile(false);
                    setFileProgress(null);
                }
                return;
            }

            if (msg.type === 'file-chunk') {
                let entry = incomingRef.current.get(msg.transferId);
                if (!entry) {
                    entry = {
                        chunks: new Array(msg.totalChunks),
                        received: 0,
                        totalChunks: msg.totalChunks,
                        fileName: msg.fileName,
                        fileSize: msg.fileSize,
                        mimeType: msg.mimeType,
                        from: msg.from,
                        timestamp: msg.timestamp
                    };
                    incomingRef.current.set(msg.transferId, entry);
                }

                if (!entry.chunks[msg.chunkIndex]) {
                    entry.chunks[msg.chunkIndex] = new Uint8Array(msg.data);
                    entry.received += 1;
                }

                if (entry.received === entry.totalChunks) {
                    const buffer = new Uint8Array(entry.fileSize);
                    let position = 0;
                    for (const chunk of entry.chunks) {
                        buffer.set(chunk, position);
                        position += chunk.length;
                    }
                    const blob = new Blob([buffer], { type: entry.mimeType });
                    const downloadUrl = URL.createObjectURL(blob);
                    objectUrlsRef.current.add(downloadUrl);
                    incomingRef.current.delete(msg.transferId);

                    setMessages(previous => [...previous, {
                        type: 'file',
                        transferId: msg.transferId,
                        fileName: entry.fileName,
                        fileSize: entry.fileSize,
                        from: entry.from,
                        downloadUrl,
                        timestamp: entry.timestamp || Date.now()
                    }]);
                }
            }
        } catch (error) {
            console.error('Peer data error:', error);
        }
    }, [sendFileToPeer]);

    const addPeer = useCallback((socketId, remotePeerId, initiator) => {
        if (peersRef.current.has(socketId)) return peersRef.current.get(socketId);
        namesRef.current.set(socketId, remotePeerId);

        const peer = createPeer({
            initiator,
            onSignal: signal => socket.emit('signal', { toSocketId: socketId, signal }),
            onConnect: refreshPeers,
            onData: data => handlePeerData(data, socketId),
            onClose: () => {
                peersRef.current.delete(socketId);
                namesRef.current.delete(socketId);
                refreshPeers();
            },
            onError: error => {
                console.error(`Peer ${socketId} error:`, error);
                refreshPeers();
            }
        });

        peersRef.current.set(socketId, peer);
        return peer;
    }, [handlePeerData, refreshPeers]);

    useEffect(() => {
        const onExistingPeers = ({ peers }) => {
            peers.forEach(item => addPeer(item.socketId, item.peerId, false));
        };
        const onUserJoined = ({ socketId, peerId: remotePeerId }) => {
            addPeer(socketId, remotePeerId, true);
            setMessages(previous => [...previous, {
                type: 'system', text: `${remotePeerId} joined`, timestamp: Date.now()
            }]);
        };
        const onSignal = ({ fromSocketId, signal }) => {
            peersRef.current.get(fromSocketId)?.signal(signal);
        };
        const onUserLeft = ({ socketId, peerId: remotePeerId }) => {
            peersRef.current.get(socketId)?.destroy();
            peersRef.current.delete(socketId);
            namesRef.current.delete(socketId);
            refreshPeers();
            setMessages(previous => [...previous, {
                type: 'system', text: `${remotePeerId || 'A device'} left`, timestamp: Date.now()
            }]);
        };

        socket.on('existing-peers', onExistingPeers);
        socket.on('user-joined', onUserJoined);
        socket.on('signal', onSignal);
        socket.on('user-left', onUserLeft);
        socket.emit('join-room', { roomId, peerId });

        return () => {
            socket.emit('leave-room');
            socket.off('existing-peers', onExistingPeers);
            socket.off('user-joined', onUserJoined);
            socket.off('signal', onSignal);
            socket.off('user-left', onUserLeft);
            peersRef.current.forEach(peer => peer.destroy());
            peersRef.current.clear();
            incomingRef.current.clear();
            objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
            objectUrlsRef.current.clear();
        };
    }, [addPeer, peerId, refreshPeers, roomId]);

    const sendMessage = useCallback(text => {
        const msg = { type: 'text', text, from: peerId, timestamp: Date.now() };
        let delivered = 0;
        peersRef.current.forEach((_, socketId) => { if (safeSend(socketId, msg)) delivered += 1; });
        setMessages(previous => [...previous, { ...msg, local: true, delivered }]);
    }, [peerId, safeSend]);

    const sendFile = useCallback(file => {
        const connectedSocketIds = [...peersRef.current.entries()]
            .filter(([, peer]) => peer.connected && !peer.destroyed)
            .map(([socketId]) => socketId);

        if (connectedSocketIds.length === 0) throw new Error('No connected receiver is online.');

        const id = transferId();
        const record = { id, file, offeredAt: Date.now() };
        outgoingRef.current.set(id, record);

        const offer = {
            type: 'file-offer',
            transferId: id,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            from: peerId,
            timestamp: record.offeredAt
        };

        connectedSocketIds.forEach(socketId => safeSend(socketId, offer));
        setMessages(previous => [...previous, {
            type: 'system',
            text: `File offer sent: ${file.name}`,
            timestamp: Date.now()
        }]);
    }, [peerId, safeSend]);

    const respondToOffer = useCallback((offer, accepted) => {
        safeSend(offer.socketId, {
            type: 'file-response',
            transferId: offer.transferId,
            accepted
        });
        setPendingOffers(previous => previous.filter(item => item.transferId !== offer.transferId));
    }, [safeSend]);

    return {
        messages,
        activeUsers,
        pendingOffers,
        isConnected,
        isSendingFile,
        fileProgress,
        sendMessage,
        sendFile,
        acceptFile: offer => respondToOffer(offer, true),
        rejectFile: offer => respondToOffer(offer, false)
    };
}