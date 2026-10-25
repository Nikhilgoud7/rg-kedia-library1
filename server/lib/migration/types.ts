// server/lib/migration/types.ts — Type definitions for Phase 9E Staging Dry-Run, Migration Simulation & Rollback Engine

import { UserRole, AcademicProgram, SecondLanguage, SyntheticUserRecord, CohortValidationError } from '../cohort/types.js';

export type MigrationOperation = 'INSERT' | 'SKIP' | 'UPDATE' | 'CONFLICT';

export interface PlannedMigrationAction {
  row: number;
  operation: MigrationOperation;
  email: string;
  role: UserRole;
  rollNumber?: string | null;
  reason: string;
  existingUserId?: string;
}

export interface MigrationConflictRecord {
  row: number;
  email: string;
  rollNumber?: string | null;
  conflictType: 'EMAIL_ALREADY_EXISTS_WITH_DIFFERENT_ROLL' | 'ROLL_ALREADY_EXISTS_WITH_DIFFERENT_EMAIL' | 'INTRA_DATASET_COLLISION' | 'DATABASE_FIELD_MISMATCH';
  reason: string;
}

export interface MigrationReconciliationCounts {
  totalInDbBefore: number;
  studentsInDbBefore: number;
  teachersInDbBefore: number;
  librariansInDbBefore: number;
  plannedInserts: number;
  plannedSkips: number;
  plannedConflicts: number;
  projectedTotalInDbAfter: number;
  isReconciled: boolean;
}

export interface StagingDryRunResult {
  status: 'READY' | 'BLOCKED';
  totalSourceRecords: number;
  validRecordsCount: number;
  invalidRecordsCount: number;
  toInsertCount: number;
  toSkipCount: number;
  conflictCount: number;
  byRole: Record<UserRole, number>;
  byProgram: Record<string, number>;
  validationErrors: CohortValidationError[];
  conflicts: MigrationConflictRecord[];
  plannedActions: PlannedMigrationAction[];
  reconciliation: MigrationReconciliationCounts;
  zeroMutationVerified: boolean;
  dryRunAt: string;
}

export interface MigrationSimulationOptions {
  batchId?: string;
  actorId: string;
  batchSize?: number;
  requirePreBackup?: boolean;
  backupEncryptionKey?: string;
  skipPreBackup?: boolean;
  dryRun?: boolean;
  conflictStrategy?: 'SKIP_EXISTING' | 'FAIL_ON_CONFLICT';
  targetDbUrl?: string;
}

export interface MigrationSimulationResult {
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  batchId: string;
  totalRecords: number;
  insertedCount: number;
  skippedCount: number;
  conflictCount: number;
  createdUserIds: string[];
  reconciliation: {
    totalInDbBefore: number;
    insertedCount: number;
    skippedCount: number;
    totalInDbAfter: number;
    isReconciled: boolean;
  };
  preBackupVerified: boolean;
  preBackupFile?: string;
  auditLogCreated: boolean;
  durationMs: number;
  error?: string;
}

export interface RollbackOptions {
  batchId: string;
  actorId: string;
  userIds?: string[];
  dryRun?: boolean;
  targetDbUrl?: string;
}

export interface RollbackResult {
  status: 'SUCCESS' | 'FAILED';
  batchId: string;
  deletedCount: number;
  preRollbackCount: number;
  postRollbackCount: number;
  isReconciled: boolean;
  auditLogCreated: boolean;
  durationMs: number;
  error?: string;
}

// ─── Phase 9F Demo Account Provenance & Purge Types ───────────────────────

export type AccountClassification = 'VERIFIED_DEMO' | 'AMBIGUOUS' | 'NON_DEMO';

export interface ProvenanceDetails {
  userId: string;
  email: string;
  role: string;
  classification: AccountClassification;
  factors: {
    hasDemoEmailDomain: boolean;
    hasDemoNamePattern: boolean;
    hasDemoPhonePattern: boolean;
    hasDemoRollPattern: boolean;
    matchesCanonicalSeedPersona: boolean;
  };
  reasons: string[];
}

export interface DemoAccountInventory {
  totalUsersScanned: number;
  verifiedDemoCount: number;
  ambiguousCount: number;
  nonDemoCount: number;
  byRole: Record<string, number>;
  verifiedDemoUserIds: string[];
  ambiguousUserIds: string[];
  details: ProvenanceDetails[];
  inventoriedAt: string;
}

export interface DemoPurgeDependencyReport {
  userId: string;
  email: string;
  activeLendingsCount: number;
  historicalLendingsCount: number;
  bookRequestsCount: number;
  notificationsCount: number;
  examPapersCount: number;
  auditLogsAsActorCount: number;
  hasBlockingDependencies: boolean;
  blockingReasons: string[];
}

export interface DemoPurgePlan {
  status: 'READY' | 'BLOCKED';
  totalUsersBefore: number;
  eligibleForPurgeCount: number;
  blockedByDependenciesCount: number;
  ambiguousDetectedCount: number;
  totalToPurge: number;
  projectedTotalUsersAfter: number;
  zeroMutationVerified: boolean;
  blockingReasons: string[];
  dependencyReports: DemoPurgeDependencyReport[];
  plannedUserIds: string[];
  plannedAt: string;
}

export interface DemoPurgeOptions {
  actorId: string;
  dryRun?: boolean;
  requireBackup?: boolean;
  backupEncryptionKey?: string;
  skipBackup?: boolean;
  targetDbUrl?: string;
}

export interface DemoPurgeResult {
  status: 'SUCCESS' | 'BLOCKED' | 'FAILED' | 'ROLLED_BACK';
  purgedCount: number;
  prePurgeCount: number;
  postPurgeCount: number;
  isReconciled: boolean;
  preBackupVerified: boolean;
  preBackupFile?: string;
  auditLogCreated: boolean;
  durationMs: number;
  error?: string;
}
