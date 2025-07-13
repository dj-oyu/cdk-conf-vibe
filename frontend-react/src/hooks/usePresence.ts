import { useState, useCallback, useEffect } from 'react';

export interface UserPresence {
  userId: string;
  name?: string;
  avatar?: string;
  cursor?: {
    x: number;
    y: number;
  };
  selection?: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
  color: string;
  lastSeen: number;
  isActive: boolean;
}

export interface PresenceState {
  users: Map<string, UserPresence>;
  currentUser: UserPresence;
}

const PRESENCE_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red  
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#ec4899', // pink
];

export const usePresence = (userId: string, userName?: string) => {
  const [presence, setPresence] = useState<PresenceState>(() => {
    const userColor = PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)];
    
    return {
      users: new Map(),
      currentUser: {
        userId,
        name: userName || `User ${userId.slice(0, 8)}`,
        color: userColor,
        lastSeen: Date.now(),
        isActive: true
      }
    };
  });

  // Update current user's cursor position
  const updateCursor = useCallback((x: number, y: number) => {
    setPresence(prev => ({
      ...prev,
      currentUser: {
        ...prev.currentUser,
        cursor: { x, y },
        lastSeen: Date.now()
      }
    }));
  }, []);

  // Update current user's selection
  const updateSelection = useCallback((startX: number, startY: number, endX: number, endY: number) => {
    setPresence(prev => ({
      ...prev,
      currentUser: {
        ...prev.currentUser,
        selection: { startX, startY, endX, endY },
        lastSeen: Date.now()
      }
    }));
  }, []);

  // Clear current user's selection
  const clearSelection = useCallback(() => {
    setPresence(prev => ({
      ...prev,
      currentUser: {
        ...prev.currentUser,
        selection: undefined,
        lastSeen: Date.now()
      }
    }));
  }, []);

  // Add or update another user's presence
  const updateUserPresence = useCallback((userPresence: Partial<UserPresence> & { userId: string }) => {
    setPresence(prev => {
      const newUsers = new Map(prev.users);
      const existingUser = newUsers.get(userPresence.userId);
      
      // Assign color if new user
      const color = existingUser?.color || 
                   PRESENCE_COLORS[Array.from(newUsers.keys()).length % PRESENCE_COLORS.length];

      newUsers.set(userPresence.userId, {
        userId: userPresence.userId,
        name: userPresence.name || `User ${userPresence.userId.slice(0, 8)}`,
        avatar: userPresence.avatar,
        cursor: userPresence.cursor,
        selection: userPresence.selection,
        color,
        lastSeen: Date.now(),
        isActive: true,
        ...existingUser
      });

      return {
        ...prev,
        users: newUsers
      };
    });
  }, []);

  // Remove user presence
  const removeUserPresence = useCallback((targetUserId: string) => {
    setPresence(prev => {
      const newUsers = new Map(prev.users);
      newUsers.delete(targetUserId);
      return {
        ...prev,
        users: newUsers
      };
    });
  }, []);

  // Mark user as inactive (for cleanup)
  const markUserInactive = useCallback((targetUserId: string) => {
    setPresence(prev => {
      const newUsers = new Map(prev.users);
      const user = newUsers.get(targetUserId);
      if (user) {
        newUsers.set(targetUserId, {
          ...user,
          isActive: false,
          lastSeen: Date.now()
        });
      }
      return {
        ...prev,
        users: newUsers
      };
    });
  }, []);

  // Get presence data for sharing
  const getPresenceData = useCallback(() => {
    return {
      userId: presence.currentUser.userId,
      name: presence.currentUser.name,
      avatar: presence.currentUser.avatar,
      cursor: presence.currentUser.cursor,
      selection: presence.currentUser.selection,
      color: presence.currentUser.color,
      lastSeen: presence.currentUser.lastSeen,
      isActive: presence.currentUser.isActive
    };
  }, [presence.currentUser]);

  // Get all active users (excluding current user)
  const getActiveUsers = useCallback(() => {
    return Array.from(presence.users.values()).filter(user => user.isActive);
  }, [presence.users]);

  // Get user count
  const getUserCount = useCallback(() => {
    return presence.users.size + 1; // +1 for current user
  }, [presence.users.size]);

  // Cleanup inactive users periodically
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      const INACTIVE_TIMEOUT = 30000; // 30 seconds

      setPresence(prev => {
        const newUsers = new Map();
        
        prev.users.forEach((user, userId) => {
          if (now - user.lastSeen < INACTIVE_TIMEOUT) {
            newUsers.set(userId, user);
          }
        });

        return {
          ...prev,
          users: newUsers
        };
      });
    };

    const interval = setInterval(cleanup, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Track mouse movement for cursor updates
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Only update if mouse is over the canvas/whiteboard area
      const target = event.target as HTMLElement;
      if (target.tagName === 'CANVAS' || target.closest('.whiteboard-container')) {
        const rect = target.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        updateCursor(x, y);
      }
    };

    const handleMouseLeave = () => {
      // Clear cursor when mouse leaves the whiteboard
      setPresence(prev => ({
        ...prev,
        currentUser: {
          ...prev.currentUser,
          cursor: undefined,
          lastSeen: Date.now()
        }
      }));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [updateCursor]);

  return {
    presence: presence.currentUser,
    users: presence.users,
    updateCursor,
    updateSelection,
    clearSelection,
    updateUserPresence,
    removeUserPresence,
    markUserInactive,
    getPresenceData,
    getActiveUsers,
    getUserCount
  };
};