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
  AcademyEvent,
  EventType,
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

export type NewSubjectInput = { code: string; name: string };
export type NewCourseInput = { name: string; subjectId: number; instructorId: number; price: number };
export type NewEventInput = {
  title: string;
  type: EventType;
  startDate: string;
  endDate: string;
  allDay?: boolean;
  memo?: string;
};

// 기간 + 요일 반복으로 다건 수업 생성
export type RecurringSessionInput = {
  courseId: number;
  instructorId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  weekdays: number[]; // 0(일)~6(토)
  durationMinutes: number;
  topic?: string;
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
  academyEvents: AcademyEvent[];

  // actions
  addStudent: (input: NewStudentInput) => Student;
  removeStudent: (id: number) => void;
  addCounselForm: (input: NewCounselInput) => CounselForm;
  updateCounselForm: (formId: number, patch: Partial<CounselForm>) => void;
  updateCounselStatus: (formId: number, status: CounselStatus) => void;
  addCounselRound: (formId: number, input: NewRoundInput) => void;
  addClassSession: (input: NewClassSessionInput) => ClassSession;
  addRecurringClassSessions: (input: RecurringSessionInput) => number;
  addPayment: (input: NewPaymentInput) => Payment;
  markPaymentPaid: (paymentId: number) => void;
  updatePayment: (id: number, patch: Partial<Payment>) => void;
  addExpense: (input: NewExpenseInput) => Expense;
  addSubject: (input: NewSubjectInput) => Subject;
  addCourse: (input: NewCourseInput) => Course;
  addAcademyEvent: (input: NewEventInput) => AcademyEvent;
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
  academyEvents: [...seed.academyEvents],

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

  // 기간 + 요일 반복으로 수업 다건 생성 (캘린더 표시용)
  addRecurringClassSessions: (input) => {
    let count = 0;
    set((s) => {
      const sessions: ClassSession[] = [];
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      let nid = s.classSessions.reduce((m, r) => Math.max(m, r.id), 0);
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (input.weekdays.includes(d.getDay())) {
          nid += 1;
          sessions.push({
            id: nid,
            courseId: input.courseId,
            instructorId: input.instructorId,
            sessionDate: d.toISOString().slice(0, 10),
            durationMinutes: input.durationMinutes,
            status: 'scheduled',
            topic: input.topic,
          });
        }
      }
      count = sessions.length;
      return { classSessions: [...sessions, ...s.classSessions] };
    });
    return count;
  },

  updatePayment: (id, patch) =>
    set((s) => ({
      payments: s.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  addSubject: (input) => {
    const subject: Subject = { id: 0, code: input.code, name: input.name };
    set((s) => {
      subject.id = nextId(s.subjects);
      return { subjects: [...s.subjects, subject] };
    });
    return subject;
  },

  addCourse: (input) => {
    const course: Course = {
      id: 0,
      name: input.name,
      subjectId: input.subjectId,
      instructorId: input.instructorId,
      price: input.price,
    };
    set((s) => {
      course.id = nextId(s.courses);
      return { courses: [...s.courses, course] };
    });
    return course;
  },

  addAcademyEvent: (input) => {
    const ev: AcademyEvent = {
      id: 0,
      title: input.title,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      allDay: input.allDay,
      memo: input.memo,
    };
    set((s) => {
      ev.id = nextId(s.academyEvents);
      return { academyEvents: [ev, ...s.academyEvents] };
    });
    return ev;
  },
}));
