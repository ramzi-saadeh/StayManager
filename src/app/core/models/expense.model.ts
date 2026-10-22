import { Timestamp } from 'firebase/firestore';
import { FirestoreDocument } from './base.model';

/**
 * Firestore path: /workspaces/{workspaceId}/expenses/{expenseId}
 */
export interface Expense extends FirestoreDocument {
  expenseId: string;
  workspaceId: string;

  /** YYYY-MM-DD selected by the owner when logging the expense. */
  expenseDate: string;

  /** YYYY-MM used for monthly finance filtering. */
  month: string;

  label: string;
  amount: number;

  createdBy: string;
  updatedBy: string;
}
