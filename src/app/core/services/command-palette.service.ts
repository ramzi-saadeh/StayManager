import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

export interface RecentItem {
  /** Unique identifier for deduplication. Format: `{type}:{id}` */
  key: string;
  label: string;
  subtitle: string;
  icon: string;
  route: string[];
}

const STORAGE_KEY = 'sm_cmd_recent';
const MAX_RECENT  = 5;

@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  // Opened lazily so MatDialog doesn't need to be injected until actually used.
  private dialogRef: MatDialogRef<unknown> | null = null;

  /** Open the command palette. Safe to call multiple times — idempotent. */
  async open(dialog: MatDialog): Promise<void> {
    if (this.dialogRef) return;

    const { CommandPaletteComponent } = await import(
      '../../ui/command-palette/command-palette.component'
    );

    this.dialogRef = dialog.open(CommandPaletteComponent, {
      width:          '600px',
      maxWidth:       '95vw',
      maxHeight:      '80vh',
      panelClass:     'command-palette-panel',
      autoFocus:      'input',
      restoreFocus:   true,
    });

    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null;
    });
  }

  // ── Recent items ──────────────────────────────────────────────────────────

  getRecentItems(userId: string | null | undefined, workspaceId: string | null | undefined): RecentItem[] {
    if (!userId || !workspaceId) return [];

    try {
      const raw = localStorage.getItem(this.storageKey(userId, workspaceId));
      return raw ? (JSON.parse(raw) as RecentItem[]) : [];
    } catch {
      return [];
    }
  }

  addRecentItem(
    userId: string | null | undefined,
    workspaceId: string | null | undefined,
    item: RecentItem,
  ): void {
    if (!userId || !workspaceId) return;

    const items = this.getRecentItems(userId, workspaceId).filter((i) => i.key !== item.key);
    items.unshift(item);
    localStorage.setItem(
      this.storageKey(userId, workspaceId),
      JSON.stringify(items.slice(0, MAX_RECENT)),
    );
  }

  private storageKey(userId: string, workspaceId: string): string {
    return `${STORAGE_KEY}:${userId}:${workspaceId}`;
  }
}
