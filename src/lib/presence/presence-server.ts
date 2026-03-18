/**
 * WebSocket presence server for tracking active file viewers.
 *
 * Handles events:
 * - file:viewer-joined — user opened a file
 * - file:viewer-left — user closed/navigated away
 * - file:viewers-list — request current viewers for a file
 *
 * Stale viewers are removed after STALE_TIMEOUT_MS.
 */

export interface IPresenceViewer {
  userId: string;
  username: string;
  avatarUrl?: string;
  joinedAt: number;
  lastSeen: number;
}

export interface IPresenceEvents {
  'file:viewer-joined': { fileId: string; viewer: IPresenceViewer };
  'file:viewer-left': { fileId: string; userId: string };
  'file:viewers-list': { fileId: string; viewers: IPresenceViewer[] };
}

const STALE_TIMEOUT_MS = 30_000;

export class PresenceServer {
  /** fileId → Map<userId, viewer> */
  private readonly viewers = new Map<string, Map<string, IPresenceViewer>>();

  /** Broadcast callback — set by the transport layer (e.g., Socket.IO) */
  private broadcastFn?: (
    event: string,
    data: IPresenceEvents[keyof IPresenceEvents],
  ) => void;

  setBroadcast(
    fn: (event: string, data: IPresenceEvents[keyof IPresenceEvents]) => void,
  ): void {
    this.broadcastFn = fn;
  }

  join(
    fileId: string,
    viewer: Omit<IPresenceViewer, 'joinedAt' | 'lastSeen'>,
  ): void {
    if (!this.viewers.has(fileId)) {
      this.viewers.set(fileId, new Map());
    }
    const fileViewers = this.viewers.get(fileId)!;
    const now = Date.now();
    const full: IPresenceViewer = { ...viewer, joinedAt: now, lastSeen: now };
    fileViewers.set(viewer.userId, full);

    this.broadcastFn?.('file:viewer-joined', { fileId, viewer: full });
  }

  leave(fileId: string, userId: string): void {
    const fileViewers = this.viewers.get(fileId);
    if (!fileViewers) return;
    fileViewers.delete(userId);
    if (fileViewers.size === 0) this.viewers.delete(fileId);

    this.broadcastFn?.('file:viewer-left', { fileId, userId });
  }

  heartbeat(fileId: string, userId: string): void {
    const viewer = this.viewers.get(fileId)?.get(userId);
    if (viewer) viewer.lastSeen = Date.now();
  }

  getViewers(fileId: string): IPresenceViewer[] {
    const fileViewers = this.viewers.get(fileId);
    if (!fileViewers) return [];
    return Array.from(fileViewers.values());
  }

  listViewers(fileId: string): void {
    this.broadcastFn?.('file:viewers-list', {
      fileId,
      viewers: this.getViewers(fileId),
    });
  }

  /** Remove viewers that haven't sent a heartbeat within the timeout. */
  purgeStale(): void {
    const cutoff = Date.now() - STALE_TIMEOUT_MS;
    for (const [fileId, fileViewers] of this.viewers) {
      for (const [userId, viewer] of fileViewers) {
        if (viewer.lastSeen < cutoff) {
          fileViewers.delete(userId);
          this.broadcastFn?.('file:viewer-left', { fileId, userId });
        }
      }
      if (fileViewers.size === 0) this.viewers.delete(fileId);
    }
  }
}
