// tests/suites/bulkImportExecution.test.js — Phase 7B Bulk Import Execution Test Suite
import crypto from 'crypto';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import {
  serializeCsv,
  normalizeIsbn,
  BULK_IMPORT_COLUMNS,
} from '../helpers/csvHelper.js';

export async function runBulkImportExecutionTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Persona Setup & Authorization Checks
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p7b_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p7b_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'p7b_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // 1.1 Unauthenticated access
    const unauthRes = await unauthClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: 'Title,Author' },
    });
    assert(unauthRes.status === 401, 'POST /api/books/import/execute rejects unauthenticated access with HTTP 401');

    // 1.2 Student access forbidden
    const studentRes = await studentClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: 'Title,Author' },
    });
    assert(studentRes.status === 403, 'POST /api/books/import/execute forbids student with HTTP 403');

    // 1.3 Teacher access forbidden
    const teacherRes = await teacherClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: 'Title,Author' },
    });
    assert(teacherRes.status === 403, 'POST /api/books/import/execute forbids teacher with HTTP 403');

    // ---------------------------------------------------------
    // 2. Payload Validation & Error Handling
    // ---------------------------------------------------------
    // 2.1 Empty payload / no csvContent / no file
    const emptyRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: {},
    });
    assert(emptyRes.status === 400, 'POST /api/books/import/execute rejects empty payload with HTTP 400');

    // 2.2 Unsupported file extension via FormData
    const badFileForm = new FormData();
    const badBlob = new Blob(['sample text'], { type: 'text/plain' });
    badFileForm.append('file', badBlob, 'test.txt');
    const badFileRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: badFileForm,
    });
    assert(badFileRes.status === 400, 'Rejects non-CSV file upload with HTTP 400');
    assert(
      (badFileRes.body?.error || '').includes('Only CSV files are allowed'),
      'Returns helpful error message for non-CSV file extension'
    );

    // 2.3 Invalid CSV schema (missing required columns)
    const invalidSchemaCsv = 'InvalidHeader1,InvalidHeader2\r\nValue1,Value2';
    const invalidSchemaRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: invalidSchemaCsv },
    });
    assert(invalidSchemaRes.status === 400, 'Rejects CSV with missing required columns with HTTP 400');

    // 2.4 Invalid Category enum value
    const invalidEnumCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        'Book with Bad Category',
        'Author Name',
        '9780132350884',
        'Publisher',
        '1st',
        '2022',
        'INVALID_CATEGORY',
        'Commerce',
        'Description',
        '1',
        '',
        '',
        '',
        '',
      ],
    ]);
    const invalidEnumRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: invalidEnumCsv },
    });
    assert(invalidEnumRes.status === 400, 'Rejects invalid category enum value with HTTP 400');

    // ---------------------------------------------------------
    // 3. Successful Single Book Import (JSON payload)
    // ---------------------------------------------------------
    const uniqueIsbn1 = `978${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const barcode1A = `BC-${dataManager.sessionPrefix}-${crypto.randomBytes(3).toString('hex')}-1`;
    const barcode1B = `BC-${dataManager.sessionPrefix}-${crypto.randomBytes(3).toString('hex')}-2`;

    const singleBookCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        `[${dataManager.sessionPrefix}] Corporate Accounting Fundamentals`,
        'Dr. K. S. Sharma',
        uniqueIsbn1,
        'Himalaya Publishing',
        '3rd Edition',
        '2023',
        'TEXTBOOK',
        'Accounting',
        'Comprehensive guide to corporate accounting principles.',
        '2',
        'Rack C, Shelf 2',
        `${barcode1A};${barcode1B}`,
        'Good;Good',
        'BCOM:General;BBA',
      ],
    ]);

    const singleImportRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: singleBookCsv },
    });
    assert(singleImportRes.status === 200, 'Single book import succeeds with HTTP 200');
    assert(singleImportRes.body?.success === true, 'Response indicates success: true');
    assert(singleImportRes.body?.summary?.totalBooksImported === 1, 'Summary reports 1 book imported');
    assert(singleImportRes.body?.summary?.totalCopiesImported === 2, 'Summary reports 2 copies imported');
    assert(singleImportRes.body?.summary?.bookIds?.length === 1, 'Summary provides 1 created book ID');

    const createdBookId = singleImportRes.body?.summary?.bookIds?.[0];
    assert(typeof createdBookId === 'string', 'Created book ID is a valid string');
    dataManager.createdBookIds.add(createdBookId);

    // Verify DB state for imported book
    const dbBook = await dataManager.prisma.book.findUnique({
      where: { id: createdBookId },
      include: {
        copies: { orderBy: { copyNumber: 'asc' } },
        bookPrograms: { orderBy: { program: 'asc' } },
      },
    });

    assert(Boolean(dbBook), 'Imported book exists in database');
    assert(dbBook.author === 'Dr. K. S. Sharma', 'Book author matches CSV');
    assert(dbBook.isbn === uniqueIsbn1, 'Book ISBN matches normalized CSV ISBN');
    assert(dbBook.totalCopies === 2, 'Book totalCopies is 2');
    assert(dbBook.availableCopies === 2, 'Book availableCopies initialized to 2');
    assert(dbBook.category === 'TEXTBOOK', 'Book category matches TEXTBOOK');
    assert(dbBook.segment === 'Accounting', 'Book segment matches Accounting');
    assert(dbBook.shelfLocation === 'Rack C, Shelf 2', 'Book shelfLocation matches CSV');

    // Verify copies
    assert(dbBook.copies.length === 2, 'Exactly 2 BookCopy records created');
    assert(dbBook.copies[0].copyNumber === 1 && dbBook.copies[0].barcode === barcode1A, 'Copy 1 barcode matches CSV');
    assert(dbBook.copies[1].copyNumber === 2 && dbBook.copies[1].barcode === barcode1B, 'Copy 2 barcode matches CSV');
    assert(dbBook.copies[0].status === 'AVAILABLE', 'Copy 1 status is AVAILABLE');
    assert(dbBook.copies[1].status === 'AVAILABLE', 'Copy 2 status is AVAILABLE');
    assert(dbBook.copies[0].condition === 'Good', 'Copy 1 condition is Good');

    // Verify program mappings
    assert(dbBook.bookPrograms.length === 2, 'Exactly 2 BookProgram mappings created');
    const bcomProg = dbBook.bookPrograms.find((p) => p.program === 'BCOM');
    const bbaProg = dbBook.bookPrograms.find((p) => p.program === 'BBA');
    assert(Boolean(bcomProg) && bcomProg.branch === 'General', 'BCOM:General program mapping created');
    assert(Boolean(bbaProg) && bbaProg.branch === null, 'BBA program mapping created with null branch');

    // ---------------------------------------------------------
    // 4. Successful Multi-Book Import via Multipart FormData
    // ---------------------------------------------------------
    const uniqueIsbn2A = `978${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const uniqueIsbn2B = `978${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const barcode2A = `BC-${dataManager.sessionPrefix}-${crypto.randomBytes(3).toString('hex')}-10`;
    const barcode2B = `BC-${dataManager.sessionPrefix}-${crypto.randomBytes(3).toString('hex')}-11`;

    const multiBookCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        `[${dataManager.sessionPrefix}] Business Statistics in Practice`,
        'Prof. V. Ramanathan',
        uniqueIsbn2A,
        'Tata McGraw Hill',
        '2nd Edition',
        '2021',
        'REFERENCE',
        'Statistics',
        'Advanced business statistics handbook.',
        '2',
        'Rack B, Shelf 1',
        `${barcode2A};${barcode2B}`,
        'Good;Good',
        'BBA;BSC:Computer Applications',
      ],
      [
        `[${dataManager.sessionPrefix}] General Principles of Commercial Law`,
        'Adv. R. K. Gupta',
        uniqueIsbn2B,
        'Eastern Book Company',
        '4th Edition',
        '2022',
        'GENERAL',
        'Law',
        'Reference book on mercantile regulations.',
        '1',
        'Rack D, Shelf 4',
        '', // Auto-generated/optional barcode
        'Fair',
        'BCOM',
      ],
    ]);

    const multiForm = new FormData();
    const csvBlob = new Blob([multiBookCsv], { type: 'text/csv' });
    multiForm.append('file', csvBlob, 'batch_books.csv');

    const multiImportRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: multiForm,
    });

    assert(multiImportRes.status === 200, 'Multipart multi-book import succeeds with HTTP 200');
    assert(multiImportRes.body?.success === true, 'Multipart response indicates success: true');
    assert(multiImportRes.body?.summary?.totalBooksImported === 2, 'Summary reports 2 books imported');
    assert(multiImportRes.body?.summary?.totalCopiesImported === 3, 'Summary reports 3 copies imported (2 + 1)');
    assert(multiImportRes.body?.summary?.bookIds?.length === 2, 'Summary provides 2 created book IDs');

    for (const bId of multiImportRes.body?.summary?.bookIds || []) {
      dataManager.createdBookIds.add(bId);
    }

    // Verify both books exist in database
    const importedBooks = await dataManager.prisma.book.findMany({
      where: { id: { in: multiImportRes.body.summary.bookIds } },
      include: { copies: true, bookPrograms: true },
    });
    assert(importedBooks.length === 2, 'Both books persisted in database');
    const statBook = importedBooks.find((b) => b.isbn === uniqueIsbn2A);
    const lawBook = importedBooks.find((b) => b.isbn === uniqueIsbn2B);
    assert(Boolean(statBook) && statBook.copies.length === 2, 'Statistics book has 2 copies');
    assert(Boolean(lawBook) && lawBook.copies.length === 1, 'Law book has 1 copy');

    // ---------------------------------------------------------
    // 5. Duplicate Collisions & Transactional Rollback
    // ---------------------------------------------------------
    // 5.1 Pre-existing ISBN conflict in database
    const duplicateIsbnCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        `[${dataManager.sessionPrefix}] Conflicting Book With Existing ISBN`,
        'Another Author',
        uniqueIsbn1, // Already exists from section 3
        'Different Publisher',
        '1st Edition',
        '2024',
        'TEXTBOOK',
        'Accounting',
        'Test book',
        '1',
        '',
        '',
        '',
        'BCOM',
      ],
    ]);

    const dupIsbnRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: duplicateIsbnCsv },
    });
    assert(dupIsbnRes.status === 409, 'Import with existing database ISBN rejected with HTTP 409');
    assert(
      (dupIsbnRes.body?.error || '').includes('existing ISBN or physical copy barcode conflicts'),
      'Response mentions duplicate conflicts'
    );
    assert(
      dupIsbnRes.body?.databaseDuplicates?.existingIsbns?.length === 1,
      'Identified conflicting ISBN in database duplicates report'
    );

    // 5.2 Pre-existing Barcode conflict in database
    const duplicateBarcodeCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        `[${dataManager.sessionPrefix}] Book With Conflicting Barcode`,
        'Third Author',
        `978${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        'Publisher',
        '1st Edition',
        '2024',
        'TEXTBOOK',
        'Commerce',
        'Test book',
        '1',
        '',
        barcode1A, // Already assigned in section 3
        'Good',
        'BCOM',
      ],
    ]);

    const dupBarcodeRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: duplicateBarcodeCsv },
    });
    assert(dupBarcodeRes.status === 409, 'Import with existing database barcode rejected with HTTP 409');
    assert(
      dupBarcodeRes.body?.databaseDuplicates?.existingBarcodes?.length === 1,
      'Identified conflicting Barcode in database duplicates report'
    );

    // 5.3 In-file duplicate ISBN within the same import payload
    const sharedIsbn = `978${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const inFileDupIsbnCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      ['Book Alpha', 'Author A', sharedIsbn, '', '', '2023', 'TEXTBOOK', 'Tech', '', '1', '', '', '', ''],
      ['Book Beta', 'Author B', sharedIsbn, '', '', '2023', 'TEXTBOOK', 'Tech', '', '1', '', '', '', ''],
    ]);

    const inFileDupRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: inFileDupIsbnCsv },
    });
    assert(inFileDupRes.status === 400, 'In-file duplicate ISBN rejected with HTTP 400');
    assert(
      inFileDupRes.body?.validation?.errors?.some((e) => e.column === 'ISBN' && e.message.includes('Duplicate ISBN')),
      'Validation errors list duplicate ISBN'
    );

    // ---------------------------------------------------------
    // 6. Audit Log Verification
    // ---------------------------------------------------------
    const auditEntries = await dataManager.prisma.auditLog.findMany({
      where: {
        actorId: librarian.id,
        action: 'BOOK_CREATED',
      },
      orderBy: { timestamp: 'desc' },
    });

    assert(auditEntries.length >= 2, 'AuditLog recorded BOOK_CREATED actions for bulk import batches');
    const sampleBatchLog = auditEntries.find((a) => a.details && a.details.includes('batchImport'));
    assert(Boolean(sampleBatchLog), 'AuditLog details confirm batchImport: true flag');

    // ---------------------------------------------------------
    // 7. Security & Leak Detection Scan
    // ---------------------------------------------------------
    const leakedInSingle = findLeakedSecrets(singleImportRes.body);
    assert(leakedInSingle.length === 0, 'Zero credentials or secrets leaked in single import response');

    const leakedInMulti = findLeakedSecrets(multiImportRes.body);
    assert(leakedInMulti.length === 0, 'Zero credentials or secrets leaked in multi import response');

    const leakedInConflict = findLeakedSecrets(dupIsbnRes.body);
    assert(leakedInConflict.length === 0, 'Zero credentials or secrets leaked in 409 conflict response');
  } finally {
    // ---------------------------------------------------------
    // 8. Guaranteed Cleanup
    // ---------------------------------------------------------
    await dataManager.cleanup();
  }
}
