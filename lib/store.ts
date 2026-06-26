import { create } from 'zustand';
import type {
  Student,
  Parent,
  ParentStudent,
  Instructor,
  Subject,
  Course,
  Enrollment,
  ClassSession,
  Attendance,
  AttendanceStatus,
  SessionReport,
  Payment,
  PaymentMethod,
  Transaction,
  Expense,
  ExpenseCategory,
  InstructorPayout,
  CounselForm,
  CounselRound,
  CounselStatus,
  CounselSource,
  CounselResult,
  DesiredStartTime,
  LearningAtmosphere,
  StudentIntention,
} from '@/types';
import * as seed from './mock/seed';

const nextId = (rows: { id: number }[]) =>
  rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;

export type NewStudentInput = {
  name: string;
  englishName?: string;
  grade?: number;
  phone?: string;
  webId?: string; // 학생 로그인 id (선택 — 연결용)
  courseId?: number; // 등록할 코스 (선택)
  parent?: {
    name: string;
    phone?: string;
    webId?: string; // 부모 로그인 id (선택)
    relation?: string;
  };
};

const today = () => new Date().toISOString().slice(0, 10);

export type NewCounselInput = {
  applicantName: string;
  applicantPhone?: string;
  source: CounselSource; // internal_form(학생/학부모) | manual(상담실장) …
  assignedStaffId?: number;
  interestSubjectId?: number;
  interestCourseId?: number;
  academyExpectation?: string;
  desiredStartTime?: DesiredStartTime;
  learningAtmosphere?: LearningAtmosphere;
  studentIntention?: StudentIntention;
  weakness?: string;
};

export type NewRoundInput = {
  counselorId?: number;
  summary?: string;
  detail?: string;
  result?: CounselResult;
  nextAction?: string;
  nextContactAt?: string;
};

export type NewClassSessionInput = {
  courseId: number;
  instructorId: number;
  sessionDate: string;
  durationMinutes: number;
  topic?: string;
};

export type NewPaymentInput = {
  studentId: number;
  enrollmentId?: number;
  amount: number;
  paymentMethod?: PaymentMethod;
  dueAt?: string;
};

export type NewExpenseInput = {
  category: ExpenseCategory;
  title: string;
  amount: number;
  spentAt: string;
  vendor?: string;
  memo?: string;
};

type TacoState = {
  // collections (in-memory mock DB)
  students: Student[];
  parents: Parent[];
  parentStudents: ParentStudent[];
  instructors: Instructor[];
  subjects: Subject[];
  courses: Course[];
  enrollments: Enrollment[];
  classSessions: ClassSession[];
  attendance: Attendance[];
  sessionReports: SessionReport[];
  payments: Payment[];
  transactions: Transaction[];
  expenses: Expense[];
  instructorPayouts: InstructorPayout[];
  counselForms: CounselForm[];
  counselRounds: CounselRound[];

  // actions
  addStudent: (input: NewStudentInput) => Student;
  removeStudent: (id: number) => void;
  addCounselForm: (input: NewCounselInput) => CounselForm;
  updateCounselForm: (formId: number, patch: Partial<CounselForm>) => void;
  updateCounselStatus: (formId: number, status: CounselStatus) => void;
  addCounselRound: (formId: number, input: NewRoundInput) => void;
  addClassSession: (input: NewClassSessionInput) => ClassSession;
  addPayment: (input: NewPaymentInput) => Payment;
  markPaymentPaid: (paymentId: number) => void;
  addExpense: (input: NewExpenseInput) => Expense;
  setAttendance: (sessionId: number, studentId: number, status: AttendanceStatus) => void;
  upsertReport: (
    sessionId: number,
    studentId: number,
    instructorId: number,
    patch: { content?: string; homework?: string },
  ) => void;
  submitReport: (sessionId: number, studentId: number) => void;
};

export const useTacoStore = create<TacoState>((set) => ({
  students: [...seed.students],
  parents: [...seed.parents],
  parentStudents: [...seed.parentStudents],
  instructors: [...seed.instructors],
  subjects: [...seed.subjects],
  courses: [...seed.courses],
  enrollments: [...seed.enrollments],
  classSessions: [...seed.classSessions],
  attendance: [...seed.attendance],
  sessionReports: [...seed.sessionReports],
  payments: [...seed.payments],
  transactions: [...seed.transactions],
  expenses: [...seed.expenses],
  instructorPayouts: [...seed.instructorPayouts],
  counselForms: [...seed.counselForms],
  counselRounds: [...seed.counselRounds],

  addStudent: (input) => {
    const student: Student = {
      id: 0,
      name: input.name,
      englishName: input.englishName,
      grade: input.grade,
      phone: input.phone,
      status: input.courseId ? 'active' : 'lead', // 코스 등록까지 하면 active
      webId: input.webId,
    };
    set((s) => {
      student.id = nextId(s.students);
      const patch: Partial<TacoState> = { students: [student, ...s.students] };

      // 학부모(선택) → parents + 학생-부모 연결
      if (input.parent?.name) {
        const parent: Parent = {
          id: nextId(s.parents),
          name: input.parent.name,
          phone: input.parent.phone ?? '',
          kakaoAvailable: false,
          webId: input.parent.webId,
        };
        patch.parents = [...s.parents, parent];
        patch.parentStudents = [
          ...s.parentStudents,
          {
            id: nextId(s.parentStudents),
            parentId: parent.id,
            studentId: student.id,
            relation: input.parent.relation,
            isPayer: true,
            isPrimary: true,
          },
        ];
      }

      // 등록 코스(선택) → enrollment 생성
      if (input.courseId) {
        patch.enrollments = [
          ...s.enrollments,
          {
            id: nextId(s.enrollments),
            studentId: student.id,
            courseId: input.courseId,
            status: 'active',
            completedSessions: 0,
            enrolledAt: today(),
          },
        ];
      }
      return patch;
    });
    return student;
  },

  // 학생 삭제 시 출석·피드백·수강등록·결제·부모연결까지 cascade
  removeStudent: (id) =>
    set((s) => ({
      students: s.students.filter((x) => x.id !== id),
      enrollments: s.enrollments.filter((e) => e.studentId !== id),
      attendance: s.attendance.filter((a) => a.studentId !== id),
      sessionReports: s.sessionReports.filter((r) => r.studentId !== id),
      parentStudents: s.parentStudents.filter((ps) => ps.studentId !== id),
      payments: s.payments.filter((p) => p.studentId !== id),
    })),

  setAttendance: (sessionId, studentId, status) =>
    set((s) => {
      const existing = s.attendance.find(
        (a) => a.sessionId === sessionId && a.studentId === studentId,
      );
      if (existing) {
        return {
          attendance: s.attendance.map((a) =>
            a === existing ? { ...a, status } : a,
          ),
        };
      }
      return {
        attendance: [
          ...s.attendance,
          { id: nextId(s.attendance), sessionId, studentId, status },
        ],
      };
    }),

  upsertReport: (sessionId, studentId, instructorId, patch) =>
    set((s) => {
      const existing = s.sessionReports.find(
        (r) => r.sessionId === sessionId && r.studentId === studentId,
      );
      if (existing) {
        return {
          sessionReports: s.sessionReports.map((r) =>
            r === existing ? { ...r, ...patch } : r,
          ),
        };
      }
      return {
        sessionReports: [
          ...s.sessionReports,
          {
            id: nextId(s.sessionReports),
            sessionId,
            studentId,
            instructorId,
            content: patch.content ?? '',
            homework: patch.homework,
            status: 'draft',
          },
        ],
      };
    }),

  submitReport: (sessionId, studentId) =>
    set((s) => ({
      sessionReports: s.sessionReports.map((r) =>
        r.sessionId === sessionId && r.studentId === studentId
          ? { ...r, status: 'submitted' }
          : r,
      ),
    })),

  // 상담 신청 (학생/학부모 자가 작성 또는 상담실장 작성) → status=requested
  addCounselForm: (input) => {
    const form: CounselForm = {
      id: 0,
      applicantName: input.applicantName,
      applicantPhone: input.applicantPhone,
      assignedStaffId: input.assignedStaffId,
      status: 'requested',
      source: input.source,
      interestSubjectId: input.interestSubjectId,
      interestCourseId: input.interestCourseId,
      academyExpectation: input.academyExpectation,
      desiredStartTime: input.desiredStartTime,
      learningAtmosphere: input.learningAtmosphere,
      studentIntention: input.studentIntention,
      weakness: input.weakness,
      createdAt: today(),
    };
    set((s) => {
      form.id = nextId(s.counselForms);
      return { counselForms: [form, ...s.counselForms] };
    });
    return form;
  },

  updateCounselForm: (formId, patch) =>
    set((s) => ({
      counselForms: s.counselForms.map((f) =>
        f.id === formId ? { ...f, ...patch } : f,
      ),
    })),

  updateCounselStatus: (formId, status) =>
    set((s) => ({
      counselForms: s.counselForms.map((f) =>
        f.id === formId ? { ...f, status } : f,
      ),
    })),

  // 상담 회차 추가 (roundNo 자동 증가)
  addCounselRound: (formId, input) =>
    set((s) => {
      const rounds = s.counselRounds.filter((r) => r.counselFormId === formId);
      const roundNo = rounds.reduce((max, r) => Math.max(max, r.roundNo), -1) + 1;
      return {
        counselRounds: [
          ...s.counselRounds,
          {
            id: nextId(s.counselRounds),
            counselFormId: formId,
            roundNo,
            counselorId: input.counselorId,
            completedAt: today(),
            isCompleted: true,
            summary: input.summary,
            detail: input.detail,
            result: input.result,
            nextAction: input.nextAction,
            nextContactAt: input.nextContactAt,
          },
        ],
      };
    }),

  // 신규 수업 개설 (예정 상태)
  addClassSession: (input) => {
    const session: ClassSession = {
      id: 0,
      courseId: input.courseId,
      instructorId: input.instructorId,
      sessionDate: input.sessionDate,
      durationMinutes: input.durationMinutes,
      status: 'scheduled',
      topic: input.topic,
    };
    set((s) => {
      session.id = nextId(s.classSessions);
      return { classSessions: [session, ...s.classSessions] };
    });
    return session;
  },

  // 결제 청구 생성 (미수)
  addPayment: (input) => {
    const payment: Payment = {
      id: 0,
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      amount: input.amount,
      paidAmount: 0,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      dueAt: input.dueAt,
    };
    set((s) => {
      payment.id = nextId(s.payments);
      return { payments: [payment, ...s.payments] };
    });
    return payment;
  },

  // 수납 완료 → 입금 거래 원장에 반영 (대시보드 입금/미수금 연동)
  markPaymentPaid: (paymentId) =>
    set((s) => {
      const payment = s.payments.find((p) => p.id === paymentId);
      if (!payment || payment.status === 'paid') return {};
      const student = s.students.find((st) => st.id === payment.studentId);
      const tx: Transaction = {
        id: nextId(s.transactions),
        direction: 'in',
        category: 'enrollment',
        label: `수강료 입금 · ${student?.name ?? '학생'}`,
        amount: payment.amount,
        method: payment.paymentMethod,
        occurredAt: today(),
      };
      return {
        payments: s.payments.map((p) =>
          p.id === paymentId
            ? { ...p, status: 'paid', paidAmount: p.amount, paidAt: today() }
            : p,
        ),
        transactions: [tx, ...s.transactions],
      };
    }),

  // 지출 처리 → 출금 거래 원장에 반영 (대시보드 출금 연동)
  addExpense: (input) => {
    const expense: Expense = {
      id: 0,
      category: input.category,
      title: input.title,
      amount: input.amount,
      spentAt: input.spentAt,
      vendor: input.vendor,
      memo: input.memo,
    };
    set((s) => {
      expense.id = nextId(s.expenses);
      const tx: Transaction = {
        id: nextId(s.transactions),
        direction: 'out',
        category: 'expense',
        label: input.title,
        amount: input.amount,
        occurredAt: input.spentAt,
      };
      return {
        expenses: [expense, ...s.expenses],
        transactions: [tx, ...s.transactions],
      };
    });
    return expense;
  },
}));
