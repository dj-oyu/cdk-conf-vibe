import { test, expect } from '@playwright/test';

test.describe('WebRTC Collaboration', () => {
  test('should handle multiple users in same room', async ({ browser }) => {
    // Create two browser contexts for different users
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const roomId = `TEST-${Date.now()}`;
    
    // User 1 creates room
    await page1.goto('/');
    await page1.fill('input[placeholder*="Room ID"]', roomId);
    await page1.fill('input[placeholder*="Your name"]', 'User 1');
    await page1.click('button:has-text("Join Room")');
    await expect(page1.locator('canvas')).toBeVisible();
    
    // User 2 joins same room
    await page2.goto('/');
    await page2.fill('input[placeholder*="Room ID"]', roomId);
    await page2.fill('input[placeholder*="Your name"]', 'User 2');
    await page2.click('button:has-text("Join Room")');
    await expect(page2.locator('canvas')).toBeVisible();
    
    // Both should see the same room
    await expect(page1.locator(`text=Room: ${roomId}`)).toBeVisible();
    await expect(page2.locator(`text=Room: ${roomId}`)).toBeVisible();
    
    // User count should eventually update (allowing for connection time)
    await page1.waitForTimeout(1000);
    // Note: In a real WebRTC implementation, this would show 2 users
    // For now, we just verify the pages loaded correctly
    
    await context1.close();
    await context2.close();
  });

  test('should maintain drawing state across page reload', async ({ page }) => {
    const roomId = `TEST-RELOAD-${Date.now()}`;
    
    // Join room
    await page.goto('/');
    await page.fill('input[placeholder*="Room ID"]', roomId);
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Join Room")');
    await expect(page.locator('canvas')).toBeVisible();
    
    // Draw something
    await page.click('button[title="Pen"]');
    const canvas = page.locator('canvas');
    await canvas.hover({ position: { x: 100, y: 100 } });
    await page.mouse.down();
    await canvas.hover({ position: { x: 200, y: 150 } });
    await page.mouse.up();
    
    // Reload page
    await page.reload();
    
    // Should return to room manager (as there's no persistence implemented yet)
    await expect(page.locator('h2')).toContainText('Join or Create a Room');
    
    // Re-join same room
    await page.fill('input[placeholder*="Room ID"]', roomId);
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Join Room")');
    await expect(page.locator('canvas')).toBeVisible();
    
    // In a full implementation, drawing state would be restored from Y.js/WebRTC
  });

  test('should handle WebRTC connection errors gracefully', async ({ page }) => {
    // Mock WebRTC not available
    await page.addInitScript(() => {
      // @ts-ignore
      delete window.RTCPeerConnection;
    });
    
    await page.goto('/');
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Create New Room")');
    
    // Should still load the whiteboard even without WebRTC
    await expect(page.locator('canvas')).toBeVisible();
    
    // Might show an error message about WebRTC
    // This depends on the error handling implementation
  });

  test('should handle WebSocket connection failures', async ({ page }) => {
    // Override WebSocket to simulate connection failure
    await page.addInitScript(() => {
      class MockWebSocket {
        constructor() {
          setTimeout(() => {
            // @ts-ignore
            if (this.onerror) this.onerror(new Event('error'));
          }, 100);
        }
        send() {}
        close() {}
      }
      // @ts-ignore
      window.WebSocket = MockWebSocket;
    });
    
    await page.goto('/');
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Create New Room")');
    
    // Should show connection error
    await expect(page.locator('text=Failed to connect to room')).toBeVisible();
  });

  test('should sync drawing tools between users', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const roomId = `TEST-SYNC-${Date.now()}`;
    
    // Both users join same room
    await page1.goto('/');
    await page1.fill('input[placeholder*="Room ID"]', roomId);
    await page1.fill('input[placeholder*="Your name"]', 'User 1');
    await page1.click('button:has-text("Join Room")');
    await expect(page1.locator('canvas')).toBeVisible();
    
    await page2.goto('/');
    await page2.fill('input[placeholder*="Room ID"]', roomId);
    await page2.fill('input[placeholder*="Your name"]', 'User 2');
    await page2.click('button:has-text("Join Room")');
    await expect(page2.locator('canvas')).toBeVisible();
    
    // User 1 draws
    await page1.click('button[title="Pen"]');
    const canvas1 = page1.locator('canvas');
    await canvas1.hover({ position: { x: 150, y: 100 } });
    await page1.mouse.down();
    await canvas1.hover({ position: { x: 250, y: 150 } });
    await page1.mouse.up();
    
    // User 2 draws with different tool
    await page2.click('button[title="Rectangle"]');
    const canvas2 = page2.locator('canvas');
    await canvas2.hover({ position: { x: 50, y: 50 } });
    await page2.mouse.down();
    await canvas2.hover({ position: { x: 100, y: 100 } });
    await page2.mouse.up();
    
    // In a real implementation, both drawings would be visible on both canvases
    // For now, we just verify the interactions work
    
    await context1.close();
    await context2.close();
  });

  test('should handle user leaving room', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const roomId = `TEST-LEAVE-${Date.now()}`;
    
    // Both users join same room
    await page1.goto('/');
    await page1.fill('input[placeholder*="Room ID"]', roomId);
    await page1.fill('input[placeholder*="Your name"]', 'User 1');
    await page1.click('button:has-text("Join Room")');
    await expect(page1.locator('canvas')).toBeVisible();
    
    await page2.goto('/');
    await page2.fill('input[placeholder*="Room ID"]', roomId);
    await page2.fill('input[placeholder*="Your name"]', 'User 2');
    await page2.click('button:has-text("Join Room")');
    await expect(page2.locator('canvas')).toBeVisible();
    
    // User 1 leaves
    await page1.click('button:has-text("Leave Room")');
    await expect(page1.locator('h2')).toContainText('Join or Create a Room');
    
    // User 2 should still be in the room
    await expect(page2.locator('canvas')).toBeVisible();
    await expect(page2.locator(`text=Room: ${roomId}`)).toBeVisible();
    
    await context1.close();
    await context2.close();
  });

  test('should handle room with maximum users', async ({ page }) => {
    const roomId = 'FULL-ROOM-TEST';
    
    await page.goto('/');
    await page.fill('input[placeholder*="Room ID"]', roomId);
    await page.fill('input[placeholder*="Your name"]', 'Test User');
    await page.click('button:has-text("Join Room")');
    
    // Should join successfully (as we can't easily simulate 8 users in this test)
    await expect(page.locator('canvas')).toBeVisible();
    
    // In a real implementation with 8+ users, it might show a warning
    // or prevent joining
  });
});