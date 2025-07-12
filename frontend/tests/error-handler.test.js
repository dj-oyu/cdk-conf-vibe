import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ErrorHandler } from '../error-handler.js';

describe('ErrorHandler', () => {
    let errorHandler;
    let mockCollaborationEngine;
    let mockWebRTCManager;
    let mockPresenceManager;
    let mockOfflineSyncManager;

    beforeEach(() => {
        mockCollaborationEngine = {
            signalingService: {
                onError: null,
                onClose: null,
                connected: true,
                connect: jest.fn().mockResolvedValue()
            },
            provider: {
                synced: true,
                connect: jest.fn(),
                on: jest.fn()
            },
            persistence: {
                destroy: jest.fn(),
                on: jest.fn()
            }
        };

        mockWebRTCManager = {
            onConnectionStateChange: null,
            initiateConnection: jest.fn(),
            getConnectedUsers: jest.fn(() => ['user1', 'user2'])
        };

        mockPresenceManager = {
            updateLocalPresence: jest.fn()
        };

        mockOfflineSyncManager = {
            onOperationFailed: null,
            forceSyncNow: jest.fn(),
            cleanupOldOperations: jest.fn(),
            clearOfflineData: jest.fn(),
            retryFailedOperations: jest.fn(),
            getPendingOperations: jest.fn(() => [])
        };

        // Reset localStorage mock
        localStorage.getItem.mockClear();
        localStorage.setItem.mockClear();
        localStorage.removeItem.mockClear();

        errorHandler = new ErrorHandler(
            mockCollaborationEngine,
            mockWebRTCManager,
            mockPresenceManager,
            mockOfflineSyncManager
        );
    });

    afterEach(() => {
        if (errorHandler) {
            errorHandler.destroy();
        }
    });

    describe('Constructor', () => {
        test('should initialize with correct properties', () => {
            expect(errorHandler.collaborationEngine).toBe(mockCollaborationEngine);
            expect(errorHandler.webrtcManager).toBe(mockWebRTCManager);
            expect(errorHandler.presenceManager).toBe(mockPresenceManager);
            expect(errorHandler.offlineSyncManager).toBe(mockOfflineSyncManager);
            expect(errorHandler.reconnectionAttempts).toBe(0);
            expect(errorHandler.isReconnecting).toBe(false);
            expect(errorHandler.errorLog).toEqual([]);
        });

        test('should setup error handlers', () => {
            expect(mockCollaborationEngine.signalingService.onError).toEqual(expect.any(Function));
            expect(mockCollaborationEngine.signalingService.onClose).toEqual(expect.any(Function));
            expect(mockCollaborationEngine.provider.on).toHaveBeenCalledWith('connection-error', expect.any(Function));
            expect(mockCollaborationEngine.provider.on).toHaveBeenCalledWith('connection-close', expect.any(Function));
            expect(mockCollaborationEngine.persistence.on).toHaveBeenCalledWith('error', expect.any(Function));
        });

        test('should setup global error handlers', () => {
            const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
            const documentAddEventListenerSpy = jest.spyOn(document, 'addEventListener');

            new ErrorHandler(mockCollaborationEngine, mockWebRTCManager, mockPresenceManager, mockOfflineSyncManager);

            expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
            expect(documentAddEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        });
    });

    describe('Error Logging', () => {
        test('should log error with correct format', () => {
            const type = 'TestError';
            const message = 'Test error message';
            const details = { context: 'test' };

            errorHandler.logError(type, message, details);

            expect(errorHandler.errorLog).toHaveLength(1);
            const logEntry = errorHandler.errorLog[0];
            expect(logEntry.type).toBe(type);
            expect(logEntry.message).toBe(message);
            expect(logEntry.details).toBe(details);
            expect(logEntry.id).toMatch(/^error-\d+-/);
            expect(logEntry.timestamp).toBeDefined();
            expect(logEntry.userId).toBe(mockCollaborationEngine.userId);
        });

        test('should enforce error log size limit', () => {
            errorHandler.maxErrorLogSize = 3;

            errorHandler.logError('Error1', 'Message1');
            errorHandler.logError('Error2', 'Message2');
            errorHandler.logError('Error3', 'Message3');
            errorHandler.logError('Error4', 'Message4');

            expect(errorHandler.errorLog).toHaveLength(3);
            expect(errorHandler.errorLog[0].type).toBe('Error2');
            expect(errorHandler.errorLog[2].type).toBe('Error4');
        });

        test('should save error log to localStorage', () => {
            errorHandler.logError('TestError', 'Test message');

            expect(localStorage.setItem).toHaveBeenCalledWith(
                'error-log',
                expect.stringContaining('"errors"')
            );
        });

        test('should load error log from localStorage', () => {
            const mockErrorLog = {
                errors: [
                    { id: 'error1', type: 'TestError', timestamp: new Date().toISOString() }
                ],
                timestamp: Date.now()
            };

            localStorage.getItem.mockReturnValue(JSON.stringify(mockErrorLog));

            errorHandler.loadErrorLog();

            expect(errorHandler.errorLog).toEqual(mockErrorLog.errors);
        });

        test('should filter out old errors when loading', () => {
            const weekAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
            const recent = new Date().toISOString();

            const mockErrorLog = {
                errors: [
                    { id: 'old-error', timestamp: weekAgo },
                    { id: 'recent-error', timestamp: recent }
                ]
            };

            localStorage.getItem.mockReturnValue(JSON.stringify(mockErrorLog));

            errorHandler.loadErrorLog();

            expect(errorHandler.errorLog).toHaveLength(1);
            expect(errorHandler.errorLog[0].id).toBe('recent-error');
        });

        test('should handle localStorage errors gracefully', () => {
            localStorage.setItem.mockImplementation(() => {
                throw new Error('localStorage error');
            });

            // Should not throw
            expect(() => errorHandler.logError('TestError', 'Test message')).not.toThrow();
        });

        test('should clear error log', () => {
            errorHandler.errorLog = [{ id: 'error1' }];

            errorHandler.clearErrorLog();

            expect(errorHandler.errorLog).toEqual([]);
            expect(localStorage.removeItem).toHaveBeenCalledWith('error-log');
        });
    });

    describe('Error Handling', () => {
        test('should handle signaling error', () => {
            const error = new Error('Signaling failed');
            const logErrorSpy = jest.spyOn(errorHandler, 'logError');
            const initiateReconnectionSpy = jest.spyOn(errorHandler, 'initiateReconnection');

            errorHandler.handleSignalingError(error);

            expect(logErrorSpy).toHaveBeenCalledWith('SignalingError', error.message, error);
            expect(initiateReconnectionSpy).toHaveBeenCalledWith('signaling');
        });

        test('should handle signaling disconnection', () => {
            const event = { code: 1006, reason: 'Abnormal closure' };
            const logErrorSpy = jest.spyOn(errorHandler, 'logError');
            const initiateReconnectionSpy = jest.spyOn(errorHandler, 'initiateReconnection');

            errorHandler.handleSignalingDisconnection(event);

            expect(logErrorSpy).toHaveBeenCalledWith('SignalingDisconnection', expect.stringContaining('1006'), event);
            expect(initiateReconnectionSpy).toHaveBeenCalledWith('signaling');
        });

        test('should not reconnect on clean disconnection', () => {
            const event = { code: 1000, reason: 'Normal closure' };
            const initiateReconnectionSpy = jest.spyOn(errorHandler, 'initiateReconnection');

            errorHandler.handleSignalingDisconnection(event);

            expect(initiateReconnectionSpy).not.toHaveBeenCalled();
        });

        test('should handle WebRTC connection failure', () => {
            const userId = 'failed-user';
            const logErrorSpy = jest.spyOn(errorHandler, 'logError');
            
            jest.useFakeTimers();

            errorHandler.handleWebRTCConnectionFailure(userId);

            expect(logErrorSpy).toHaveBeenCalledWith('WebRTCConnectionFailure', expect.stringContaining(userId), { userId });

            // Should attempt to re-establish connection after delay
            jest.advanceTimersByTime(2000);
            expect(mockWebRTCManager.initiateConnection).toHaveBeenCalledWith(userId);

            jest.useRealTimers();
        });

        test('should handle persistence error', () => {
            const error = new Error('Persistence failed');
            const logErrorSpy = jest.spyOn(errorHandler, 'logError');
            const reinitializePersistenceSpy = jest.spyOn(errorHandler, 'reinitializePersistence');

            errorHandler.handlePersistenceError(error);

            expect(logErrorSpy).toHaveBeenCalledWith('PersistenceError', error.message, error);
            expect(reinitializePersistenceSpy).toHaveBeenCalled();
        });

        test('should handle storage quota exceeded', () => {
            const quotaError = new Error('QuotaExceededError');
            quotaError.name = 'QuotaExceededError';
            const handleStorageQuotaExceededSpy = jest.spyOn(errorHandler, 'handleStorageQuotaExceeded');

            errorHandler.handlePersistenceError(quotaError);

            expect(handleStorageQuotaExceededSpy).toHaveBeenCalled();
        });

        test('should handle global errors', () => {
            const error = new Error('Global error');
            const filename = 'test.js';
            const lineno = 42;
            const logErrorSpy = jest.spyOn(errorHandler, 'logError');

            errorHandler.handleGlobalError(error, filename, lineno);

            expect(logErrorSpy).toHaveBeenCalledWith('GlobalError', error.message, {
                error,
                filename,
                lineno,
                stack: error.stack
            });
        });

        test('should handle unhandled promise rejections', () => {
            const reason = new Error('Unhandled rejection');
            const logErrorSpy = jest.spyOn(errorHandler, 'logError');

            errorHandler.handleUnhandledRejection(reason);

            expect(logErrorSpy).toHaveBeenCalledWith('UnhandledRejection', reason.message, { reason });
        });
    });

    describe('Reconnection Logic', () => {
        test('should not start reconnection if already reconnecting', async () => {
            errorHandler.isReconnecting = true;
            const attemptReconnectionSpy = jest.spyOn(errorHandler, 'attemptReconnection');

            await errorHandler.initiateReconnection('test');

            expect(attemptReconnectionSpy).not.toHaveBeenCalled();
        });

        test('should attempt reconnection up to max attempts', async () => {
            errorHandler.maxReconnectionAttempts = 2;
            const isConnectionHealthySpy = jest.spyOn(errorHandler, 'isConnectionHealthy').mockReturnValue(false);
            const attemptReconnectionSpy = jest.spyOn(errorHandler, 'attemptReconnection').mockResolvedValue();

            await errorHandler.initiateReconnection('test');

            expect(attemptReconnectionSpy).toHaveBeenCalledTimes(2);
            expect(errorHandler.reconnectionAttempts).toBe(2);
        });

        test('should succeed reconnection when connection is healthy', async () => {
            const isConnectionHealthySpy = jest.spyOn(errorHandler, 'isConnectionHealthy').mockReturnValue(true);
            const attemptReconnectionSpy = jest.spyOn(errorHandler, 'attemptReconnection').mockResolvedValue();
            const reconnectionSuccessSpy = jest.spyOn(errorHandler, 'reconnectionSuccess');

            await errorHandler.initiateReconnection('test');

            expect(reconnectionSuccessSpy).toHaveBeenCalled();
            expect(errorHandler.isReconnecting).toBe(false);
            expect(errorHandler.reconnectionAttempts).toBe(0);
        });

        test('should fail reconnection after max attempts', async () => {
            errorHandler.maxReconnectionAttempts = 1;
            const isConnectionHealthySpy = jest.spyOn(errorHandler, 'isConnectionHealthy').mockReturnValue(false);
            const attemptReconnectionSpy = jest.spyOn(errorHandler, 'attemptReconnection').mockResolvedValue();
            const reconnectionFailedSpy = jest.spyOn(errorHandler, 'reconnectionFailed');

            await errorHandler.initiateReconnection('test');

            expect(reconnectionFailedSpy).toHaveBeenCalled();
            expect(errorHandler.isReconnecting).toBe(false);
        });

        test('should attempt to reconnect signaling service', async () => {
            mockCollaborationEngine.signalingService.connected = false;

            await errorHandler.attemptReconnection();

            expect(mockCollaborationEngine.signalingService.connect).toHaveBeenCalled();
        });

        test('should attempt to reconnect Y.js provider', async () => {
            mockCollaborationEngine.provider.synced = false;
            const waitForYjsSyncSpy = jest.spyOn(errorHandler, 'waitForYjsSync').mockResolvedValue();

            await errorHandler.attemptReconnection();

            expect(mockCollaborationEngine.provider.connect).toHaveBeenCalled();
            expect(waitForYjsSyncSpy).toHaveBeenCalled();
        });

        test('should update presence after reconnection', async () => {
            await errorHandler.attemptReconnection();

            expect(mockPresenceManager.updateLocalPresence).toHaveBeenCalledWith('active');
        });

        test('should trigger offline sync after reconnection', async () => {
            await errorHandler.attemptReconnection();

            expect(mockOfflineSyncManager.forceSyncNow).toHaveBeenCalled();
        });

        test('should check connection health', () => {
            mockCollaborationEngine.signalingService.connected = true;
            mockCollaborationEngine.provider.synced = true;
            navigator.onLine = true;

            const isHealthy = errorHandler.isConnectionHealthy();

            expect(isHealthy).toBe(true);
        });

        test('should detect unhealthy connection', () => {
            mockCollaborationEngine.signalingService.connected = false;

            const isHealthy = errorHandler.isConnectionHealthy();

            expect(isHealthy).toBe(false);
        });

        test('should stop reconnection manually', () => {
            errorHandler.isReconnecting = true;
            const logErrorSpy = jest.spyOn(errorHandler, 'logError');

            errorHandler.stopReconnection();

            expect(errorHandler.isReconnecting).toBe(false);
            expect(logErrorSpy).toHaveBeenCalledWith('ReconnectionStopped', 'Reconnection stopped manually');
        });
    });

    describe('Health Monitoring', () => {
        test('should start health monitoring', () => {
            jest.useFakeTimers();

            errorHandler.startHealthMonitoring(1000);

            expect(errorHandler.healthMonitorInterval).not.toBeNull();

            jest.useRealTimers();
        });

        test('should stop health monitoring', () => {
            jest.useFakeTimers();

            errorHandler.startHealthMonitoring(1000);
            errorHandler.stopHealthMonitoring();

            expect(errorHandler.healthMonitorInterval).toBeNull();

            jest.useRealTimers();
        });

        test('should perform health check', () => {
            mockCollaborationEngine.signalingService.connected = true;
            mockCollaborationEngine.provider.synced = true;
            mockWebRTCManager.getConnectedUsers = jest.fn(() => ['user1', 'user2']);
            mockOfflineSyncManager.getPendingOperations = jest.fn(() => []);
            const getRecentErrorCountSpy = jest.spyOn(errorHandler, 'getRecentErrorCount').mockReturnValue(2);

            const health = errorHandler.performHealthCheck();

            expect(health).toMatchObject({
                timestamp: expect.any(Number),
                online: navigator.onLine,
                signalingConnected: true,
                yjsSynced: true,
                webrtcConnections: 2,
                pendingOperations: 0,
                errorCount: 2
            });
        });

        test('should trigger reconnection on health check failure', () => {
            mockCollaborationEngine.signalingService.connected = false;
            navigator.onLine = true;
            const initiateReconnectionSpy = jest.spyOn(errorHandler, 'initiateReconnection');

            errorHandler.performHealthCheck();

            expect(initiateReconnectionSpy).toHaveBeenCalledWith('health-check');
        });
    });

    describe('Recovery Actions', () => {
        test('should reinitialize persistence', async () => {
            const IndexeddbPersistenceMock = jest.fn();
            global.IndexeddbPersistence = IndexeddbPersistenceMock;

            const oldDestroy = mockCollaborationEngine.persistence.destroy;
            await errorHandler.reinitializePersistence();

            expect(oldDestroy).toHaveBeenCalled();
            expect(IndexeddbPersistenceMock).toHaveBeenCalled();
        });

        test('should reset application', async () => {
            const clearErrorLogSpy = jest.spyOn(errorHandler, 'clearErrorLog');

            await errorHandler.resetApplication();

            expect(clearErrorLogSpy).toHaveBeenCalled();
            expect(mockOfflineSyncManager.clearOfflineData).toHaveBeenCalled();
        });

        test('should force manual reconnect', () => {
            const stopReconnectionSpy = jest.spyOn(errorHandler, 'stopReconnection');
            const initiateReconnectionSpy = jest.spyOn(errorHandler, 'initiateReconnection');

            errorHandler.forceReconnect();

            expect(stopReconnectionSpy).toHaveBeenCalled();
            expect(initiateReconnectionSpy).toHaveBeenCalledWith('manual');
        });

        test('should retry failed operations', () => {
            errorHandler.retryFailedOperations();

            expect(mockOfflineSyncManager.retryFailedOperations).toHaveBeenCalled();
        });
    });

    describe('Utility Methods', () => {
        test('should generate unique error IDs', () => {
            const id1 = errorHandler.generateErrorId();
            const id2 = errorHandler.generateErrorId();

            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^error-\d+-/);
            expect(id2).toMatch(/^error-\d+-/);
        });

        test('should get recent error count', () => {
            const now = Date.now();
            const recentTime = new Date(now - 30 * 60 * 1000).toISOString(); // 30 minutes ago
            const oldTime = new Date(now - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

            errorHandler.errorLog = [
                { timestamp: recentTime },
                { timestamp: oldTime },
                { timestamp: recentTime }
            ];

            const recentCount = errorHandler.getRecentErrorCount(1); // 1 hour window

            expect(recentCount).toBe(2);
        });

        test('should get error log copy', () => {
            const errors = [{ id: 'error1' }, { id: 'error2' }];
            errorHandler.errorLog = errors;

            const logCopy = errorHandler.getErrorLog();

            expect(logCopy).toEqual(errors);
            expect(logCopy).not.toBe(errors); // Should be a copy
        });

        test('should get connection status', () => {
            errorHandler.isReconnecting = true;
            errorHandler.reconnectionAttempts = 3;
            errorHandler.errorLog = [{ id: 'latest-error' }];

            const status = errorHandler.getConnectionStatus();

            expect(status).toMatchObject({
                isReconnecting: true,
                reconnectionAttempts: 3,
                isHealthy: expect.any(Boolean),
                lastError: { id: 'latest-error' },
                errorCount: 1
            });
        });
    });

    describe('Cleanup', () => {
        test('should destroy and clean up resources', () => {
            const stopHealthMonitoringSpy = jest.spyOn(errorHandler, 'stopHealthMonitoring');
            const stopReconnectionSpy = jest.spyOn(errorHandler, 'stopReconnection');
            const saveErrorLogSpy = jest.spyOn(errorHandler, 'saveErrorLog');

            errorHandler.destroy();

            expect(stopHealthMonitoringSpy).toHaveBeenCalled();
            expect(stopReconnectionSpy).toHaveBeenCalled();
            expect(saveErrorLogSpy).toHaveBeenCalled();
        });
    });
});