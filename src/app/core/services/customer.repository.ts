import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { CustomerLookupOption, UpsertWorkspaceCustomerInput, WorkspaceCustomer } from '../models/customer.model';
import { CloudFunctionService } from './cloud-function.service';

@Injectable({ providedIn: 'root' })
export class CustomerRepository {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private functions = inject(CloudFunctionService);

  listRecent(workspaceId: string, maxItems = 100): Observable<WorkspaceCustomer[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    return collectionData<WorkspaceCustomer>(
      query(col, orderBy('lastUsedAt', 'desc'), limit(maxItems)) as any,
      { idField: 'customerId' },
    );
  }

  async searchRegistered(workspaceId: string, search: string): Promise<CustomerLookupOption[]> {
    const result = await this.functions.call<CustomerLookupOption[]>('searchRegisteredCustomers', {
      workspaceId,
      query: search,
    });
    if (!result.success) throw new Error(result.message);
    return result.data;
  }

  async upsertFromBooking(workspaceId: string, input: UpsertWorkspaceCustomerInput): Promise<void> {
    const actorUid = this.auth.getCurrentUser()?.uid ?? 'SYSTEM';
    const normalizedName = this.normalizeName(input.name);
    const normalizedPhone = this.normalizePhone(input.phone);
    const email = this.normalizeOptional(input.email);
    const notes = this.normalizeOptional(input.notes);

    if (!normalizedName || !normalizedPhone) {
      return;
    }

    const customerId = this.buildCustomerId(normalizedPhone, normalizedName, email);
    const ref = doc(this.firestore, this.docPath(workspaceId, customerId));
    const snapshot = await getDoc(ref as any);

    if (!snapshot.exists()) {
      await setDoc(ref, {
        customerId,
        workspaceId,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email,
        notes,
        nameLower: normalizedName,
        phoneNormalized: normalizedPhone,
        visitsCount: 1,
        lastUsedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actorUid,
        updatedBy: actorUid,
      });
      return;
    }

    const existing = snapshot.data() as Partial<WorkspaceCustomer>;
    await updateDoc(ref, {
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: email ?? existing.email ?? null,
      notes: notes ?? existing.notes ?? null,
      nameLower: normalizedName,
      phoneNormalized: normalizedPhone,
      visitsCount: Number(existing.visitsCount ?? 0) + 1,
      lastUsedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
  }

  private colPath(workspaceId: string): string {
    return `workspaces/${workspaceId}/customers`;
  }

  private docPath(workspaceId: string, customerId: string): string {
    return `${this.colPath(workspaceId)}/${customerId}`;
  }

  private normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private normalizePhone(value: string): string {
    const trimmed = value.trim();
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private buildCustomerId(phoneNormalized: string, nameLower: string, email: string | null): string {
    const emailPart = email ? email.toLowerCase() : 'na';
    const base = `${phoneNormalized}_${nameLower}_${emailPart}`;
    return base
      .replace(/[^a-zA-Z0-9_+.-]/g, '_')
      .slice(0, 120);
  }
}
