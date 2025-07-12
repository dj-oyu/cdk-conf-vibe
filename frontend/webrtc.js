// WebRTC P2P Connection Manager
export class WebRTCManager {
    constructor(userId, signalingService) {
        this.userId = userId;
        this.signalingService = signalingService;
        this.connections = new Map(); // userId -> RTCPeerConnection
        this.dataChannels = new Map(); // userId -> RTCDataChannel
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };
        
        this.setupSignalingHandlers();
    }
    
    setupSignalingHandlers() {
        this.signalingService.onMessage('webrtc-offer', (data) => {
            this.handleOffer(data.fromUserId, data.offer);
        });
        
        this.signalingService.onMessage('webrtc-answer', (data) => {
            this.handleAnswer(data.fromUserId, data.answer);
        });
        
        this.signalingService.onMessage('webrtc-ice-candidate', (data) => {
            this.handleIceCandidate(data.fromUserId, data.candidate);
        });
        
        this.signalingService.onMessage('user-joined', (data) => {
            this.initiateConnection(data.userId);
        });
        
        this.signalingService.onMessage('user-left', (data) => {
            this.closeConnection(data.userId);
        });
    }
    
    async initiateConnection(targetUserId) {
        if (this.connections.has(targetUserId)) {
            return; // Connection already exists
        }
        
        console.log(`Initiating WebRTC connection to ${targetUserId}`);
        
        const peerConnection = new RTCPeerConnection(this.configuration);
        this.connections.set(targetUserId, peerConnection);
        
        // Create data channel for the initiator
        const dataChannel = peerConnection.createDataChannel('collaboration', {
            ordered: true,
            maxRetransmits: 3
        });
        
        this.setupDataChannel(dataChannel, targetUserId);
        this.dataChannels.set(targetUserId, dataChannel);
        
        // Setup peer connection event handlers
        this.setupPeerConnectionHandlers(peerConnection, targetUserId);
        
        try {
            // Create and send offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.signalingService.send({
                type: 'webrtc-offer',
                toUserId: targetUserId,
                offer: offer
            });
            
        } catch (error) {
            console.error('Error creating offer:', error);
            this.closeConnection(targetUserId);
        }
    }
    
    async handleOffer(fromUserId, offer) {
        if (this.connections.has(fromUserId)) {
            return; // Connection already exists
        }
        
        console.log(`Handling WebRTC offer from ${fromUserId}`);
        
        const peerConnection = new RTCPeerConnection(this.configuration);
        this.connections.set(fromUserId, peerConnection);
        
        // Setup peer connection event handlers
        this.setupPeerConnectionHandlers(peerConnection, fromUserId);
        
        // Handle incoming data channel
        peerConnection.ondatachannel = (event) => {
            const dataChannel = event.channel;
            this.setupDataChannel(dataChannel, fromUserId);
            this.dataChannels.set(fromUserId, dataChannel);
        };
        
        try {
            await peerConnection.setRemoteDescription(offer);
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.signalingService.send({
                type: 'webrtc-answer',
                toUserId: fromUserId,
                answer: answer
            });
            
        } catch (error) {
            console.error('Error handling offer:', error);
            this.closeConnection(fromUserId);
        }
    }
    
    async handleAnswer(fromUserId, answer) {
        const peerConnection = this.connections.get(fromUserId);
        if (!peerConnection) {
            console.error(`No peer connection found for ${fromUserId}`);
            return;
        }
        
        try {
            await peerConnection.setRemoteDescription(answer);
            console.log(`WebRTC answer processed for ${fromUserId}`);
        } catch (error) {
            console.error('Error handling answer:', error);
            this.closeConnection(fromUserId);
        }
    }
    
    async handleIceCandidate(fromUserId, candidate) {
        const peerConnection = this.connections.get(fromUserId);
        if (!peerConnection) {
            console.error(`No peer connection found for ${fromUserId}`);
            return;
        }
        
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
    
    setupPeerConnectionHandlers(peerConnection, userId) {
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signalingService.send({
                    type: 'webrtc-ice-candidate',
                    toUserId: userId,
                    candidate: event.candidate
                });
            }
        };
        
        peerConnection.onconnectionstatechange = () => {
            console.log(`WebRTC connection state with ${userId}: ${peerConnection.connectionState}`);
            
            if (peerConnection.connectionState === 'failed') {
                this.closeConnection(userId);
            }
            
            this.onConnectionStateChange?.(userId, peerConnection.connectionState);
        };
        
        peerConnection.onicecandidateerror = (event) => {
            console.error('ICE candidate error:', event);
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state with ${userId}: ${peerConnection.iceConnectionState}`);
            
            if (peerConnection.iceConnectionState === 'failed') {
                this.restartIce(userId);
            }
        };
    }
    
    setupDataChannel(dataChannel, userId) {
        dataChannel.onopen = () => {
            console.log(`Data channel opened with ${userId}`);
            this.onDataChannelOpen?.(userId);
        };
        
        dataChannel.onclose = () => {
            console.log(`Data channel closed with ${userId}`);
            this.onDataChannelClose?.(userId);
        };
        
        dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.onDataChannelMessage?.(userId, message);
            } catch (error) {
                console.error('Error parsing data channel message:', error);
            }
        };
        
        dataChannel.onerror = (error) => {
            console.error(`Data channel error with ${userId}:`, error);
        };
    }
    
    sendData(userId, data) {
        const dataChannel = this.dataChannels.get(userId);
        if (dataChannel && dataChannel.readyState === 'open') {
            try {
                dataChannel.send(JSON.stringify(data));
                return true;
            } catch (error) {
                console.error(`Error sending data to ${userId}:`, error);
                return false;
            }
        }
        return false;
    }
    
    broadcastData(data) {
        const results = {};
        this.dataChannels.forEach((dataChannel, userId) => {
            results[userId] = this.sendData(userId, data);
        });
        return results;
    }
    
    async restartIce(userId) {
        const peerConnection = this.connections.get(userId);
        if (!peerConnection) return;
        
        try {
            console.log(`Restarting ICE for ${userId}`);
            await peerConnection.restartIce();
        } catch (error) {
            console.error('Error restarting ICE:', error);
            this.closeConnection(userId);
        }
    }
    
    closeConnection(userId) {
        const peerConnection = this.connections.get(userId);
        const dataChannel = this.dataChannels.get(userId);
        
        if (dataChannel) {
            dataChannel.close();
            this.dataChannels.delete(userId);
        }
        
        if (peerConnection) {
            peerConnection.close();
            this.connections.delete(userId);
        }
        
        console.log(`WebRTC connection closed with ${userId}`);
        this.onConnectionClosed?.(userId);
    }
    
    getConnectionState(userId) {
        const peerConnection = this.connections.get(userId);
        return peerConnection ? peerConnection.connectionState : 'closed';
    }
    
    getDataChannelState(userId) {
        const dataChannel = this.dataChannels.get(userId);
        return dataChannel ? dataChannel.readyState : 'closed';
    }
    
    getConnectedUsers() {
        const connected = [];
        this.dataChannels.forEach((dataChannel, userId) => {
            if (dataChannel.readyState === 'open') {
                connected.push(userId);
            }
        });
        return connected;
    }
    
    getConnectionStats(userId) {
        const peerConnection = this.connections.get(userId);
        if (!peerConnection) return null;
        
        return peerConnection.getStats();
    }
    
    destroy() {
        this.connections.forEach((peerConnection, userId) => {
            this.closeConnection(userId);
        });
        
        this.connections.clear();
        this.dataChannels.clear();
    }
    
    // Event handlers (to be overridden by implementation)
    onConnectionStateChange(userId, state) {
        // Override in implementation
        console.log(`Connection state changed: ${userId} -> ${state}`);
    }
    
    onDataChannelOpen(userId) {
        // Override in implementation
        console.log(`Data channel opened: ${userId}`);
    }
    
    onDataChannelClose(userId) {
        // Override in implementation
        console.log(`Data channel closed: ${userId}`);
    }
    
    onDataChannelMessage(userId, message) {
        // Override in implementation
        console.log(`Data channel message from ${userId}:`, message);
    }
    
    onConnectionClosed(userId) {
        // Override in implementation
        console.log(`Connection closed: ${userId}`);
    }
}

// WebRTC Statistics Monitor
export class WebRTCStatsMonitor {
    constructor(webrtcManager) {
        this.webrtcManager = webrtcManager;
        this.statsInterval = null;
        this.currentStats = new Map();
    }
    
    startMonitoring(intervalMs = 5000) {
        this.stopMonitoring();
        
        this.statsInterval = setInterval(async () => {
            await this.collectStats();
        }, intervalMs);
    }
    
    stopMonitoring() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }
    
    async collectStats() {
        const connectedUsers = this.webrtcManager.getConnectedUsers();
        
        for (const userId of connectedUsers) {
            try {
                const stats = await this.webrtcManager.getConnectionStats(userId);
                const processedStats = await this.processStats(stats);
                this.currentStats.set(userId, processedStats);
                
                this.onStatsUpdate?.(userId, processedStats);
            } catch (error) {
                console.error(`Error collecting stats for ${userId}:`, error);
            }
        }
    }
    
    async processStats(stats) {
        const processed = {
            timestamp: Date.now(),
            bytesReceived: 0,
            bytesSent: 0,
            packetsReceived: 0,
            packetsSent: 0,
            packetsLost: 0,
            roundTripTime: 0,
            jitter: 0,
            connectionState: 'unknown'
        };
        
        stats.forEach((report) => {
            if (report.type === 'data-channel') {
                processed.bytesReceived += report.bytesReceived || 0;
                processed.bytesSent += report.bytesSent || 0;
                processed.messagesReceived = report.messagesReceived || 0;
                processed.messagesSent = report.messagesSent || 0;
            }
            
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                processed.roundTripTime = report.currentRoundTripTime || 0;
                processed.bytesReceived += report.bytesReceived || 0;
                processed.bytesSent += report.bytesSent || 0;
            }
            
            if (report.type === 'peer-connection') {
                processed.connectionState = report.connectionState || 'unknown';
            }
        });
        
        return processed;
    }
    
    getStats(userId) {
        return this.currentStats.get(userId);
    }
    
    getAllStats() {
        return Object.fromEntries(this.currentStats);
    }
    
    onStatsUpdate(userId, stats) {
        // Override in implementation
        console.log(`Stats update for ${userId}:`, stats);
    }
}