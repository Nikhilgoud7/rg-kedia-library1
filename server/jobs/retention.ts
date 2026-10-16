import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

export interface RetentionResult {
  deletedCount: number;
  cutoffDate: Date;
  retentionDays: number;
}

/**
 * Purges notifications marked as read that are older than the specified retention window (default 90 days).
 * Unread notifications are strictly preserved regardless of age.
 */
export async function purgeOldNotifications(retentionDays = 90): Promise<RetentionResult> {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await prisma.notification.deleteMany({
    where: {
      read: true,
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return {
    deletedCount: result.count,
    cutoffDate,
    retentionDays,
  };
}

async function runCli() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║    RG-Kedia LMS — Notification Retention Cleanup     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('⏳ Running 90-day retention purge for read notifications...');

  try {
    const result = await purgeOldNotifications(90);
    console.log(`✅ Retention job completed.`);
    console.log(`   Cutoff Date: ${result.cutoffDate.toISOString()}`);
    console.log(`   Deleted Read Notifications: ${result.deletedCount}`);
  } catch (error: any) {
    console.error('❌ Failed to run notification retention cleanup:', error.message || error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute when invoked directly from CLI
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('retention.ts') || process.argv[1].endsWith('retention.js'));

if (isDirectExecution) {
  runCli();
}
