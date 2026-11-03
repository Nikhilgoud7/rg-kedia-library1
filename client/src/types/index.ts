export type Role = 'STUDENT' | 'TEACHER' | 'LIBRARIAN';

export type Program = 'BCOM' | 'BBA' | 'BSC';

export type SecondLanguage = 'TELUGU' | 'SANSKRIT' | 'ARABIC' | 'HINDI';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  rollNumber?: string | null;
  program?: Program | null;
  branch?: string | null;
  year?: number | null;
  semester?: number | null;
  secondLanguage?: SecondLanguage | null;
  phone?: string | null;
  gender?: string | null;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  approvedAt?: string | null;
  approvedById?: string | null;
  rejectionReason?: string | null;
  active: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  _count?: {
    lendings?: number;
  };
}

export interface BookProgram {
  id: string;
  bookId: string;
  program: Program;
  branch?: string | null;
}

export interface BookCopy {
  id: string;
  bookId: string;
  copyNumber: number;
  condition: string;
  status: 'AVAILABLE' | 'ISSUED' | 'RESERVED' | 'LOST' | 'DAMAGED' | 'WITHDRAWN';
  barcode?: string | null;
  shelfLocation?: string | null;
  lendings?: Lending[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
  category: 'TEXTBOOK' | 'REFERENCE' | 'GENERAL' | 'LANGUAGE' | 'JOURNAL';
  segment: string;
  description?: string | null;
  totalCopies: number;
  availableCopies: number;
  shelfLocation?: string | null;
  coverImage?: string | null;
  createdAt: string;
  updatedAt: string;
  copies?: BookCopy[];
  bookPrograms?: BookProgram[];
  _count?: {
    copies?: number;
    requests?: number;
  };
}

export interface Lending {
  id: string;
  userId: string;
  bookCopyId: string;
  issuedDate: string;
  dueDate: string;
  returnedDate?: string | null;
  status: 'ISSUED' | 'RETURNED' | 'OVERDUE';
  fine: number;
  renewalCount: number;
  isOverdue?: boolean;
  daysOverdue?: number;
  issuedById?: string | null;
  notes?: string | null;
  createdAt: string;
  user?: User;
  bookCopy?: BookCopy & {
    book?: Book;
  };
}

export interface BookRequest {
  id: string;
  userId: string;
  bookId: string;
  type: 'BORROW' | 'RETURN_REQUEST';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  message?: string | null;
  responseMessage?: string | null;
  respondedById?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: User;
  book?: Book;
}

export interface ExamPaper {
  id: string;
  title: string;
  subject: string;
  program: Program;
  branch: string;
  year: number;
  semester: number;
  type: 'PREVIOUS_YEAR' | 'IMPORTANT_QUESTIONS' | 'STUDY_GUIDE';
  fileUrl: string;
  description?: string | null;
  uploadedById: string;
  storageProvider?: string;
  storageKey?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  checksum?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: {
    id?: string;
    name: string;
    role: Role;
  };
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'OVERDUE' | 'REQUEST' | 'APPROVAL';
  read: boolean;
  link?: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalBooks: number;
  totalCopies: number;
  issuedCopies: number;
  availableCopies: number;
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
  pendingRequests: number;
  overdueCount: number;
  todayIssued: number;
}

export interface BulkImportRowValidationError {
  row: number;
  column: string;
  message: string;
  value?: string;
}

export interface BulkImportSummary {
  totalRows: number;
  validRowCount: number;
  errorRowCount: number;
  totalBooks: number;
  totalPhysicalCopies: number;
  uniqueIsbns: number;
  totalBarcodes: number;
}

export interface BulkImportValidationReport {
  isValid: boolean;
  totalRows: number;
  validRows: any[];
  errors: BulkImportRowValidationError[];
  warnings: string[];
  summary: BulkImportSummary;
}

export interface BulkImportDatabaseDuplicates {
  existingIsbns: Array<{
    row: number;
    isbn: string;
    existingBookId: string;
    existingTitle: string;
  }>;
  existingBarcodes: Array<{
    row: number;
    barcode: string;
    existingCopyId: string;
    existingBookTitle: string;
  }>;
}

export interface BulkImportValidationResponse {
  isValid: boolean;
  validation: BulkImportValidationReport;
  databaseDuplicates: BulkImportDatabaseDuplicates;
}

export interface BulkImportExecutionResponse {
  success: boolean;
  message?: string;
  error?: string;
  summary?: {
    totalBooksImported: number;
    totalCopiesImported: number;
    totalBatches: number;
    bookIds: string[];
  };
  databaseDuplicates?: BulkImportDatabaseDuplicates;
  validation?: BulkImportValidationReport;
}
