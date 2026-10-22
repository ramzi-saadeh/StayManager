import { getApps, initializeApp } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export {
  createReservation,
  deliverReservationNotification,
  updateReservationPayment,
  updateReservationStatus,
} from './reservations.js';
