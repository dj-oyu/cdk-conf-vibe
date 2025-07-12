// Comprehensive Error Handling and Reconnection Logic
export class ErrorHandler {
    constructor(collaborationEngine, webrtcManager, presenceManager, offlineSyncManager) {
        this.collaborationEngine = collaborationEngine;
        this.webrtcManager = webrtcManager;
        this.presenceManager = presenceManager;
        this.offlineSyncManager = offlineSyncManager;
        
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 10;
        this.baseReconnectionDelay = 1000; // 1 second
        this.maxReconnectionDelay = 30000; // 30 seconds
        this.isReconnecting = false;
        this.errorLog = [];
        this.maxErrorLogSize = 100;
        
        this.setupErrorHandlers();
        this.setupGlobalErrorHandlers();
    }
    
    setupErrorHandlers() {
        // WebSocket signaling errors
        this.collaborationEngine.signalingService.onError = (error) => {
            this.handleSignalingError(error);
        };
        
        this.collaborationEngine.signalingService.onClose = (event) => {
            this.handleSignalingDisconnection(event);
        };
        
        // Y.js provider errors
        this.collaborationEngine.provider.on('connection-error', (error) => {
            this.handleYjsConnectionError(error);
        });
        
        this.collaborationEngine.provider.on('connection-close', (event) => {
            this.handleYjsConnectionClose(event);
        });
        
        // WebRTC errors
        this.webrtcManager.onConnectionStateChange = (userId, state) => {
            if (state === 'failed') {
                this.handleWebRTCConnectionFailure(userId);
            }
        };
        
        // IndexedDB persistence errors
        this.collaborationEngine.persistence.on('error', (error) => {
            this.handlePersistenceError(error);
        });
        
        // Offline sync errors
        this.offlineSyncManager.onOperationFailed = (operation, error) => {
            this.handleSyncOperationError(operation, error);
        };
    }
    
    setupGlobalErrorHandlers() {
        // Global error handler
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event.error, event.filename, event.lineno);
        });
        
        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.handleUnhandledRejection(event.reason);
        });
        
        // Page visibility change handler
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.handlePageVisible();
            }
        });
    }
    
    // Error handling methods
    handleSignalingError(error) {
        this.logError('SignalingError', error.message, error);
        
        if (!this.isReconnecting) {
            this.initiateReconnection('signaling');
        }
        
        this.onSignalingError?.(error);
    }
    
    handleSignalingDisconnection(event) {
        this.logError('SignalingDisconnection', `WebSocket closed: ${event.code} - ${event.reason}`, event);
        
        // Only reconnect if it wasn't a clean close
        if (event.code !== 1000 && !this.isReconnecting) {
            this.initiateReconnection('signaling');
        }
        
        this.onSignalingDisconnection?.(event);
    }
    
    handleYjsConnectionError(error) {
        this.logError('YjsConnectionError', error.message, error);
        
        if (!this.isReconnecting) {
            this.initiateReconnection('yjs');
        }
        
        this.onYjsConnectionError?.(error);
    }
    
    handleYjsConnectionClose(event) {
        this.logError('YjsConnectionClose', `Y.js connection closed: ${event.reason}`, event);
        
        if (!this.isReconnecting) {
            this.initiateReconnection('yjs');
        }
        
        this.onYjsConnectionClose?.(event);
    }
    
    handleWebRTCConnectionFailure(userId) {
        this.logError('WebRTCConnectionFailure', `WebRTC connection failed for user: ${userId}`, { userId });
        
        // Attempt to re-establish WebRTC connection
        setTimeout(() => {
            this.webrtcManager.initiateConnection(userId);
        }, 2000);
        
        this.onWebRTCConnectionFailure?.(userId);
    }
    
    handlePersistenceError(error) {
        this.logError('PersistenceError', error.message, error);
        
        // Try to reinitialize persistence
        if (error.name === 'QuotaExceededError') {
            this.handleStorageQuotaExceeded();
        } else {
            this.reinitializePersistence();
        }
        
        this.onPersistenceError?.(error);
    }
    
    handleSyncOperationError(operation, error) {
        this.logError('SyncOperationError', `Failed to sync operation: ${operation.id}`, { operation, error });
        
        this.onSyncOperationError?.(operation, error);
    }
    
    handleGlobalError(error, filename, lineno) {
        this.logError('GlobalError', error?.message || 'Unknown error', {
            error,
            filename,
            lineno,
            stack: error?.stack
        });
        
        this.onGlobalError?.(error, filename, lineno);
    }
    
    handleUnhandledRejection(reason) {
        this.logError('UnhandledRejection', reason?.message || 'Unhandled promise rejection', { reason });
        
        this.onUnhandledRejection?.(reason);
    }
    
    handlePageVisible() {
        // Check and restore connections when page becomes visible
        if (!this.collaborationEngine.provider.synced || 
            !this.collaborationEngine.signalingService.connected) {
            this.initiateReconnection('page-visible');
        }
    }
    
    handleStorageQuotaExceeded() {
        this.logError('StorageQuotaExceeded', 'Browser storage quota exceeded');
        
        // Clean up old data
        try {
            this.offlineSyncManager.cleanupOldOperations();
            this.clearOldErrorLogs();
        } catch (error) {
            console.error('Failed to clean up storage:', error);
        }
        
        this.onStorageQuotaExceeded?.();
    }
    
    // Reconnection logic
    async initiateReconnection(reason) {
        if (this.isReconnecting) {
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectionAttempts = 0;
        
        this.logError('ReconnectionStarted', `Starting reconnection due to: ${reason}`);
        this.onReconnectionStarted?.(reason);
        
        while (this.reconnectionAttempts < this.maxReconnectionAttempts && this.isReconnecting) {
            this.reconnectionAttempts++;
            
            try {
                await this.attemptReconnection();
                
                if (this.isConnectionHealthy()) {
                    this.reconnectionSuccess();
                    return;
                }
            } catch (error) {
                this.logError('ReconnectionAttemptFailed', `Attempt ${this.reconnectionAttempts} failed`, error);
            }
            
            // Calculate exponential backoff delay
            const delay = Math.min(
                this.baseReconnectionDelay * Math.pow(2, this.reconnectionAttempts - 1),
                this.maxReconnectionDelay
            );
            
            this.onReconnectionAttempt?.(this.reconnectionAttempts, delay);
            
            await this.sleep(delay);
        }
        
        this.reconnectionFailed();
    }
    
    async attemptReconnection() {
        // Reconnect signaling service
        if (!this.collaborationEngine.signalingService.connected) {
            await this.collaborationEngine.signalingService.connect();
        }
        
        // Reconnect Y.js provider
        if (!this.collaborationEngine.provider.synced) {
            this.collaborationEngine.provider.connect();
            
            // Wait for sync
            await this.waitForYjsSync();
        }
        
        // Update presence
        this.presenceManager.updateLocalPresence('active');
        
        // Trigger offline sync
        this.offlineSyncManager.forceSyncNow();
    }
    
    async waitForYjsSync(timeout = 10000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Y.js sync timeout'));
            }, timeout);
            
            const checkSync = () => {
                if (this.collaborationEngine.provider.synced) {
                    clearTimeout(timer);
                    resolve();
                } else {
                    setTimeout(checkSync, 100);
                }
            };
            
            checkSync();
        });
    }
    
    isConnectionHealthy() {
        return (
            this.collaborationEngine.signalingService.connected &&
            this.collaborationEngine.provider.synced &&
            navigator.onLine
        );
    }
    
    reconnectionSuccess() {
        this.isReconnecting = false;
        this.reconnectionAttempts = 0;
        
        this.logError('ReconnectionSuccess', 'Successfully reconnected');
        this.onReconnectionSuccess?.();
    }
    
    reconnectionFailed() {
        this.isReconnecting = false;
        
        this.logError('ReconnectionFailed', `Failed to reconnect after ${this.maxReconnectionAttempts} attempts`);
        this.onReconnectionFailed?.();
    }
    
    stopReconnection() {
        this.isReconnecting = false;
        this.logError('ReconnectionStopped', 'Reconnection stopped manually');
    }
    
    // Error logging
    logError(type, message, details = null) {
        const errorEntry = {
            id: this.generateErrorId(),
            type,
            message,
            details,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            userId: this.collaborationEngine.userId
        };
        
        this.errorLog.push(errorEntry);
        
        // Enforce log size limit
        if (this.errorLog.length > this.maxErrorLogSize) {
            this.errorLog.shift();
        }
        
        // Log to console
        console.error(`[${type}] ${message}`, details);
        
        // Save to localStorage
        this.saveErrorLog();
        
        this.onErrorLogged?.(errorEntry);
    }
    
    saveErrorLog() {
        try {
            localStorage.setItem('error-log', JSON.stringify({
                errors: this.errorLog,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('Failed to save error log:', error);
        }
    }
    
    loadErrorLog() {
        try {
            const data = localStorage.getItem('error-log');
            if (data) {
                const parsed = JSON.parse(data);
                this.errorLog = parsed.errors || [];
                
                // Clean up old errors (older than 7 days)
                const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                this.errorLog = this.errorLog.filter(error => 
                    new Date(error.timestamp).getTime() > weekAgo
                );
            }
        } catch (error) {
            console.error('Failed to load error log:', error);
            this.errorLog = [];
        }
    }
    
    clearOldErrorLogs() {
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        this.errorLog = this.errorLog.filter(error => 
            new Date(error.timestamp).getTime() > dayAgo
        );
        this.saveErrorLog();
    }
    
    clearErrorLog() {
        this.errorLog = [];
        localStorage.removeItem('error-log');
        this.onErrorLogCleared?.();
    }
    
    // Recovery actions
    async reinitializePersistence() {
        try {
            this.collaborationEngine.persistence.destroy();
            this.collaborationEngine.persistence = new IndexeddbPersistence(
                this.collaborationEngine.roomId,
                this.collaborationEngine.ydoc
            );
            
            this.logError('PersistenceReinitialized', 'Successfully reinitialized persistence');
        } catch (error) {
            this.logError('PersistenceReinitializationFailed', 'Failed to reinitialize persistence', error);
        }
    }
    
    async resetApplication() {
        try {
            // Clear all data and restart
            this.clearErrorLog();
            this.offlineSyncManager.clearOfflineData();
            
            // Destroy current instances
            this.collaborationEngine.destroy();
            this.webrtcManager.destroy();
            this.presenceManager.destroy();
            this.offlineSyncManager.destroy();
            
            this.onApplicationReset?.();
        } catch (error) {
            this.logError('ApplicationResetFailed', 'Failed to reset application', error);
        }
    }
    
    // Health monitoring
    startHealthMonitoring(intervalMs = 30000) { // 30 seconds
        this.healthMonitorInterval = setInterval(() => {
            this.performHealthCheck();
        }, intervalMs);
    }
    
    stopHealthMonitoring() {
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
        }
    }
    
    performHealthCheck() {
        const health = {
            timestamp: Date.now(),
            online: navigator.onLine,
            signalingConnected: this.collaborationEngine.signalingService.connected,
            yjsSynced: this.collaborationEngine.provider.synced,
            webrtcConnections: this.webrtcManager.getConnectedUsers().length,
            pendingOperations: this.offlineSyncManager.getPendingOperations().length,
            errorCount: this.getRecentErrorCount()
        };
        
        // Check for potential issues
        if (!health.online) {
            this.logError('HealthCheck', 'Device is offline');
        }
        
        if (health.online && !health.signalingConnected) {
            this.logError('HealthCheck', 'Signaling not connected while online');
            this.initiateReconnection('health-check');
        }
        
        if (health.pendingOperations > 50) {
            this.logError('HealthCheck', `High number of pending operations: ${health.pendingOperations}`);
        }
        
        this.onHealthCheck?.(health);
        
        return health;
    }
    
    // Utility methods
    generateErrorId() {
        return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getRecentErrorCount(hours = 1) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        return this.errorLog.filter(error => 
            new Date(error.timestamp).getTime() > cutoff
        ).length;
    }
    
    getErrorLog() {
        return [...this.errorLog];
    }
    
    getConnectionStatus() {
        return {
            isReconnecting: this.isReconnecting,
            reconnectionAttempts: this.reconnectionAttempts,
            isHealthy: this.isConnectionHealthy(),
            lastError: this.errorLog[this.errorLog.length - 1],
            errorCount: this.errorLog.length
        };
    }
    
    // Manual recovery actions
    forceReconnect() {
        this.stopReconnection();
        this.initiateReconnection('manual');
    }
    
    retryFailedOperations() {
        this.offlineSyncManager.retryFailedOperations();
    }
    
    // Event handlers (to be overridden)
    onSignalingError(error) {
        console.error('Signaling error:', error);
    }
    
    onSignalingDisconnection(event) {
        console.log('Signaling disconnected:', event);
    }
    
    onYjsConnectionError(error) {
        console.error('Y.js connection error:', error);
    }
    
    onYjsConnectionClose(event) {
        console.log('Y.js connection closed:', event);
    }
    
    onWebRTCConnectionFailure(userId) {
        console.error('WebRTC connection failed:', userId);
    }
    
    onPersistenceError(error) {
        console.error('Persistence error:', error);
    }
    
    onSyncOperationError(operation, error) {
        console.error('Sync operation error:', operation, error);
    }
    
    onGlobalError(error, filename, lineno) {
        console.error('Global error:', error, filename, lineno);
    }
    
    onUnhandledRejection(reason) {
        console.error('Unhandled rejection:', reason);
    }
    
    onStorageQuotaExceeded() {
        console.warn('Storage quota exceeded');
    }
    
    onReconnectionStarted(reason) {
        console.log('Reconnection started:', reason);
    }
    
    onReconnectionAttempt(attempt, delay) {
        console.log(`Reconnection attempt ${attempt}, next in ${delay}ms`);
    }
    
    onReconnectionSuccess() {
        console.log('Reconnection successful');
    }
    
    onReconnectionFailed() {
        console.error('Reconnection failed');
    }
    
    onErrorLogged(errorEntry) {
        // Override in implementation for error reporting
    }
    
    onErrorLogCleared() {
        console.log('Error log cleared');
    }
    
    onApplicationReset() {
        console.log('Application reset');
    }
    
    onHealthCheck(health) {
        // Override in implementation for health monitoring
    }
    
    // Cleanup
    destroy() {
        this.stopHealthMonitoring();
        this.stopReconnection();
        this.saveErrorLog();
    }
}