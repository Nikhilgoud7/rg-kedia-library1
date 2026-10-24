// server/lib/cohort/types.ts — Type definitions for Synthetic Cohort Validation & Credential Generation

export type UserRole = 'STUDENT' | 'TEACHER' | 'LIBRARIAN';
export type AcademicProgram = 'BCOM' | 'BBA' | 'BSC';
export type SecondLanguage = 'TELUGU' | 'SANSKRIT' | 'ARABIC' | 'HINDI';

export const VALID_ROLES: UserRole[] = ['STUDENT', 'TEACHER', 'LIBRARIAN'];
export const VALID_PROGRAMS: AcademicProgram[] = ['BCOM', 'BBA', 'BSC'];
export const VALID_LANGUAGES: SecondLanguage[] = ['TELUGU', 'SANSKRIT', 'ARABIC', 'HINDI'];

export const ACADEMIC_YEAR_SEMESTER_MAP: Record<number, number[]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
};

export interface SyntheticUserRecord {
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  // Student-specific fields
  rollNumber?: string | null;
  program?: string | null;
  branch?: string | null;
  year?: number | null;
  semester?: number | null;
  secondLanguage?: string | null;
}

export interface CohortValidationError {
  row: number; // 1-based index corresponding to data row
  field: string;
  code: string;
  message: string;
  value?: unknown;
}

export interface CohortSummaryStats {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  byRole: Record<UserRole, number>;
  byProgram: Record<string, number>;
  byYear: Record<number, number>;
  bySemester: Record<number, number>;
  academicMismatches: number;
  duplicateEmails: number;
  duplicateRollNumbers: number;
  dbConflicts: number;
}

export interface CohortValidationResult {
  isValid: boolean;
  summary: CohortSummaryStats;
  errors: CohortValidationError[];
  validRecords: SyntheticUserRecord[];
}

export interface CohortValidationOptions {
  checkDatabase?: boolean;
  prisma?: any;
  allowedEmailDomains?: string[];
  maxRecords?: number;
}

export interface GeneratedUserCredential {
  name: string;
  email: string;
  role: UserRole;
  rollNumber?: string | null;
  program?: string | null;
  branch?: string | null;
  year?: number | null;
  semester?: number | null;
  secondLanguage?: string | null;
  temporaryPassword: string;
  passwordHash: string;
  mustChangePassword: true;
}

export interface CredentialEnvelope {
  warning: string;
  generatedAt: string;
  recordCount: number;
  credentials: GeneratedUserCredential[];
}

export interface CredentialGenerationOptions {
  outputPath: string;
  overwrite?: boolean;
  passwordLength?: number;
  bcryptSaltRounds?: number;
  fileMode?: number;
  repoRoot?: string;
  format?: 'json' | 'csv';
}

export interface CredentialGenerationResult {
  outputPath: string;
  recordCount: number;
  fileSizeBytes: number;
  format: 'json' | 'csv';
  durationMs: number;
}
