import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Expense } from '../models/expense.model';

export interface CreateExpensePayload {
  expenseDate: string;
  month: string;
  label: string;
  amount: number;
}

@Injectable({ providedIn: 'root' })
export class ExpenseRepository {
  private firestore = inject(Firestore);

  list(workspaceId: string, month?: string): Observable<Expense[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    if (!month) {
      return collectionData<Expense>(col as any, { idField: 'expenseId' });
    }

    return collectionData<Expense>(
      query(col, where('month', '==', month)) as any,
      { idField: 'expenseId' },
    );
  }

  async create(
    workspaceId: string,
    payload: CreateExpensePayload,
    createdBy: string,
  ): Promise<string> {
    const ref = doc(collection(this.firestore, this.colPath(workspaceId)));
    await setDoc(ref, {
      expenseId: ref.id,
      workspaceId,
      expenseDate: payload.expenseDate,
      month: payload.month,
      label: payload.label,
      amount: payload.amount,
      createdBy,
      updatedBy: createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async remove(workspaceId: string, expenseId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, this.docPath(workspaceId, expenseId)));
  }

  private colPath(workspaceId: string): string {
    return `workspaces/${workspaceId}/expenses`;
  }

  private docPath(workspaceId: string, expenseId: string): string {
    return `workspaces/${workspaceId}/expenses/${expenseId}`;
  }
}
