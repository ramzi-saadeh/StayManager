import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { ResourceRepository } from '../../../core/services/resource.repository';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../services/auth.service';
import { ResourceType, BookingMode, PriceUnit, WorkspacePlan } from '../../../core/models/enums';

@Component({
  selector: 'app-resource-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './resource-form.component.html',
  styleUrl: './resource-form.component.scss',
})
export class ResourceFormComponent implements OnInit {
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private fb      = inject(FormBuilder);
  private repo    = inject(ResourceRepository);
  private ws      = inject(WorkspaceService);
  private auth    = inject(AuthService);
  private snack   = inject(MatSnackBar);

  readonly ResourceType = ResourceType;
  readonly BookingMode  = BookingMode;
  readonly PriceUnit    = PriceUnit;

  isEdit      = signal(false);
  resourceId  = signal<string | null>(null);
  isLoading   = signal(false);

  resourceTypes = Object.values(ResourceType);
  bookingModes  = Object.values(BookingMode);
  priceUnits    = Object.values(PriceUnit);

  form = this.fb.nonNullable.group({
    name:               ['', [Validators.required, Validators.maxLength(64)]],
    type:               [ResourceType.GUEST_HOUSE, Validators.required],
    bookingMode:        [BookingMode.DATE_RANGE, Validators.required],
    description:        [''],
    capacity:           [null as number | null],
    basePrice:          [0, [Validators.required, Validators.min(0)]],
    priceUnit:          [PriceUnit.PER_NIGHT, Validators.required],
    bufferMinutes:      [0, [Validators.min(0)]],
    minDurationMinutes: [null as number | null],
    maxDurationMinutes: [null as number | null],
    isActive:           [true],
    sortOrder:          [0],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.resourceId.set(id);
      const wid = this.ws.activeWorkspaceId();
      if (!wid) return;
      this.repo.get(wid, id).pipe(take(1)).subscribe((r) => {
        if (!r) { this.router.navigate(['/resources']); return; }
        this.form.patchValue({
          name:               r.name,
          type:               r.type,
          bookingMode:        r.bookingMode,
          description:        r.description ?? '',
          capacity:           r.capacity,
          basePrice:          r.basePrice,
          priceUnit:          r.priceUnit,
          bufferMinutes:      r.bufferMinutes,
          minDurationMinutes: r.minDurationMinutes,
          maxDurationMinutes: r.maxDurationMinutes,
          isActive:           r.isActive,
          sortOrder:          r.sortOrder,
        });
        // bookingMode is immutable after first reservation — disable the control
        this.form.controls.bookingMode.disable();
      });
    }
  }

  typeLabel(type: ResourceType): string {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  priceUnitLabel(u: PriceUnit): string {
    return u.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async onSave(): Promise<void> {
    if (!this.form.valid) return;
    const wid = this.ws.activeWorkspaceId();
    const uid = this.auth.getCurrentUser()?.uid;
    if (!wid || !uid) return;
    this.isLoading.set(true);

    const v = this.form.getRawValue();

    try {
      if (this.isEdit()) {
        const rid = this.resourceId()!;
        await this.repo.update(wid, rid, {
          name:               v.name,
          description:        v.description || null,
          capacity:           v.capacity,
          basePrice:          v.basePrice,
          priceUnit:          v.priceUnit,
          bufferMinutes:      v.bufferMinutes,
          minDurationMinutes: v.minDurationMinutes,
          maxDurationMinutes: v.maxDurationMinutes,
          isActive:           v.isActive,
          sortOrder:          v.sortOrder,
        }, uid);
        this.snack.open('Resource updated.', 'OK', { duration: 3000 });
      } else {
        const workspace = this.ws.workspace$();
        if (this.isFreePlan(workspace?.plan)) {
          const existingResources = await firstValueFrom(this.repo.listAll(wid).pipe(take(1)));
          if (existingResources.length >= 1) {
            this.snack.open('Free plan allows only one resource. Upgrade your plan to add more.', 'Dismiss', {
              duration: 5500,
            });
            return;
          }
        }

        await this.repo.create(wid, {
          name:               v.name,
          type:               v.type,
          bookingMode:        v.bookingMode,
          description:        v.description || null,
          capacity:           v.capacity,
          basePrice:          v.basePrice,
          priceUnit:          v.priceUnit,
          bufferMinutes:      v.bufferMinutes,
          minDurationMinutes: v.minDurationMinutes,
          maxDurationMinutes: v.maxDurationMinutes,
          attributes:         {},
          imageUrls:          [],
          isActive:           v.isActive,
          sortOrder:          v.sortOrder,
        }, uid);
        this.snack.open('Resource created.', 'OK', { duration: 3000 });
      }
      this.router.navigate(['/resources']);
    } catch (error: any) {
      if (error?.message === 'FREE_PLAN_RESOURCE_LIMIT') {
        this.snack.open('Free plan allows only one resource. Upgrade your plan to add more.', 'Dismiss', {
          duration: 5500,
        });
        return;
      }

      this.snack.open('Failed to save resource. Please try again.', 'Dismiss', { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  private isFreePlan(value: unknown): boolean {
    const raw = String(value ?? '').trim().toUpperCase();
    return raw === WorkspacePlan.FREE;
  }
}
