import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WhiteboardCore, SignalingService } from '../core-integration.js';

// Mock the component modules
jest.unstable_mockModule('../collaboration.js', () => ({
    CollaborationEngine: jest.fn()
}));

jest.unstable_mockModule('../webrtc.js', () => ({
    WebRTCManager: jest.fn()
}));

jest.unstable_mockModule('../presence.js', () => ({
    PresenceManager: jest.fn()
}));

jest.unstable_mockModule('../offline-sync.js', () => ({
    OfflineSyncManager: jest.fn()
}));

jest.unstable_mockModule('../error-handler.js', () => ({
    ErrorHandler: jest.fn()
}));

describe('WhiteboardCore', () => {
    let whiteboardCore;
    let mockCollaboration;
    let mockWebRTC;
    let mockPresence;
    let mockOfflineSync;
    let mockErrorHandler;
    let mockSignaling;

    beforeEach(async () => {
        // Import mocked modules
        const { CollaborationEngine } = await import('../collaboration.js');
        const { WebRTCManager } = await import('../webrtc.js');
        const { PresenceManager } = await import('../presence.js');
        const { OfflineSyncManager } = await import('../offline-sync.js');
        const { ErrorHandler } = await import('../error-handler.js');

        // Create mock instances
        mockSignaling = {
            connect: jest.fn().mockResolvedValue(),
            disconnect: jest.fn(),
            joinRoom: jest.fn().mockResolvedValue(),
            leaveRoom: jest.fn().mockResolvedValue(),
            send: jest.fn(),
            onMessage: jest.fn(),
            connected: true,
            onError: null,
            onClose: null
        };

        mockCollaboration = {
            connect: jest.fn(),
            disconnect: jest.fn(),
            addDrawingStroke: jest.fn(),
            addDrawingShape: jest.fn(),
            removeDrawingElement: jest.fn(),
            clearDrawing: jest.fn(),
            getDrawingElements: jest.fn(() => []),
            insertText: jest.fn(),
            deleteText: jest.fn(),
            getText: jest.fn(() => ''),
            updateCursor: jest.fn(),
            hideCursor: jest.fn(),
            destroy: jest.fn(),
            provider: { 
                synced: true,
                on: jest.fn() 
            },
            signalingService: mockSignaling,
            persistence: {
                destroy: jest.fn(),
                on: jest.fn()
            }
        };

        mockWebRTC = {
            sendData: jest.fn(() => true),
            broadcastData: jest.fn(() => ({ user1: true, user2: true })),
            getConnectionState: jest.fn(() => 'connected'),
            getConnectedUsers: jest.fn(() => ['user1', 'user2']),
            destroy: jest.fn(),
            onConnectionStateChange: null,
            onDataChannelOpen: null,
            onDataChannelClose: null,
            onDataChannelMessage: null
        };

        mockPresence = {
            updateLocalCursor: jest.fn(),
            hideLocalCursor: jest.fn(),
            showLocalCursor: jest.fn(),
            getRemoteCursors: jest.fn(() => ({})),
            updateLocalPresence: jest.fn(),
            getUserPresence: jest.fn(),
            getAllPresence: jest.fn(() => ({})),
            getConnectedUsers: jest.fn(() => ['user1', 'user2']),
            getUserCount: jest.fn(() => 3),
            startTyping: jest.fn(),
            stopTyping: jest.fn(),
            setupActivityTracking: jest.fn(),
            recordActivity: jest.fn(),
            destroy: jest.fn(),
            onRemoteCursorUpdate: null,
            onUserJoined: null,
            onUserLeft: null,
            onUserPresenceUpdate: null
        };

        mockOfflineSync = {
            getOfflineStatus: jest.fn(() => ({ isOnline: true })),
            getPendingOperations: jest.fn(() => []),
            forceSyncNow: jest.fn(),
            retryFailedOperations: jest.fn(),
            destroy: jest.fn(),
            onNetworkOnline: null,
            onNetworkOffline: null,
            onSyncCompleted: null,
            onOperationFailed: null
        };

        mockErrorHandler = {
            getConnectionStatus: jest.fn(() => ({ isReconnecting: false })),
            getErrorLog: jest.fn(() => []),
            clearErrorLog: jest.fn(),
            forceReconnect: jest.fn(),
            getRecentErrorCount: jest.fn(() => 0),
            startHealthMonitoring: jest.fn(),
            destroy: jest.fn(),
            onReconnectionStarted: null,
            onReconnectionSuccess: null,
            onReconnectionFailed: null,
            onHealthCheck: null
        };


        // Setup constructor mocks
        CollaborationEngine.mockReturnValue(mockCollaboration);
        WebRTCManager.mockReturnValue(mockWebRTC);
        PresenceManager.mockReturnValue(mockPresence);
        OfflineSyncManager.mockReturnValue(mockOfflineSync);
        ErrorHandler.mockReturnValue(mockErrorHandler);

        const config = {
            roomId: 'test-room',
            userId: 'test-user',
            websocketUrl: 'ws://test.com',
            signalingUrls: ['ws://signal.com']
        };

        whiteboardCore = new WhiteboardCore(config);
        whiteboardCore.components.signaling = mockSignaling;
    });

    afterEach(() => {
        if (whiteboardCore) {
            whiteboardCore.destroy();
        }
    });

    describe('Constructor', () => {
        test('should initialize with correct configuration', () => {
            expect(whiteboardCore.config.roomId).toBe('test-room');
            expect(whiteboardCore.config.userId).toBe('test-user');
            expect(whiteboardCore.config.websocketUrl).toBe('ws://test.com');
            expect(whiteboardCore.config.maxUsers).toBe(8);
        });

        test('should initialize all components', () => {
            expect(whiteboardCore.components.collaboration).toBe(mockCollaboration);
            expect(whiteboardCore.components.webrtc).toBe(mockWebRTC);
            expect(whiteboardCore.components.presence).toBe(mockPresence);
            expect(whiteboardCore.components.offlineSync).toBe(mockOfflineSync);
            expect(whiteboardCore.components.errorHandler).toBe(mockErrorHandler);
        });

        test('should setup component integration', () => {
            expect(mockPresence.setupActivityTracking).toHaveBeenCalled();
            expect(mockErrorHandler.startHealthMonitoring).toHaveBeenCalled();
        });

        test('should not be initialized by default', () => {
            expect(whiteboardCore.isInitialized).toBe(false);
        });
    });

    describe('Connection Management', () => {
        test('should connect successfully', async () => {
            await whiteboardCore.connect();

            expect(mockSignaling.connect).toHaveBeenCalled();
            expect(mockSignaling.joinRoom).toHaveBeenCalledWith('test-room', 'test-user');
            expect(mockCollaboration.connect).toHaveBeenCalled();
            expect(mockPresence.updateLocalPresence).toHaveBeenCalledWith('active');
            expect(whiteboardCore.isInitialized).toBe(true);
        });

        test('should not connect if already initialized', async () => {
            whiteboardCore.isInitialized = true;

            await expect(whiteboardCore.connect()).rejects.toThrow('Already connected');
        });

        test('should handle connection errors', async () => {
            const error = new Error('Connection failed');
            mockSignaling.connect.mockRejectedValue(error);
            const onConnectionErrorSpy = jest.fn();
            whiteboardCore.onConnectionError = onConnectionErrorSpy;

            await expect(whiteboardCore.connect()).rejects.toThrow('Connection failed');
            expect(onConnectionErrorSpy).toHaveBeenCalledWith(error);
        });

        test('should disconnect successfully', async () => {
            whiteboardCore.isInitialized = true;

            await whiteboardCore.disconnect();

            expect(mockSignaling.leaveRoom).toHaveBeenCalledWith('test-room');
            expect(mockCollaboration.disconnect).toHaveBeenCalled();
            expect(mockWebRTC.destroy).toHaveBeenCalled();
            expect(mockSignaling.disconnect).toHaveBeenCalled();
            expect(whiteboardCore.isInitialized).toBe(false);
        });

        test('should handle disconnection when not initialized', async () => {
            whiteboardCore.isInitialized = false;

            // Should not throw or attempt to disconnect
            await expect(whiteboardCore.disconnect()).resolves.toBeUndefined();
            expect(mockSignaling.leaveRoom).not.toHaveBeenCalled();
        });

        test('should handle disconnection errors', async () => {
            whiteboardCore.isInitialized = true;
            const error = new Error('Disconnection failed');
            mockSignaling.leaveRoom.mockRejectedValue(error);
            const onDisconnectionErrorSpy = jest.fn();
            whiteboardCore.onDisconnectionError = onDisconnectionErrorSpy;

            await expect(whiteboardCore.disconnect()).rejects.toThrow('Disconnection failed');
            expect(onDisconnectionErrorSpy).toHaveBeenCalledWith(error);
        });
    });

    describe('Drawing Operations', () => {
        test('should add drawing stroke', () => {
            const stroke = { points: [{ x: 10, y: 20 }] };

            whiteboardCore.addDrawingStroke(stroke);

            expect(mockCollaboration.addDrawingStroke).toHaveBeenCalledWith(stroke);
            expect(mockPresence.recordActivity).toHaveBeenCalled();
        });

        test('should add drawing shape', () => {
            const shape = { type: 'rectangle', x: 10, y: 20 };

            whiteboardCore.addDrawingShape(shape);

            expect(mockCollaboration.addDrawingShape).toHaveBeenCalledWith(shape);
            expect(mockPresence.recordActivity).toHaveBeenCalled();
        });

        test('should remove drawing element', () => {
            const elementId = 'element-123';

            whiteboardCore.removeDrawingElement(elementId);

            expect(mockCollaboration.removeDrawingElement).toHaveBeenCalledWith(elementId);
            expect(mockPresence.recordActivity).toHaveBeenCalled();
        });

        test('should clear drawing', () => {
            whiteboardCore.clearDrawing();

            expect(mockCollaboration.clearDrawing).toHaveBeenCalled();
            expect(mockPresence.recordActivity).toHaveBeenCalled();
        });

        test('should get drawing elements', () => {
            const elements = [{ id: '1', type: 'stroke' }];
            mockCollaboration.getDrawingElements.mockReturnValue(elements);

            const result = whiteboardCore.getDrawingElements();

            expect(result).toBe(elements);
            expect(mockCollaboration.getDrawingElements).toHaveBeenCalled();
        });
    });

    describe('Text Operations', () => {
        test('should insert text', () => {
            whiteboardCore.insertText(5, 'Hello');

            expect(mockCollaboration.insertText).toHaveBeenCalledWith(5, 'Hello');
            expect(mockPresence.recordActivity).toHaveBeenCalled();
        });

        test('should delete text', () => {
            whiteboardCore.deleteText(5, 3);

            expect(mockCollaboration.deleteText).toHaveBeenCalledWith(5, 3);
            expect(mockPresence.recordActivity).toHaveBeenCalled();
        });

        test('should get text', () => {
            const text = 'Hello, World!';
            mockCollaboration.getText.mockReturnValue(text);

            const result = whiteboardCore.getText();

            expect(result).toBe(text);
            expect(mockCollaboration.getText).toHaveBeenCalled();
        });
    });

    describe('Cursor Operations', () => {
        test('should update cursor', () => {
            whiteboardCore.updateCursor(100, 200);

            expect(mockPresence.updateLocalCursor).toHaveBeenCalledWith(100, 200);
        });

        test('should hide cursor', () => {
            whiteboardCore.hideCursor();

            expect(mockPresence.hideLocalCursor).toHaveBeenCalled();
        });

        test('should show cursor', () => {
            whiteboardCore.showCursor();

            expect(mockPresence.showLocalCursor).toHaveBeenCalled();
        });

        test('should get remote cursors', () => {
            const cursors = { user1: { x: 10, y: 20 } };
            mockPresence.getRemoteCursors.mockReturnValue(cursors);

            const result = whiteboardCore.getRemoteCursors();

            expect(result).toBe(cursors);
            expect(mockPresence.getRemoteCursors).toHaveBeenCalled();
        });
    });

    describe('Presence Operations', () => {
        test('should update presence', () => {
            const status = 'busy';
            const metadata = { tool: 'pen' };

            whiteboardCore.updatePresence(status, metadata);

            expect(mockPresence.updateLocalPresence).toHaveBeenCalledWith(status, metadata);
        });

        test('should get user presence', () => {
            const presence = { status: 'active' };
            mockPresence.getUserPresence.mockReturnValue(presence);

            const result = whiteboardCore.getUserPresence('user1');

            expect(result).toBe(presence);
            expect(mockPresence.getUserPresence).toHaveBeenCalledWith('user1');
        });

        test('should get all presence', () => {
            const allPresence = { user1: { status: 'active' } };
            mockPresence.getAllPresence.mockReturnValue(allPresence);

            const result = whiteboardCore.getAllPresence();

            expect(result).toBe(allPresence);
            expect(mockPresence.getAllPresence).toHaveBeenCalled();
        });

        test('should get connected users', () => {
            const users = ['user1', 'user2'];
            mockPresence.getConnectedUsers.mockReturnValue(users);

            const result = whiteboardCore.getConnectedUsers();

            expect(result).toBe(users);
            expect(mockPresence.getConnectedUsers).toHaveBeenCalled();
        });

        test('should get user count', () => {
            mockPresence.getUserCount.mockReturnValue(5);

            const result = whiteboardCore.getUserCount();

            expect(result).toBe(5);
            expect(mockPresence.getUserCount).toHaveBeenCalled();
        });
    });

    describe('Typing Indicators', () => {
        test('should start typing', () => {
            const location = { x: 100, y: 200 };

            whiteboardCore.startTyping(location);

            expect(mockPresence.startTyping).toHaveBeenCalledWith(location);
        });

        test('should stop typing', () => {
            whiteboardCore.stopTyping();

            expect(mockPresence.stopTyping).toHaveBeenCalled();
        });
    });

    describe('WebRTC Communication', () => {
        test('should send data to user', () => {
            const data = { type: 'test', message: 'hello' };
            mockWebRTC.sendData.mockReturnValue(true);

            const result = whiteboardCore.sendDataToUser('user1', data);

            expect(result).toBe(true);
            expect(mockWebRTC.sendData).toHaveBeenCalledWith('user1', data);
        });

        test('should broadcast data', () => {
            const data = { type: 'test', message: 'hello' };
            const results = { user1: true, user2: false };
            mockWebRTC.broadcastData.mockReturnValue(results);

            const result = whiteboardCore.broadcastData(data);

            expect(result).toBe(results);
            expect(mockWebRTC.broadcastData).toHaveBeenCalledWith(data);
        });

        test('should get WebRTC connection state', () => {
            mockWebRTC.getConnectionState.mockReturnValue('connected');

            const result = whiteboardCore.getWebRTCConnectionState('user1');

            expect(result).toBe('connected');
            expect(mockWebRTC.getConnectionState).toHaveBeenCalledWith('user1');
        });
    });

    describe('Offline Sync Operations', () => {
        test('should get offline status', () => {
            const status = { isOnline: true, pendingOperations: 0 };
            mockOfflineSync.getOfflineStatus.mockReturnValue(status);

            const result = whiteboardCore.getOfflineStatus();

            expect(result).toBe(status);
            expect(mockOfflineSync.getOfflineStatus).toHaveBeenCalled();
        });

        test('should get pending operations', () => {
            const operations = [{ id: 'op1', type: 'drawing' }];
            mockOfflineSync.getPendingOperations.mockReturnValue(operations);

            const result = whiteboardCore.getPendingOperations();

            expect(result).toBe(operations);
            expect(mockOfflineSync.getPendingOperations).toHaveBeenCalled();
        });

        test('should force sync now', () => {
            whiteboardCore.forceSyncNow();

            expect(mockOfflineSync.forceSyncNow).toHaveBeenCalled();
        });

        test('should retry failed operations', () => {
            whiteboardCore.retryFailedOperations();

            expect(mockOfflineSync.retryFailedOperations).toHaveBeenCalled();
        });
    });

    describe('Error Handling Operations', () => {
        test('should get connection status', () => {
            const status = { isReconnecting: false, errorCount: 0 };
            mockErrorHandler.getConnectionStatus.mockReturnValue(status);

            const result = whiteboardCore.getConnectionStatus();

            expect(result).toBe(status);
            expect(mockErrorHandler.getConnectionStatus).toHaveBeenCalled();
        });

        test('should get error log', () => {
            const errors = [{ id: 'error1', type: 'TestError' }];
            mockErrorHandler.getErrorLog.mockReturnValue(errors);

            const result = whiteboardCore.getErrorLog();

            expect(result).toBe(errors);
            expect(mockErrorHandler.getErrorLog).toHaveBeenCalled();
        });

        test('should clear error log', () => {
            whiteboardCore.clearErrorLog();

            expect(mockErrorHandler.clearErrorLog).toHaveBeenCalled();
        });

        test('should force reconnect', () => {
            whiteboardCore.forceReconnect();

            expect(mockErrorHandler.forceReconnect).toHaveBeenCalled();
        });
    });

    describe('System Statistics', () => {
        test('should get system stats', () => {
            mockCollaboration.getDrawingElements.mockReturnValue([{}, {}]);
            mockCollaboration.getText.mockReturnValue('Hello');
            mockWebRTC.getConnectedUsers.mockReturnValue(['user1', 'user2']);
            mockPresence.getConnectedUsers.mockReturnValue(['user1', 'user2']);
            mockPresence.getUserCount.mockReturnValue(3);
            mockOfflineSync.getOfflineStatus.mockReturnValue({ isOnline: true });
            mockErrorHandler.getRecentErrorCount.mockReturnValue(1);
            mockErrorHandler.getConnectionStatus.mockReturnValue({ isReconnecting: false });

            const stats = whiteboardCore.getSystemStats();

            expect(stats).toMatchObject({
                collaboration: {
                    connected: true,
                    drawingElements: 2,
                    textLength: 5
                },
                webrtc: {
                    connectedUsers: ['user1', 'user2'],
                    connectionStates: expect.any(Object)
                },
                presence: {
                    userCount: 3,
                    connectedUsers: ['user1', 'user2']
                },
                offline: { isOnline: true },
                errors: {
                    recentCount: 1,
                    isReconnecting: false
                }
            });
        });
    });

    describe('Configuration Updates', () => {
        test('should update configuration', () => {
            const newConfig = { maxUsers: 10, newProperty: 'value' };

            whiteboardCore.updateConfig(newConfig);

            expect(whiteboardCore.config.maxUsers).toBe(10);
            expect(whiteboardCore.config.newProperty).toBe('value');
            expect(whiteboardCore.config.roomId).toBe('test-room'); // Original values preserved
        });
    });

    describe('Event Handler Integration', () => {
        test('should setup collaboration integration', () => {
            const onDrawingUpdateSpy = jest.fn();
            whiteboardCore.onDrawingUpdate = onDrawingUpdateSpy;

            // Simulate collaboration event
            if (mockCollaboration.onDrawingUpdate) {
                mockCollaboration.onDrawingUpdate({ type: 'stroke-added' });
                expect(onDrawingUpdateSpy).toHaveBeenCalledWith({ type: 'stroke-added' });
            }
        });

        test('should setup WebRTC integration', () => {
            const onUserConnectedSpy = jest.fn();
            whiteboardCore.onUserConnected = onUserConnectedSpy;

            // Simulate WebRTC event
            if (mockWebRTC.onDataChannelOpen) {
                mockWebRTC.onDataChannelOpen('user1');
                expect(onUserConnectedSpy).toHaveBeenCalledWith('user1');
            }
        });

        test('should setup presence integration', () => {
            const onUserJoinedSpy = jest.fn();
            whiteboardCore.onUserJoined = onUserJoinedSpy;

            // Simulate presence event
            if (mockPresence.onUserJoined) {
                mockPresence.onUserJoined('user1', { status: 'active' });
                expect(onUserJoinedSpy).toHaveBeenCalledWith('user1', { status: 'active' });
            }
        });

        test('should setup offline sync integration', () => {
            const onNetworkStatusChangeSpy = jest.fn();
            whiteboardCore.onNetworkStatusChange = onNetworkStatusChangeSpy;

            // Simulate offline sync event
            if (mockOfflineSync.onNetworkOnline) {
                mockOfflineSync.onNetworkOnline();
                expect(onNetworkStatusChangeSpy).toHaveBeenCalledWith('online');
            }
        });

        test('should setup error handler integration', () => {
            const onReconnectionStartedSpy = jest.fn();
            whiteboardCore.onReconnectionStarted = onReconnectionStartedSpy;

            // Simulate error handler event
            if (mockErrorHandler.onReconnectionStarted) {
                mockErrorHandler.onReconnectionStarted('test-reason');
                expect(onReconnectionStartedSpy).toHaveBeenCalledWith('test-reason');
            }
        });
    });

    describe('Cleanup', () => {
        test('should destroy all components', () => {
            whiteboardCore.destroy();

            expect(mockCollaboration.destroy).toHaveBeenCalled();
            expect(mockWebRTC.destroy).toHaveBeenCalled();
            expect(mockPresence.destroy).toHaveBeenCalled();
            expect(mockOfflineSync.destroy).toHaveBeenCalled();
            expect(mockErrorHandler.destroy).toHaveBeenCalled();
            expect(whiteboardCore.components).toEqual({});
            expect(whiteboardCore.isInitialized).toBe(false);
        });
    });
});

describe('SignalingService', () => {
    let signalingService;
    const websocketUrl = 'ws://test.com';

    beforeEach(() => {
        global.WebSocket = jest.fn(() => createMockWebSocket());
        signalingService = new SignalingService(websocketUrl);
    });

    afterEach(() => {
        if (signalingService) {
            signalingService.disconnect();
        }
    });

    describe('Constructor', () => {
        test('should initialize with websocket URL', () => {
            expect(signalingService.websocketUrl).toBe(websocketUrl);
            expect(signalingService.connected).toBe(false);
            expect(signalingService.messageHandlers).toBeInstanceOf(Map);
        });
    });

    describe('Connection Management', () => {
        test('should connect successfully', async () => {
            const connectPromise = signalingService.connect();
            
            // Simulate websocket open
            signalingService.websocket.simulateOpen();
            
            await connectPromise;

            expect(signalingService.connected).toBe(true);
            expect(signalingService.reconnectAttempts).toBe(0);
        });

        test('should handle connection errors', async () => {
            const error = new Error('Connection failed');
            const connectPromise = signalingService.connect();
            
            // Simulate websocket error
            signalingService.websocket.simulateError(error);
            
            await expect(connectPromise).rejects.toBe(error);
        });

        test('should disconnect properly', () => {
            const mockWebSocket = createMockWebSocket();
            signalingService.websocket = mockWebSocket;
            signalingService.connected = true;

            signalingService.disconnect();

            expect(mockWebSocket.close).toHaveBeenCalled();
            expect(signalingService.connected).toBe(false);
            expect(signalingService.websocket).toBeNull();
        });

        test('should handle disconnection events', async () => {
            const onCloseSpy = jest.fn();
            signalingService.onClose = onCloseSpy;

            const connectPromise = signalingService.connect();
            signalingService.websocket.simulateOpen();
            await connectPromise;

            // Simulate disconnection
            const closeEvent = { code: 1006, reason: 'Abnormal closure' };
            signalingService.websocket.simulateClose(closeEvent.code, closeEvent.reason);

            expect(signalingService.connected).toBe(false);
            expect(onCloseSpy).toHaveBeenCalledWith(closeEvent);
        });
    });

    describe('Message Handling', () => {
        test('should send messages when connected', () => {
            signalingService.websocket = createMockWebSocket();
            signalingService.connected = true;
            const message = { type: 'test', data: 'hello' };

            signalingService.send(message);

            expect(signalingService.websocket.send).toHaveBeenCalledWith(JSON.stringify(message));
        });

        test('should not send messages when disconnected', () => {
            signalingService.websocket = createMockWebSocket();
            signalingService.connected = false;
            const message = { type: 'test', data: 'hello' };

            signalingService.send(message);

            expect(signalingService.websocket.send).not.toHaveBeenCalled();
        });

        test('should handle incoming messages', async () => {
            const handler = jest.fn();
            signalingService.onMessage('test-type', handler);

            const connectPromise = signalingService.connect();
            signalingService.websocket.simulateOpen();
            await connectPromise;

            // Simulate incoming message
            const message = { type: 'test-type', data: 'hello' };
            signalingService.websocket.simulateMessage(message);

            expect(handler).toHaveBeenCalledWith(message);
        });

        test('should handle unknown message types', async () => {
            const connectPromise = signalingService.connect();
            signalingService.websocket.simulateOpen();
            await connectPromise;

            // Should not throw for unknown message type
            const message = { type: 'unknown-type', data: 'hello' };
            signalingService.websocket.simulateMessage(message);
        });

        test('should handle malformed messages', async () => {
            const connectPromise = signalingService.connect();
            signalingService.websocket.simulateOpen();
            await connectPromise;

            // Simulate malformed JSON
            if (signalingService.websocket.onmessage) {
                signalingService.websocket.onmessage({ data: 'invalid-json' });
            }

            // Should not throw or crash
        });
    });

    describe('Room Operations', () => {
        test('should join room', async () => {
            signalingService.websocket = createMockWebSocket();
            signalingService.connected = true;

            await signalingService.joinRoom('room123', 'user456');

            expect(signalingService.websocket.send).toHaveBeenCalledWith(JSON.stringify({
                action: 'signal',
                type: 'join-room',
                roomId: 'room123',
                userId: 'user456'
            }));
        });

        test('should leave room', async () => {
            signalingService.websocket = createMockWebSocket();
            signalingService.connected = true;

            await signalingService.leaveRoom('room123');

            expect(signalingService.websocket.send).toHaveBeenCalledWith(JSON.stringify({
                action: 'signal',
                type: 'leave-room',
                roomId: 'room123'
            }));
        });
    });
});