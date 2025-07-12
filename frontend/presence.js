// User Presence and Cursor Tracking System
export class PresenceManager {
    constructor(collaborationEngine, webrtcManager) {
        this.collaborationEngine = collaborationEngine;
        this.webrtcManager = webrtcManager;
        this.localCursor = { x: 0, y: 0, visible: false };
        this.remoteCursors = new Map(); // userId -> cursor data
        this.userPresence = new Map(); // userId -> presence data
        this.presenceInterval = null;
        
        this.setupEventListeners();
        this.startPresenceHeartbeat();
    }
    
    setupEventListeners() {
        // Listen for Y.js awareness changes
        this.collaborationEngine.provider.awareness.on('change', (changes) => {
            this.handleAwarenessChanges(changes);
        });
        
        // Listen for WebRTC data channel messages
        this.webrtcManager.onDataChannelMessage = (userId, message) => {
            this.handleWebRTCMessage(userId, message);
        };
        
        // Listen for cursor updates from Y.js
        this.collaborationEngine.onCursorUpdate = (event) => {
            this.handleCursorUpdate(event);
        };
        
        // Listen for user joins/leaves
        this.webrtcManager.onConnectionStateChange = (userId, state) => {
            this.handleConnectionStateChange(userId, state);
        };
    }
    
    // Local cursor management
    updateLocalCursor(x, y, visible = true) {
        this.localCursor = { x, y, visible, timestamp: Date.now() };
        
        // Update in Y.js awareness
        this.collaborationEngine.provider.awareness.setLocalStateField('cursor', {
            x, y, visible,
            timestamp: Date.now()
        });
        
        // Broadcast via WebRTC for lower latency
        this.webrtcManager.broadcastData({
            type: 'cursor-update',
            cursor: this.localCursor
        });
        
        this.onLocalCursorUpdate?.(this.localCursor);
    }
    
    hideLocalCursor() {
        this.updateLocalCursor(this.localCursor.x, this.localCursor.y, false);
    }
    
    showLocalCursor() {
        this.updateLocalCursor(this.localCursor.x, this.localCursor.y, true);
    }
    
    // Remote cursor management
    handleCursorUpdate(event) {
        // Handle Y.js cursor updates (fallback for WebRTC)
        const cursors = this.collaborationEngine.getCursors();
        
        Object.entries(cursors).forEach(([userId, cursor]) => {
            if (userId !== this.collaborationEngine.userId) {
                this.updateRemoteCursor(userId, cursor);
            }
        });
    }
    
    updateRemoteCursor(userId, cursor) {
        const previousCursor = this.remoteCursors.get(userId);
        this.remoteCursors.set(userId, {
            ...cursor,
            userId,
            color: this.getUserColor(userId)
        });
        
        // Only trigger update if cursor actually changed
        if (!previousCursor || 
            previousCursor.x !== cursor.x || 
            previousCursor.y !== cursor.y || 
            previousCursor.visible !== cursor.visible) {
            
            this.onRemoteCursorUpdate?.(userId, cursor);
        }
    }
    
    removeRemoteCursor(userId) {
        if (this.remoteCursors.has(userId)) {
            this.remoteCursors.delete(userId);
            this.onRemoteCursorRemove?.(userId);
        }
    }
    
    // User presence management
    updateLocalPresence(status, metadata = {}) {
        const presenceData = {
            status, // 'active', 'idle', 'away', 'busy'
            metadata,
            timestamp: Date.now(),
            lastSeen: Date.now()
        };
        
        // Update in Y.js awareness
        this.collaborationEngine.provider.awareness.setLocalStateField('presence', presenceData);
        
        // Broadcast via WebRTC
        this.webrtcManager.broadcastData({
            type: 'presence-update',
            presence: presenceData
        });
        
        this.onLocalPresenceUpdate?.(presenceData);
    }
    
    handleAwarenessChanges(changes) {
        // Handle Y.js awareness changes for presence and cursors
        const awareness = this.collaborationEngine.provider.awareness;
        
        changes.added.forEach(clientId => {
            const state = awareness.getStates().get(clientId);
            if (state?.user?.id && state.user.id !== this.collaborationEngine.userId) {
                this.handleUserJoined(state.user.id, state);
            }
        });
        
        changes.updated.forEach(clientId => {
            const state = awareness.getStates().get(clientId);
            if (state?.user?.id && state.user.id !== this.collaborationEngine.userId) {
                this.handleUserUpdated(state.user.id, state);
            }
        });
        
        changes.removed.forEach(clientId => {
            // Find the user ID from previous state
            const previousStates = awareness.meta.get(clientId);
            if (previousStates?.user?.id) {
                this.handleUserLeft(previousStates.user.id);
            }
        });
    }
    
    handleUserJoined(userId, state) {
        console.log(`User ${userId} joined`);
        
        if (state.presence) {
            this.userPresence.set(userId, {
                ...state.presence,
                userId,
                color: this.getUserColor(userId)
            });
            this.onUserJoined?.(userId, state.presence);
        }
        
        if (state.cursor) {
            this.updateRemoteCursor(userId, state.cursor);
        }
    }
    
    handleUserUpdated(userId, state) {
        if (state.presence) {
            const previousPresence = this.userPresence.get(userId);
            this.userPresence.set(userId, {
                ...state.presence,
                userId,
                color: this.getUserColor(userId)
            });
            
            // Only trigger update if presence actually changed
            if (!previousPresence || 
                previousPresence.status !== state.presence.status ||
                JSON.stringify(previousPresence.metadata) !== JSON.stringify(state.presence.metadata)) {
                
                this.onUserPresenceUpdate?.(userId, state.presence);
            }
        }
        
        if (state.cursor) {
            this.updateRemoteCursor(userId, state.cursor);
        }
    }
    
    handleUserLeft(userId) {
        console.log(`User ${userId} left`);
        
        this.userPresence.delete(userId);
        this.removeRemoteCursor(userId);
        
        this.onUserLeft?.(userId);
    }
    
    // WebRTC message handling for real-time updates
    handleWebRTCMessage(userId, message) {
        switch (message.type) {
            case 'cursor-update':
                this.updateRemoteCursor(userId, message.cursor);
                break;
                
            case 'presence-update':
                this.userPresence.set(userId, {
                    ...message.presence,
                    userId,
                    color: this.getUserColor(userId)
                });
                this.onUserPresenceUpdate?.(userId, message.presence);
                break;
                
            case 'typing-start':
                this.onUserTypingStart?.(userId, message.location);
                break;
                
            case 'typing-stop':
                this.onUserTypingStop?.(userId);
                break;
        }
    }
    
    handleConnectionStateChange(userId, state) {
        if (state === 'connected') {
            // User connected via WebRTC
            this.onUserConnected?.(userId);
        } else if (state === 'disconnected' || state === 'failed') {
            // User disconnected
            this.handleUserLeft(userId);
        }
    }
    
    // Typing indicators
    startTyping(location = null) {
        this.webrtcManager.broadcastData({
            type: 'typing-start',
            location,
            timestamp: Date.now()
        });
        
        this.onLocalTypingStart?.(location);
    }
    
    stopTyping() {
        this.webrtcManager.broadcastData({
            type: 'typing-stop',
            timestamp: Date.now()
        });
        
        this.onLocalTypingStop?.();
    }
    
    // Presence heartbeat
    startPresenceHeartbeat(intervalMs = 30000) { // 30 seconds
        this.stopPresenceHeartbeat();
        
        this.presenceInterval = setInterval(() => {
            this.updateLocalPresence(this.getCurrentStatus());
        }, intervalMs);
    }
    
    stopPresenceHeartbeat() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }
    }
    
    getCurrentStatus() {
        // Determine user status based on activity
        const now = Date.now();
        const idleThreshold = 5 * 60 * 1000; // 5 minutes
        const awayThreshold = 15 * 60 * 1000; // 15 minutes
        
        if (this.lastActivity && (now - this.lastActivity) > awayThreshold) {
            return 'away';
        } else if (this.lastActivity && (now - this.lastActivity) > idleThreshold) {
            return 'idle';
        } else {
            return 'active';
        }
    }
    
    recordActivity() {
        this.lastActivity = Date.now();
        
        // If user was idle/away, update status to active
        const currentStatus = this.getCurrentStatus();
        if (currentStatus === 'active') {
            this.updateLocalPresence('active');
        }
    }
    
    // Utility methods
    getUserColor(userId) {
        return this.collaborationEngine.generateUserColor(userId);
    }
    
    getRemoteCursors() {
        return Object.fromEntries(this.remoteCursors);
    }
    
    getUserPresence(userId) {
        return this.userPresence.get(userId);
    }
    
    getAllPresence() {
        return Object.fromEntries(this.userPresence);
    }
    
    getConnectedUsers() {
        return Array.from(this.userPresence.keys());
    }
    
    getUserCount() {
        return this.userPresence.size + 1; // +1 for local user
    }
    
    // Activity tracking
    setupActivityTracking() {
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        
        events.forEach(eventType => {
            document.addEventListener(eventType, () => {
                this.recordActivity();
            }, { passive: true });
        });
        
        // Track visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.updateLocalPresence('away');
            } else {
                this.recordActivity();
                this.updateLocalPresence('active');
            }
        });
    }
    
    // Cleanup
    destroy() {
        this.stopPresenceHeartbeat();
        this.remoteCursors.clear();
        this.userPresence.clear();
    }
    
    // Event handlers (to be overridden by UI)
    onLocalCursorUpdate(cursor) {
        // Override in implementation
        console.log('Local cursor updated:', cursor);
    }
    
    onRemoteCursorUpdate(userId, cursor) {
        // Override in implementation
        console.log(`Remote cursor updated: ${userId}`, cursor);
    }
    
    onRemoteCursorRemove(userId) {
        // Override in implementation
        console.log(`Remote cursor removed: ${userId}`);
    }
    
    onLocalPresenceUpdate(presence) {
        // Override in implementation
        console.log('Local presence updated:', presence);
    }
    
    onUserJoined(userId, presence) {
        // Override in implementation
        console.log(`User joined: ${userId}`, presence);
    }
    
    onUserLeft(userId) {
        // Override in implementation
        console.log(`User left: ${userId}`);
    }
    
    onUserPresenceUpdate(userId, presence) {
        // Override in implementation
        console.log(`User presence updated: ${userId}`, presence);
    }
    
    onUserConnected(userId) {
        // Override in implementation
        console.log(`User connected via WebRTC: ${userId}`);
    }
    
    onUserTypingStart(userId, location) {
        // Override in implementation
        console.log(`User started typing: ${userId}`, location);
    }
    
    onUserTypingStop(userId) {
        // Override in implementation
        console.log(`User stopped typing: ${userId}`);
    }
    
    onLocalTypingStart(location) {
        // Override in implementation
        console.log('Local typing started:', location);
    }
    
    onLocalTypingStop() {
        // Override in implementation
        console.log('Local typing stopped');
    }
}