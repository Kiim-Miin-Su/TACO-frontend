// 도메인 모델 타입 (백엔드 응답과 1:1). 기본적으로 type 사용.
// 백엔드와 형태가 갈라지지 않도록, 변경 시 backend/src/modules/*/.entity.ts와 함께 수정.

export type ID = number;

export type StudentStatus = 'lead' | 'active' | 'paused' | 'completed' | 'canceled';
export type ResidenceType = 'domestic' | 'overseas';

export type Student = {
  id: ID;
  name: string;
  englishName?: string;
  phone?: string;
  grade?: number;
  schoolName?: string;
  residenceType: ResidenceType;
  status: StudentStatus;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'canceled';

export type Enrollment = {
  id: ID;
  studentId: ID;
  courseId: ID;
  roadmapId?: ID;
  status: EnrollmentStatus;
  totalSessions?: number;
  completedSessions: number;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'refunded' | 'partial_refund';
export type PaymentMethod = 'card' | 'transfer' | 'cash' | 'point' | 'etc';

export type Payment = {
  id: ID;
  enrollmentId?: ID;
  studentId: ID;
  payerParentId?: ID;
  amount: number;
  paidAmount: number;
  status: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
};
