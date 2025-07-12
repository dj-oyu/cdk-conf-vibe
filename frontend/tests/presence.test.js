import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PresenceManager } from '../presence.js';

describe('PresenceManager', () => {
    let presenceManager;
    let mockCollaborationEngine;
    let mockWebRTCManager;

    beforeEach(() => {
        mockCollaborationEngine = {
            userId: 'test-user',
            provider: {
                awareness: {
                    setLocalStateField: jest.fn(),
                    getStates: jest.fn(() => new Map()),
                    on: jest.fn(),
                    meta: new Map()
                }
            },
            generateUserColor: jest.fn((userId) => `hsl(${userId.length * 30}, 70%, 50%)`),
            getCursors: jest.fn(() => ({}))
        };

        mockWebRTCManager = {
            broadcastData: jest.fn(),
            onDataChannelMessage: null,
            onConnectionStateChange: null
        };

        presenceManager = new PresenceManager(mockCollaborationEngine, mockWebRTCManager);
    });

    afterEach(() => {
        if (presenceManager) {
            presenceManager.destroy();
        }
    });

    describe('Constructor', () => {
        test('should initialize with correct properties', () => {
            expect(presenceManager.collaborationEngine).toBe(mockCollaborationEngine);
            expect(presenceManager.webrtcManager).toBe(mockWebRTCManager);
            expect(presenceManager.localCursor).toEqual({ x: 0, y: 0, visible: false });
            expect(presenceManager.remoteCursors).toBeInstanceOf(Map);
            expect(presenceManager.userPresence).toBeInstanceOf(Map);
        });

        test('should setup event listeners', () => {
            expect(mockCollaborationEngine.provider.awareness.on).toHaveBeenCalledWith('change', expect.any(Function));
            expect(mockWebRTCManager.onDataChannelMessage).toEqual(expect.any(Function));
        });

        test('should start presence heartbeat', () => {
            expect(presenceManager.presenceInterval).not.toBeNull();
        });
    });

    describe('Local Cursor Management', () => {
        test('should update local cursor position', () => {
            const x = 100;
            const y = 200;

            presenceManager.updateLocalCursor(x, y);

            expect(presenceManager.localCursor.x).toBe(x);
            expect(presenceManager.localCursor.y).toBe(y);
            expect(presenceManager.localCursor.visible).toBe(true);
            expect(presenceManager.localCursor.timestamp).toBeGreaterThan(0);
        });

        test('should update Y.js awareness with cursor position', () => {
            const x = 150;
            const y = 250;

            presenceManager.updateLocalCursor(x, y);

            expect(mockCollaborationEngine.provider.awareness.setLocalStateField)
                .toHaveBeenCalledWith('cursor', {
                    x, y, visible: true,
                    timestamp: expect.any(Number)
                });
        });

        test('should broadcast cursor via WebRTC', () => {
            const x = 75;
            const y = 125;

            presenceManager.updateLocalCursor(x, y);

            expect(mockWebRTCManager.broadcastData).toHaveBeenCalledWith({
                type: 'cursor-update',
                cursor: expect.objectContaining({ x, y, visible: true })
            });
        });

        test('should hide local cursor', () => {
            presenceManager.hideLocalCursor();

            expect(presenceManager.localCursor.visible).toBe(false);
        });

        test('should show local cursor', () => {
            presenceManager.localCursor.visible = false;

            presenceManager.showLocalCursor();

            expect(presenceManager.localCursor.visible).toBe(true);
        });
    });

    describe('Remote Cursor Management', () => {
        test('should update remote cursor', () => {
            const userId = 'remote-user';
            const cursor = { x: 50, y: 75, visible: true };

            presenceManager.updateRemoteCursor(userId, cursor);

            const storedCursor = presenceManager.remoteCursors.get(userId);
            expect(storedCursor).toMatchObject(cursor);
            expect(storedCursor.userId).toBe(userId);
            expect(storedCursor.color).toBeDefined();
        });

        test('should generate user color for remote cursor', () => {
            const userId = 'remote-user';
            const cursor = { x: 50, y: 75, visible: true };

            presenceManager.updateRemoteCursor(userId, cursor);

            expect(mockCollaborationEngine.generateUserColor).toHaveBeenCalledWith(userId);
        });

        test('should not trigger update if cursor hasn\'t changed', () => {
            const userId = 'remote-user';
            const cursor = { x: 50, y: 75, visible: true };
            const onRemoteCursorUpdateSpy = jest.fn();
            presenceManager.onRemoteCursorUpdate = onRemoteCursorUpdateSpy;

            // First update
            presenceManager.updateRemoteCursor(userId, cursor);
            expect(onRemoteCursorUpdateSpy).toHaveBeenCalledTimes(1);

            // Same update
            presenceManager.updateRemoteCursor(userId, cursor);
            expect(onRemoteCursorUpdateSpy).toHaveBeenCalledTimes(1);
        });

        test('should trigger update if cursor position changed', () => {
            const userId = 'remote-user';
            const cursor1 = { x: 50, y: 75, visible: true };
            const cursor2 = { x: 60, y: 85, visible: true };
            const onRemoteCursorUpdateSpy = jest.fn();
            presenceManager.onRemoteCursorUpdate = onRemoteCursorUpdateSpy;

            presenceManager.updateRemoteCursor(userId, cursor1);
            presenceManager.updateRemoteCursor(userId, cursor2);

            expect(onRemoteCursorUpdateSpy).toHaveBeenCalledTimes(2);
        });

        test('should remove remote cursor', () => {
            const userId = 'remote-user';
            const cursor = { x: 50, y: 75, visible: true };
            const onRemoteCursorRemoveSpy = jest.fn();
            presenceManager.onRemoteCursorRemove = onRemoteCursorRemoveSpy;

            presenceManager.updateRemoteCursor(userId, cursor);
            expect(presenceManager.remoteCursors.has(userId)).toBe(true);

            presenceManager.removeRemoteCursor(userId);

            expect(presenceManager.remoteCursors.has(userId)).toBe(false);
            expect(onRemoteCursorRemoveSpy).toHaveBeenCalledWith(userId);
        });

        test('should get remote cursors', () => {
            const userId1 = 'user1';
            const userId2 = 'user2';
            const cursor1 = { x: 10, y: 20, visible: true };
            const cursor2 = { x: 30, y: 40, visible: true };

            presenceManager.updateRemoteCursor(userId1, cursor1);
            presenceManager.updateRemoteCursor(userId2, cursor2);

            const cursors = presenceManager.getRemoteCursors();

            expect(cursors[userId1]).toMatchObject(cursor1);
            expect(cursors[userId2]).toMatchObject(cursor2);
        });
    });

    describe('User Presence Management', () => {
        test('should update local presence', () => {
            const status = 'active';
            const metadata = { tool: 'pen' };

            presenceManager.updateLocalPresence(status, metadata);

            expect(mockCollaborationEngine.provider.awareness.setLocalStateField)
                .toHaveBeenCalledWith('presence', {
                    status,
                    metadata,
                    timestamp: expect.any(Number),
                    lastSeen: expect.any(Number)
                });
        });

        test('should broadcast presence via WebRTC', () => {
            const status = 'busy';
            const metadata = { activity: 'drawing' };

            presenceManager.updateLocalPresence(status, metadata);

            expect(mockWebRTCManager.broadcastData).toHaveBeenCalledWith({
                type: 'presence-update',
                presence: expect.objectContaining({ status, metadata })
            });
        });

        test('should get user presence', () => {
            const userId = 'test-user';
            const presence = { status: 'active', metadata: {} };

            presenceManager.userPresence.set(userId, presence);

            const retrievedPresence = presenceManager.getUserPresence(userId);

            expect(retrievedPresence).toBe(presence);
        });

        test('should get all presence data', () => {
            const user1 = 'user1';
            const user2 = 'user2';
            const presence1 = { status: 'active' };
            const presence2 = { status: 'idle' };

            presenceManager.userPresence.set(user1, presence1);
            presenceManager.userPresence.set(user2, presence2);

            const allPresence = presenceManager.getAllPresence();

            expect(allPresence).toEqual({
                [user1]: presence1,
                [user2]: presence2
            });
        });

        test('should get connected users', () => {
            presenceManager.userPresence.set('user1', { status: 'active' });
            presenceManager.userPresence.set('user2', { status: 'idle' });

            const connectedUsers = presenceManager.getConnectedUsers();

            expect(connectedUsers).toEqual(['user1', 'user2']);
        });

        test('should get user count including local user', () => {
            presenceManager.userPresence.set('user1', { status: 'active' });
            presenceManager.userPresence.set('user2', { status: 'idle' });

            const userCount = presenceManager.getUserCount();

            expect(userCount).toBe(3); // 2 remote + 1 local
        });
    });

    describe('Awareness Changes Handling', () => {
        test('should handle user joined', () => {
            const onUserJoinedSpy = jest.fn();
            presenceManager.onUserJoined = onUserJoinedSpy;

            const changes = {
                added: [123],
                updated: [],
                removed: []
            };

            const mockState = {
                user: { id: 'new-user' },
                presence: { status: 'active' },
                cursor: { x: 10, y: 20 }
            };

            mockCollaborationEngine.provider.awareness.getStates.mockReturnValue(
                new Map([[123, mockState]])
            );

            presenceManager.handleAwarenessChanges(changes);

            expect(onUserJoinedSpy).toHaveBeenCalledWith('new-user', mockState.presence);
            expect(presenceManager.userPresence.has('new-user')).toBe(true);
        });

        test('should handle user updated', () => {
            const onUserPresenceUpdateSpy = jest.fn();
            presenceManager.onUserPresenceUpdate = onUserPresenceUpdateSpy;

            const changes = {
                added: [],
                updated: [123],
                removed: []
            };

            const mockState = {
                user: { id: 'existing-user' },
                presence: { status: 'busy', metadata: { tool: 'eraser' } }
            };

            mockCollaborationEngine.provider.awareness.getStates.mockReturnValue(
                new Map([[123, mockState]])
            );

            presenceManager.handleAwarenessChanges(changes);

            expect(onUserPresenceUpdateSpy).toHaveBeenCalledWith('existing-user', mockState.presence);
        });

        test('should handle user left', () => {
            const userId = 'leaving-user';
            const onUserLeftSpy = jest.fn();
            presenceManager.onUserLeft = onUserLeftSpy;

            // Add user first
            presenceManager.userPresence.set(userId, { status: 'active' });
            presenceManager.remoteCursors.set(userId, { x: 10, y: 20 });

            presenceManager.handleUserLeft(userId);

            expect(onUserLeftSpy).toHaveBeenCalledWith(userId);
            expect(presenceManager.userPresence.has(userId)).toBe(false);
            expect(presenceManager.remoteCursors.has(userId)).toBe(false);
        });

        test('should not handle changes for local user', () => {
            const onUserJoinedSpy = jest.fn();
            presenceManager.onUserJoined = onUserJoinedSpy;

            const changes = {
                added: [123],
                updated: [],
                removed: []
            };

            const mockState = {
                user: { id: mockCollaborationEngine.userId }, // Same as local user
                presence: { status: 'active' }
            };

            mockCollaborationEngine.provider.awareness.getStates.mockReturnValue(
                new Map([[123, mockState]])
            );

            presenceManager.handleAwarenessChanges(changes);

            expect(onUserJoinedSpy).not.toHaveBeenCalled();
        });
    });

    describe('WebRTC Message Handling', () => {
        test('should handle cursor update message', () => {
            const userId = 'remote-user';
            const message = {
                type: 'cursor-update',
                cursor: { x: 100, y: 150, visible: true }
            };

            const updateRemoteCursorSpy = jest.spyOn(presenceManager, 'updateRemoteCursor');

            presenceManager.handleWebRTCMessage(userId, message);

            expect(updateRemoteCursorSpy).toHaveBeenCalledWith(userId, message.cursor);
        });

        test('should handle presence update message', () => {
            const userId = 'remote-user';
            const message = {
                type: 'presence-update',
                presence: { status: 'busy', metadata: { tool: 'pen' } }
            };

            const onUserPresenceUpdateSpy = jest.fn();
            presenceManager.onUserPresenceUpdate = onUserPresenceUpdateSpy;

            presenceManager.handleWebRTCMessage(userId, message);

            expect(presenceManager.userPresence.has(userId)).toBe(true);
            expect(onUserPresenceUpdateSpy).toHaveBeenCalledWith(userId, message.presence);
        });

        test('should handle typing start message', () => {
            const userId = 'remote-user';
            const message = {
                type: 'typing-start',
                location: { x: 50, y: 75 }
            };

            const onUserTypingStartSpy = jest.fn();
            presenceManager.onUserTypingStart = onUserTypingStartSpy;

            presenceManager.handleWebRTCMessage(userId, message);

            expect(onUserTypingStartSpy).toHaveBeenCalledWith(userId, message.location);
        });

        test('should handle typing stop message', () => {
            const userId = 'remote-user';
            const message = {
                type: 'typing-stop'
            };

            const onUserTypingStopSpy = jest.fn();
            presenceManager.onUserTypingStop = onUserTypingStopSpy;

            presenceManager.handleWebRTCMessage(userId, message);

            expect(onUserTypingStopSpy).toHaveBeenCalledWith(userId);
        });
    });

    describe('Typing Indicators', () => {
        test('should start typing', () => {
            const location = { x: 100, y: 200 };
            const onLocalTypingStartSpy = jest.fn();
            presenceManager.onLocalTypingStart = onLocalTypingStartSpy;

            presenceManager.startTyping(location);

            expect(mockWebRTCManager.broadcastData).toHaveBeenCalledWith({
                type: 'typing-start',
                location,
                timestamp: expect.any(Number)
            });
            expect(onLocalTypingStartSpy).toHaveBeenCalledWith(location);
        });

        test('should stop typing', () => {
            const onLocalTypingStopSpy = jest.fn();
            presenceManager.onLocalTypingStop = onLocalTypingStopSpy;

            presenceManager.stopTyping();

            expect(mockWebRTCManager.broadcastData).toHaveBeenCalledWith({
                type: 'typing-stop',
                timestamp: expect.any(Number)
            });
            expect(onLocalTypingStopSpy).toHaveBeenCalled();
        });
    });

    describe('Presence Heartbeat', () => {
        test('should start presence heartbeat', () => {
            jest.useFakeTimers();

            presenceManager.startPresenceHeartbeat(1000);

            expect(presenceManager.presenceInterval).not.toBeNull();

            jest.useRealTimers();
        });

        test('should stop presence heartbeat', () => {
            jest.useFakeTimers();

            presenceManager.startPresenceHeartbeat(1000);
            presenceManager.stopPresenceHeartbeat();

            expect(presenceManager.presenceInterval).toBeNull();

            jest.useRealTimers();
        });

        test('should update presence during heartbeat', () => {
            jest.useFakeTimers();
            const updateLocalPresenceSpy = jest.spyOn(presenceManager, 'updateLocalPresence');

            presenceManager.startPresenceHeartbeat(1000);

            jest.advanceTimersByTime(1000);

            expect(updateLocalPresenceSpy).toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('Activity Tracking', () => {
        test('should record activity', () => {
            const beforeActivity = presenceManager.lastActivity;

            presenceManager.recordActivity();

            expect(presenceManager.lastActivity).toBeGreaterThan(beforeActivity || 0);
        });

        test('should determine active status', () => {
            presenceManager.recordActivity();

            const status = presenceManager.getCurrentStatus();

            expect(status).toBe('active');
        });

        test('should determine idle status', () => {
            const idleTime = 6 * 60 * 1000; // 6 minutes ago
            presenceManager.lastActivity = Date.now() - idleTime;

            const status = presenceManager.getCurrentStatus();

            expect(status).toBe('idle');
        });

        test('should determine away status', () => {
            const awayTime = 16 * 60 * 1000; // 16 minutes ago
            presenceManager.lastActivity = Date.now() - awayTime;

            const status = presenceManager.getCurrentStatus();

            expect(status).toBe('away');
        });

        test('should setup activity tracking', () => {
            const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

            presenceManager.setupActivityTracking();

            expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), { passive: true });
            expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true });
            expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { passive: true });
            expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
            expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true });
            expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        });
    });

    describe('Cleanup', () => {
        test('should destroy and clean up resources', () => {
            const stopPresenceHeartbeatSpy = jest.spyOn(presenceManager, 'stopPresenceHeartbeat');

            presenceManager.userPresence.set('user1', { status: 'active' });
            presenceManager.remoteCursors.set('user1', { x: 10, y: 20 });

            presenceManager.destroy();

            expect(stopPresenceHeartbeatSpy).toHaveBeenCalled();
            expect(presenceManager.remoteCursors.size).toBe(0);
            expect(presenceManager.userPresence.size).toBe(0);
        });
    });
});