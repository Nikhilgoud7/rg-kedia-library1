// tests/runner.js — Automated Regression Test Suite Dispatcher
import { spawn } from 'child_process';
import { verifyTestEnvironment } from './helpers/envGuard.js';
import { runAuthTests } from './suites/auth.test.js';
import { runAuthorizationTests } from './suites/authorization.test.js';
import { runLendingTests } from './suites/lending.test.js';
import { runConcurrencyTests } from './suites/concurrency.test.js';
import { runNotificationTests } from './suites/notification.test.js';
import { runDemoAndRetentionTests } from './suites/demoAndRetention.test.js';
import { runAuditLogTests } from './suites/auditLog.test.js';
import { runUserHardeningTests } from './suites/userHardening.test.js';
import { runLendingQueueTests } from './suites/lendingQueue.test.js';
import { runExamGuideTests } from './suites/examGuide.test.js';
import { runLibrarianPolishTests } from './suites/librarianPolish.test.js';
import { runCopyManagementTests } from './suites/copyManagement.test.js';
import { runInventoryReconciliationTests } from './suites/inventoryReconciliation.test.js';
import { runLostDamagedTests } from './suites/lostDamaged.test.js';
import { runInventoryExperienceTests } from './suites/inventoryExperience.test.js';
import { runInventoryCirculationTests } from './suites/inventoryCirculation.test.js';
import { runCrossPersonaInventoryTests } from './suites/crossPersonaInventory.test.js';
import { runInventoryFinalGateTests } from './suites/inventoryFinalGate.test.js';
import { runBulkImportFoundationTests } from './suites/bulkImportFoundation.test.js';
import { runBulkImportExecutionTests } from './suites/bulkImportExecution.test.js';
import { runBulkImportUIWorkflowTests } from './suites/bulkImportUIWorkflow.test.js';
import { runBulkImportFinalGateTests } from './suites/bulkImportFinalGate.test.js';
import { runBulkExportTests } from './suites/bulkExport.test.js';
import { runEnvGuardValidationTests } from './suites/envGuardValidation.test.js';
import { runStorageAdapterTests } from './suites/storageAdapter.test.js';
import { runBookCoverApiTests } from './suites/bookCoverApi.test.js';
import { runBookCoverUIWorkflowTests } from './suites/bookCoverUIWorkflow.test.js';
import { runDataExportTests } from './suites/dataExport.test.js';
import { runMandatoryPasswordChangeTests } from './suites/mandatoryPasswordChange.test.js';
import { runBackupRecoveryTests } from './suites/backupRecovery.test.js';
import { runSyntheticCohortTests } from './suites/syntheticCohort.test.js';
import { runMigrationSimulationTests } from './suites/migrationSimulation.test.js';
import { runDemoPurgeTests } from './suites/demoPurge.test.js';
import { runReportingFoundationTests } from './suites/reportingFoundation.test.js';
import { runReportingOverdueLossTests } from './suites/reportingOverdueLoss.test.js';
import { runReportingInventoryAnalyticsTests } from './suites/reportingInventoryAnalytics.test.js';
import { runLibrarianAnalyticsUIWorkflowTests } from './suites/librarianAnalyticsUIWorkflow.test.js';
import { runAuditFoundationTests } from './suites/auditFoundation.test.js';
import { runAuditMonthlyQuarterlyTests } from './suites/auditMonthlyQuarterly.test.js';
import { runAuditPhysicalInventoryTests } from './suites/auditPhysicalInventory.test.js';
import { runAuditDiscrepancyManagementTests } from './suites/auditDiscrepancyManagement.test.js';
import { runAuditAnnualInstitutionalTests } from './suites/auditAnnualInstitutional.test.js';
import { runAuditFinalIntegrationTests } from './suites/auditFinalIntegration.test.js';
import { runAuditRouteTests } from './suites/auditRouteIntegration.test.js';
import { runCloudExamStorageTests } from './suites/cloudExamStorage.test.js';

const SUITES = {
  auth: { name: 'Authentication Suite (Step 3)', fn: runAuthTests },
  authorization: { name: 'Role Authorization Suite (Step 4)', fn: runAuthorizationTests },
  lending: { name: 'Lending Policy & Lifecycle Suite (Step 5)', fn: runLendingTests },
  concurrency: { name: 'PostgreSQL Concurrency & Advisory Lock Suite (Step 6)', fn: runConcurrencyTests },
  notification: { name: 'Notification Regression Suite (Step 7)', fn: runNotificationTests },
  demo: { name: 'Demo Safeguards & Retention Suite (Phase 3G-4C)', fn: runDemoAndRetentionTests },
  audit: { name: 'AuditLog Infrastructure & Administrative Logging Suite (Phase 5B)', fn: runAuditLogTests },
  userHardening: { name: 'User Management Hardening & Administrative Protection Suite (Phase 5C)', fn: runUserHardeningTests },
  lendingQueue: { name: 'Lending Requests & Issued Books Queue Suite (Phase 5D)', fn: runLendingQueueTests },
  examGuide: { name: 'Exam Guide & Academic Material Manager Suite (Phase 5E)', fn: runExamGuideTests },
  librarianPolish: { name: 'Librarian UX Polish & Governance Suite (Phase 5F)', fn: runLibrarianPolishTests },
  copyManagement: { name: 'Physical Copy Management APIs Suite (Phase 6B)', fn: runCopyManagementTests },
  inventoryReconciliation: { name: 'Inventory Reconciliation & Consistency Engine Suite (Phase 6C)', fn: runInventoryReconciliationTests },
  lostDamaged: { name: 'Zero-Fine Lost & Damaged Workflows Suite (Phase 6D)', fn: runLostDamagedTests },
  inventoryExperience: { name: 'Librarian Physical Inventory UI & Copy Management Suite (Phase 6E)', fn: runInventoryExperienceTests },
  inventoryCirculation: { name: 'Real Inventory Circulation Integration & Barcode Operations Suite (Phase 6F)', fn: runInventoryCirculationTests },
  crossPersonaInventory: { name: 'Cross-Persona Physical Inventory & Student Visibility Suite (Phase 6G)', fn: runCrossPersonaInventoryTests },
  inventoryFinalGate: { name: 'Physical Inventory Final Quality Gate & End-to-End Lifecycle Suite (Phase 6H)', fn: runInventoryFinalGateTests },
  bulkImportFoundation: { name: 'Bulk Book Import Foundation & Validation Suite (Phase 7A)', fn: runBulkImportFoundationTests },
  bulkImportExecution: { name: 'Transactional Batch Import Execution Suite (Phase 7B)', fn: runBulkImportExecutionTests },
  bulkImportUIWorkflow: { name: 'Librarian Bulk Import Modal & Workflow Suite (Phase 7C)', fn: runBulkImportUIWorkflowTests },
  bulkImportFinalGate: { name: 'Bulk Book Import Final Quality Gate Suite (Phase 7D)', fn: runBulkImportFinalGateTests },
  bulkExport: { name: 'Bulk Book Export Engine Suite (Phase 7E)', fn: runBulkExportTests },
  envGuardValidation: { name: 'Test Database Environment Guard Validation Suite', fn: runEnvGuardValidationTests },
  storageAdapter: { name: 'Storage Adapter & Database Storage Driver Suite (Phase 8B)', fn: runStorageAdapterTests },
  bookCoverApi: { name: 'Book Cover API Suite (Phase 8C)', fn: runBookCoverApiTests },
  bookCoverUIWorkflow: { name: 'Book Cover UI Workflow Suite (Phase 8D)', fn: runBookCoverUIWorkflowTests },
  dataExport: { name: 'Personal Data Export & DPDP Compliance Suite (Phase 9A)', fn: runDataExportTests },
  mandatoryPasswordChange: { name: 'Mandatory First-Login Password Change Suite (Phase 9B)', fn: runMandatoryPasswordChangeTests },
  backupRecovery: { name: 'Automated Backup & Disaster Recovery Suite (Phase 9C)', fn: runBackupRecoveryTests },
  syntheticCohort: { name: 'Synthetic User Cohort Validation & Secure Credential Suite (Phase 9D)', fn: runSyntheticCohortTests },
  migrationSimulation: { name: 'Staging Dry-Run, Migration Simulation & Rollback Suite (Phase 9E)', fn: runMigrationSimulationTests },
  demoPurge: { name: 'Demo Account Cleanup & Provenance Suite (Phase 9F)', fn: runDemoPurgeTests },
  reportingFoundation: { name: 'Reporting Data Models & Circulation Foundation Suite (Phase 10A)', fn: runReportingFoundationTests },
  reportingOverdueLoss: { name: 'Overdue, Aging & Loss Analytics Suite (Phase 10B)', fn: runReportingOverdueLossTests },
  reportingInventoryAnalytics: { name: 'Inventory Condition, Shelf-Audit & Reconciliation Analytics Suite (Phase 10C)', fn: runReportingInventoryAnalyticsTests },
  librarianAnalyticsUIWorkflow: { name: 'Librarian Analytics Dashboard & UI Workflow Suite (Phase 10D)', fn: runLibrarianAnalyticsUIWorkflowTests },
  auditFoundation: { name: 'Audit Dashboard & Management Foundation Suite (Phase 11A)', fn: runAuditFoundationTests },
  auditMonthlyQuarterly: { name: 'Monthly & Quarterly Operational Audits Suite (Phase 11B)', fn: runAuditMonthlyQuarterlyTests },
  auditPhysicalInventory: { name: 'Audit Physical Inventory Suite (Phase 11C)', fn: runAuditPhysicalInventoryTests },
  auditDiscrepancyManagement: { name: 'Audit Discrepancy & Corrective Action Suite (Phase 11D)', fn: runAuditDiscrepancyManagementTests },
  auditAnnualInstitutional: { name: 'Annual Institutional Audit Suite (Phase 11E)', fn: runAuditAnnualInstitutionalTests },
  auditFinalIntegration: { name: 'Audit Evidence Export & Final Integration Suite (Phase 11F)', fn: runAuditFinalIntegrationTests },
  auditRoute: { name: 'Audit Route & UI Integrity Suite (Phase 12B)', fn: runAuditRouteTests },
  cloudExamStorage: { name: 'Cloud Exam Storage & Driver Suite (Phase 12C)', fn: runCloudExamStorageTests },
};

async function checkHealth(url) {
  try {
    const res = await fetch(`${url}/api/health`);
    return res.status === 200;
  } catch {
    return false;
  }
}

async function ensureServer(baseUrl, port) {
  const isUp = await checkHealth(baseUrl);
  if (isUp) {
    console.log(`[runner] Target server detected and healthy at ${baseUrl}`);
    return null;
  }

  console.log(`[runner] No server detected at ${baseUrl}. Launching background test server...`);
  const child = spawn('npx', ['tsx', 'server/index.ts'], {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    },
  });

  const maxAttempts = 30;
  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 600));
    if (await checkHealth(baseUrl)) {
      console.log(`[runner] Background server became healthy after ${i * 600}ms.`);
      return child;
    }
  }

  // Failed to start
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch {}

  throw new Error(`Server failed to start and respond at ${baseUrl}/api/health after ${maxAttempts * 600}ms.`);
}

function stopServer(child) {
  if (!child) return;
  console.log('[runner] Stopping background test server...');
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch (err) {
    console.error('[runner] Error stopping background server:', err.message);
  }
}

async function main() {
  const startTime = Date.now();
  console.log('================================================================');
  console.log('   RG-Kedia Library Management System — Regression Test Suite   ');
  console.log('================================================================\n');

  // Parse CLI flags
  const args = process.argv.slice(2);
  const suiteArg = args.find((a) => a.startsWith('--suite='))?.split('=')[1] || args.find((a) => Object.keys(SUITES).some((k) => k.toLowerCase() === a.toLowerCase()));
  const portArg = args.find((a) => a.startsWith('--port='))?.split('=')[1] || process.env.PORT || '5000';
  const port = parseInt(portArg, 10);
  const baseUrl = `http://localhost:${port}`;

  // Step 2: Enforce strict test environment safety
  await verifyTestEnvironment();

  // Determine target suites
  const suitesToRun = [];
  if (suiteArg && suiteArg.includes(',')) {
    const keys = suiteArg.split(',').map((k) => k.trim());
    for (const rawKey of keys) {
      const match = Object.keys(SUITES).find((k) => k.toLowerCase() === rawKey.toLowerCase());
      if (match && SUITES[match]) {
        suitesToRun.push({ key: match, ...SUITES[match] });
      }
    }
  } else {
    const matchingKey = suiteArg ? Object.keys(SUITES).find((k) => k.toLowerCase() === suiteArg.toLowerCase()) : null;
    if (matchingKey && SUITES[matchingKey]) {
      suitesToRun.push({ key: matchingKey, ...SUITES[matchingKey] });
    } else {
      for (const [key, value] of Object.entries(SUITES)) {
        suitesToRun.push({ key, ...value });
      }
    }
  }

  console.log(`[runner] Executing ${suitesToRun.length} suite(s): ${suitesToRun.map((s) => s.key).join(', ')}\n`);

  let spawnedProcess = null;
  const suiteResults = [];

  try {
    spawnedProcess = await ensureServer(baseUrl, port);

    for (const suite of suitesToRun) {
      console.log(`\n▶ Starting Suite: ${suite.name}`);
      const suiteStart = Date.now();
      let passed = 0;
      let failed = 0;
      const failures = [];

      const assert = (condition, description, detail = '') => {
        if (condition) {
          passed++;
          console.log(`    ✅ PASS: ${description}`);
        } else {
          failed++;
          failures.push({ description, detail });
          console.log(`    ❌ FAIL: ${description}${detail ? ' (' + detail + ')' : ''}`);
        }
      };

      try {
        await suite.fn(baseUrl, assert);
      } catch (suiteErr) {
        failed++;
        failures.push({ description: `Suite execution uncaught exception: ${suiteErr.message}`, detail: suiteErr.stack });
        console.error(`    ❌ CRITICAL EXCEPTION in ${suite.name}:`, suiteErr.message);
      }

      const suiteDuration = ((Date.now() - suiteStart) / 1000).toFixed(2);
      suiteResults.push({
        name: suite.name,
        key: suite.key,
        total: passed + failed,
        passed,
        failed,
        skipped: 0,
        duration: `${suiteDuration}s`,
        failures,
      });

      console.log(`⏹ Completed Suite: ${suite.name} [Passed: ${passed}, Failed: ${failed}, Duration: ${suiteDuration}s]`);
    }
  } finally {
    if (spawnedProcess) {
      stopServer(spawnedProcess);
    }
  }

  // Summary Report
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  console.log('\n================================================================');
  console.log('                    REGRESSION TEST RESULTS                     ');
  console.log('================================================================');
  console.log('| Suite Name                             | Total | Pass | Fail | Skip | Duration |');
  console.log('|----------------------------------------|-------|------|------|------|----------|');

  for (const res of suiteResults) {
    totalTests += res.total;
    totalPassed += res.passed;
    totalFailed += res.failed;
    totalSkipped += res.skipped;

    const paddedName = res.name.padEnd(38, ' ').slice(0, 38);
    const paddedTotal = String(res.total).padStart(5, ' ');
    const paddedPass = String(res.passed).padStart(4, ' ');
    const paddedFail = String(res.failed).padStart(4, ' ');
    const paddedSkip = String(res.skipped).padStart(4, ' ');
    const paddedDuration = res.duration.padStart(8, ' ');

    console.log(`| ${paddedName} | ${paddedTotal} | ${paddedPass} | ${paddedFail} | ${paddedSkip} | ${paddedDuration} |`);
  }

  console.log('|----------------------------------------|-------|------|------|------|----------|');
  const summaryLine = `TOTAL: ${totalTests} assertions | PASSED: ${totalPassed} | FAILED: ${totalFailed} | SKIPPED: ${totalSkipped} | DURATION: ${totalDuration}s`;
  console.log(`\n${summaryLine}\n`);

  if (totalFailed > 0) {
    console.error('❌ REGRESSION SUITE FAILED with one or more failing checks.');
    process.exit(1);
  } else {
    console.log('✅ ALL REGRESSION SUITES PASSED CLEANLY with ZERO regressions.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n[runner] Fatal unhandled error:', err.message);
  process.exit(1);
});
