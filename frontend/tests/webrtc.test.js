import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WebRTCManager, WebRTCStatsMonitor } from '../webrtc.js';

describe('WebRTCManager', () => {
    let webrtcManager;
    let mockSignalingService;
    const userId = 'test-user';

    beforeEach(() => {
        mockSignalingService = {
            onMessage: jest.fn(),
            send: jest.fn()
        };

        // Mock global RTCPeerConnection
        global.RTCPeerConnection = jest.fn(() => createMockRTCPeerConnection());

        webrtcManager = new WebRTCManager(userId, mockSignalingService);
    });

    afterEach(() => {
        if (webrtcManager) {
            webrtcManager.destroy();
        }
    });

    describe('Constructor', () => {
        test('should initialize with correct properties', () => {
            expect(webrtcManager.userId).toBe(userId);
            expect(webrtcManager.signalingService).toBe(mockSignalingService);
            expect(webrtcManager.connections).toBeInstanceOf(Map);
            expect(webrtcManager.dataChannels).toBeInstanceOf(Map);
        });

        test('should setup signaling handlers', () => {
            expect(mockSignalingService.onMessage).toHaveBeenCalledWith('webrtc-offer', expect.any(Function));
            expect(mockSignalingService.onMessage).toHaveBeenCalledWith('webrtc-answer', expect.any(Function));
            expect(mockSignalingService.onMessage).toHaveBeenCalledWith('webrtc-ice-candidate', expect.any(Function));
            expect(mockSignalingService.onMessage).toHaveBeenCalledWith('user-joined', expect.any(Function));
            expect(mockSignalingService.onMessage).toHaveBeenCalledWith('user-left', expect.any(Function));
        });

        test('should have correct ICE server configuration', () => {
            expect(webrtcManager.configuration.iceServers).toEqual([
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]);
        });
    });

    describe('Connection Initiation', () => {
        test('should initiate connection to target user', async () => {
            const targetUserId = 'target-user';

            await webrtcManager.initiateConnection(targetUserId);

            expect(global.RTCPeerConnection).toHaveBeenCalledWith(webrtcManager.configuration);
            expect(webrtcManager.connections.has(targetUserId)).toBe(true);
            expect(webrtcManager.dataChannels.has(targetUserId)).toBe(true);
        });

        test('should not create duplicate connections', async () => {
            const targetUserId = 'target-user';

            await webrtcManager.initiateConnection(targetUserId);
            const firstConnectionCount = webrtcManager.connections.size;

            await webrtcManager.initiateConnection(targetUserId);
            const secondConnectionCount = webrtcManager.connections.size;

            expect(firstConnectionCount).toBe(secondConnectionCount);
        });

        test('should send offer to signaling service', async () => {
            const targetUserId = 'target-user';

            await webrtcManager.initiateConnection(targetUserId);

            expect(mockSignalingService.send).toHaveBeenCalledWith({
                type: 'webrtc-offer',
                toUserId: targetUserId,
                offer: expect.any(Object)
            });
        });

        test('should create data channel with correct configuration', async () => {
            const targetUserId = 'target-user';
            const mockPeerConnection = createMockRTCPeerConnection();
            global.RTCPeerConnection.mockReturnValue(mockPeerConnection);

            await webrtcManager.initiateConnection(targetUserId);

            expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith('collaboration', {
                ordered: true,
                maxRetransmits: 3
            });
        });
    });

    describe('Offer Handling', () => {
        test('should handle incoming offer', async () => {
            const fromUserId = 'sender-user';
            const offer = { type: 'offer', sdp: 'mock-sdp' };

            await webrtcManager.handleOffer(fromUserId, offer);

            expect(webrtcManager.connections.has(fromUserId)).toBe(true);
            expect(mockSignalingService.send).toHaveBeenCalledWith({
                type: 'webrtc-answer',
                toUserId: fromUserId,
                answer: expect.any(Object)
            });
        });

        test('should not handle duplicate offers', async () => {
            const fromUserId = 'sender-user';
            const offer = { type: 'offer', sdp: 'mock-sdp' };

            await webrtcManager.handleOffer(fromUserId, offer);
            const firstConnectionCount = webrtcManager.connections.size;

            await webrtcManager.handleOffer(fromUserId, offer);
            const secondConnectionCount = webrtcManager.connections.size;

            expect(firstConnectionCount).toBe(secondConnectionCount);
        });

        test('should setup data channel handler for incoming connections', async () => {
            const fromUserId = 'sender-user';
            const offer = { type: 'offer', sdp: 'mock-sdp' };
            const mockPeerConnection = createMockRTCPeerConnection();
            global.RTCPeerConnection.mockReturnValue(mockPeerConnection);

            await webrtcManager.handleOffer(fromUserId, offer);

            expect(mockPeerConnection.ondatachannel).toBeDefined();
        });
    });

    describe('Answer Handling', () => {
        test('should handle incoming answer', async () => {
            const fromUserId = 'sender-user';
            const answer = { type: 'answer', sdp: 'mock-sdp' };
            const mockPeerConnection = createMockRTCPeerConnection();

            webrtcManager.connections.set(fromUserId, mockPeerConnection);

            await webrtcManager.handleAnswer(fromUserId, answer);

            expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalledWith(answer);
        });

        test('should handle answer for non-existent connection', async () => {
            const fromUserId = 'non-existent-user';
            const answer = { type: 'answer', sdp: 'mock-sdp' };

            // Should not throw error
            await expect(webrtcManager.handleAnswer(fromUserId, answer)).resolves.toBeUndefined();
        });
    });

    describe('ICE Candidate Handling', () => {
        test('should handle incoming ICE candidate', async () => {
            const fromUserId = 'sender-user';
            const candidate = { candidate: 'mock-candidate' };
            const mockPeerConnection = createMockRTCPeerConnection();

            webrtcManager.connections.set(fromUserId, mockPeerConnection);

            await webrtcManager.handleIceCandidate(fromUserId, candidate);

            expect(mockPeerConnection.addIceCandidate).toHaveBeenCalledWith(candidate);
        });

        test('should handle ICE candidate for non-existent connection', async () => {
            const fromUserId = 'non-existent-user';
            const candidate = { candidate: 'mock-candidate' };

            // Should not throw error
            await expect(webrtcManager.handleIceCandidate(fromUserId, candidate)).resolves.toBeUndefined();
        });
    });

    describe('Data Channel Communication', () => {
        test('should send data to specific user', () => {
            const targetUserId = 'target-user';
            const data = { type: 'test', message: 'hello' };
            const mockDataChannel = {
                readyState: 'open',
                send: jest.fn()
            };

            webrtcManager.dataChannels.set(targetUserId, mockDataChannel);

            const result = webrtcManager.sendData(targetUserId, data);

            expect(result).toBe(true);
            expect(mockDataChannel.send).toHaveBeenCalledWith(JSON.stringify(data));
        });

        test('should fail to send data when channel is not open', () => {
            const targetUserId = 'target-user';
            const data = { type: 'test', message: 'hello' };
            const mockDataChannel = {
                readyState: 'connecting',
                send: jest.fn()
            };

            webrtcManager.dataChannels.set(targetUserId, mockDataChannel);

            const result = webrtcManager.sendData(targetUserId, data);

            expect(result).toBe(false);
            expect(mockDataChannel.send).not.toHaveBeenCalled();
        });

        test('should fail to send data when user not found', () => {
            const targetUserId = 'non-existent-user';
            const data = { type: 'test', message: 'hello' };

            const result = webrtcManager.sendData(targetUserId, data);

            expect(result).toBe(false);
        });

        test('should broadcast data to all connected users', () => {
            const data = { type: 'test', message: 'hello' };
            const mockDataChannel1 = {
                readyState: 'open',
                send: jest.fn()
            };
            const mockDataChannel2 = {
                readyState: 'open',
                send: jest.fn()
            };

            webrtcManager.dataChannels.set('user1', mockDataChannel1);
            webrtcManager.dataChannels.set('user2', mockDataChannel2);

            const results = webrtcManager.broadcastData(data);

            expect(results).toEqual({
                user1: true,
                user2: true
            });
            expect(mockDataChannel1.send).toHaveBeenCalledWith(JSON.stringify(data));
            expect(mockDataChannel2.send).toHaveBeenCalledWith(JSON.stringify(data));
        });
    });

    describe('Connection State Management', () => {
        test('should get connection state', () => {
            const userId = 'test-user';
            const mockPeerConnection = createMockRTCPeerConnection();
            mockPeerConnection.connectionState = 'connected';

            webrtcManager.connections.set(userId, mockPeerConnection);

            const state = webrtcManager.getConnectionState(userId);

            expect(state).toBe('connected');
        });

        test('should return closed for non-existent connection', () => {
            const state = webrtcManager.getConnectionState('non-existent-user');

            expect(state).toBe('closed');
        });

        test('should get data channel state', () => {
            const userId = 'test-user';
            const mockDataChannel = {
                readyState: 'open'
            };

            webrtcManager.dataChannels.set(userId, mockDataChannel);

            const state = webrtcManager.getDataChannelState(userId);

            expect(state).toBe('open');
        });

        test('should return closed for non-existent data channel', () => {
            const state = webrtcManager.getDataChannelState('non-existent-user');

            expect(state).toBe('closed');
        });

        test('should get connected users', () => {
            const mockDataChannel1 = { readyState: 'open' };
            const mockDataChannel2 = { readyState: 'connecting' };
            const mockDataChannel3 = { readyState: 'open' };

            webrtcManager.dataChannels.set('user1', mockDataChannel1);
            webrtcManager.dataChannels.set('user2', mockDataChannel2);
            webrtcManager.dataChannels.set('user3', mockDataChannel3);

            const connectedUsers = webrtcManager.getConnectedUsers();

            expect(connectedUsers).toEqual(['user1', 'user3']);
        });
    });

    describe('Connection Cleanup', () => {
        test('should close connection', () => {
            const userId = 'test-user';
            const mockPeerConnection = createMockRTCPeerConnection();
            const mockDataChannel = {
                close: jest.fn()
            };

            webrtcManager.connections.set(userId, mockPeerConnection);
            webrtcManager.dataChannels.set(userId, mockDataChannel);

            webrtcManager.closeConnection(userId);

            expect(mockDataChannel.close).toHaveBeenCalled();
            expect(mockPeerConnection.close).toHaveBeenCalled();
            expect(webrtcManager.connections.has(userId)).toBe(false);
            expect(webrtcManager.dataChannels.has(userId)).toBe(false);
        });

        test('should handle closing non-existent connection', () => {
            // Should not throw error
            expect(() => webrtcManager.closeConnection('non-existent-user')).not.toThrow();
        });

        test('should destroy all connections', () => {
            const mockPeerConnection1 = createMockRTCPeerConnection();
            const mockPeerConnection2 = createMockRTCPeerConnection();
            const mockDataChannel1 = { close: jest.fn() };
            const mockDataChannel2 = { close: jest.fn() };

            webrtcManager.connections.set('user1', mockPeerConnection1);
            webrtcManager.connections.set('user2', mockPeerConnection2);
            webrtcManager.dataChannels.set('user1', mockDataChannel1);
            webrtcManager.dataChannels.set('user2', mockDataChannel2);

            webrtcManager.destroy();

            expect(mockDataChannel1.close).toHaveBeenCalled();
            expect(mockDataChannel2.close).toHaveBeenCalled();
            expect(mockPeerConnection1.close).toHaveBeenCalled();
            expect(mockPeerConnection2.close).toHaveBeenCalled();
            expect(webrtcManager.connections.size).toBe(0);
            expect(webrtcManager.dataChannels.size).toBe(0);
        });
    });

    describe('ICE Restart', () => {
        test('should restart ICE for connection', async () => {
            const userId = 'test-user';
            const mockPeerConnection = createMockRTCPeerConnection();

            webrtcManager.connections.set(userId, mockPeerConnection);

            await webrtcManager.restartIce(userId);

            expect(mockPeerConnection.restartIce).toHaveBeenCalled();
        });

        test('should handle ICE restart for non-existent connection', async () => {
            // Should not throw error
            await expect(webrtcManager.restartIce('non-existent-user')).resolves.toBeUndefined();
        });

        test('should close connection if ICE restart fails', async () => {
            const userId = 'test-user';
            const mockPeerConnection = createMockRTCPeerConnection();
            mockPeerConnection.restartIce.mockRejectedValue(new Error('ICE restart failed'));

            webrtcManager.connections.set(userId, mockPeerConnection);
            const closeConnectionSpy = jest.spyOn(webrtcManager, 'closeConnection');

            await webrtcManager.restartIce(userId);

            expect(closeConnectionSpy).toHaveBeenCalledWith(userId);
        });
    });
});

describe('WebRTCStatsMonitor', () => {
    let statsMonitor;
    let mockWebRTCManager;

    beforeEach(() => {
        mockWebRTCManager = {
            getConnectedUsers: jest.fn(() => ['user1', 'user2']),
            getConnectionStats: jest.fn(() => Promise.resolve(new Map()))
        };

        statsMonitor = new WebRTCStatsMonitor(mockWebRTCManager);
    });

    afterEach(() => {
        if (statsMonitor) {
            statsMonitor.stopMonitoring();
        }
    });

    describe('Constructor', () => {
        test('should initialize with WebRTC manager', () => {
            expect(statsMonitor.webrtcManager).toBe(mockWebRTCManager);
            expect(statsMonitor.currentStats).toBeInstanceOf(Map);
            expect(statsMonitor.statsInterval).toBeNull();
        });
    });

    describe('Monitoring Control', () => {
        test('should start monitoring', () => {
            jest.useFakeTimers();

            statsMonitor.startMonitoring(1000);

            expect(statsMonitor.statsInterval).not.toBeNull();

            jest.useRealTimers();
        });

        test('should stop monitoring', () => {
            jest.useFakeTimers();

            statsMonitor.startMonitoring(1000);
            statsMonitor.stopMonitoring();

            expect(statsMonitor.statsInterval).toBeNull();

            jest.useRealTimers();
        });

        test('should stop existing monitoring when starting new one', () => {
            jest.useFakeTimers();

            statsMonitor.startMonitoring(1000);
            const firstInterval = statsMonitor.statsInterval;

            statsMonitor.startMonitoring(2000);
            const secondInterval = statsMonitor.statsInterval;

            expect(firstInterval).not.toBe(secondInterval);

            jest.useRealTimers();
        });
    });

    describe('Stats Collection', () => {
        test('should collect stats for connected users', async () => {
            const mockStats = new Map([
                ['report1', {
                    type: 'data-channel',
                    bytesReceived: 1000,
                    bytesSent: 2000
                }]
            ]);

            mockWebRTCManager.getConnectionStats.mockResolvedValue(mockStats);

            await statsMonitor.collectStats();

            expect(mockWebRTCManager.getConnectedUsers).toHaveBeenCalled();
            expect(mockWebRTCManager.getConnectionStats).toHaveBeenCalledWith('user1');
            expect(mockWebRTCManager.getConnectionStats).toHaveBeenCalledWith('user2');
        });

        test('should process stats correctly', async () => {
            const mockStats = new Map([
                ['report1', {
                    type: 'data-channel',
                    bytesReceived: 1000,
                    bytesSent: 2000,
                    messagesReceived: 10,
                    messagesSent: 15
                }],
                ['report2', {
                    type: 'candidate-pair',
                    state: 'succeeded',
                    currentRoundTripTime: 0.025,
                    bytesReceived: 500,
                    bytesSent: 800
                }]
            ]);

            const processed = await statsMonitor.processStats(mockStats);

            expect(processed).toMatchObject({
                timestamp: expect.any(Number),
                bytesReceived: 1500, // 1000 + 500
                bytesSent: 2800, // 2000 + 800
                roundTripTime: 0.025,
                messagesReceived: 10,
                messagesSent: 15
            });
        });

        test('should handle stats collection errors gracefully', async () => {
            mockWebRTCManager.getConnectionStats.mockRejectedValue(new Error('Stats error'));

            // Should not throw
            await expect(statsMonitor.collectStats()).resolves.toBeUndefined();
        });
    });

    describe('Stats Access', () => {
        test('should get stats for specific user', () => {
            const mockStats = { bytesReceived: 1000, bytesSent: 2000 };
            statsMonitor.currentStats.set('user1', mockStats);

            const stats = statsMonitor.getStats('user1');

            expect(stats).toBe(mockStats);
        });

        test('should get all stats', () => {
            const mockStats1 = { bytesReceived: 1000, bytesSent: 2000 };
            const mockStats2 = { bytesReceived: 1500, bytesSent: 2500 };

            statsMonitor.currentStats.set('user1', mockStats1);
            statsMonitor.currentStats.set('user2', mockStats2);

            const allStats = statsMonitor.getAllStats();

            expect(allStats).toEqual({
                user1: mockStats1,
                user2: mockStats2
            });
        });

        test('should return undefined for non-existent user stats', () => {
            const stats = statsMonitor.getStats('non-existent-user');

            expect(stats).toBeUndefined();
        });
    });
});