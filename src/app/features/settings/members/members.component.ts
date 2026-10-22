import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { MemberService } from '../../../core/services/member.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../services/auth.service';
import { WorkspaceMember } from '../../../core/models/workspace-member.model';
import { WorkspaceRole } from '../../../core/models/enums';
import { InvitableRole } from '../../../core/models/invitation.model';

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatChipsModule,
    TranslatePipe,
  ],
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
})
export class MembersComponent {
  private svc   = inject(MemberService);
  private ws    = inject(WorkspaceService);
  private auth  = inject(AuthService);
  private snack = inject(MatSnackBar);
  private fb    = inject(FormBuilder);
  private translate = inject(TranslateService);

  readonly WorkspaceRole = WorkspaceRole;
  roles: InvitableRole[] = [WorkspaceRole.STAFF, WorkspaceRole.VIEWER];

  showInviteForm = signal(false);
  inviting       = signal(false);
  revoking       = signal<string | null>(null);

  members = toSignal(
    toObservable(this.ws.activeWorkspaceId).pipe(
      switchMap((wid) => wid ? this.svc.listAll(wid) : []),
    ),
    { initialValue: [] as WorkspaceMember[] },
  );

  inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role:  [WorkspaceRole.STAFF as InvitableRole, Validators.required],
  });

  async invite(): Promise<void> {
    if (!this.inviteForm.valid) return;
    const wid = this.ws.activeWorkspaceId();
    const uid = this.auth.getCurrentUser()?.uid;
    if (!wid || !uid) return;
    this.inviting.set(true);
    try {
      const { email, role } = this.inviteForm.getRawValue();
      const res = await this.svc.invite({ workspaceId: wid, email, role: role as InvitableRole });
      if (res.success) {
        this.snack.open(this.t('SETTINGS_MEMBERS.MEMBER_ADDED', { email }), this.t('COMMON.CLOSE'), { duration: 4000 });
        this.inviteForm.reset({ email: '', role: WorkspaceRole.STAFF as InvitableRole });
        this.showInviteForm.set(false);
      } else {
        this.snack.open(!res.success ? res.message : this.t('SETTINGS_MEMBERS.ERROR_SEND_INVITE'), this.t('COMMON.CLOSE'), { duration: 5000 });
      }
    } catch {
      this.snack.open(this.t('SETTINGS_MEMBERS.ERROR_UNEXPECTED'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.inviting.set(false);
    }
  }

  async changeRole(m: WorkspaceMember, role: InvitableRole): Promise<void> {
    if (m.role === WorkspaceRole.OWNER) {
      this.snack.open(this.t('SETTINGS_MEMBERS.ERROR_UPDATE_ROLE'), this.t('COMMON.CLOSE'), { duration: 4000 });
      return;
    }

    const wid = this.ws.activeWorkspaceId();
    const uid = this.auth.getCurrentUser()?.uid;
    if (!wid || !uid) return;
    try {
      await this.svc.updateRole({ workspaceId: wid, userId: m.userId, role });
      this.snack.open(this.t('SETTINGS_MEMBERS.ROLE_UPDATED'), this.t('COMMON.CLOSE'), { duration: 3000 });
    } catch {
      this.snack.open(this.t('SETTINGS_MEMBERS.ERROR_UPDATE_ROLE'), this.t('COMMON.CLOSE'), { duration: 4000 });
    }
  }

  async revoke(m: WorkspaceMember): Promise<void> {
    if (m.role === WorkspaceRole.OWNER) {
      this.snack.open(this.t('SETTINGS_MEMBERS.ERROR_REMOVE_MEMBER'), this.t('COMMON.CLOSE'), { duration: 4000 });
      return;
    }

    if (!confirm(this.t('SETTINGS_MEMBERS.CONFIRM_REMOVE', { name: m.displayName || m.email }))) return;
    const wid = this.ws.activeWorkspaceId();
    const uid = this.auth.getCurrentUser()?.uid;
    if (!wid || !uid) return;
    this.revoking.set(m.userId);
    try {
      await this.svc.revoke({ workspaceId: wid, userId: m.userId });
      this.snack.open(this.t('SETTINGS_MEMBERS.MEMBER_REMOVED'), this.t('COMMON.CLOSE'), { duration: 3000 });
    } catch {
      this.snack.open(this.t('SETTINGS_MEMBERS.ERROR_REMOVE_MEMBER'), this.t('COMMON.CLOSE'), { duration: 4000 });
    } finally {
      this.revoking.set(null);
    }
  }

  initials(name: string | null | undefined): string {
    if (!name) return '?';
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }

  roleLabel(role: WorkspaceRole | InvitableRole): string {
    return this.t(`SETTINGS_MEMBERS.ROLE_${role}`);
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
