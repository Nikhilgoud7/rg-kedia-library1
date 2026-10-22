// tests/suites/bulkImportUIWorkflow.test.js — Phase 7C Librarian Import Modal, Preview Grid & Confirmation Workflow Test Suite
import crypto from 'crypto';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import {
  serializeCsv,
  parseCsv,
  normalizeIsbn,
  generateBookImportTemplateCsv,
  BULK_IMPORT_COLUMNS,
} from '../helpers/csvHelper.js';

export async function runBulkImportUIWorkflowTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Clients
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p7c_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const student = await dataManager.createStudent({ tag: 'p7c_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const teacher = await dataManager.createTeacher({ tag: 'p7c_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const unauthClient = createApiClient(baseUrl);

    // ---------------------------------------------------------
    // 2. Role-Based Access Control to Bulk Import Interfaces (Req 1, 2, 3)
    // ---------------------------------------------------------
    // 2.1 Librarian has full access to template, validate, and execute
    const libTemplateRes = await librarianClient.request('GET', '/api/books/import/template');
    assert(libTemplateRes.status === 200, 'Librarian can access template endpoint (HTTP 200)');

    const libValidateRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: generateBookImportTemplateCsv() },
    });
    assert(libValidateRes.status === 200, 'Librarian can access validation endpoint (HTTP 200)');

    // 2.2 Student forbidden from all import endpoints
    const stuTemplateRes = await studentClient.request('GET', '/api/books/import/template');
    assert(stuTemplateRes.status === 403, 'Student cannot access import template (HTTP 403)');

    const stuValidateRes = await studentClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: 'Title,Author' },
    });
    assert(stuValidateRes.status === 403, 'Student cannot access import validation (HTTP 403)');

    const stuExecuteRes = await studentClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: 'Title,Author' },
    });
    assert(stuExecuteRes.status === 403, 'Student cannot access import execution (HTTP 403)');

    // 2.3 Teacher forbidden from all import endpoints
    const tchTemplateRes = await teacherClient.request('GET', '/api/books/import/template');
    assert(tchTemplateRes.status === 403, 'Teacher cannot access import template (HTTP 403)');

    const tchValidateRes = await teacherClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: 'Title,Author' },
    });
    assert(tchValidateRes.status === 403, 'Teacher cannot access import validation (HTTP 403)');

    const tchExecuteRes = await teacherClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: 'Title,Author' },
    });
    assert(tchExecuteRes.status === 403, 'Teacher cannot access import execution (HTTP 403)');

    // 2.4 Unauthenticated access rejected
    const unauthRes = await unauthClient.request('GET', '/api/books/import/template');
    assert(unauthRes.status === 401, 'Unauthenticated user rejected with HTTP 401');

    // ---------------------------------------------------------
    // 3. File Selection & Validation Rules (Req 4, 5, 6)
    // ---------------------------------------------------------
    // 3.1 Invalid file extension rejection via FormData
    const badForm = new FormData();
    const badBlob = new Blob(['some text content'], { type: 'text/plain' });
    badForm.append('file', badBlob, 'test_books.txt');

    const badExtRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: badForm,
    });
    assert(badExtRes.status === 400, 'Non-CSV file extension rejected with HTTP 400');
    assert(
      (badExtRes.body?.error || '').toLowerCase().includes('only csv files are allowed'),
      'Error message clarifies that only .csv files are supported'
    );

    // 3.2 Oversized file rejection (>5MB)
    const largeBuffer = 'A'.repeat(5 * 1024 * 1024 + 100);
    const oversizedRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: largeBuffer },
    });
    assert(oversizedRes.status === 400, 'Oversized file (>5MB) rejected with HTTP 400');
    assert(
      (oversizedRes.body?.error || '').includes('5MB'),
      'Error message indicates 5MB maximum file size limit'
    );

    // ---------------------------------------------------------
    // 4. Valid CSV Preview & Grid Mapping (Req 7)
    // ---------------------------------------------------------
    const templateText = typeof libTemplateRes.body === 'string' ? libTemplateRes.body : '';
    const parsedTemplate = parseCsv(templateText);
    assert(parsedTemplate.length >= 3, 'Import template provides headers and sample data rows');
    assert(parsedTemplate[0].length === BULK_IMPORT_COLUMNS.length, 'Template has all 14 standard columns');

    // Verify all 14 standard columns present in template
    for (let cIdx = 0; cIdx < BULK_IMPORT_COLUMNS.length; cIdx++) {
      assert(
        parsedTemplate[0][cIdx].trim().toLowerCase() === BULK_IMPORT_COLUMNS[cIdx].toLowerCase(),
        `Column ${cIdx + 1} is ${BULK_IMPORT_COLUMNS[cIdx]}`
      );
    }

    // ---------------------------------------------------------
    // 5. Validation Rules & Row Error Highlighting (Req 8, 9, 10, 11)
    // ---------------------------------------------------------
    // 5.1 Invalid Row Highlighting (missing Title, invalid Category enum)
    const invalidRowCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        '', // Missing Title
        'Author Name',
        '9780132350884',
        'Publisher',
        '1st Edition',
        '2023',
        'INVALID_CATEGORY_NAME', // Invalid Category enum
        'Commerce',
        'Description',
        '2',
        'Rack A-1',
        '',
        '',
        'BCOM',
      ],
    ]);

    const invalidRowRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: invalidRowCsv },
    });
    assert(invalidRowRes.status === 200, 'Validation endpoint succeeds with HTTP 200');
    assert(invalidRowRes.body?.isValid === false, 'Validation reports isValid: false');
    assert(
      invalidRowRes.body?.validation?.errors?.some((e) => e.column === 'Title'),
      'Reports error on missing Title'
    );
    assert(
      invalidRowRes.body?.validation?.errors?.some((e) => e.column === 'Category'),
      'Reports error on invalid Category enum'
    );

    // 5.2 Duplicate ISBN in sheet detection (Req 9)
    const duplicateIsbn = `978${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const duplicateIsbnCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      ['Book Title 1', 'Author 1', duplicateIsbn, '', '', '2023', 'TEXTBOOK', 'Finance', '', '1', '', '', '', ''],
      ['Book Title 2', 'Author 2', duplicateIsbn, '', '', '2023', 'TEXTBOOK', 'Finance', '', '1', '', '', '', ''],
    ]);

    const dupIsbnRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: duplicateIsbnCsv },
    });
    assert(dupIsbnRes.body?.isValid === false, 'Duplicate ISBN in sheet fails validation');
    assert(
      dupIsbnRes.body?.validation?.errors?.some(
        (e) => e.column === 'ISBN' && e.message.toLowerCase().includes('duplicate')
      ),
      'Identified duplicate ISBN in spreadsheet'
    );

    // 5.3 Invalid Barcode Feedback: Barcode count exceeds TotalCopies (Req 10)
    const invalidBarcodeCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        'Test Single Copy Book',
        'Author',
        `978${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        '',
        '',
        '2023',
        'TEXTBOOK',
        'Management',
        '',
        '1', // TotalCopies = 1
        'Rack A-1',
        'BC-101;BC-102', // 2 barcodes provided for 1 copy!
        'Good',
        'BBA',
      ],
    ]);

    const invBarcodeRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: invalidBarcodeCsv },
    });
    assert(invBarcodeRes.body?.isValid === false, 'Barcode count mismatch fails validation');
    assert(
      invBarcodeRes.body?.validation?.errors?.some((e) =>
        e.message.toLowerCase().includes('cannot exceed totalcopies')
      ),
      'Validation error states barcodes count cannot exceed TotalCopies'
    );

    // 5.4 Correct import summary calculation (Req 11)
    const validMultiBookCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        `[${dataManager.sessionPrefix}] Principles of Marketing`,
        'Philip Kotler',
        `978${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        'Pearson',
        '17th Edition',
        '2022',
        'TEXTBOOK',
        'Marketing',
        'Foundational marketing principles',
        '2',
        'Rack M-1',
        `BC-${dataManager.sessionPrefix}-M1;BC-${dataManager.sessionPrefix}-M2`,
        'Good;Good',
        'BBA;BCOM',
      ],
      [
        `[${dataManager.sessionPrefix}] Business Mathematics`,
        'J. K. Singh',
        `978${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        'Himalaya',
        '3rd Edition',
        '2021',
        'REFERENCE',
        'Mathematics',
        'Applied business calculus',
        '3',
        'Rack M-2',
        `BC-${dataManager.sessionPrefix}-B1;BC-${dataManager.sessionPrefix}-B2;BC-${dataManager.sessionPrefix}-B3`,
        'Good;Good;Fair',
        'BCOM:General',
      ],
    ]);

    const validSummaryRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: validMultiBookCsv },
    });
    assert(validSummaryRes.status === 200, 'Valid multi-book CSV validated with HTTP 200');
    assert(validSummaryRes.body?.isValid === true, 'All rows marked isValid: true');
    assert(validSummaryRes.body?.validation?.summary?.totalBooks === 2, 'Summary counts 2 total books');
    assert(validSummaryRes.body?.validation?.summary?.totalPhysicalCopies === 5, 'Summary counts 5 total copies (2 + 3)');
    assert(validSummaryRes.body?.validation?.summary?.totalBarcodes === 5, 'Summary counts 5 total barcodes');
    assert(validSummaryRes.body?.validation?.summary?.validRowCount === 2, 'Summary reports 2 valid rows');
    assert(validSummaryRes.body?.validation?.summary?.errorRowCount === 0, 'Summary reports 0 error rows');

    // ---------------------------------------------------------
    // 6. Confirmation Disabled when Validation Fails (Req 12, 13)
    // ---------------------------------------------------------
    const blockedExecutionRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: invalidRowCsv },
    });
    assert(blockedExecutionRes.status === 400, 'Execution is rejected when CSV validation fails (HTTP 400)');
    assert(blockedExecutionRes.body?.success === false, 'Execution response has success: false');

    // ---------------------------------------------------------
    // 7. Multipart API Request & Successful Ingestion (Req 14, 15)
    // ---------------------------------------------------------
    const multiForm = new FormData();
    const csvBlob = new Blob([validMultiBookCsv], { type: 'text/csv' });
    multiForm.append('file', csvBlob, 'valid_books.csv');

    const executeRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: multiForm,
    });
    assert(executeRes.status === 200, 'Multipart bulk book import succeeds with HTTP 200');
    assert(executeRes.body?.success === true, 'Execute response has success: true');
    assert(executeRes.body?.summary?.totalBooksImported === 2, 'Summary reports 2 books imported');
    assert(executeRes.body?.summary?.totalCopiesImported === 5, 'Summary reports 5 physical copies created');
    assert(executeRes.body?.summary?.bookIds?.length === 2, 'Summary returns created book IDs');

    for (const bId of executeRes.body?.summary?.bookIds || []) {
      dataManager.createdBookIds.add(bId);
    }

    // Verify DB integrity for imported books
    const importedDbBooks = await dataManager.prisma.book.findMany({
      where: { id: { in: executeRes.body.summary.bookIds } },
      include: { copies: true, bookPrograms: true },
    });
    assert(importedDbBooks.length === 2, 'Exactly 2 books persisted in database');
    const mktBook = importedDbBooks.find((b) => b.segment === 'Marketing');
    const mathBook = importedDbBooks.find((b) => b.segment === 'Mathematics');
    assert(Boolean(mktBook) && mktBook.copies.length === 2, 'Marketing book has 2 copies in DB');
    assert(Boolean(mathBook) && mathBook.copies.length === 3, 'Math book has 3 copies in DB');
    assert(mktBook.availableCopies === 2, 'Marketing available copies initialized to 2');
    assert(mathBook.availableCopies === 3, 'Math available copies initialized to 3');
    assert(
      mktBook.copies.every((c) => c.status === 'AVAILABLE'),
      'All marketing copies have status AVAILABLE'
    );
    assert(
      mathBook.copies.every((c) => c.status === 'AVAILABLE'),
      'All math copies have status AVAILABLE'
    );

    // ---------------------------------------------------------
    // 8. Database Conflict Handling (Req 16, 17)
    // ---------------------------------------------------------
    // 8.1 Existing ISBN conflict detection
    const existingIsbnInDb = mktBook.isbn;
    const conflictIsbnCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        `[${dataManager.sessionPrefix}] Conflicting ISBN Book`,
        'New Author',
        existingIsbnInDb,
        '',
        '',
        '2023',
        'TEXTBOOK',
        'Finance',
        '',
        '1',
        '',
        '',
        '',
        'BCOM',
      ],
    ]);

    const isbnConflictVal = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: conflictIsbnCsv },
    });
    assert(isbnConflictVal.status === 200, 'Conflict check returns HTTP 200 with conflict report');
    assert(isbnConflictVal.body?.isValid === false, 'Payload marked invalid due to database duplicate');
    assert(
      isbnConflictVal.body?.databaseDuplicates?.existingIsbns?.length === 1,
      'Identified conflicting ISBN in database duplicates report'
    );
    assert(
      isbnConflictVal.body?.databaseDuplicates?.existingIsbns?.[0]?.title === mktBook.title,
      'Identified existing book title in conflict details'
    );

    const isbnConflictExec = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: conflictIsbnCsv },
    });
    assert(isbnConflictExec.status === 409, 'Execute rejects existing database ISBN with HTTP 409 Conflict');

    // 8.2 Existing Barcode conflict detection (Req 17)
    const existingBarcodeInDb = mktBook.copies[0].barcode;
    const conflictBarcodeCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        `[${dataManager.sessionPrefix}] Conflicting Barcode Book`,
        'Third Author',
        `978${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        '',
        '',
        '2023',
        'TEXTBOOK',
        'Economics',
        '',
        '1',
        '',
        existingBarcodeInDb, // Already assigned to marketing copy 1
        'Good',
        'BCOM',
      ],
    ]);

    const bcConflictExec = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: conflictBarcodeCsv },
    });
    assert(bcConflictExec.status === 409, 'Execute rejects existing database barcode with HTTP 409 Conflict');
    assert(
      bcConflictExec.body?.databaseDuplicates?.existingBarcodes?.length === 1,
      'Identified conflicting barcode in database duplicates report'
    );

    // ---------------------------------------------------------
    // 9. Concurrency & Duplicate Submission Prevention (Req 19)
    // ---------------------------------------------------------
    // Running concurrent imports with duplicate barcodes safely serializes/locks
    const uniqueIsbnA = `978${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const uniqueIsbnB = `978${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const sharedBc = `BC-SHARED-${dataManager.sessionPrefix}-${crypto.randomBytes(3).toString('hex')}`;

    const concurrentCsv1 = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      ['Race Book 1', 'Author 1', uniqueIsbnA, '', '', '2023', 'TEXTBOOK', 'Tech', '', '1', '', sharedBc, '', ''],
    ]);
    const concurrentCsv2 = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      ['Race Book 2', 'Author 2', uniqueIsbnB, '', '', '2023', 'TEXTBOOK', 'Tech', '', '1', '', sharedBc, '', ''],
    ]);

    // Fire in parallel
    const [p1, p2] = await Promise.all([
      librarianClient.request('POST', '/api/books/import/execute', { body: { csvContent: concurrentCsv1 } }),
      librarianClient.request('POST', '/api/books/import/execute', { body: { csvContent: concurrentCsv2 } }),
    ]);

    // Exactly one must succeed (200), and the other must be rejected (409 conflict or serialized error)
    const successCount = [p1, p2].filter((res) => res.status === 200).length;
    const conflictCount = [p1, p2].filter((res) => res.status === 409).length;

    assert(successCount === 1, 'Exactly one concurrent import succeeds with HTTP 200');
    assert(conflictCount === 1, 'The competing concurrent import is rejected with HTTP 409 Conflict');

    for (const res of [p1, p2]) {
      if (res.status === 200 && res.body?.summary?.bookIds) {
        for (const id of res.body.summary.bookIds) {
          dataManager.createdBookIds.add(id);
        }
      }
    }

    // ---------------------------------------------------------
    // 10. Existing Librarian Book-Management Workflows (Req 20)
    // ---------------------------------------------------------
    // 10.1 Book list filtering
    const listRes = await librarianClient.request('GET', '/api/books?limit=10');
    assert(listRes.status === 200, 'GET /api/books succeeds with HTTP 200');
    assert(Array.isArray(listRes.body?.books), 'Returns books array');

    // 10.2 Single book creation via standard form
    const createRes = await librarianClient.request('POST', '/api/books', {
      body: {
        title: `[${dataManager.sessionPrefix}] Manual Book Title`,
        author: 'Manual Author',
        isbn: `978${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        category: 'TEXTBOOK',
        segment: 'Finance',
        totalCopies: 2,
        shelfLocation: 'Rack Z-1',
        programs: [{ program: 'BCOM', branch: 'General' }],
      },
    });
    assert(createRes.status === 201, 'Standard single-book creation succeeds with HTTP 201');
    const manualBook = createRes.body?.book;
    assert(Boolean(manualBook?.id), 'Created book ID returned');
    dataManager.createdBookIds.add(manualBook.id);

    // 10.3 Single copy addition
    const addCopyRes = await librarianClient.request('POST', `/api/books/${manualBook.id}/copies`, {
      body: {
        count: 1,
        condition: 'Good',
        shelfLocation: 'Rack Z-2',
        barcode: `MANUAL-${dataManager.sessionPrefix}-1`,
      },
    });
    assert(addCopyRes.status === 201, 'Adding physical copy succeeds with HTTP 201');

    // 10.4 Inventory reconciliation
    const reconRes = await librarianClient.request('POST', `/api/books/${manualBook.id}/reconcile`);
    assert(reconRes.status === 200, 'Inventory reconciliation succeeds with HTTP 200');
    assert(reconRes.body?.result?.reconciled !== undefined, 'Returns reconciliation result object');

    // ---------------------------------------------------------
    // 11. Audit Log Verification
    // ---------------------------------------------------------
    const auditLogs = await dataManager.prisma.auditLog.findMany({
      where: {
        actorId: librarian.id,
        action: 'BOOK_CREATED',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(auditLogs.length >= 3, 'Audit logs recorded for bulk import and manual book creation');
    const bulkAudit = auditLogs.find((a) => a.details && a.details.includes('batchImport'));
    assert(Boolean(bulkAudit), 'Audit log contains batchImport metadata');

    // ---------------------------------------------------------
    // 12. Response Credential & Key Leakage Scan
    // ---------------------------------------------------------
    const leakedInVal = findLeakedSecrets(validSummaryRes.body);
    assert(leakedInVal.length === 0, 'Zero credentials leaked in validation response');

    const leakedInExec = findLeakedSecrets(executeRes.body);
    assert(leakedInExec.length === 0, 'Zero credentials leaked in execution response');

    const leakedInConflict = findLeakedSecrets(isbnConflictExec.body);
    assert(leakedInConflict.length === 0, 'Zero credentials leaked in conflict response');
  } finally {
    // ---------------------------------------------------------
    // 13. Guaranteed Cleanup
    // ---------------------------------------------------------
    await dataManager.cleanup();
  }
}
