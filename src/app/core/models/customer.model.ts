import { Timestamp } from 'firebase/firestore';

export type CustomerLookupOption = Pick<WorkspaceCustomer,
  'customerId' | 'name' | 'phone' | 'email' | 'notes' | 'nameLower' | 'phoneNormalized'>;

export interface WorkspaceCustomer {
  customerId: string;
  workspaceId: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  nameLower: string;
  phoneNormalized: string;
  visitsCount: number;
  lastUsedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
}

export interface UpsertWorkspaceCustomerInput {
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
}
