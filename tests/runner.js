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
    stdio: 'pipe',
    env: { ...process.env, PORT: String(port) },
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
  const matchingKey = suiteArg ? Object.keys(SUITES).find((k) => k.toLowerCase() === suiteArg.toLowerCase()) : null;
  if (matchingKey && SUITES[matchingKey]) {
    suitesToRun.push({ key: matchingKey, ...SUITES[matchingKey] });
  } else {
    for (const [key, value] of Object.entries(SUITES)) {
      suitesToRun.push({ key, ...value });
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
