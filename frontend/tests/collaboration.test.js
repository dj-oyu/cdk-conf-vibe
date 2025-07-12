import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CollaborationEngine, ConflictResolver, OfflineManager } from '../collaboration.js';

describe('CollaborationEngine', () => {
    let collaboration;
    const roomId = 'test-room';
    const userId = 'test-user';
    const signalingUrls = ['ws://test.com'];

    beforeEach(async () => {
        // Import mocked modules
        const Y = await import('yjs');
        const { WebrtcProvider } = await import('y-webrtc');
        const { IndexeddbPersistence } = await import('y-indexeddb');
        
        collaboration = new CollaborationEngine(roomId, userId, signalingUrls);
    });

    afterEach(() => {
        if (collaboration) {
            collaboration.destroy();
        }
    });

    describe('Constructor', () => {
        test('should initialize with correct properties', () => {
            expect(collaboration.roomId).toBe(roomId);
            expect(collaboration.userId).toBe(userId);
            expect(collaboration.signalingUrls).toEqual(signalingUrls);
        });

        test('should initialize Y.js document and shared structures', () => {
            expect(collaboration.ydoc).toBeDefined();
            expect(collaboration.drawingData).toBeDefined();
            expect(collaboration.cursors).toBeDefined();
            expect(collaboration.textData).toBeDefined();
            expect(collaboration.userPresence).toBeDefined();
        });

        test('should initialize persistence and provider', () => {
            expect(collaboration.persistence).toBeDefined();
            expect(collaboration.provider).toBeDefined();
        });
    });

    describe('User Color Generation', () => {
        test('should generate consistent color for same userId', () => {
            const color1 = collaboration.generateUserColor('user1');
            const color2 = collaboration.generateUserColor('user1');
            expect(color1).toBe(color2);
        });

        test('should generate different colors for different userIds', () => {
            const color1 = collaboration.generateUserColor('user1');
            const color2 = collaboration.generateUserColor('user2');
            expect(color1).not.toBe(color2);
        });

        test('should generate valid HSL color format', () => {
            const color = collaboration.generateUserColor('test-user');
            expect(color).toMatch(/^hsl\(\d+, 70%, 50%\)$/);
        });
    });

    describe('Drawing Operations', () => {
        test('should add drawing stroke', () => {
            const stroke = {
                points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
                color: '#000000',
                width: 2
            };

            collaboration.addDrawingStroke(stroke);

            expect(collaboration.drawingData.push).toHaveBeenCalledWith([
                expect.objectContaining({
                    type: 'stroke',
                    userId: userId,
                    data: stroke,
                    id: expect.any(String),
                    timestamp: expect.any(Number)
                })
            ]);
        });

        test('should add drawing shape', () => {
            const shape = {
                type: 'rectangle',
                x: 10,
                y: 20,
                width: 100,
                height: 50,
                color: '#ff0000'
            };

            collaboration.addDrawingShape(shape);

            expect(collaboration.drawingData.push).toHaveBeenCalledWith([
                expect.objectContaining({
                    type: 'shape',
                    userId: userId,
                    data: shape,
                    id: expect.any(String),
                    timestamp: expect.any(Number)
                })
            ]);
        });

        test('should remove drawing element', () => {
            const elementId = 'test-element-id';
            const mockElements = [
                { id: elementId, type: 'stroke' },
                { id: 'other-id', type: 'shape' }
            ];

            collaboration.drawingData.toArray.mockReturnValue(mockElements);

            collaboration.removeDrawingElement(elementId);

            expect(collaboration.drawingData.delete).toHaveBeenCalledWith(0, 1);
        });

        test('should clear all drawing elements', () => {
            collaboration.drawingData.length = 5;
            
            collaboration.clearDrawing();

            expect(collaboration.drawingData.delete).toHaveBeenCalledWith(0, 5);
        });

        test('should get drawing elements', () => {
            const mockElements = [
                { id: '1', type: 'stroke' },
                { id: '2', type: 'shape' }
            ];
            collaboration.drawingData.toArray.mockReturnValue(mockElements);

            const elements = collaboration.getDrawingElements();

            expect(elements).toEqual(mockElements);
            expect(collaboration.drawingData.toArray).toHaveBeenCalled();
        });
    });

    describe('Cursor Tracking', () => {
        test('should update cursor position', () => {
            const x = 100;
            const y = 200;

            collaboration.updateCursor(x, y);

            expect(collaboration.cursors.set).toHaveBeenCalledWith(userId, {
                x,
                y,
                timestamp: expect.any(Number)
            });
        });

        test('should hide cursor', () => {
            collaboration.hideCursor();

            expect(collaboration.cursors.delete).toHaveBeenCalledWith(userId);
        });

        test('should get cursors', () => {
            const mockCursors = new Map([
                ['user1', { x: 10, y: 20 }],
                ['user2', { x: 30, y: 40 }]
            ]);

            collaboration.cursors.forEach.mockImplementation((callback) => {
                mockCursors.forEach(callback);
            });

            const cursors = collaboration.getCursors();

            expect(cursors).toEqual({
                'user1': { x: 10, y: 20 },
                'user2': { x: 30, y: 40 }
            });
        });
    });

    describe('Text Operations', () => {
        test('should insert text', () => {
            const index = 5;
            const text = 'Hello';

            collaboration.insertText(index, text);

            expect(collaboration.textData.insert).toHaveBeenCalledWith(index, text);
        });

        test('should delete text', () => {
            const index = 5;
            const length = 3;

            collaboration.deleteText(index, length);

            expect(collaboration.textData.delete).toHaveBeenCalledWith(index, length);
        });

        test('should get text', () => {
            const mockText = 'Hello, World!';
            collaboration.textData.toString.mockReturnValue(mockText);

            const text = collaboration.getText();

            expect(text).toBe(mockText);
            expect(collaboration.textData.toString).toHaveBeenCalled();
        });
    });

    describe('User Presence', () => {
        test('should update presence', () => {
            const status = 'active';

            collaboration.updatePresence(status);

            expect(collaboration.provider.awareness.setLocalStateField)
                .toHaveBeenCalledWith('status', status);
        });

        test('should get connected users', () => {
            const mockStates = new Map([
                ['client1', { user: { id: 'user1', name: 'User 1' } }],
                ['client2', { user: { id: 'user2', name: 'User 2' } }]
            ]);

            collaboration.provider.awareness.getStates.mockReturnValue(mockStates);

            const users = collaboration.getConnectedUsers();

            expect(users).toEqual([
                { id: 'user1', name: 'User 1' },
                { id: 'user2', name: 'User 2' }
            ]);
        });
    });

    describe('Connection Management', () => {
        test('should connect provider', () => {
            collaboration.connect();

            expect(collaboration.provider.connect).toHaveBeenCalled();
        });

        test('should disconnect provider', () => {
            collaboration.disconnect();

            expect(collaboration.provider.disconnect).toHaveBeenCalled();
        });
    });

    describe('ID Generation', () => {
        test('should generate unique IDs', () => {
            const id1 = collaboration.generateId();
            const id2 = collaboration.generateId();

            expect(id1).not.toBe(id2);
            expect(id1).toContain(userId);
            expect(id2).toContain(userId);
        });

        test('should include timestamp in ID', () => {
            const beforeTime = Date.now();
            const id = collaboration.generateId();
            const afterTime = Date.now();

            const timestampMatch = id.match(/-(\d+)-/);
            expect(timestampMatch).toBeTruthy();

            const timestamp = parseInt(timestampMatch[1]);
            expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
            expect(timestamp).toBeLessThanOrEqual(afterTime);
        });
    });

    describe('Cleanup', () => {
        test('should destroy all components', () => {
            collaboration.destroy();

            expect(collaboration.provider.destroy).toHaveBeenCalled();
            expect(collaboration.persistence.destroy).toHaveBeenCalled();
            expect(collaboration.ydoc.destroy).toHaveBeenCalled();
        });
    });
});

describe('ConflictResolver', () => {
    describe('Drawing Conflicts', () => {
        test('should resolve conflicts by timestamp', () => {
            const localElements = [
                { id: 'elem1', timestamp: 1000 },
                { id: 'elem2', timestamp: 2000 }
            ];
            const remoteElements = [
                { id: 'elem1', timestamp: 1500 }, // Newer version
                { id: 'elem3', timestamp: 1800 }
            ];

            const resolved = ConflictResolver.resolveDrawingConflicts(localElements, remoteElements);

            expect(resolved).toHaveLength(3);
            expect(resolved.find(e => e.id === 'elem1').timestamp).toBe(1500);
            expect(resolved.find(e => e.id === 'elem2').timestamp).toBe(2000);
            expect(resolved.find(e => e.id === 'elem3').timestamp).toBe(1800);
        });

        test('should sort resolved elements by timestamp', () => {
            const localElements = [
                { id: 'elem1', timestamp: 3000 }
            ];
            const remoteElements = [
                { id: 'elem2', timestamp: 1000 },
                { id: 'elem3', timestamp: 2000 }
            ];

            const resolved = ConflictResolver.resolveDrawingConflicts(localElements, remoteElements);

            expect(resolved[0].timestamp).toBe(1000);
            expect(resolved[1].timestamp).toBe(2000);
            expect(resolved[2].timestamp).toBe(3000);
        });
    });

    describe('Text Conflicts', () => {
        test('should return operations unchanged (Y.js handles conflicts)', () => {
            const operations = ['op1', 'op2', 'op3'];
            const resolved = ConflictResolver.resolveTextConflicts(operations);

            expect(resolved).toEqual(operations);
        });
    });
});

describe('OfflineManager', () => {
    let offlineManager;
    let mockCollaboration;

    beforeEach(() => {
        mockCollaboration = {
            addDrawingStroke: jest.fn(),
            insertText: jest.fn()
        };
        offlineManager = new OfflineManager(mockCollaboration);
    });

    afterEach(() => {
        // Clean up event listeners
        window.removeEventListener('online', offlineManager.syncPendingOperations);
        window.removeEventListener('offline', () => {});
    });

    describe('Constructor', () => {
        test('should initialize with collaboration instance', () => {
            expect(offlineManager.collaboration).toBe(mockCollaboration);
            expect(offlineManager.isOnline).toBe(navigator.onLine);
            expect(offlineManager.pendingOperations).toEqual([]);
        });
    });

    describe('Offline Operation Handling', () => {
        test('should add pending operation when offline', () => {
            offlineManager.isOnline = false;
            const operation = {
                type: 'drawing',
                data: { points: [{ x: 1, y: 2 }] }
            };

            offlineManager.addPendingOperation(operation);

            expect(offlineManager.pendingOperations).toHaveLength(1);
            expect(offlineManager.pendingOperations[0]).toMatchObject(operation);
        });

        test('should not add operation when online', () => {
            offlineManager.isOnline = true;
            const operation = {
                type: 'drawing',
                data: { points: [{ x: 1, y: 2 }] }
            };

            offlineManager.addPendingOperation(operation);

            expect(offlineManager.pendingOperations).toHaveLength(0);
        });
    });

    describe('Sync Operations', () => {
        test('should sync drawing operations', async () => {
            offlineManager.isOnline = true;
            offlineManager.pendingOperations = [
                {
                    type: 'drawing',
                    data: { points: [{ x: 1, y: 2 }] },
                    timestamp: Date.now()
                }
            ];

            await offlineManager.syncPendingOperations();

            expect(mockCollaboration.addDrawingStroke).toHaveBeenCalledWith(
                { points: [{ x: 1, y: 2 }] }
            );
        });

        test('should sync text operations', async () => {
            offlineManager.isOnline = true;
            offlineManager.pendingOperations = [
                {
                    type: 'text',
                    index: 5,
                    text: 'Hello',
                    timestamp: Date.now()
                }
            ];

            await offlineManager.syncPendingOperations();

            expect(mockCollaboration.insertText).toHaveBeenCalledWith(5, 'Hello');
        });

        test('should not sync when offline', async () => {
            offlineManager.isOnline = false;
            offlineManager.pendingOperations = [
                {
                    type: 'drawing',
                    data: { points: [{ x: 1, y: 2 }] },
                    timestamp: Date.now()
                }
            ];

            await offlineManager.syncPendingOperations();

            expect(mockCollaboration.addDrawingStroke).not.toHaveBeenCalled();
        });
    });

    describe('Network Status Changes', () => {
        test('should handle online event', () => {
            const syncSpy = jest.spyOn(offlineManager, 'syncPendingOperations');
            offlineManager.isOnline = false;

            // Simulate online event
            const onlineEvent = new Event('online');
            window.dispatchEvent(onlineEvent);

            expect(offlineManager.isOnline).toBe(true);
            expect(syncSpy).toHaveBeenCalled();
        });

        test('should handle offline event', () => {
            offlineManager.isOnline = true;

            // Simulate offline event
            const offlineEvent = new Event('offline');
            window.dispatchEvent(offlineEvent);

            expect(offlineManager.isOnline).toBe(false);
        });
    });
});