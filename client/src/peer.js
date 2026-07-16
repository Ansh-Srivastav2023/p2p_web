import Peer from 'simple-peer';

// STUN servers (public, free)
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

export function createPeer(initiator, stream, onSignal, onConnect, onData, onError) {
    const peer = new Peer({ initiator, trickle: false, config, stream });
    
    peer.on('signal', signal => onSignal(signal));
    
    peer.on('connect', () => {
        console.log("🚀 WebRTC direct P2P connection established successfully!");
        onConnect(peer);
    });
    
    peer.on('data', data => onData(data));
    
    peer.on('error', err => {
        console.error("❌ WebRTC peer connection error:", err);
        onError(err);
    });
    
    return peer;
}