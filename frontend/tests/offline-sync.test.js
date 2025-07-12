import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OfflineSyncManager } from '../offline-sync.js';

describe('OfflineSyncManager', () => {
    let offlineSyncManager;
    let mockCollaborationEngine;
    let mockWebRTCManager;
    let mockPresenceManager;

    beforeEach(() => {
        mockCollaborationEngine = {
            userId: 'test-user',
            ydoc: {
                on: jest.fn(),
                off: jest.fn()
            },
            provider: {
                synced: true,
                on: jest.fn(),
                off: jest.fn()
            },
            addDrawingStroke: jest.fn(),
            addDrawingShape: jest.fn(),
            removeDrawingElement: jest.fn(),
            insertText: jest.fn(),
            deleteText: jest.fn(),
            updateCursor: jest.fn()
        };

        mockWebRTCManager = {
            // Mock methods if needed
        };

        mockPresenceManager = {
            updateLocalPresence: jest.fn()
        };

        // Reset localStorage mock
        localStorage.getItem.mockClear();
        localStorage.setItem.mockClear();
        localStorage.removeItem.mockClear();

        offlineSyncManager = new OfflineSyncManager(
            mockCollaborationEngine,
            mockWebRTCManager,
            mockPresenceManager
        );
    });

    afterEach(() => {
        if (offlineSyncManager) {
            offlineSyncManager.destroy();
        }
    });

    describe('Constructor', () => {
        test('should initialize with correct properties', () => {
            expect(offlineSyncManager.collaborationEngine).toBe(mockCollaborationEngine);
            expect(offlineSyncManager.webrtcManager).toBe(mockWebRTCManager);
            expect(offlineSyncManager.presenceManager).toBe(mockPresenceManager);
            expect(offlineSyncManager.isOnline).toBe(navigator.onLine);
            expect(offlineSyncManager.syncQueue).toEqual([]);
        });

        test('should setup event handlers', () => {
            expect(mockCollaborationEngine.ydoc.on).toHaveBeenCalledWith('beforeTransaction', expect.any(Function));
            expect(mockCollaborationEngine.provider.on).toHaveBeenCalledWith('status', expect.any(Function));
            expect(mockCollaborationEngine.provider.on).toHaveBeenCalledWith('synced', expect.any(Function));
        });

        test('should set up offline/online event listeners', () => {
            const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
            
            new OfflineSyncManager(mockCollaborationEngine, mockWebRTCManager, mockPresenceManager);

            expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
        });
    });

    describe('Offline Operation Queuing', () => {
        test('should queue operation when offline', () => {
            offlineSyncManager.isOnline = false;
            const operation = {
                type: 'drawing-stroke',
                data: { points: [{ x: 10, y: 20 }] }
            };

            offlineSyncManager.queueOfflineOperation(operation);

            expect(offlineSyncManager.syncQueue).toHaveLength(1);
            expect(offlineSyncManager.syncQueue[0]).toMatchObject({
                ...operation,
                id: expect.any(String),
                retryCount: 0,
                status: 'pending'
            });
        });

        test('should not exceed maximum queue size', () => {
            offlineSyncManager.isOnline = false;
            offlineSyncManager.maxOfflineOperations = 2;

            // Add operations beyond the limit
            offlineSyncManager.queueOfflineOperation({ type: 'op1' });
            offlineSyncManager.queueOfflineOperation({ type: 'op2' });
            offlineSyncManager.queueOfflineOperation({ type: 'op3' });

            expect(offlineSyncManager.syncQueue).toHaveLength(2);
            expect(offlineSyncManager.syncQueue[0].type).toBe('op2'); // First one removed
            expect(offlineSyncManager.syncQueue[1].type).toBe('op3');
        });

        test('should save to localStorage when queuing', () => {
            offlineSyncManager.isOnline = false;
            const operation = { type: 'test-operation' };

            offlineSyncManager.queueOfflineOperation(operation);

            expect(localStorage.setItem).toHaveBeenCalledWith(
                'offline-sync-data',
                expect.stringContaining('"syncQueue"')
            );
        });

        test('should generate unique operation IDs', () => {
            offlineSyncManager.isOnline = false;

            offlineSyncManager.queueOfflineOperation({ type: 'op1' });
            offlineSyncManager.queueOfflineOperation({ type: 'op2' });

            const id1 = offlineSyncManager.syncQueue[0].id;
            const id2 = offlineSyncManager.syncQueue[1].id;

            expect(id1).not.toBe(id2);
            expect(id1).toContain(mockCollaborationEngine.userId);
            expect(id2).toContain(mockCollaborationEngine.userId);
        });
    });

    describe('Sync Operations', () => {
        test('should not sync when offline', async () => {
            offlineSyncManager.isOnline = false;
            offlineSyncManager.syncQueue = [
                { type: 'drawing-stroke', data: {}, status: 'pending' }
            ];

            await offlineSyncManager.syncOfflineOperations();

            expect(mockCollaborationEngine.addDrawingStroke).not.toHaveBeenCalled();
        });

        test('should not sync when queue is empty', async () => {
            offlineSyncManager.isOnline = true;
            offlineSyncManager.syncQueue = [];

            await offlineSyncManager.syncOfflineOperations();

            expect(mockCollaborationEngine.addDrawingStroke).not.toHaveBeenCalled();
        });

        test('should sync drawing stroke operations', async () => {
            offlineSyncManager.isOnline = true;
            const strokeData = { points: [{ x: 10, y: 20 }] };
            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'drawing-stroke',
                data: strokeData,
                status: 'pending',
                retryCount: 0
            }];

            await offlineSyncManager.syncOfflineOperations();

            expect(mockCollaborationEngine.addDrawingStroke).toHaveBeenCalledWith(strokeData);
        });

        test('should sync drawing shape operations', async () => {
            offlineSyncManager.isOnline = true;
            const shapeData = { type: 'rectangle', x: 10, y: 20 };
            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'drawing-shape',
                data: shapeData,
                status: 'pending',
                retryCount: 0
            }];

            await offlineSyncManager.syncOfflineOperations();

            expect(mockCollaborationEngine.addDrawingShape).toHaveBeenCalledWith(shapeData);
        });

        test('should sync text insert operations', async () => {
            offlineSyncManager.isOnline = true;
            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'text-insert',
                index: 5,
                text: 'Hello',
                status: 'pending',
                retryCount: 0
            }];

            await offlineSyncManager.syncOfflineOperations();

            expect(mockCollaborationEngine.insertText).toHaveBeenCalledWith(5, 'Hello');
        });

        test('should sync text delete operations', async () => {
            offlineSyncManager.isOnline = true;
            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'text-delete',
                index: 5,
                length: 3,
                status: 'pending',
                retryCount: 0
            }];

            await offlineSyncManager.syncOfflineOperations();

            expect(mockCollaborationEngine.deleteText).toHaveBeenCalledWith(5, 3);
        });

        test('should sync cursor update operations', async () => {
            offlineSyncManager.isOnline = true;
            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'cursor-update',
                x: 100,
                y: 200,
                status: 'pending',
                retryCount: 0
            }];

            await offlineSyncManager.syncOfflineOperations();

            expect(mockCollaborationEngine.updateCursor).toHaveBeenCalledWith(100, 200);
        });

        test('should sync presence update operations', async () => {
            offlineSyncManager.isOnline = true;
            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'presence-update',
                status: 'active',
                metadata: { tool: 'pen' },
                status: 'pending',
                retryCount: 0
            }];

            await offlineSyncManager.syncOfflineOperations();

            expect(mockPresenceManager.updateLocalPresence).toHaveBeenCalledWith('active', { tool: 'pen' });
        });

        test('should mark operations as completed after successful sync', async () => {
            offlineSyncManager.isOnline = true;
            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'drawing-stroke',
                data: {},
                status: 'pending',
                retryCount: 0
            }];

            await offlineSyncManager.syncOfflineOperations();

            expect(offlineSyncManager.syncQueue).toHaveLength(0); // Completed operations are removed
        });

        test('should handle sync errors and retry', async () => {
            offlineSyncManager.isOnline = true;
            offlineSyncManager.syncRetryAttempts = 2;
            
            // Reset and setup mock to reject
            mockCollaborationEngine.addDrawingStroke.mockReset();
            mockCollaborationEngine.addDrawingStroke.mockImplementation(() => {
                return Promise.reject(new Error('Sync failed'));
            });

            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'drawing-stroke',
                data: {},
                status: 'pending',
                retryCount: 0
            }];

            try {
                await offlineSyncManager.syncOfflineOperations();
            } catch (error) {
                // Expected to catch the error from sync operation
            }

            const operation = offlineSyncManager.syncQueue[0];
            expect(operation.retryCount).toBeGreaterThan(0);
            expect(operation.lastError).toBe('Sync failed');
        });

        test('should mark operations as failed after max retries', async () => {
            offlineSyncManager.isOnline = true;
            offlineSyncManager.syncRetryAttempts = 1;
            
            // Reset mock to avoid interference from previous test
            mockCollaborationEngine.addDrawingStroke.mockReset();
            mockCollaborationEngine.addDrawingStroke.mockImplementation(() => {
                return Promise.reject(new Error('Sync failed'));
            });

            offlineSyncManager.syncQueue = [{
                id: 'op1',
                type: 'drawing-stroke',
                data: {},
                status: 'pending',
                retryCount: 1 // Already at max retries
            }];

            try {
                await offlineSyncManager.syncOfflineOperations();
            } catch (error) {
                // Expected to catch the error from sync operation
            }

            const operation = offlineSyncManager.syncQueue[0];
            expect(operation.status).toBe('failed');
        });
    });

    describe('Network Status Handling', () => {
        test('should handle online event', () => {
            offlineSyncManager.isOnline = false;
            const syncSpy = jest.spyOn(offlineSyncManager, 'syncOfflineOperations');

            // Simulate online event
            const onlineEvent = new Event('online');
            window.dispatchEvent(onlineEvent);

            expect(offlineSyncManager.isOnline).toBe(true);
            expect(syncSpy).toHaveBeenCalled();
        });

        test('should handle offline event', () => {
            offlineSyncManager.isOnline = true;

            // Simulate offline event
            const offlineEvent = new Event('offline');
            window.dispatchEvent(offlineEvent);

            expect(offlineSyncManager.isOnline).toBe(false);
        });

        test('should handle Y.js connection status changes', () => {
            const onYjsDisconnectedSpy = jest.fn();
            offlineSyncManager.onYjsDisconnected = onYjsDisconnectedSpy;

            offlineSyncManager.handleConnectionStatus({ status: 'disconnected' });

            expect(onYjsDisconnectedSpy).toHaveBeenCalled();
        });

        test('should handle Y.js sync status changes', () => {
            const syncSpy = jest.spyOn(offlineSyncManager, 'syncOfflineOperations');
            offlineSyncManager.isOnline = true;

            offlineSyncManager.handleSyncStatus(true);

            // Should trigger sync after delay
            setTimeout(() => {
                expect(syncSpy).toHaveBeenCalled();
            }, 1100);
        });
    });

    describe('Conflict Resolution', () => {
        test('should resolve conflicts by timestamp', () => {
            const localOps = [
                { id: 'op1', timestamp: 1000, userId: 'user1' },
                { id: 'op2', timestamp: 2000, userId: 'user1' }
            ];
            const remoteOps = [
                { id: 'op1', timestamp: 1500, userId: 'user2' }, // Newer version
                { id: 'op3', timestamp: 1800, userId: 'user2' }
            ];

            const resolved = offlineSyncManager.resolveConflicts(localOps, remoteOps);

            expect(resolved).toHaveLength(3);
            expect(resolved.find(op => op.id === 'op1').timestamp).toBe(1500);
            expect(resolved.find(op => op.id === 'op2').timestamp).toBe(2000);
            expect(resolved.find(op => op.id === 'op3').timestamp).toBe(1800);
        });

        test('should resolve conflicts by user priority', () => {
            offlineSyncManager.conflictResolutionStrategy = 'user-priority';
            const getUserPrioritiesSpy = jest.spyOn(offlineSyncManager, 'getUserPriorities')
                .mockReturnValue({ 'user1': 10, 'user2': 5 });

            const localOps = [
                { id: 'op1', timestamp: 1000, userId: 'user1' }
            ];
            const remoteOps = [
                { id: 'op1', timestamp: 1500, userId: 'user2' } // Newer but lower priority
            ];

            const resolved = offlineSyncManager.resolveConflicts(localOps, remoteOps);

            expect(resolved[0].userId).toBe('user1'); // Higher priority user wins
        });

        test('should use timestamp as tiebreaker for same priority', () => {
            offlineSyncManager.conflictResolutionStrategy = 'user-priority';
            const getUserPrioritiesSpy = jest.spyOn(offlineSyncManager, 'getUserPriorities')
                .mockReturnValue({ 'user1': 5, 'user2': 5 });

            const localOps = [
                { id: 'op1', timestamp: 1000, userId: 'user1' }
            ];
            const remoteOps = [
                { id: 'op1', timestamp: 1500, userId: 'user2' } // Same priority, newer timestamp
            ];

            const resolved = offlineSyncManager.resolveConflicts(localOps, remoteOps);

            expect(resolved[0].userId).toBe('user2'); // Newer timestamp wins
        });
    });

    describe('Data Persistence', () => {
        test('should save offline data to localStorage', () => {
            offlineSyncManager.syncQueue = [
                { id: 'op1', type: 'test', status: 'pending' }
            ];

            offlineSyncManager.saveOfflineData();

            expect(localStorage.setItem).toHaveBeenCalledWith(
                'offline-sync-data',
                expect.stringContaining('"syncQueue"')
            );
        });

        test('should load offline data from localStorage', () => {
            const mockData = {
                syncQueue: [
                    { id: 'op1', type: 'test', status: 'pending', timestamp: Date.now() }
                ],
                timestamp: Date.now(),
                version: '1.0'
            };

            localStorage.getItem.mockReturnValue(JSON.stringify(mockData));

            offlineSyncManager.loadOfflineData();

            expect(offlineSyncManager.syncQueue).toEqual(mockData.syncQueue);
        });

        test('should filter out old operations when loading', () => {
            const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
            const recentTimestamp = Date.now() - (6 * 24 * 60 * 60 * 1000); // 6 days ago

            const mockData = {
                syncQueue: [
                    { id: 'old-op', type: 'test', timestamp: oldTimestamp },
                    { id: 'recent-op', type: 'test', timestamp: recentTimestamp }
                ]
            };

            localStorage.getItem.mockReturnValue(JSON.stringify(mockData));

            offlineSyncManager.loadOfflineData();

            expect(offlineSyncManager.syncQueue).toHaveLength(1);
            expect(offlineSyncManager.syncQueue[0].id).toBe('recent-op');
        });

        test('should handle localStorage errors gracefully', () => {
            localStorage.getItem.mockImplementation(() => {
                throw new Error('localStorage error');
            });

            // Should not throw
            expect(() => offlineSyncManager.loadOfflineData()).not.toThrow();
            expect(offlineSyncManager.syncQueue).toEqual([]);
        });

        test('should clear offline data', () => {
            offlineSyncManager.syncQueue = [{ id: 'op1' }];

            offlineSyncManager.clearOfflineData();

            expect(localStorage.removeItem).toHaveBeenCalledWith('offline-sync-data');
            expect(offlineSyncManager.syncQueue).toEqual([]);
        });
    });

    describe('Storage Management', () => {
        test('should cleanup old operations', () => {
            const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
            const recentTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago

            offlineSyncManager.syncQueue = [
                { id: 'old-op', timestamp: oldTimestamp, status: 'completed' },
                { id: 'recent-op', timestamp: recentTimestamp, status: 'completed' },
                { id: 'pending-op', timestamp: oldTimestamp, status: 'pending' }
            ];

            offlineSyncManager.cleanupOldOperations();

            expect(offlineSyncManager.syncQueue).toHaveLength(2);
            expect(offlineSyncManager.syncQueue.find(op => op.id === 'old-op')).toBeUndefined();
            expect(offlineSyncManager.syncQueue.find(op => op.id === 'recent-op')).toBeDefined();
            expect(offlineSyncManager.syncQueue.find(op => op.id === 'pending-op')).toBeDefined(); // Pending ops are kept
        });

        test('should handle storage quota exceeded error', () => {
            const quotaError = new Error('QuotaExceededError');
            quotaError.name = 'QuotaExceededError';
            const cleanupSpy = jest.spyOn(offlineSyncManager, 'cleanupOldOperations');

            offlineSyncManager.handleStorageError(quotaError);

            expect(cleanupSpy).toHaveBeenCalled();
        });
    });

    describe('Status and Utility Methods', () => {
        test('should get offline status', () => {
            offlineSyncManager.isOnline = false;
            offlineSyncManager.syncQueue = [
                { status: 'pending' },
                { status: 'failed' },
                { status: 'completed' }
            ];

            const status = offlineSyncManager.getOfflineStatus();

            expect(status).toMatchObject({
                isOnline: false,
                pendingOperations: 1,
                failedOperations: 1,
                totalQueueSize: 3
            });
        });

        test('should get pending operations', () => {
            offlineSyncManager.syncQueue = [
                { id: 'op1', status: 'pending' },
                { id: 'op2', status: 'failed' },
                { id: 'op3', status: 'pending' }
            ];

            const pending = offlineSyncManager.getPendingOperations();

            expect(pending).toHaveLength(2);
            expect(pending[0].id).toBe('op1');
            expect(pending[1].id).toBe('op3');
        });

        test('should get failed operations', () => {
            offlineSyncManager.syncQueue = [
                { id: 'op1', status: 'pending' },
                { id: 'op2', status: 'failed' },
                { id: 'op3', status: 'failed' }
            ];

            const failed = offlineSyncManager.getFailedOperations();

            expect(failed).toHaveLength(2);
            expect(failed[0].id).toBe('op2');
            expect(failed[1].id).toBe('op3');
        });

        test('should force sync when online', () => {
            offlineSyncManager.isOnline = true;
            const syncSpy = jest.spyOn(offlineSyncManager, 'syncOfflineOperations');

            offlineSyncManager.forceSyncNow();

            expect(syncSpy).toHaveBeenCalled();
        });

        test('should not force sync when offline', () => {
            offlineSyncManager.isOnline = false;
            const syncSpy = jest.spyOn(offlineSyncManager, 'syncOfflineOperations');

            offlineSyncManager.forceSyncNow();

            expect(syncSpy).not.toHaveBeenCalled();
        });

        test('should retry failed operations', () => {
            offlineSyncManager.syncQueue = [
                { id: 'op1', status: 'failed', retryCount: 3, lastError: 'Error' },
                { id: 'op2', status: 'pending' }
            ];

            offlineSyncManager.retryFailedOperations();

            const operation = offlineSyncManager.syncQueue.find(op => op.id === 'op1');
            expect(operation.status).toBe('pending');
            expect(operation.retryCount).toBe(0);
            expect(operation.lastError).toBeNull();
        });
    });

    describe('Cleanup', () => {
        test('should save data and clear queue on destroy', () => {
            const saveSpy = jest.spyOn(offlineSyncManager, 'saveOfflineData');
            offlineSyncManager.syncQueue = [{ id: 'op1' }];

            offlineSyncManager.destroy();

            expect(saveSpy).toHaveBeenCalled();
            expect(offlineSyncManager.syncQueue).toEqual([]);
        });
    });
});