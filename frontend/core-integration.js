// Core Integration Layer - Orchestrates all backend systems
import { CollaborationEngine } from './collaboration.js';
import { WebRTCManager } from './webrtc.js';
import { PresenceManager } from './presence.js';
import { OfflineSyncManager } from './offline-sync.js';
import { ErrorHandler } from './error-handler.js';

export class WhiteboardCore {
    constructor(config) {
        this.config = {
            roomId: config.roomId,
            userId: config.userId,
            signalingUrls: config.signalingUrls || [],
            websocketUrl: config.websocketUrl,
            maxUsers: config.maxUsers || 8,
            ...config
        };
        
        this.isInitialized = false;
        this.components = {};
        
        this.initializeComponents();
        this.setupIntegration();
    }
    
    initializeComponents() {
        // Initialize collaboration engine with Y.js
        this.components.collaboration = new CollaborationEngine(
            this.config.roomId,
            this.config.userId,
            this.config.signalingUrls
        );
        
        // Initialize signaling service for WebSocket communication
        this.components.signaling = new SignalingService(this.config.websocketUrl);
        
        // Add signaling service to collaboration engine for error handler access
        if (this.components.collaboration) {
            this.components.collaboration.signalingService = this.components.signaling;
        }
        
        // Initialize WebRTC manager
        this.components.webrtc = new WebRTCManager(
            this.config.userId,
            this.components.signaling
        );
        
        // Initialize presence manager
        this.components.presence = new PresenceManager(
            this.components.collaboration,
            this.components.webrtc
        );
        
        // Initialize offline sync manager
        this.components.offlineSync = new OfflineSyncManager(
            this.components.collaboration,
            this.components.webrtc,
            this.components.presence
        );
        
        // Initialize error handler
        this.components.errorHandler = new ErrorHandler(
            this.components.collaboration,
            this.components.webrtc,
            this.components.presence,
            this.components.offlineSync
        );
    }
    
    setupIntegration() {
        this.setupCollaborationIntegration();
        this.setupWebRTCIntegration();
        this.setupPresenceIntegration();
        this.setupOfflineSyncIntegration();
        this.setupErrorHandlingIntegration();
    }
    
    setupCollaborationIntegration() {
        const { collaboration } = this.components;
        
        // Override Y.js event handlers to propagate to UI
        collaboration.onDrawingUpdate = (event) => {
            this.onDrawingUpdate?.(event);
        };
        
        collaboration.onTextUpdate = (event) => {
            this.onTextUpdate?.(event);
        };
        
        collaboration.onConnectionStatusChange = (event) => {
            this.onConnectionStatusChange?.('collaboration', event);
        };
        
        collaboration.onSyncStateChange = (synced) => {
            this.onSyncStateChange?.(synced);
        };
    }
    
    setupWebRTCIntegration() {
        const { webrtc } = this.components;
        
        webrtc.onConnectionStateChange = (userId, state) => {
            this.onWebRTCConnectionStateChange?.(userId, state);
            
            // Notify presence manager
            this.components.presence.handleConnectionStateChange(userId, state);
        };
        
        webrtc.onDataChannelOpen = (userId) => {
            this.onUserConnected?.(userId);
        };
        
        webrtc.onDataChannelClose = (userId) => {
            this.onUserDisconnected?.(userId);
        };
        
        webrtc.onDataChannelMessage = (userId, message) => {
            // Route messages to appropriate handlers
            if (message.type?.startsWith('presence-') || message.type?.startsWith('cursor-')) {
                this.components.presence.handleWebRTCMessage(userId, message);
            } else {
                this.onWebRTCMessage?.(userId, message);
            }
        };
    }
    
    setupPresenceIntegration() {
        const { presence } = this.components;
        
        presence.onRemoteCursorUpdate = (userId, cursor) => {
            this.onRemoteCursorUpdate?.(userId, cursor);
        };
        
        presence.onUserJoined = (userId, presenceData) => {
            this.onUserJoined?.(userId, presenceData);
        };
        
        presence.onUserLeft = (userId) => {
            this.onUserLeft?.(userId);
        };
        
        presence.onUserPresenceUpdate = (userId, presence) => {
            this.onUserPresenceUpdate?.(userId, presence);
        };
        
        // Setup activity tracking
        presence.setupActivityTracking();
    }
    
    setupOfflineSyncIntegration() {
        const { offlineSync } = this.components;
        
        offlineSync.onNetworkOnline = () => {
            this.onNetworkStatusChange?.('online');
        };
        
        offlineSync.onNetworkOffline = () => {
            this.onNetworkStatusChange?.('offline');
        };
        
        offlineSync.onSyncCompleted = (operationCount) => {
            this.onOfflineSyncCompleted?.(operationCount);
        };
        
        offlineSync.onOperationFailed = (operation, error) => {
            this.onOfflineSyncError?.(operation, error);
        };
    }
    
    setupErrorHandlingIntegration() {
        const { errorHandler } = this.components;
        
        errorHandler.onReconnectionStarted = (reason) => {
            this.onReconnectionStarted?.(reason);
        };
        
        errorHandler.onReconnectionSuccess = () => {
            this.onReconnectionSuccess?.();
        };
        
        errorHandler.onReconnectionFailed = () => {
            this.onReconnectionFailed?.();
        };
        
        errorHandler.onHealthCheck = (health) => {
            this.onHealthCheck?.(health);
        };
        
        // Start health monitoring
        errorHandler.startHealthMonitoring();
    }
    
    // Public API methods
    async connect() {
        if (this.isInitialized) {
            throw new Error('Already connected');
        }
        
        try {
            // Connect signaling service
            await this.components.signaling.connect();
            
            // Join room
            await this.components.signaling.joinRoom(this.config.roomId, this.config.userId);
            
            // Connect Y.js collaboration
            this.components.collaboration.connect();
            
            // Initialize presence
            this.components.presence.updateLocalPresence('active');
            
            this.isInitialized = true;
            this.onConnected?.();
        } catch (error) {
            this.onConnectionError?.(error);
            throw error;
        }
    }
    
    async disconnect() {
        if (!this.isInitialized) {
            return;
        }
        
        try {
            // Leave room
            await this.components.signaling.leaveRoom(this.config.roomId);
            
            // Disconnect all components
            this.components.collaboration.disconnect();
            this.components.webrtc.destroy();
            this.components.signaling.disconnect();
            
            this.isInitialized = false;
            this.onDisconnected?.();
        } catch (error) {
            this.onDisconnectionError?.(error);
            throw error;
        }
    }
    
    // Drawing operations
    addDrawingStroke(stroke) {
        this.components.collaboration.addDrawingStroke(stroke);
        this.components.presence.recordActivity();
    }
    
    addDrawingShape(shape) {
        this.components.collaboration.addDrawingShape(shape);
        this.components.presence.recordActivity();
    }
    
    removeDrawingElement(elementId) {
        this.components.collaboration.removeDrawingElement(elementId);
        this.components.presence.recordActivity();
    }
    
    clearDrawing() {
        this.components.collaboration.clearDrawing();
        this.components.presence.recordActivity();
    }
    
    getDrawingElements() {
        return this.components.collaboration.getDrawingElements();
    }
    
    // Text operations
    insertText(index, text) {
        this.components.collaboration.insertText(index, text);
        this.components.presence.recordActivity();
    }
    
    deleteText(index, length) {
        this.components.collaboration.deleteText(index, length);
        this.components.presence.recordActivity();
    }
    
    getText() {
        return this.components.collaboration.getText();
    }
    
    // Cursor operations
    updateCursor(x, y) {
        this.components.presence.updateLocalCursor(x, y);
    }
    
    hideCursor() {
        this.components.presence.hideLocalCursor();
    }
    
    showCursor() {
        this.components.presence.showLocalCursor();
    }
    
    getRemoteCursors() {
        return this.components.presence.getRemoteCursors();
    }
    
    // Presence operations
    updatePresence(status, metadata) {
        this.components.presence.updateLocalPresence(status, metadata);
    }
    
    getUserPresence(userId) {
        return this.components.presence.getUserPresence(userId);
    }
    
    getAllPresence() {
        return this.components.presence.getAllPresence();
    }
    
    getConnectedUsers() {
        return this.components.presence.getConnectedUsers();
    }
    
    getUserCount() {
        return this.components.presence.getUserCount();
    }
    
    // Typing indicators
    startTyping(location) {
        this.components.presence.startTyping(location);
    }
    
    stopTyping() {
        this.components.presence.stopTyping();
    }
    
    // WebRTC data channel communication
    sendDataToUser(userId, data) {
        return this.components.webrtc.sendData(userId, data);
    }
    
    broadcastData(data) {
        return this.components.webrtc.broadcastData(data);
    }
    
    getWebRTCConnectionState(userId) {
        return this.components.webrtc.getConnectionState(userId);
    }
    
    // Offline sync operations
    getOfflineStatus() {
        return this.components.offlineSync.getOfflineStatus();
    }
    
    getPendingOperations() {
        return this.components.offlineSync.getPendingOperations();
    }
    
    forceSyncNow() {
        this.components.offlineSync.forceSyncNow();
    }
    
    retryFailedOperations() {
        this.components.offlineSync.retryFailedOperations();
    }
    
    // Error handling operations
    getConnectionStatus() {
        return this.components.errorHandler.getConnectionStatus();
    }
    
    getErrorLog() {
        return this.components.errorHandler.getErrorLog();
    }
    
    clearErrorLog() {
        this.components.errorHandler.clearErrorLog();
    }
    
    forceReconnect() {
        this.components.errorHandler.forceReconnect();
    }
    
    // Statistics and monitoring
    getSystemStats() {
        return {
            collaboration: {
                connected: this.components.collaboration.provider.synced,
                drawingElements: this.getDrawingElements().length,
                textLength: this.getText().length
            },
            webrtc: {
                connectedUsers: this.components.webrtc.getConnectedUsers(),
                connectionStates: this.getConnectedUsers().reduce((acc, userId) => {
                    acc[userId] = this.getWebRTCConnectionState(userId);
                    return acc;
                }, {})
            },
            presence: {
                userCount: this.getUserCount(),
                connectedUsers: this.getConnectedUsers()
            },
            offline: this.getOfflineStatus(),
            errors: {
                recentCount: this.components.errorHandler.getRecentErrorCount(),
                isReconnecting: this.getConnectionStatus().isReconnecting
            }
        };
    }
    
    // Configuration updates
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    
    // Cleanup
    destroy() {
        Object.values(this.components).forEach(component => {
            if (component.destroy) {
                component.destroy();
            }
        });
        
        this.components = {};
        this.isInitialized = false;
    }
    
    // Event handlers (to be overridden by UI implementation)
    onConnected() {
        console.log('Whiteboard core connected');
    }
    
    onDisconnected() {
        console.log('Whiteboard core disconnected');
    }
    
    onConnectionError(error) {
        console.error('Connection error:', error);
    }
    
    onDisconnectionError(error) {
        console.error('Disconnection error:', error);
    }
    
    onDrawingUpdate(event) {
        console.log('Drawing updated:', event);
    }
    
    onTextUpdate(event) {
        console.log('Text updated:', event);
    }
    
    onRemoteCursorUpdate(userId, cursor) {
        console.log('Remote cursor updated:', userId, cursor);
    }
    
    onUserJoined(userId, presence) {
        console.log('User joined:', userId, presence);
    }
    
    onUserLeft(userId) {
        console.log('User left:', userId);
    }
    
    onUserPresenceUpdate(userId, presence) {
        console.log('User presence updated:', userId, presence);
    }
    
    onUserConnected(userId) {
        console.log('User connected via WebRTC:', userId);
    }
    
    onUserDisconnected(userId) {
        console.log('User disconnected from WebRTC:', userId);
    }
    
    onWebRTCConnectionStateChange(userId, state) {
        console.log('WebRTC connection state changed:', userId, state);
    }
    
    onWebRTCMessage(userId, message) {
        console.log('WebRTC message:', userId, message);
    }
    
    onConnectionStatusChange(component, status) {
        console.log('Connection status changed:', component, status);
    }
    
    onSyncStateChange(synced) {
        console.log('Sync state changed:', synced);
    }
    
    onNetworkStatusChange(status) {
        console.log('Network status changed:', status);
    }
    
    onOfflineSyncCompleted(operationCount) {
        console.log('Offline sync completed:', operationCount);
    }
    
    onOfflineSyncError(operation, error) {
        console.error('Offline sync error:', operation, error);
    }
    
    onReconnectionStarted(reason) {
        console.log('Reconnection started:', reason);
    }
    
    onReconnectionSuccess() {
        console.log('Reconnection successful');
    }
    
    onReconnectionFailed() {
        console.error('Reconnection failed');
    }
    
    onHealthCheck(health) {
        console.log('Health check:', health);
    }
}

// WebSocket Signaling Service
class SignalingService {
    constructor(websocketUrl) {
        this.websocketUrl = websocketUrl;
        this.websocket = null;
        this.connected = false;
        this.messageHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }
    
    async connect() {
        return new Promise((resolve, reject) => {
            this.websocket = new WebSocket(this.websocketUrl);
            
            this.websocket.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                console.log('Signaling service connected');
                resolve();
            };
            
            this.websocket.onclose = (event) => {
                this.connected = false;
                console.log('Signaling service disconnected:', event.code);
                this.onClose?.(event);
            };
            
            this.websocket.onerror = (error) => {
                console.error('Signaling service error:', error);
                this.onError?.(error);
                reject(error);
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Failed to parse signaling message:', error);
                }
            };
        });
    }
    
    disconnect() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.connected = false;
    }
    
    send(message) {
        if (this.websocket && this.connected) {
            this.websocket.send(JSON.stringify(message));
        } else {
            console.error('Cannot send message: not connected');
        }
    }
    
    async joinRoom(roomId, userId) {
        this.send({
            action: 'signal',
            type: 'join-room',
            roomId,
            userId
        });
    }
    
    async leaveRoom(roomId) {
        this.send({
            action: 'signal',
            type: 'leave-room',
            roomId
        });
    }
    
    onMessage(type, handler) {
        this.messageHandlers.set(type, handler);
    }
    
    handleMessage(message) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler(message);
        } else {
            console.log('Unhandled signaling message:', message);
        }
    }
}

export { SignalingService };