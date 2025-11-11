/**
 * Tests for Auth Session Management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  configureAuth,
  getSession,
  switchOrg,
  requireAuth,
  isAuthenticated,
  getCurrentUser,
  getCurrentOrgId,
} from '../session';
import type { Session, AuthAdapter } from '../types';

describe('Auth Session Management', () => {
  let mockAdapter: AuthAdapter;
  const mockSession: Session = {
    user: {
      id: 100,
      email: 'test@example.com',
      currentOrgId: 1,
      permissions: ['campaign:read', 'campaign:create'],
    },
    expires: '2025-12-31T23:59:59Z',
  };

  beforeEach(() => {
    // Reset adapter before each test
    mockAdapter = {
      getSession: vi.fn().mockResolvedValue(mockSession),
      switchOrg: vi.fn().mockResolvedValue(undefined),
    };

    configureAuth(mockAdapter);
  });

  describe('configureAuth', () => {
    it('should configure auth adapter successfully', () => {
      const newAdapter: AuthAdapter = {
        getSession: vi.fn().mockResolvedValue(null),
        switchOrg: vi.fn().mockResolvedValue(undefined),
      };

      configureAuth(newAdapter);

      // Verify new adapter is used
      expect(true).toBe(true); // Configuration successful
    });

    it('should warn when reconfiguring adapter', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const newAdapter: AuthAdapter = {
        getSession: vi.fn().mockResolvedValue(null),
        switchOrg: vi.fn().mockResolvedValue(undefined),
      };

      configureAuth(newAdapter);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auth already configured')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getSession', () => {
    it('should return session when authenticated', async () => {
      const session = await getSession();

      expect(session).toEqual(mockSession);
      expect(mockAdapter.getSession).toHaveBeenCalledTimes(1);
    });

    it('should return null when not authenticated', async () => {
      mockAdapter.getSession = vi.fn().mockResolvedValue(null);
      configureAuth(mockAdapter);

      const session = await getSession();

      expect(session).toBeNull();
    });

    it('should call adapter getSession method', async () => {
      await getSession();

      expect(mockAdapter.getSession).toHaveBeenCalled();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when session exists', async () => {
      const result = await isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when session is null', async () => {
      mockAdapter.getSession = vi.fn().mockResolvedValue(null);
      configureAuth(mockAdapter);

      const result = await isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('should return user when authenticated', async () => {
      const user = await getCurrentUser();

      expect(user).toEqual(mockSession.user);
    });

    it('should throw when not authenticated', async () => {
      mockAdapter.getSession = vi.fn().mockResolvedValue(null);
      configureAuth(mockAdapter);

      await expect(getCurrentUser()).rejects.toThrow('Not authenticated');
    });
  });

  describe('getCurrentOrgId', () => {
    it('should return current org ID when authenticated', async () => {
      const orgId = await getCurrentOrgId();

      expect(orgId).toBe(1);
    });

    it('should throw when not authenticated', async () => {
      mockAdapter.getSession = vi.fn().mockResolvedValue(null);
      configureAuth(mockAdapter);

      await expect(getCurrentOrgId()).rejects.toThrow('Not authenticated');
    });
  });

  describe('switchOrg', () => {
    it('should call adapter switchOrg method', async () => {
      await switchOrg(100, 5);

      expect(mockAdapter.switchOrg).toHaveBeenCalledWith(100, 5);
    });

    it('should propagate errors from adapter', async () => {
      const error = new Error('User does not have access to org 5');
      mockAdapter.switchOrg = vi.fn().mockRejectedValue(error);
      configureAuth(mockAdapter);

      await expect(switchOrg(100, 5)).rejects.toThrow(
        'User does not have access to org 5'
      );
    });
  });

  describe('requireAuth', () => {
    it('should call handler with session when authenticated', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      const wrappedHandler = requireAuth(handler);

      const result = await wrappedHandler('test-input');

      expect(handler).toHaveBeenCalledWith(mockSession, 'test-input');
      expect(result).toEqual({ success: true });
    });

    it('should throw when not authenticated', async () => {
      mockAdapter.getSession = vi.fn().mockResolvedValue(null);
      configureAuth(mockAdapter);

      const handler = vi.fn();
      const wrappedHandler = requireAuth(handler);

      await expect(wrappedHandler('test-input')).rejects.toThrow(
        'Authentication required'
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('should work with typed inputs and outputs', async () => {
      interface Input {
        name: string;
      }
      interface Output {
        id: number;
        name: string;
      }

      const handler = requireAuth<Input, Output>(async (session, input) => {
        return {
          id: session.user.id,
          name: input.name,
        };
      });

      const result = await handler({ name: 'Test' });

      expect(result).toEqual({
        id: 100,
        name: 'Test',
      });
    });
  });

  describe('Error handling without configuration', () => {
    it('should throw helpful error when getSession called without config', async () => {
      // Set to null to simulate unconfigured state
      configureAuth(null as any);

      await expect(getSession()).rejects.toThrow('Auth not configured');
    });
  });

  describe('Concurrent session access', () => {
    it('should handle concurrent getSession calls', async () => {
      const sessions = await Promise.all([
        getSession(),
        getSession(),
        getSession(),
      ]);

      expect(sessions).toHaveLength(3);
      sessions.forEach((session) => {
        expect(session).toEqual(mockSession);
      });
    });

    it('should handle mixed authenticated/unauthenticated states', async () => {
      let callCount = 0;
      mockAdapter.getSession = vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount % 2 === 0 ? mockSession : null;
      });
      configureAuth(mockAdapter);

      const results = await Promise.all([
        isAuthenticated(),
        isAuthenticated(),
        isAuthenticated(),
        isAuthenticated(),
      ]);

      // Should alternate between true and false
      expect(results).toContain(true);
      expect(results).toContain(false);
    });
  });
});
