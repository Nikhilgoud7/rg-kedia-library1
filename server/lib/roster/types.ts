// server/lib/roster/types.ts — Type definitions for Production Student Roster Importer

export type AcademicProgram = 'BCOM' | 'BBA' | 'BSC';
export type SecondLanguage = 'TELUGU' | 'SANSKRIT' | 'ARABIC' | 'HINDI';

export const VALID_PROGRAMS: AcademicProgram[] = ['BCOM', 'BBA', 'BSC'];
export const VALID_LANGUAGES: SecondLanguage[] = ['TELUGU', 'SANSKRIT', 'ARABIC', 'HINDI'];

export const ACADEMIC_YEAR_SEMESTER_MAP: Record<number, number[]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
};

export const MAX_ROSTER_RECORDS = 5000;

export interface StudentRosterRecord {
  rowNumber: number; // 1-based CSV row number (header is row 1, data starts at row 2)
  name: string;
  rollNumber: string;
  email: string;
  program: AcademicProgram;
  branch: string | null;
  year: number | null;
  semester: number | null;
  secondLanguage: SecondLanguage | null;
  phone: string | null;
}

export interface RosterValidationError {
  row: number;
  field: string;
  code: string;
  message: string;
  value?: unknown;
}

export interface RosterSummaryStats {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  byProgram: Record<string, number>;
  byYear: Record<number, number>;
  bySemester: Record<number, number>;
  duplicateEmails: number;
  duplicateRollNumbers: number;
  dbConflicts?: number;
}

export interface RosterValidationResult {
  isValid: boolean;
  totalRows: number;
  validRecords: StudentRosterRecord[];
  errors: RosterValidationError[];
  summary: RosterSummaryStats;
}

export interface GeneratedStudentCredential {
  name: string;
  email: string;
  rollNumber: string;
  program: AcademicProgram;
  branch: string | null;
  year: number | null;
  semester: number | null;
  secondLanguage: SecondLanguage | null;
  phone: string | null;
  temporaryPassword: string;
  passwordHash: string;
  mustChangePassword: true;
}

export interface StudentCredentialEnvelope {
  warning: string;
  generatedAt: string;
  recordCount: number;
  credentials: GeneratedStudentCredential[];
}

export interface RosterImportOptions {
  csvText: string;
  dryRun?: boolean;
  confirmProduction?: boolean;
  actorId?: string;
  skipExisting?: boolean;
  credentialsOutputPath?: string;
  credentialsFormat?: 'json' | 'csv';
  prisma?: any;
  env?: NodeJS.ProcessEnv;
  sourceName?: string;
  testSimulateFailure?: boolean;
  testSimulateCleanupFailure?: boolean;
}

export interface RosterImportSuccessResult {
  success: true;
  dryRun: boolean;
  message: string;
  summary: {
    totalRows: number;
    validRows: number;
    createdCount: number;
    skippedCount: number;
    conflictCount: number;
    createdRollNumbers: string[];
    skippedRollNumbers: string[];
  };
  credentialsFile?: string;
  auditLogId?: string;
}

export interface RosterImportErrorResult {
  success: false;
  dryRun: boolean;
  error: string;
  code: string;
  validation?: RosterValidationResult;
  cleanupWarning?: string;
  orphanStagingPath?: string;
  dbConflicts?: {
    existingEmails: string[];
    existingRollNumbers: string[];
    conflicts: Array<{ rollNumber?: string; email?: string; reason: string }>;
  };
}

export type RosterImportResult = RosterImportSuccessResult | RosterImportErrorResult;
