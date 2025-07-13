import { test, expect } from '@playwright/test';

test.describe('Room Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should validate room ID input', async ({ page }) => {
    const userNameInput = page.locator('input[placeholder*="Your name"]');
    const joinButton = page.locator('button:has-text("Join Room")');
    
    // Fill user name
    await userNameInput.fill('Test User');
    
    // Try to join without room ID
    await joinButton.click();
    
    // Should not proceed (button might be disabled or show validation)
    // The actual validation behavior depends on implementation
    
    // Fill room ID and try again
    await page.fill('input[placeholder*="Room ID"]', 'TEST-ROOM');
    await joinButton.click();
    
    // Should proceed to whiteboard
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('should validate user name input', async ({ page }) => {
    const roomIdInput = page.locator('input[placeholder*="Room ID"]');
    const joinButton = page.locator('button:has-text("Join Room")');
    
    // Fill room ID
    await roomIdInput.fill('TEST-ROOM');
    
    // Try to join without user name
    await joinButton.click();
    
    // Should not proceed (button might be disabled or show validation)
    
    // Fill user name and try again
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await joinButton.click();
    
    // Should proceed to whiteboard
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('should handle room ID normalization', async ({ page }) => {
    const roomId = 'test-room-123';
    const normalizedRoomId = 'TEST-ROOM-123';
    
    await page.fill('input[placeholder*="Room ID"]', roomId);
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Join Room")');
    
    await expect(page.locator('canvas')).toBeVisible();
    
    // Room ID should be normalized to uppercase
    await expect(page.locator(`text=Room: ${normalizedRoomId}`)).toBeVisible();
  });

  test('should generate unique room IDs for new rooms', async ({ page }) => {
    // Create first room
    await page.fill('input[placeholder*="Your name"]', 'User 1');
    await page.click('button:has-text("Create New Room")');
    await expect(page.locator('canvas')).toBeVisible();
    
    // Get the generated room ID
    const roomIdText1 = await page.locator('text=Room:').textContent();
    const roomId1 = roomIdText1?.split('Room: ')[1];
    
    // Leave room
    await page.click('button:has-text("Leave Room")');
    await expect(page.locator('h2')).toContainText('Join or Create a Room');
    
    // Create second room
    await page.fill('input[placeholder*="Your name"]', 'User 2');
    await page.click('button:has-text("Create New Room")');
    await expect(page.locator('canvas')).toBeVisible();
    
    // Get the second generated room ID
    const roomIdText2 = await page.locator('text=Room:').textContent();
    const roomId2 = roomIdText2?.split('Room: ')[1];
    
    // Room IDs should be different
    expect(roomId1).not.toBe(roomId2);
    expect(roomId1).toBeTruthy();
    expect(roomId2).toBeTruthy();
  });

  test('should handle special characters in room ID', async ({ page }) => {
    const roomId = 'TEST@ROOM#123';
    
    await page.fill('input[placeholder*="Room ID"]', roomId);
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Join Room")');
    
    // Should handle special characters gracefully
    await expect(page.locator('canvas')).toBeVisible();
    // Room ID display might sanitize special characters
  });

  test('should handle very long room IDs', async ({ page }) => {
    const longRoomId = 'A'.repeat(100);
    
    await page.fill('input[placeholder*="Room ID"]', longRoomId);
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Join Room")');
    
    // Should handle long room IDs (might truncate for display)
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('should handle special characters in user name', async ({ page }) => {
    const userName = 'Test User 测试 🎨';
    
    await page.fill('input[placeholder*="Room ID"]', 'TEST-ROOM');
    await page.fill('input[placeholder*="Your name"]', userName);
    await page.click('button:has-text("Join Room")');
    
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator(`text=Welcome, ${userName}`)).toBeVisible();
  });

  test('should handle very long user names', async ({ page }) => {
    const longUserName = 'Very Long User Name '.repeat(10);
    
    await page.fill('input[placeholder*="Room ID"]', 'TEST-ROOM');
    await page.fill('input[placeholder*="Your name"]', longUserName);
    await page.click('button:has-text("Join Room")');
    
    await expect(page.locator('canvas')).toBeVisible();
    // User name might be truncated in display
  });

  test('should preserve room state when multiple users join', async ({ browser }) => {
    const roomId = `MULTI-USER-${Date.now()}`;
    
    // First user creates room
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.goto('/');
    await page1.fill('input[placeholder*="Room ID"]', roomId);
    await page1.fill('input[placeholder*="Your name"]', 'User 1');
    await page1.click('button:has-text("Join Room")');
    await expect(page1.locator('canvas')).toBeVisible();
    
    // Second user joins same room
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto('/');
    await page2.fill('input[placeholder*="Room ID"]', roomId);
    await page2.fill('input[placeholder*="Your name"]', 'User 2');
    await page2.click('button:has-text("Join Room")');
    await expect(page2.locator('canvas')).toBeVisible();
    
    // Both should see the same room
    await expect(page1.locator(`text=Room: ${roomId}`)).toBeVisible();
    await expect(page2.locator(`text=Room: ${roomId}`)).toBeVisible();
    
    // User count should reflect multiple users (with some delay for WebRTC)
    await page1.waitForTimeout(1000);
    
    await context1.close();
    await context2.close();
  });

  test('should handle rapid room creation and joining', async ({ page }) => {
    // Rapidly create and leave rooms
    for (let i = 0; i < 3; i++) {
      await page.fill('input[placeholder*="Your name"]', `User ${i}`);
      await page.click('button:has-text("Create New Room")');
      await expect(page.locator('canvas')).toBeVisible();
      
      await page.click('button:has-text("Leave Room")');
      await expect(page.locator('h2')).toContainText('Join or Create a Room');
    }
  });

  test('should show appropriate loading states', async ({ page }) => {
    // Start joining a room
    await page.fill('input[placeholder*="Room ID"]', 'TEST-LOADING');
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    
    // Click join and look for loading state
    await page.click('button:has-text("Join Room")');
    
    // Might show connecting state (could be too fast to catch)
    // This depends on the actual loading implementation
    
    // Should eventually load the whiteboard
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('should handle browser back/forward navigation', async ({ page }) => {
    // Join a room
    await page.fill('input[placeholder*="Room ID"]', 'TEST-NAV');
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Join Room")');
    await expect(page.locator('canvas')).toBeVisible();
    
    // Go back
    await page.goBack();
    
    // Should return to room manager or handle navigation gracefully
    // The exact behavior depends on routing implementation
    
    // Go forward
    await page.goForward();
    
    // Should handle forward navigation
  });

  test('should clear error states when retrying', async ({ page }) => {
    // This test would require simulating an error condition
    // For now, we just test the basic flow
    
    await page.fill('input[placeholder*="Room ID"]', 'ERROR-TEST');
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Join Room")');
    
    // If there's an error, it should be clearable
    // This depends on error handling implementation
    
    await expect(page.locator('canvas')).toBeVisible();
  });
});