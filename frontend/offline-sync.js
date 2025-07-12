// Offline Support and Synchronization Manager
export class OfflineSyncManager {
    constructor(collaborationEngine, webrtcManager, presenceManager) {
        this.collaborationEngine = collaborationEngine;
        this.webrtcManager = webrtcManager;
        this.presenceManager = presenceManager;
        
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.conflictResolutionStrategy = 'timestamp'; // 'timestamp', 'user-priority', 'merge'
        this.maxOfflineOperations = 1000;
        this.syncRetryDelay = 5000; // 5 seconds
        this.syncRetryAttempts = 3;
        
        this.setupOfflineHandlers();
        this.setupStorageHandlers();
        this.loadOfflineData();
    }
    
    setupOfflineHandlers() {
        // Network status change handlers
        window.addEventListener('online', () => {
            console.log('Network connection restored');
            this.isOnline = true;
            this.onNetworkOnline();
            this.syncOfflineOperations();
        });
        
        window.addEventListener('offline', () => {
            console.log('Network connection lost');
            this.isOnline = false;
            this.onNetworkOffline();
        });
        
        // Y.js connection state handlers
        this.collaborationEngine.provider.on('status', (event) => {
            this.handleConnectionStatus(event);
        });
        
        this.collaborationEngine.provider.on('synced', (synced) => {
            this.handleSyncStatus(synced);
        });
    }
    
    setupStorageHandlers() {
        // Intercept Y.js operations for offline queueing
        this.collaborationEngine.ydoc.on('beforeTransaction', (transaction) => {
            if (!this.isOnline || !this.collaborationEngine.provider.synced) {
                this.queueOfflineOperation({
                    type: 'yjs-transaction',
                    transaction: this.serializeTransaction(transaction),
                    timestamp: Date.now(),
                    userId: this.collaborationEngine.userId
                });
            }
        });
        
        // Monitor localStorage quota
        this.monitorStorageQuota();
    }
    
    // Offline operation management
    queueOfflineOperation(operation) {
        // Add to sync queue
        this.syncQueue.push({
            id: this.generateOperationId(),
            ...operation,
            retryCount: 0,
            status: 'pending'
        });
        
        // Enforce queue size limit
        if (this.syncQueue.length > this.maxOfflineOperations) {
            const removed = this.syncQueue.shift();
            console.warn('Offline queue full, removed oldest operation:', removed.id);
        }
        
        // Save to localStorage
        this.saveOfflineData();
        
        this.onOfflineOperationQueued?.(operation);
    }
    
    async syncOfflineOperations() {
        if (!this.isOnline || this.syncQueue.length === 0) {
            return;
        }
        
        console.log(`Syncing ${this.syncQueue.length} offline operations`);
        
        const pendingOps = this.syncQueue.filter(op => op.status === 'pending');
        
        for (const operation of pendingOps) {
            try {
                await this.syncSingleOperation(operation);
                operation.status = 'completed';
                this.onOperationSynced?.(operation);
            } catch (error) {
                console.error('Failed to sync operation:', operation.id, error);
                operation.retryCount++;
                operation.lastError = error.message;
                
                if (operation.retryCount >= this.syncRetryAttempts) {
                    operation.status = 'failed';
                    this.onOperationFailed?.(operation, error);
                } else {
                    // Retry after delay
                    setTimeout(() => {
                        this.syncSingleOperation(operation);
                    }, this.syncRetryDelay * operation.retryCount);
                }
            }
        }
        
        // Remove completed operations
        this.syncQueue = this.syncQueue.filter(op => op.status !== 'completed');
        this.saveOfflineData();
        
        this.onSyncCompleted?.(pendingOps.length);
    }
    
    async syncSingleOperation(operation) {
        switch (operation.type) {
            case 'drawing-stroke':
                this.collaborationEngine.addDrawingStroke(operation.data);
                break;
                
            case 'drawing-shape':
                this.collaborationEngine.addDrawingShape(operation.data);
                break;
                
            case 'drawing-delete':
                this.collaborationEngine.removeDrawingElement(operation.elementId);
                break;
                
            case 'text-insert':
                this.collaborationEngine.insertText(operation.index, operation.text);
                break;
                
            case 'text-delete':
                this.collaborationEngine.deleteText(operation.index, operation.length);
                break;
                
            case 'cursor-update':
                this.collaborationEngine.updateCursor(operation.x, operation.y);
                break;
                
            case 'presence-update':
                this.presenceManager.updateLocalPresence(operation.status, operation.metadata);
                break;
                
            case 'yjs-transaction':
                await this.applySerializedTransaction(operation.transaction);
                break;
                
            default:
                console.warn('Unknown operation type:', operation.type);
        }
    }
    
    // Conflict resolution
    resolveConflicts(localOperations, remoteOperations) {
        switch (this.conflictResolutionStrategy) {
            case 'timestamp':
                return this.resolveByTimestamp(localOperations, remoteOperations);
            case 'user-priority':
                return this.resolveByUserPriority(localOperations, remoteOperations);
            case 'merge':
                return this.mergeOperations(localOperations, remoteOperations);
            default:
                return this.resolveByTimestamp(localOperations, remoteOperations);
        }
    }
    
    resolveByTimestamp(localOps, remoteOps) {
        const allOps = [...localOps, ...remoteOps];
        const uniqueOps = new Map();
        
        // Sort by timestamp and keep latest version of each operation
        allOps.sort((a, b) => a.timestamp - b.timestamp);
        
        allOps.forEach(op => {
            const key = this.getOperationKey(op);
            if (!uniqueOps.has(key) || uniqueOps.get(key).timestamp < op.timestamp) {
                uniqueOps.set(key, op);
            }
        });
        
        return Array.from(uniqueOps.values());
    }
    
    resolveByUserPriority(localOps, remoteOps) {
        // Implement user-based priority resolution
        const userPriorities = this.getUserPriorities();
        
        const allOps = [...localOps, ...remoteOps];
        const uniqueOps = new Map();
        
        allOps.forEach(op => {
            const key = this.getOperationKey(op);
            const existing = uniqueOps.get(key);
            
            if (!existing) {
                uniqueOps.set(key, op);
            } else {
                const currentPriority = userPriorities[op.userId] || 0;
                const existingPriority = userPriorities[existing.userId] || 0;
                
                if (currentPriority > existingPriority ||
                    (currentPriority === existingPriority && op.timestamp > existing.timestamp)) {
                    uniqueOps.set(key, op);
                }
            }
        });
        
        return Array.from(uniqueOps.values());
    }
    
    mergeOperations(localOps, remoteOps) {
        // Implement operation merging for compatible operations
        const merged = [];
        const processed = new Set();
        
        [...localOps, ...remoteOps].forEach(op => {
            const key = this.getOperationKey(op);
            
            if (!processed.has(key)) {
                const similarOps = [...localOps, ...remoteOps].filter(o => 
                    this.getOperationKey(o) === key
                );
                
                if (similarOps.length > 1) {
                    const mergedOp = this.mergeCompatibleOperations(similarOps);
                    merged.push(mergedOp);
                } else {
                    merged.push(op);
                }
                
                processed.add(key);
            }
        });
        
        return merged;
    }
    
    // Data persistence
    saveOfflineData() {
        try {
            const data = {
                syncQueue: this.syncQueue,
                timestamp: Date.now(),
                version: '1.0'
            };
            
            localStorage.setItem('offline-sync-data', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save offline data:', error);
            this.handleStorageError(error);
        }
    }
    
    loadOfflineData() {
        try {
            const data = localStorage.getItem('offline-sync-data');
            if (data) {
                const parsed = JSON.parse(data);
                this.syncQueue = parsed.syncQueue || [];
                
                // Clean up old operations (older than 7 days)
                const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                this.syncQueue = this.syncQueue.filter(op => op.timestamp > weekAgo);
                
                console.log(`Loaded ${this.syncQueue.length} offline operations`);
            }
        } catch (error) {
            console.error('Failed to load offline data:', error);
            this.syncQueue = [];
        }
    }
    
    clearOfflineData() {
        try {
            localStorage.removeItem('offline-sync-data');
            this.syncQueue = [];
            this.onOfflineDataCleared?.();
        } catch (error) {
            console.error('Failed to clear offline data:', error);
        }
    }
    
    // Storage management
    monitorStorageQuota() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            navigator.storage.estimate().then(estimate => {
                const usagePercentage = (estimate.usage / estimate.quota) * 100;
                
                if (usagePercentage > 90) {
                    console.warn('Storage quota nearly full:', usagePercentage + '%');
                    this.onStorageQuotaWarning?.(usagePercentage);
                    
                    // Clean up old operations
                    this.cleanupOldOperations();
                }
            });
        }
    }
    
    cleanupOldOperations() {
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const oldCount = this.syncQueue.length;
        
        this.syncQueue = this.syncQueue.filter(op => 
            op.timestamp > dayAgo || op.status === 'pending'
        );
        
        const cleaned = oldCount - this.syncQueue.length;
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old operations`);
            this.saveOfflineData();
        }
    }
    
    handleStorageError(error) {
        if (error.name === 'QuotaExceededError') {
            console.warn('Storage quota exceeded, cleaning up old data');
            this.cleanupOldOperations();
        }
    }
    
    // Network status handling
    handleConnectionStatus(event) {
        console.log('Y.js connection status:', event);
        
        if (event.status === 'disconnected') {
            this.onYjsDisconnected?.();
        } else if (event.status === 'connected') {
            this.onYjsConnected?.();
        }
    }
    
    handleSyncStatus(synced) {
        console.log('Y.js sync status:', synced);
        
        if (synced && this.isOnline) {
            // Trigger sync of pending operations
            setTimeout(() => this.syncOfflineOperations(), 1000);
        }
    }
    
    // Utility methods
    generateOperationId() {
        return `${this.collaborationEngine.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getOperationKey(operation) {
        // Generate a key for identifying similar operations
        switch (operation.type) {
            case 'drawing-stroke':
            case 'drawing-shape':
                return `${operation.type}-${operation.data.id}`;
            case 'text-insert':
            case 'text-delete':
                return `${operation.type}-${operation.index}`;
            case 'cursor-update':
                return `cursor-${operation.userId}`;
            default:
                return `${operation.type}-${operation.id || operation.timestamp}`;
        }
    }
    
    serializeTransaction(transaction) {
        // Serialize Y.js transaction for offline storage
        return {
            changes: transaction.changedParentTypes,
            deletions: transaction.deletedStructs,
            timestamp: Date.now()
        };
    }
    
    async applySerializedTransaction(serialized) {
        // Apply serialized transaction when back online
        // This would need proper Y.js transaction reconstruction
        console.log('Applying serialized transaction:', serialized);
    }
    
    getUserPriorities() {
        // Return user priority mapping for conflict resolution
        return {
            [this.collaborationEngine.userId]: 10, // Current user gets high priority
            // Other users get lower priorities based on role/seniority
        };
    }
    
    mergeCompatibleOperations(operations) {
        // Merge compatible operations (e.g., text insertions at same position)
        return operations.reduce((merged, op) => {
            // Implement operation-specific merging logic
            return merged;
        }, operations[0]);
    }
    
    // Status methods
    getOfflineStatus() {
        return {
            isOnline: this.isOnline,
            pendingOperations: this.syncQueue.filter(op => op.status === 'pending').length,
            failedOperations: this.syncQueue.filter(op => op.status === 'failed').length,
            totalQueueSize: this.syncQueue.length,
            lastSyncAttempt: this.lastSyncAttempt,
            yjsSynced: this.collaborationEngine.provider.synced
        };
    }
    
    getPendingOperations() {
        return this.syncQueue.filter(op => op.status === 'pending');
    }
    
    getFailedOperations() {
        return this.syncQueue.filter(op => op.status === 'failed');
    }
    
    // Manual sync trigger
    forceSyncNow() {
        if (this.isOnline) {
            this.syncOfflineOperations();
        } else {
            console.warn('Cannot sync while offline');
        }
    }
    
    retryFailedOperations() {
        const failedOps = this.getFailedOperations();
        failedOps.forEach(op => {
            op.status = 'pending';
            op.retryCount = 0;
            op.lastError = null;
        });
        
        this.saveOfflineData();
        
        if (this.isOnline) {
            this.syncOfflineOperations();
        }
    }
    
    // Event handlers (to be overridden)
    onNetworkOnline() {
        console.log('Back online - syncing data');
    }
    
    onNetworkOffline() {
        console.log('Gone offline - queuing operations');
    }
    
    onOfflineOperationQueued(operation) {
        console.log('Operation queued for sync:', operation);
    }
    
    onOperationSynced(operation) {
        console.log('Operation synced:', operation.id);
    }
    
    onOperationFailed(operation, error) {
        console.error('Operation failed permanently:', operation.id, error);
    }
    
    onSyncCompleted(operationCount) {
        console.log(`Sync completed: ${operationCount} operations`);
    }
    
    onStorageQuotaWarning(percentage) {
        console.warn(`Storage quota warning: ${percentage}% used`);
    }
    
    onOfflineDataCleared() {
        console.log('Offline data cleared');
    }
    
    onYjsConnected() {
        console.log('Y.js connected');
    }
    
    onYjsDisconnected() {
        console.log('Y.js disconnected');
    }
    
    // Cleanup
    destroy() {
        this.saveOfflineData();
        this.syncQueue = [];
    }
}