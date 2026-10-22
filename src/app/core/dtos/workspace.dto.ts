import { CalendarViewMode, WorkspacePlan } from '../models/enums';
import { WorkspaceSettings } from '../models/workspace.model';

// =============================================================================
// CREATE WORKSPACE
// =============================================================================

export interface CreateWorkspaceDto {
  name: string;
  businessType?: string;
  timezone: string;
  currency: string;
  plan?: WorkspacePlan;
  supportedCurrencies?: string[];
  paymentMethods?: string[];
  calendarView?: CalendarViewMode;
  weekViewStartHour?: number;
  weekViewEndHour?: number;
  workspaceSettings?: WorkspaceSettings;
  phone?: string;
  whishNumber?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
}

export interface CreateWorkspaceResponseData {
  workspaceId: string;
}

// =============================================================================
// UPDATE WORKSPACE
// =============================================================================

export interface UpdateWorkspaceDto {
  workspaceId: string;
  name?: string;
  businessType?: string;
  timezone?: string;
  currency?: string;
  supportedCurrencies?: string[];
  paymentMethods?: string[];
  calendarView?: CalendarViewMode;
  weekViewStartHour?: number;
  weekViewEndHour?: number;
  workspaceSettings?: WorkspaceSettings;
  phone?: string | null;
  whishNumber?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  logoUrl?: string | null;
  plan?: WorkspacePlan;
}
