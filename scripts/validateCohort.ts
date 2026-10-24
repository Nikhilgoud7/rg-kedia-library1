// scripts/validateCohort.ts — CLI Synthetic Cohort Validation Utility
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { validateSyntheticCohort } from '../server/lib/cohort/cohortValidator.js';

// Safe environment resolution
const envArg = process.argv.slice(2).find((a) => a.startsWith('--env='));
const explicitEnv = envArg ? envArg.split('=')[1] : process.env.ENV_FILE;
const targetEnv =
  explicitEnv || (process.env.NODE_ENV === 'production' ? '.env' : fs.existsSync('.env.test') ? '.env.test' : '.env');
if (fs.existsSync(targetEnv)) {
  dotenv.config({ path: targetEnv, override: true });
} else {
  dotenv.config();
}

async function main() {
  const args = process.argv.slice(2);

  const fileArg = args.find((a) => a.startsWith('--file='));
  const filePath = fileArg ? fileArg.split('=')[1] : args.find((a) => !a.startsWith('--'));

  const checkDb = args.includes('--check-db');
  const jsonOutput = args.includes('--json');
  const maxArg = args.find((a) => a.startsWith('--max='));
  const maxRecords = maxArg ? parseInt(maxArg.split('=')[1], 10) : undefined;

  if (!filePath) {
    console.error('❌ Error: Missing cohort file path.');
    console.error('Usage: tsx scripts/validateCohort.ts --file=<path> [--check-db] [--json]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Error: File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(resolvedPath, 'utf8');

  let prisma: PrismaClient | undefined;
  if (checkDb) {
    prisma = new PrismaClient();
  }

  try {
    const result = await validateSyntheticCohort(fileContent, {
      checkDatabase: checkDb,
      prisma,
      maxRecords,
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.isValid ? 0 : 1);
    }

    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║       RG-Kedia LMS — Synthetic Cohort Validator      ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log(`\n📄 Input File:     ${resolvedPath}`);
    console.log(`🔍 DB Check:       ${checkDb ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📊 Status:         ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`\n📈 Summary Statistics (DPDP Compliant — Zero PII):`);
    console.log(`   - Total Records:       ${result.summary.totalRecords}`);
    console.log(`   - Valid Records:       ${result.summary.validRecords}`);
    console.log(`   - Invalid Records:     ${result.summary.invalidRecords}`);
    console.log(`   - Students:            ${result.summary.byRole.STUDENT || 0}`);
    console.log(`   - Teachers:            ${result.summary.byRole.TEACHER || 0}`);
    console.log(`   - Librarians:          ${result.summary.byRole.LIBRARIAN || 0}`);

    if (Object.keys(result.summary.byProgram).length > 0) {
      console.log(`\n📚 By Program:`);
      for (const [prog, count] of Object.entries(result.summary.byProgram)) {
        console.log(`   - ${prog.padEnd(10)}: ${count}`);
      }
    }

    if (Object.keys(result.summary.byYear).length > 0) {
      console.log(`\n📅 By Academic Year:`);
      for (const [year, count] of Object.entries(result.summary.byYear)) {
        console.log(`   - Year ${year}   : ${count}`);
      }
    }

    if (
      result.summary.academicMismatches > 0 ||
      result.summary.duplicateEmails > 0 ||
      result.summary.duplicateRollNumbers > 0 ||
      result.summary.dbConflicts > 0
    ) {
      console.log(`\n⚠️ Conflict & Mismatch Metrics:`);
      console.log(`   - Academic Mismatches:     ${result.summary.academicMismatches}`);
      console.log(`   - Duplicate Emails:        ${result.summary.duplicateEmails}`);
      console.log(`   - Duplicate Roll Numbers:  ${result.summary.duplicateRollNumbers}`);
      console.log(`   - Database Collisions:     ${result.summary.dbConflicts}`);
    }

    if (result.errors.length > 0) {
      console.log(`\n❌ Validation Errors (${result.errors.length}):`);
      result.errors.slice(0, 25).forEach((err) => {
        const rowStr = err.row > 0 ? `Row ${String(err.row).padStart(3)}: ` : 'Cohort: ';
        console.log(`   [${err.code}] ${rowStr}${err.field} — ${err.message}`);
      });
      if (result.errors.length > 25) {
        console.log(`   ... and ${result.errors.length - 25} more error(s).`);
      }
    }

    if (!result.isValid) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n💥 Execution Error: ${err.message}`);
    process.exit(1);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

main();
