// tests/suites/auditPhysicalInventory.test.js — Phase 11C Six-Monthly Physical Inventory Audit Test Suite
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runAuditPhysicalInventoryTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();
  const createdAuditIds = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas & Test Data
    // -------------------------------------------------------------------------
    const student = await dataManager.createStudent({ tag: 'inv_stu' });
    const teacher = await dataManager.createTeacher({ tag: 'inv_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'inv_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(student);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // Create test book with copies for inventory testing
    const book = await dataManager.createBook({
      title: 'Auditing and Assurance Services - Shelf Test',
      category: 'TEXTBOOK',
      totalCopies: 4,
    });

    const copies = await prisma.bookCopy.findMany({
      where: { bookId: book.id },
      orderBy: { copyNumber: 'asc' },
    });

    // Ensure copies have unique barcodes and known shelf locations
    const copy1 = await prisma.bookCopy.update({
      where: { id: copies[0].id },
      data: { barcode: `TEST-BC-INV-1-${Date.now()}`, shelfLocation: 'SHELF-A1' },
    });
    const copy2 = await prisma.bookCopy.update({
      where: { id: copies[1].id },
      data: { barcode: `TEST-BC-INV-2-${Date.now()}`, shelfLocation: 'SHELF-A1' },
    });
    const copy3 = await prisma.bookCopy.update({
      where: { id: copies[2].id },
      data: { barcode: `TEST-BC-INV-3-${Date.now()}`, shelfLocation: 'SHELF-A1' },
    });
    // Mark copy 4 as ISSUED to student to test borrowed-book protection
    const copy4 = await prisma.bookCopy.update({
      where: { id: copies[3].id },
      data: { barcode: `TEST-BC-INV-4-${Date.now()}`, status: 'ISSUED', shelfLocation: 'SHELF-A1' },
    });

    // Create an active lending for copy 4
    const lending = await prisma.lending.create({
      data: {
        userId: student.id,
        bookCopyId: copy4.id,
        issuedDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'ISSUED',
        issuedById: librarian.id,
      },
    });

    // =========================================================================
    // SECTION A: Initiate Physical Inventory Audit Engagement
    // =========================================================================
    const createAuditRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'SEMI_ANNUAL_INVENTORY',
        title: 'H1 Comprehensive Physical Stock Verification 2026',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-15',
        academicYear: '2026-2027',
        observations: 'Pre-monsoon physical shelf inventory audit.',
      },
    });

    assert(createAuditRes.status === 201, 'Librarian can create SEMI_ANNUAL_INVENTORY audit', `Got status ${createAuditRes.status}`);
    const audit = createAuditRes.body.data;
    createdAuditIds.push(audit.id);

    // =========================================================================
    // SECTION B: RBAC & Access Control Checks
    // =========================================================================
    const anonSessionRes = await anonClient.request('POST', `/api/audits/${audit.id}/inventory-session`, { body: {} });
    assert(anonSessionRes.status === 401, 'Anonymous user rejected from inventory session (HTTP 401)', `Got status ${anonSessionRes.status}`);

    const studentSessionRes = await studentClient.request('POST', `/api/audits/${audit.id}/inventory-session`, { body: {} });
    assert(studentSessionRes.status === 403, 'Student rejected from inventory session (HTTP 403)', `Got status ${studentSessionRes.status}`);

    const teacherSessionRes = await teacherClient.request('POST', `/api/audits/${audit.id}/inventory-session`, { body: {} });
    assert(teacherSessionRes.status === 403, 'Teacher rejected from inventory session (HTTP 403)', `Got status ${teacherSessionRes.status}`);

    // =========================================================================
    // SECTION C: Start Inventory Session
    // =========================================================================
    const startSessionRes = await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session`, { body: {} });
    assert(startSessionRes.status === 200, 'Librarian starts inventory session (HTTP 200)', `Got status ${startSessionRes.status}`);
    const session = startSessionRes.body.data;
    assert(session.status === 'ACTIVE', 'Inventory session is initialized with ACTIVE status');
    assert(session.totalExpected > 0, 'Inventory session captures positive totalExpected catalog count');
    assert(session.totalIssued >= 1, 'Inventory session accounts for issued copies baseline');
    assert(session.totalScanned === 0, 'totalScanned starts at 0');

    // Test idempotent session retrieval
    const idempotentStart = await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session`, { body: {} });
    assert(idempotentStart.status === 200, 'Subsequent startSession call returns existing active session');
    assert(idempotentStart.body.data.id === session.id, 'Same session ID returned idempotently');

    // =========================================================================
    // SECTION D: Barcode Scanning & Exception Detection
    // =========================================================================

    // 1. Valid scan with matching shelf
    const scan1Res = await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session/scan`, {
      body: {
        barcode: copy1.barcode,
        scannedShelf: 'SHELF-A1',
        notes: 'Condition verified Good',
      },
    });

    assert(scan1Res.status === 201, 'Valid barcode scan accepted (HTTP 201)', `Got status ${scan1Res.status}`);
    assert(scan1Res.body.data.matchStatus === 'MATCHED', 'Scanned copy correctly classified as MATCHED');
    assert(scan1Res.body.data.session.totalScanned === 1, 'totalScanned incremented to 1');
    assert(scan1Res.body.data.session.totalMatched === 1, 'totalMatched incremented to 1');

    // 2. Duplicate Scan Rejection (Defensive Inventory Count Guard)
    const duplicateScanRes = await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session/scan`, {
      body: {
        barcode: copy1.barcode,
        scannedShelf: 'SHELF-A1',
      },
    });

    assert(
      duplicateScanRes.status === 409,
      'Duplicate scan in same session is rejected with HTTP 409',
      `Got status ${duplicateScanRes.status}`
    );
    assert(
      duplicateScanRes.body.error && duplicateScanRes.body.error.includes('already scanned'),
      'Duplicate scan returns clear explanatory error message'
    );

    // 3. Unregistered barcode scan (physical book found not in digital catalog)
    const unregisteredBarcode = `UNREG-BOOK-${Date.now()}`;
    const scanUnregRes = await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session/scan`, {
      body: {
        barcode: unregisteredBarcode,
        scannedShelf: 'SHELF-B3',
        notes: 'Uncataloged donation copy found on shelf',
      },
    });

    assert(scanUnregRes.status === 201, 'Unregistered barcode scan recorded (HTTP 201)', `Got status ${scanUnregRes.status}`);
    assert(scanUnregRes.body.data.matchStatus === 'UNREGISTERED', 'Correctly classified as UNREGISTERED');
    assert(scanUnregRes.body.data.session.totalSurplus >= 1, 'totalSurplus incremented');
    assert(scanUnregRes.body.data.session.totalDiscrepancy >= 1, 'totalDiscrepancy incremented');

    // 4. Shelf Mismatch scan (book recorded at SHELF-A1 but scanned at SHELF-Z9)
    const scanMismatchRes = await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session/scan`, {
      body: {
        barcode: copy2.barcode,
        scannedShelf: 'SHELF-Z9', // Different from recorded SHELF-A1
        notes: 'Found in incorrect section',
      },
    });

    assert(scanMismatchRes.status === 201, 'Shelf mismatch scan recorded (HTTP 201)', `Got status ${scanMismatchRes.status}`);
    assert(scanMismatchRes.body.data.matchStatus === 'SHELF_MISMATCH', 'Correctly classified as SHELF_MISMATCH');

    // 5. Status Conflict scan (copy 4 is recorded as ISSUED to student, but physical copy scanned on shelf!)
    const scanStatusConflictRes = await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session/scan`, {
      body: {
        barcode: copy4.barcode,
        scannedShelf: 'SHELF-A1',
        notes: 'Physical copy present on shelf despite active lending record in system',
      },
    });

    assert(scanStatusConflictRes.status === 201, 'Status conflict scan recorded (HTTP 201)', `Got status ${scanStatusConflictRes.status}`);
    assert(scanStatusConflictRes.body.data.matchStatus === 'STATUS_CONFLICT', 'Correctly classified as STATUS_CONFLICT');

    // =========================================================================
    // SECTION E: Session Summary & Progress Tracking
    // =========================================================================
    const summaryRes = await librarianClient.request('GET', `/api/audits/${audit.id}/inventory-session`);
    assert(summaryRes.status === 200, 'Retrieve inventory session summary (HTTP 200)', `Got status ${summaryRes.status}`);
    const summary = summaryRes.body.data;

    assert(summary.session.totalScanned === 4, 'Summary reflects 4 total scans recorded');
    assert(summary.session.progressPercentage >= 0 && summary.session.progressPercentage <= 100, 'progressPercentage calculated properly');
    assert(summary.exceptions.length >= 3, 'Summary includes exception scans (UNREGISTERED, SHELF_MISMATCH, STATUS_CONFLICT)');

    // Issued Book Protection Check: copy4 is issued and was scanned, but copy3 is AVAILABLE and was not scanned.
    const isCopy3InUnscanned = summary.unscannedAvailable.some((c) => c.barcode === copy3.barcode);
    assert(isCopy3InUnscanned, 'Unscanned available copy (copy3) appears in unscannedAvailable list');

    // =========================================================================
    // SECTION F: Finalize Session & Create Discrepancies
    // =========================================================================
    const finalizeRes = await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session/finalize`, { body: {} });
    assert(finalizeRes.status === 200, 'Librarian can finalize inventory session (HTTP 200)', `Got status ${finalizeRes.status}`);
    assert(finalizeRes.body.data.discrepanciesCreated > 0, 'Discrepancies automatically generated for reconciliation');

    // Verify Audit state advanced to PENDING_RECONCILIATION
    const updatedAuditRes = await librarianClient.request('GET', `/api/audits/${audit.id}`);
    assert(
      updatedAuditRes.body.data.status === 'PENDING_RECONCILIATION',
      'Audit state advanced to PENDING_RECONCILIATION upon inventory finalization',
      `Got status ${updatedAuditRes.body.data.status}`
    );

    // Verify generated discrepancies in database
    const discrepancies = await prisma.auditDiscrepancy.findMany({
      where: { auditId: audit.id },
    });
    assert(discrepancies.length > 0, 'AuditDiscrepancy records persisted in database');

    const hasMissing = discrepancies.some((d) => d.category === 'MISSING_PHYSICAL_BOOK');
    const hasUnregistered = discrepancies.some((d) => d.category === 'UNREGISTERED_PHYSICAL_BOOK');
    const hasShelfMismatch = discrepancies.some((d) => d.category === 'INCORRECT_SHELF_LOCATION');
    const hasStatusConflict = discrepancies.some((d) => d.category === 'INCORRECT_STATUS');

    assert(hasMissing, 'Discrepancy generated for unscanned available book (MISSING_PHYSICAL_BOOK)');
    assert(hasUnregistered, 'Discrepancy generated for uncataloged book (UNREGISTERED_PHYSICAL_BOOK)');
    assert(hasShelfMismatch, 'Discrepancy generated for misplaced book (INCORRECT_SHELF_LOCATION)');
    assert(hasStatusConflict, 'Discrepancy generated for circulation conflict (INCORRECT_STATUS)');

    // Verify non-destructive integrity: BookCopy records were NOT deleted or mutated
    const copy1Check = await prisma.bookCopy.findUnique({ where: { id: copy1.id } });
    assert(Boolean(copy1Check), 'BookCopy record preserved without destructive mutation');

  } finally {
    // Teardown created audits and lendings
    if (createdAuditIds.length > 0) {
      await prisma.libraryAudit.deleteMany({
        where: { id: { in: createdAuditIds } },
      }).catch(() => {});
    }
    await dataManager.cleanup();
    await prisma.$disconnect();
  }
}
