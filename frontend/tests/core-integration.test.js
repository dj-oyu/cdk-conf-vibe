import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('../collaboration.js', () => ({ CollaborationEngine: jest.fn() }));
jest.unstable_mockModule('../webrtc.js', () => ({ WebRTCManager: jest.fn() }));
jest.unstable_mockModule('../presence.js', () => ({ PresenceManager: jest.fn() }));
jest.unstable_mockModule('../offline-sync.js', () => ({ OfflineSyncManager: jest.fn() }));
jest.unstable_mockModule('../error-handler.js', () => ({ ErrorHandler: jest.fn() }));

// Manually mock SignalingService from the core-integration file
const mockSignaling = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    joinRoom: jest.fn().mockResolvedValue(undefined),
    leaveRoom: jest.fn(),
};
const SignalingService = jest.fn(() => mockSignaling);

const { WhiteboardCore } = await import('../core-integration.js');

describe('WhiteboardCore', () => {
    let CollaborationEngine, WebRTCManager, PresenceManager, OfflineSyncManager, ErrorHandler;
    let whiteboardCore;
    let mockCollaboration, mockWebRTC, mockPresence, mockOfflineSync, mockErrorHandler;

    beforeEach(async () => {
        // Dynamically import mocked modules
        ({ CollaborationEngine } = await import('../collaboration.js'));
        ({ WebRTCManager } = await import('../webrtc.js'));
        ({ PresenceManager } = await import('../presence.js'));
        ({ OfflineSyncManager } = await import('../offline-sync.js'));
        ({ ErrorHandler } = await import('../error-handler.js'));

        // Reset mocks
        jest.clearAllMocks();

        // Define mock instances
        mockCollaboration = { connect: jest.fn(), disconnect: jest.fn(), destroy: jest.fn(), provider: { on: jest.fn() }, persistence: { on: jest.fn() }, signalingService: mockSignaling };
        mockWebRTC = { destroy: jest.fn() };
        mockPresence = { setupActivityTracking: jest.fn(), destroy: jest.fn(), updateLocalPresence: jest.fn() };
        mockOfflineSync = { destroy: jest.fn() };
        mockErrorHandler = { startHealthMonitoring: jest.fn(), destroy: jest.fn() };

        // Set up mock implementations
        CollaborationEngine.mockImplementation(() => mockCollaboration);
        WebRTCManager.mockImplementation(() => mockWebRTC);
        PresenceManager.mockImplementation(() => mockPresence);
        OfflineSyncManager.mockImplementation(() => mockOfflineSync);
        ErrorHandler.mockImplementation(() => mockErrorHandler);

        const config = { roomId: 'test-room', userId: 'test-user', websocketUrl: 'ws://test.com' };
        whiteboardCore = new WhiteboardCore(config);
        // Manually replace the created signaling service with our mock
        whiteboardCore.components.signaling = mockSignaling;
    });

    afterEach(() => {
        whiteboardCore.destroy();
    });

    test('should initialize all components', () => {
        expect(CollaborationEngine).toHaveBeenCalledTimes(1);
        expect(WebRTCManager).toHaveBeenCalledTimes(1);
        expect(PresenceManager).toHaveBeenCalledTimes(1);
        expect(OfflineSyncManager).toHaveBeenCalledTimes(1);
        expect(ErrorHandler).toHaveBeenCalledTimes(1);
    });

    test('should connect successfully', async () => {
        await whiteboardCore.connect();
        expect(mockSignaling.connect).toHaveBeenCalledTimes(1);
        expect(mockSignaling.joinRoom).toHaveBeenCalledWith('test-room', 'test-user');
        expect(mockCollaboration.connect).toHaveBeenCalledTimes(1);
        expect(mockPresence.updateLocalPresence).toHaveBeenCalledWith('active');
    });
});