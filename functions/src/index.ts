import { getApps, initializeApp } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { registerAccount, completeGoogleAccount, searchRegisteredCustomers, lookupMemberByEmail } from './accounts.js';

export {
  createReservation,
  deliverReservationNotification,
  updateReservationPayment,
  updateReservationStatus,
} from './reservations.js';
