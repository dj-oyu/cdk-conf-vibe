// Y.js CRDT Collaborative Editing Implementation
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';

export class CollaborationEngine {
    constructor(roomId, userId, signalingUrls = []) {
        this.roomId = roomId;
        this.userId = userId;
        this.signalingUrls = signalingUrls;
        
        // Y.js document for collaborative data
        this.ydoc = new Y.Doc();
        
        // Shared data structures
        this.drawingData = this.ydoc.getArray('drawing');
        this.cursors = this.ydoc.getMap('cursors');
        this.textData = this.ydoc.getText('text');
        this.userPresence = this.ydoc.getMap('presence');
        
        // Persistence layer
        this.persistence = new IndexeddbPersistence(roomId, this.ydoc);
        
        // WebRTC provider for P2P connection
        this.provider = new WebrtcProvider(roomId, this.ydoc, {
            signaling: signalingUrls,
            password: null,
            awareness: {
                user: {
                    id: userId,
                    name: userId,
                    color: this.generateUserColor(userId)
                }
            }
        });
        
        this.setupEventListeners();
    }
    
    generateUserColor(userId) {
        // Generate consistent color based on userId
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 50%)`;
    }
    
    setupEventListeners() {
        // Drawing data changes
        this.drawingData.observe((event) => {
            this.onDrawingUpdate(event);
        });
        
        // Cursor position changes
        this.cursors.observe((event) => {
            this.onCursorUpdate(event);
        });
        
        // Text changes
        this.textData.observe((event) => {
            this.onTextUpdate(event);
        });
        
        // User presence changes
        this.provider.awareness.on('change', (changes) => {
            this.onPresenceUpdate(changes);
        });
        
        // Connection state changes
        this.provider.on('status', (event) => {
            this.onConnectionStatusChange(event);
        });
        
        // Sync state changes
        this.provider.on('synced', (synced) => {
            this.onSyncStateChange(synced);
        });
    }
    
    // Drawing operations
    addDrawingStroke(stroke) {
        this.ydoc.transact(() => {
            this.drawingData.push([{
                id: this.generateId(),
                type: 'stroke',
                userId: this.userId,
                timestamp: Date.now(),
                data: stroke
            }]);
        });
    }
    
    addDrawingShape(shape) {
        this.ydoc.transact(() => {
            this.drawingData.push([{
                id: this.generateId(),
                type: 'shape',
                userId: this.userId,
                timestamp: Date.now(),
                data: shape
            }]);
        });
    }
    
    removeDrawingElement(elementId) {
        this.ydoc.transact(() => {
            const elements = this.drawingData.toArray();
            const index = elements.findIndex(el => el.id === elementId);
            if (index !== -1) {
                this.drawingData.delete(index, 1);
            }
        });
    }
    
    clearDrawing() {
        this.ydoc.transact(() => {
            this.drawingData.delete(0, this.drawingData.length);
        });
    }
    
    // Cursor tracking
    updateCursor(x, y) {
        this.cursors.set(this.userId, {
            x,
            y,
            timestamp: Date.now()
        });
    }
    
    hideCursor() {
        this.cursors.delete(this.userId);
    }
    
    // Text operations
    insertText(index, text) {
        this.textData.insert(index, text);
    }
    
    deleteText(index, length) {
        this.textData.delete(index, length);
    }
    
    // User presence
    updatePresence(status) {
        this.provider.awareness.setLocalStateField('status', status);
    }
    
    // Connection management
    connect() {
        this.provider.connect();
    }
    
    disconnect() {
        this.provider.disconnect();
    }
    
    // Event handlers (to be overridden by UI)
    onDrawingUpdate(event) {
        // Override in UI implementation
        console.log('Drawing updated:', event);
    }
    
    onCursorUpdate(event) {
        // Override in UI implementation
        console.log('Cursors updated:', event);
    }
    
    onTextUpdate(event) {
        // Override in UI implementation
        console.log('Text updated:', event);
    }
    
    onPresenceUpdate(changes) {
        // Override in UI implementation
        console.log('Presence updated:', changes);
    }
    
    onConnectionStatusChange(event) {
        // Override in UI implementation
        console.log('Connection status:', event);
    }
    
    onSyncStateChange(synced) {
        // Override in UI implementation
        console.log('Sync state:', synced);
    }
    
    // Utility methods
    generateId() {
        return `${this.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getDrawingElements() {
        return this.drawingData.toArray();
    }
    
    getCursors() {
        const cursors = {};
        this.cursors.forEach((cursor, userId) => {
            cursors[userId] = cursor;
        });
        return cursors;
    }
    
    getText() {
        return this.textData.toString();
    }
    
    getConnectedUsers() {
        const users = [];
        this.provider.awareness.getStates().forEach((state, clientId) => {
            if (state.user) {
                users.push(state.user);
            }
        });
        return users;
    }
    
    // Cleanup
    destroy() {
        this.provider.destroy();
        this.persistence.destroy();
        this.ydoc.destroy();
    }
}

// Conflict resolution utilities
export class ConflictResolver {
    static resolveDrawingConflicts(localElements, remoteElements) {
        // Use timestamp-based resolution for drawing conflicts
        const merged = [...localElements, ...remoteElements];
        const unique = merged.reduce((acc, element) => {
            const existing = acc.find(el => el.id === element.id);
            if (!existing) {
                acc.push(element);
            } else if (element.timestamp > existing.timestamp) {
                const index = acc.indexOf(existing);
                acc[index] = element;
            }
            return acc;
        }, []);
        
        return unique.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    static resolveTextConflicts(operations) {
        // Y.js handles text conflict resolution automatically
        // This is for custom conflict handling if needed
        return operations;
    }
}

// Offline support
export class OfflineManager {
    constructor(collaboration) {
        this.collaboration = collaboration;
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        
        this.setupOfflineHandlers();
    }
    
    setupOfflineHandlers() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.syncPendingOperations();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }
    
    addPendingOperation(operation) {
        if (!this.isOnline) {
            this.pendingOperations.push({
                ...operation,
                timestamp: Date.now()
            });
        }
    }
    
    syncPendingOperations() {
        if (this.isOnline && this.pendingOperations.length > 0) {
            this.pendingOperations.forEach(operation => {
                // Apply pending operations
                switch (operation.type) {
                    case 'drawing':
                        this.collaboration.addDrawingStroke(operation.data);
                        break;
                    case 'text':
                        this.collaboration.insertText(operation.index, operation.text);
                        break;
                }
            });
            
            this.pendingOperations = [];
        }
    }
}