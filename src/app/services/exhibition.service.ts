import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Firestore,
  collection,
  onSnapshot,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
} from '@angular/fire/firestore';
// import { ExhibitionMember } from '../models/exhibition-member.model';
// import { BusinessFeedback } from '../models/business-feedback.model';
// import { ExhibitionFeedback } from '../models/exhibition-feedback.model';

@Injectable({
  providedIn: 'root',
})
export class ExhibitionService {
  // private firestore = inject(Firestore);
  // private membersCollection = collection(this.firestore, 'exhibition_members');
  // private feedbackCollection = collection(this.firestore, 'business_feedback');
  // private exhibitionFeedbackCollection = collection(this.firestore, 'exhibition_feedback');
  // private settingsCollection = collection(this.firestore, 'exhibition_settings');

  // getSettings(): Observable<{ resultsPublished: boolean }> {
  //   return new Observable<{ resultsPublished: boolean }>((subscriber) => {
  //     const docRef = doc(this.firestore, 'exhibition_settings/global');
  //     const unsubscribe = onSnapshot(
  //       docRef,
  //       (snapshot: any) => {
  //         if (snapshot.exists()) {
  //           subscriber.next(snapshot.data() as { resultsPublished: boolean });
  //         } else {
  //           subscriber.next({ resultsPublished: false });
  //         }
  //       },
  //       (error: any) => subscriber.error(error),
  //     );
  //     return () => unsubscribe();
  //   });
  // }

  // async updateSettings(published: boolean): Promise<void> {
  //   const { setDoc } = await import('@angular/fire/firestore');
  //   const docRef = doc(this.firestore, 'exhibition_settings/global');
  //   await setDoc(docRef, { resultsPublished: published }, { merge: true });
  // }

  // getMembers(): Observable<ExhibitionMember[]> {
  //   return new Observable<ExhibitionMember[]>((subscriber) => {
  //     const q = query(this.membersCollection, orderBy('createdDate', 'desc'));
  //     const unsubscribe = onSnapshot(
  //       q,
  //       (snapshot: any) => {
  //         const members = snapshot.docs.map((d: any) => {
  //           const data = d.data();
  //           return { id: d.id, ...data, createdDate: data['createdDate']?.toDate() || new Date() };
  //         }) as ExhibitionMember[];
  //         subscriber.next(members);
  //       },
  //       (error: any) => subscriber.error(error),
  //     );
  //     return () => unsubscribe();
  //   });
  // }

  // async getMemberById(id: string): Promise<ExhibitionMember | null> {
  //   const docRef = doc(this.firestore, `exhibition_members/${id}`);
  //   const snap = await getDoc(docRef);
  //   if (!snap.exists()) return null;
  //   const data = snap.data();
  //   return { id: snap.id, ...data, createdDate: data['createdDate']?.toDate() || new Date() } as ExhibitionMember;
  // }

  // async addMember(member: Omit<ExhibitionMember, 'id' | 'createdDate'>): Promise<void> {
  //   await addDoc(this.membersCollection, { ...member, createdDate: new Date() });
  // }

  // async deleteMember(id: string): Promise<void> {
  //   const batch = writeBatch(this.firestore);
    
  //   // 1. Delete member doc
  //   batch.delete(doc(this.firestore, `exhibition_members/${id}`));
    
  //   // 2. Delete all business feedback for this id
  //   const feedbackRef = collection(this.firestore, 'business_feedback');
  //   const q = query(feedbackRef, where('businessId', '==', id));
  //   const snap = await getDocs(q);
  //   snap.forEach((d) => {
  //     batch.delete(d.ref);
  //   });

  //   await batch.commit();
  // }

  // getFeedbackForBusiness(businessId: string): Observable<BusinessFeedback[]> {
  //   return new Observable<BusinessFeedback[]>((subscriber) => {
  //     const q = query(collection(this.firestore, 'business_feedback'), orderBy('createdDate', 'desc'));
  //     const unsubscribe = onSnapshot(
  //       q,
  //       (snapshot) => {
  //         const all = snapshot.docs.map((d) => {
  //           const data = d.data();
  //           return { id: d.id, ...data, createdDate: data['createdDate']?.toDate() || new Date() };
  //         }) as BusinessFeedback[];
  //         subscriber.next(all.filter((f) => f.businessId === businessId));
  //       },
  //       (error) => subscriber.error(error),
  //     );
  //     return () => unsubscribe();
  //   });
  // }

  // async addBusinessFeedback(feedback: Omit<BusinessFeedback, 'id' | 'createdDate'>): Promise<void> {
  //   await addDoc(this.feedbackCollection, { ...feedback, createdDate: new Date() });
  // }

  // getExhibitionFeedback(): Observable<ExhibitionFeedback[]> {
  //   return new Observable<ExhibitionFeedback[]>((subscriber) => {
  //     const q = query(this.exhibitionFeedbackCollection, orderBy('createdDate', 'desc'));
  //     const unsubscribe = onSnapshot(
  //       q,
  //       (snapshot) => {
  //         const list = snapshot.docs.map((d) => {
  //           const data = d.data();
  //           return { id: d.id, ...data, createdDate: data['createdDate']?.toDate() || new Date() };
  //         }) as ExhibitionFeedback[];
  //         subscriber.next(list);
  //       },
  //       (error) => subscriber.error(error),
  //     );
  //     return () => unsubscribe();
  //   });
  // }

  // async addExhibitionFeedback(feedback: Omit<ExhibitionFeedback, 'id' | 'createdDate'>): Promise<void> {
  //   await addDoc(this.exhibitionFeedbackCollection, { ...feedback, createdDate: new Date() });
  // }
}
