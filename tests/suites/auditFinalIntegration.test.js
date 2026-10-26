// tests/suites/auditFinalIntegration.test.js — Phase 11F Evidence Export & Final Integration Test Suite
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runAuditFinalIntegrationTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();
  const createdAuditIds = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas & Test Data
    // -------------------------------------------------------------------------
    const student = await dataManager.createStudent({ tag: 'csv_stu' });
    const teacher = await dataManager.createTeacher({ tag: 'csv_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'csv_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(student);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    const book = await dataManager.createBook({
      title: 'Taxation Law & Practice - Export Test',
      category: 'TEXTBOOK',
      totalCopies: 2,
    });

    // Create an audit
    const createAuditRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        title: 'Monthly Audit with Export Evidence — May 2026',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        academicYear: '2025-2026',
      },
    });

    assert(createAuditRes.status === 201, 'Librarian creates audit for export testing', `Got status ${createAuditRes.status}`);
    const audit = createAuditRes.body.data;
    createdAuditIds.push(audit.id);

    // Create a discrepancy with potential formula injection payload to verify defense-in-depth
    const maliciousFormulaDescription = '=cmd|\'/C calc\'!A0, Formula Test Payload';
    await librarianClient.request('POST', `/api/audits/${audit.id}/discrepancies`, {
      body: {
        category: 'OTHER',
        severity: 'LOW',
        barcode: '@MALICIOUS-BARCODE',
        description: maliciousFormulaDescription,
      },
    });

    // Start inventory session and record a scan
    await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session`, { body: {} });
    await librarianClient.request('POST', `/api/audits/${audit.id}/inventory-session/scan`, {
      body: {
        barcode: '+SCAN-TRIGGER-BC',
        scannedShelf: 'SHELF-EXPORT',
        notes: '=SUM(100+200)',
      },
    });

    // =========================================================================
    // SECTION A: Authorization Checks for Export
    // =========================================================================
    const anonExportRes = await anonClient.request('GET', `/api/audits/${audit.id}/export?type=summary`);
    assert(anonExportRes.status === 401, 'Anonymous user rejected from CSV export (HTTP 401)', `Got status ${anonExportRes.status}`);

    const stuExportRes = await studentClient.request('GET', `/api/audits/${audit.id}/export?type=summary`);
    assert(stuExportRes.status === 403, 'Student rejected from CSV export (HTTP 403)', `Got status ${stuExportRes.status}`);

    const teaExportRes = await teacherClient.request('GET', `/api/audits/${audit.id}/export?type=summary`);
    assert(teaExportRes.status === 403, 'Teacher rejected from CSV export (HTTP 403)', `Got status ${teaExportRes.status}`);

    // =========================================================================
    // SECTION B: Summary CSV Export & Structure
    // =========================================================================
    const summaryCsvRes = await librarianClient.request('GET', `/api/audits/${audit.id}/export?type=summary`);
    assert(summaryCsvRes.status === 200, 'Librarian can export summary CSV (HTTP 200)', `Got status ${summaryCsvRes.status}`);

    const contentType = summaryCsvRes.headers.get ? summaryCsvRes.headers.get('content-type') : summaryCsvRes.headers['content-type'];
    const contentDisp = summaryCsvRes.headers.get ? summaryCsvRes.headers.get('content-disposition') : summaryCsvRes.headers['content-disposition'];

    assert(contentType && contentType.includes('text/csv'), 'Content-Type is text/csv');
    assert(contentDisp && contentDisp.includes('attachment'), 'Content-Disposition is attachment');

    const summaryCsvText = typeof summaryCsvRes.body === 'string' ? summaryCsvRes.body : JSON.stringify(summaryCsvRes.body);
    assert(summaryCsvText.includes('Metric,Value'), 'CSV contains Metric,Value header');
    assert(summaryCsvText.includes('Institution'), 'CSV contains Institution row');
    assert(summaryCsvText.includes('R.G. Kedia College of Commerce'), 'CSV contains college name');

    // =========================================================================
    // SECTION C: Discrepancy CSV Export & Formula Injection Defense
    // =========================================================================
    const discCsvRes = await librarianClient.request('GET', `/api/audits/${audit.id}/export?type=discrepancies`);
    assert(discCsvRes.status === 200, 'Librarian can export discrepancies CSV (HTTP 200)', `Got status ${discCsvRes.status}`);

    const discCsvText = typeof discCsvRes.body === 'string' ? discCsvRes.body : JSON.stringify(discCsvRes.body);
    assert(discCsvText.includes('Audit Number,Barcode,Book Title,Category'), 'Discrepancy CSV headers present');

    // DEFENSE-IN-DEPTH: Verify formula trigger character '=' is neutralized with prepended apostrophe "'"
    assert(
      discCsvText.includes("''=cmd|") || discCsvText.includes("'=cmd|"),
      'Spreadsheet formula trigger "=" successfully neutralized with apostrophe in CSV output'
    );
    assert(
      discCsvText.includes("''@MALICIOUS") || discCsvText.includes("'@MALICIOUS"),
      'Spreadsheet formula trigger "@" successfully neutralized with apostrophe in CSV output'
    );

    // =========================================================================
    // SECTION D: Physical Inventory Scans CSV Export
    // =========================================================================
    const scansCsvRes = await librarianClient.request('GET', `/api/audits/${audit.id}/export?type=scans`);
    assert(scansCsvRes.status === 200, 'Librarian can export inventory scans CSV (HTTP 200)', `Got status ${scansCsvRes.status}`);

    const scansCsvText = typeof scansCsvRes.body === 'string' ? scansCsvRes.body : JSON.stringify(scansCsvRes.body);
    assert(scansCsvText.includes('Barcode,Book Title,Match Status'), 'Inventory scans CSV headers present');
    assert(scansCsvText.includes("'+SCAN-TRIGGER") || scansCsvText.includes("''+SCAN-TRIGGER"), 'Formula trigger "+" neutralized');

    // =========================================================================
    // SECTION E: Audit Evidence Retention, Immutability & Referential Protection
    // =========================================================================

    // 1. Deleting a librarian cannot erase their historical audit evidence
    const auditLeadLibrarian = await dataManager.createLibrarian({ tag: 'lead_lib' });
    const leadAuditRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        title: 'Lead Librarian Retention Audit',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        academicYear: '2026-2027',
      },
    });
    assert(leadAuditRes.status === 201, 'Created audit for librarian retention test');
    const leadAudit = leadAuditRes.body.data;
    createdAuditIds.push(leadAudit.id);

    // Update leadLibrarianId to auditLeadLibrarian.id
    await prisma.libraryAudit.update({
      where: { id: leadAudit.id },
      data: { leadLibrarianId: auditLeadLibrarian.id },
    });

    // Attempt to delete the lead librarian via admin API (must be rejected by Institutional Audit Protection guard)
    const deleteLeadRes = await librarianClient.request('DELETE', `/api/admin/users/${auditLeadLibrarian.id}`);
    assert(
      deleteLeadRes.status === 400,
      'Admin API rejects deleting librarian associated with institutional audit evidence (HTTP 400)',
      `Got status ${deleteLeadRes.status}`
    );
    assert(
      deleteLeadRes.body?.error?.includes('associated with institutional audit evidence'),
      'Admin API error explains deletion blocked due to institutional audit evidence'
    );

    // Verify audit evidence remains intact
    const preservedAudit = await prisma.libraryAudit.findUnique({ where: { id: leadAudit.id } });
    assert(
      preservedAudit !== null && preservedAudit.leadLibrarianId === auditLeadLibrarian.id,
      'Institutional audit record remains intact and attributed after rejected librarian deletion'
    );

    // 2. Deleting a user who scanned inventory cannot erase scan evidence
    const scannerAssistant = await dataManager.createStudent({ tag: 'scan_asst' });
    const invSession = await prisma.inventoryAuditSession.findFirst({ where: { auditId: audit.id } });
    const assistantScan = await prisma.inventoryAuditScan.create({
      data: {
        sessionId: invSession.id,
        barcode: 'BC-ASST-SCAN-001',
        scannedById: scannerAssistant.id,
        matchStatus: 'MATCHED',
        scannedShelf: 'AISLE-A1',
      },
    });

    // Attempt to delete scanner user via admin API (must be rejected)
    const deleteScannerRes = await librarianClient.request('DELETE', `/api/admin/users/${scannerAssistant.id}`);
    assert(
      deleteScannerRes.status === 400,
      'Admin API rejects deleting user associated with inventory scan evidence (HTTP 400)',
      `Got status ${deleteScannerRes.status}`
    );
    assert(
      deleteScannerRes.body?.error?.includes('inventory scans'),
      'Admin API error explains deletion blocked due to inventory scan evidence'
    );

    // Verify scan record remains intact
    const preservedScan = await prisma.inventoryAuditScan.findUnique({ where: { id: assistantScan.id } });
    assert(
      preservedScan !== null && preservedScan.scannedById === scannerAssistant.id,
      'Inventory scan evidence remains intact after rejected user deletion'
    );

    // 3. Deleting a user who performed corrective actions cannot erase action history
    const actionPerformer = await dataManager.createTeacher({ tag: 'act_perf' });
    const discrepancy = await prisma.auditDiscrepancy.findFirst({ where: { auditId: audit.id } });
    const correctiveAction = await prisma.auditCorrectiveAction.create({
      data: {
        discrepancyId: discrepancy.id,
        actionTaken: 'Physical shelf re-indexing and item verification',
        performedById: actionPerformer.id,
        resultingStatus: 'UNDER_INVESTIGATION',
      },
    });

    // Attempt to delete action performer via admin API (must be rejected)
    const deletePerformerRes = await librarianClient.request('DELETE', `/api/admin/users/${actionPerformer.id}`);
    assert(
      deletePerformerRes.status === 400,
      'Admin API rejects deleting user associated with corrective action records (HTTP 400)',
      `Got status ${deletePerformerRes.status}`
    );
    assert(
      deletePerformerRes.body?.error?.includes('corrective action'),
      'Admin API error explains deletion blocked due to corrective action history'
    );

    // Verify corrective action remains intact
    const preservedAction = await prisma.auditCorrectiveAction.findUnique({ where: { id: correctiveAction.id } });
    assert(
      preservedAction !== null && preservedAction.performedById === actionPerformer.id,
      'Corrective action history remains intact after rejected user deletion'
    );

    // 4. Sealed audit records cannot be deleted or modified through ordinary application workflows
    // Advance leadAudit to COMPLETED then CLOSED
    const startLeadRes = await librarianClient.request('PATCH', `/api/audits/${leadAudit.id}/status`, { body: { status: 'IN_PROGRESS' } });
    assert(startLeadRes.status === 200, 'Audit transitions to IN_PROGRESS');
    const completeLeadRes = await librarianClient.request('PATCH', `/api/audits/${leadAudit.id}/status`, { body: { status: 'COMPLETED' } });
    assert(completeLeadRes.status === 200, 'Audit transitions to COMPLETED');
    const closeLeadRes = await librarianClient.request('PATCH', `/api/audits/${leadAudit.id}/status`, { body: { status: 'CLOSED' } });
    assert(closeLeadRes.status === 200, 'Audit transitions to CLOSED');

    // Verify no HTTP DELETE route exists for audits
    const auditDeleteAttempt = await librarianClient.request('DELETE', `/api/audits/${leadAudit.id}`);
    assert(auditDeleteAttempt.status === 404, 'No HTTP DELETE endpoint exists for library audits (HTTP 404)');

    // Verify closed audit cannot be modified or reopened
    const reopenAttempt = await librarianClient.request('PATCH', `/api/audits/${leadAudit.id}/status`, {
      body: { status: 'IN_PROGRESS' },
    });
    assert(reopenAttempt.status === 400, 'Sealed CLOSED audit cannot be reopened or mutated (HTTP 400)');

    // Verify notes on closed audit cannot be modified
    const notesAttempt = await librarianClient.request('PATCH', `/api/audits/${leadAudit.id}/notes`, {
      body: { observations: 'New observation attempt after seal' },
    });
    assert(notesAttempt.status === 400, 'Observations on sealed CLOSED audit cannot be modified (HTTP 400)');

    // 5. Catalog deletion continues preserving audit evidence (onDelete: SetNull)
    const catalogBook = await dataManager.createBook({
      title: 'Catalog Deletion Retention Test Book',
      category: 'GENERAL',
      totalCopies: 1,
    });
    const catalogCopy = catalogBook.copies[0];

    // Create scan and discrepancy linked to catalog copy
    const catalogScan = await prisma.inventoryAuditScan.create({
      data: {
        sessionId: invSession.id,
        barcode: catalogCopy.barcode,
        bookCopyId: catalogCopy.id,
        scannedById: librarian.id,
        matchStatus: 'MATCHED',
        scannedShelf: 'AISLE-TEST',
      },
    });

    const catalogDisc = await prisma.auditDiscrepancy.create({
      data: {
        auditId: audit.id,
        bookId: catalogBook.id,
        bookCopyId: catalogCopy.id,
        barcode: catalogCopy.barcode,
        category: 'DAMAGED_BOOK',
        severity: 'MEDIUM',
        description: 'Binding wear observed during shelf verification',
      },
    });

    // Delete the BookCopy
    await prisma.bookCopy.delete({ where: { id: catalogCopy.id } });

    // Verify scan record preserved with bookCopyId set to null
    const preservedCatalogScan = await prisma.inventoryAuditScan.findUnique({ where: { id: catalogScan.id } });
    assert(preservedCatalogScan !== null, 'Scan record preserved after book copy deletion');
    assert(preservedCatalogScan.bookCopyId === null, 'Scan bookCopyId set to null via SetNull');
    assert(preservedCatalogScan.barcode === catalogCopy.barcode, 'Scanned barcode evidence string fully retained');

    // Verify discrepancy record preserved with bookCopyId set to null
    const preservedCatalogDisc = await prisma.auditDiscrepancy.findUnique({ where: { id: catalogDisc.id } });
    assert(preservedCatalogDisc !== null, 'Discrepancy preserved after book copy deletion');
    assert(preservedCatalogDisc.bookCopyId === null, 'Discrepancy bookCopyId set to null via SetNull');
    assert(preservedCatalogDisc.barcode === catalogCopy.barcode, 'Discrepancy barcode and details fully retained');

  } finally {
    if (createdAuditIds.length > 0) {
      await prisma.libraryAudit.deleteMany({
        where: { id: { in: createdAuditIds } },
      }).catch(() => {});
    }
    await dataManager.cleanup();
    await prisma.$disconnect();
  }
}
