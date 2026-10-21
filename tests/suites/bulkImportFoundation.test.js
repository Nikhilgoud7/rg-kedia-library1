// tests/suites/bulkImportFoundation.test.js — Phase 7A Bulk Import Foundation Test Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import {
  parseCsv,
  serializeCsv,
  sanitizeCsvField,
  normalizeIsbn,
  generateBookImportTemplateCsv,
  BULK_IMPORT_COLUMNS,
} from '../helpers/csvHelper.js';

export async function runBulkImportFoundationTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Clients
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p7a_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p7a_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'p7a_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // ---------------------------------------------------------
    // 2. CSV Parser & Sanitization Unit Verifications
    // ---------------------------------------------------------
    // 2.1 Formula injection escaping
    assert(sanitizeCsvField('=SUM(A1:A10)') === "'=SUM(A1:A10)", 'Leading = is escaped with single quote');
    assert(sanitizeCsvField('+cmd|/c calc') === "'+cmd|/c calc", 'Leading + is escaped with single quote');
    assert(sanitizeCsvField('-1+1') === "'-1+1", 'Leading - is escaped with single quote');
    assert(sanitizeCsvField('@import') === "'@import", 'Leading @ is escaped with single quote');
    assert(sanitizeCsvField('Normal Book Title') === 'Normal Book Title', 'Normal text is untouched');

    // 2.2 RFC 4180 parsing with quotes, commas, and escaped quotes
    const testCsv = `Title,Author,Description\r\n"Book, With Comma","Author ""Nick"" Name","Line 1\r\nLine 2"`;
    const parsed = parseCsv(testCsv);
    assert(parsed.length === 2, 'Parsed exactly 2 rows from RFC 4180 CSV');
    assert(parsed[1][0] === 'Book, With Comma', 'Correctly parsed comma inside quotes');
    assert(parsed[1][1] === 'Author "Nick" Name', 'Correctly unescaped double quotes');
    assert(parsed[1][2] === 'Line 1\r\nLine 2', 'Correctly parsed embedded newline in quoted field');

    // 2.3 ISBN normalization
    assert(normalizeIsbn('978-81-203-5120-1') === '9788120351201', 'ISBN correctly stripped of hyphens');

    // ---------------------------------------------------------
    // 3. Template Download Endpoint (GET /api/books/import/template)
    // ---------------------------------------------------------
    // 3.1 Authorization guards
    const unauthRes = await unauthClient.request('GET', '/api/books/import/template');
    assert(unauthRes.status === 401, 'Unauthenticated access to template is rejected with HTTP 401');

    const studentRes = await studentClient.request('GET', '/api/books/import/template');
    assert(studentRes.status === 403, 'Student access to template is forbidden with HTTP 403');

    const teacherRes = await teacherClient.request('GET', '/api/books/import/template');
    assert(teacherRes.status === 403, 'Teacher access to template is forbidden with HTTP 403');

    const librarianRes = await librarianClient.request('GET', '/api/books/import/template');
    assert(librarianRes.status === 200, 'Librarian can download import template with HTTP 200');

    // 3.2 Content & Header verification
    const contentType = librarianRes.headers.get('content-type') || '';
    assert(contentType.includes('text/csv'), 'Template content-type is text/csv');

    const contentDisposition = librarianRes.headers.get('content-disposition') || '';
    assert(contentDisposition.includes('attachment'), 'Template headers specify attachment');
    assert(contentDisposition.includes('rg_kedia_book_import_template.csv'), 'Template filename matches expected pattern');

    const templateText = typeof librarianRes.body === 'string' ? librarianRes.body : '';
    assert(generateBookImportTemplateCsv().charCodeAt(0) === 0xFEFF, 'Template includes UTF-8 BOM for Excel compatibility');
    assert(templateText.startsWith('Title,Author'), 'Template CSV content starts with Title header');

    const parsedTemplate = parseCsv(templateText);
    assert(parsedTemplate.length >= 3, 'Template contains header and at least 2 example rows');
    assert(parsedTemplate[0].length === BULK_IMPORT_COLUMNS.length, `Template header has all ${BULK_IMPORT_COLUMNS.length} standard columns`);
    assert(parsedTemplate[0][0] === 'Title' && parsedTemplate[0][1] === 'Author', 'Template headers match schema');

    // ---------------------------------------------------------
    // 4. Validation Engine (POST /api/books/import/validate)
    // ---------------------------------------------------------
    // 4.1 Authorization
    const valUnauth = await unauthClient.request('POST', '/api/books/import/validate', { body: { csvContent: 'Title,Author' } });
    assert(valUnauth.status === 401, 'Validate endpoint rejects unauthenticated access with HTTP 401');

    const valStudent = await studentClient.request('POST', '/api/books/import/validate', { body: { csvContent: 'Title,Author' } });
    assert(valStudent.status === 403, 'Validate endpoint forbids student with HTTP 403');

    const valTeacher = await teacherClient.request('POST', '/api/books/import/validate', { body: { csvContent: 'Title,Author' } });
    assert(valTeacher.status === 403, 'Validate endpoint forbids teacher with HTTP 403');

    // 4.2 Missing payload validation
    const valMissing = await librarianClient.request('POST', '/api/books/import/validate', { body: {} });
    assert(valMissing.status === 400, 'Missing csvContent returns HTTP 400');

    // 4.3 Empty file validation
    const emptyValRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: '   ' } });
    assert(emptyValRes.status === 200, 'Empty CSV request processed with HTTP 200');
    assert(emptyValRes.body?.isValid === false, 'Empty CSV marked invalid');
    assert(emptyValRes.body?.validation?.errors?.[0]?.message?.includes('empty'), 'Empty CSV returns clear error message');

    // 4.4 Missing required headers
    const badHeaderCsv = 'BookTitle,Writer,Category\r\nSome Book,Some Author,TEXTBOOK';
    const badHeaderRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: badHeaderCsv } });
    assert(badHeaderRes.body?.isValid === false, 'CSV with missing required headers marked invalid');
    assert(badHeaderRes.body?.validation?.errors?.some((e) => e.column === 'Header'), 'Missing header error specifically identified');

    // 4.5 Headers only (no data rows)
    const headersOnlyCsv = BULK_IMPORT_COLUMNS.join(',') + '\r\n';
    const headersOnlyRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: headersOnlyCsv } });
    assert(headersOnlyRes.body?.isValid === false, 'Headers-only CSV marked invalid');
    assert(headersOnlyRes.body?.validation?.errors?.some((e) => e.column === 'Data'), 'Reports no data rows error');

    // 4.6 Valid CSV with single & multi-copy books
    const validCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        'Corporate Governance in India',
        'Dr. A. K. Sen',
        '978-81-203-9999-1',
        'Kedia Press',
        '1st Edition',
        '2024',
        'TEXTBOOK',
        'Commerce & Governance',
        'Standard curriculum reference.',
        '2',
        'Rack A-1',
        `BC-CORP-01-${Date.now().toString(36)};BC-CORP-02-${Date.now().toString(36)}`,
        'Good;Good',
        'BCOM:General',
      ],
      [
        'Business Statistics Guide',
        'Prof. V. Sharma',
        '978-93-513-8888-2',
        'Standard Pub',
        '2nd Edition',
        '2023',
        'REFERENCE',
        'Mathematics & Statistics',
        'Statistical methods textbook.',
        '1',
        'Rack B-3',
        `BC-STAT-01-${Date.now().toString(36)}`,
        'Good',
        'BBA:General;BSC:Mathematics',
      ],
    ]);

    const validRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: validCsv } });
    assert(validRes.status === 200, 'Valid CSV returns HTTP 200');
    assert(validRes.body?.isValid === true, 'Valid CSV reported as isValid: true');
    assert(validRes.body?.validation?.summary?.totalBooks === 2, 'Summary reports exactly 2 books');
    assert(validRes.body?.validation?.summary?.totalPhysicalCopies === 3, 'Summary reports exactly 3 physical copies');
    assert(validRes.body?.validation?.summary?.uniqueIsbns === 2, 'Summary reports 2 unique ISBNs');

    // 4.7 Missing required fields (Title, Author, Segment)
    const missingFieldsCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      ['', 'Author Name', '', '', '', '2024', 'TEXTBOOK', '', '', '1', '', '', '', ''],
    ]);
    const missingRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: missingFieldsCsv } });
    assert(missingRes.body?.isValid === false, 'CSV missing required fields marked invalid');
    const missingCols = missingRes.body?.validation?.errors?.map((e) => e.column) || [];
    assert(missingCols.includes('Title'), 'Validation caught missing Title');
    assert(missingCols.includes('Segment'), 'Validation caught missing Segment');

    // 4.8 Invalid field values (Year, Category, TotalCopies)
    const invalidValsCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        'Test Invalid Book',
        'Test Author',
        'invalid-isbn-123',
        'Test Pub',
        '1st',
        '2999', // invalid year
        'MAGAZINE', // invalid category
        'Accounting',
        '',
        '-5', // invalid copies
        '',
        '',
        '',
        '',
      ],
    ]);
    const invalidValsRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: invalidValsCsv } });
    assert(invalidValsRes.body?.isValid === false, 'CSV with invalid values marked invalid');
    const invalidCols = invalidValsRes.body?.validation?.errors?.map((e) => e.column) || [];
    assert(invalidCols.includes('ISBN'), 'Validation caught invalid ISBN');
    assert(invalidCols.includes('PublicationYear'), 'Validation caught future year');
    assert(invalidCols.includes('Category'), 'Validation caught invalid category');
    assert(invalidCols.includes('TotalCopies'), 'Validation caught negative copies');

    // 4.9 In-sheet duplicate ISBN detection
    const duplicateIsbnCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      ['Book Vol 1', 'Author A', '978-81-203-1111-1', '', '', '2024', 'TEXTBOOK', 'Commerce', '', '1', '', '', '', ''],
      ['Book Vol 2', 'Author B', '978-81-203-1111-1', '', '', '2024', 'TEXTBOOK', 'Commerce', '', '1', '', '', '', ''],
    ]);
    const dupIsbnRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: duplicateIsbnCsv } });
    assert(dupIsbnRes.body?.isValid === false, 'In-sheet duplicate ISBN marked invalid');
    const hasDupIsbnError = dupIsbnRes.body?.validation?.errors?.some((e) => e.column === 'ISBN' && e.message.includes('Duplicate ISBN'));
    assert(hasDupIsbnError, 'Error message explicitly reports duplicate ISBN in file');

    // 4.10 In-sheet duplicate barcode detection & barcode count mismatch
    const dupBarcodeCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      ['Book A', 'Author A', '', '', '', '2024', 'TEXTBOOK', 'Commerce', '', '1', '', 'BC-DUP-999;BC-EXTRA-888', '', ''],
      ['Book B', 'Author B', '', '', '', '2024', 'TEXTBOOK', 'Commerce', '', '2', '', 'BC-DUP-999', '', ''],
    ]);
    const dupBarcodeRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: dupBarcodeCsv } });
    assert(dupBarcodeRes.body?.isValid === false, 'Duplicate barcode and count mismatch marked invalid');
    const hasCountMismatch = dupBarcodeRes.body?.validation?.errors?.some((e) => e.message.includes('Barcodes count cannot exceed TotalCopies'));
    assert(hasCountMismatch, 'Error identifies barcodes count exceeding TotalCopies');
    const hasDupBarcode = dupBarcodeRes.body?.validation?.errors?.some((e) => e.message.includes('Duplicate barcode'));
    assert(hasDupBarcode, 'Error identifies duplicate barcode between rows');

    // ---------------------------------------------------------
    // 5. Database Duplicate Detection (Read-only query verification)
    // ---------------------------------------------------------
    const uniqueExistingIsbn = `978-93-${Date.now().toString().slice(-8)}`;
    const uniqueExistingBarcode = `BC-EXIST-${Date.now().toString(36).toUpperCase()}`;

    // Create a temporary synthetic parent book in DB
    const tempBook = await dataManager.prisma.book.create({
      data: {
        title: 'Temporary Duplicate Detection Book',
        author: 'Temp Author',
        isbn: normalizeIsbn(uniqueExistingIsbn),
        segment: 'Testing',
        category: 'TEXTBOOK',
        totalCopies: 1,
        availableCopies: 1,
        copies: {
          create: {
            copyNumber: 1,
            barcode: uniqueExistingBarcode,
            status: 'AVAILABLE',
          },
        },
      },
    });
    dataManager.createdBookIds.add(tempBook.id);

    // Validate a CSV that contains the exact same ISBN and barcode
    const dbConflictCsv = serializeCsv([
      [...BULK_IMPORT_COLUMNS],
      [
        'New Incoming Book With Conflict',
        'New Author',
        uniqueExistingIsbn,
        '',
        '',
        '2024',
        'TEXTBOOK',
        'Testing',
        '',
        '1',
        '',
        uniqueExistingBarcode,
        '',
        '',
      ],
    ]);

    const dbConflictRes = await librarianClient.request('POST', '/api/books/import/validate', { body: { csvContent: dbConflictCsv } });
    assert(dbConflictRes.status === 200, 'Database duplicate check returns HTTP 200');
    assert(dbConflictRes.body?.isValid === false, 'Payload marked invalid due to database duplicates');
    assert(dbConflictRes.body?.databaseDuplicates?.existingIsbns?.length === 1, 'Database check detected existing ISBN in DB');
    assert(dbConflictRes.body?.databaseDuplicates?.existingBarcodes?.length === 1, 'Database check detected existing Barcode in DB');
    assert(dbConflictRes.body?.databaseDuplicates?.existingIsbns?.[0]?.existingBookId === tempBook.id, 'Identified correct existing book ID');

    // ---------------------------------------------------------
    // 6. Response Credential & Key Leakage Scan
    // ---------------------------------------------------------
    const leakedInTemplate = findLeakedSecrets(librarianRes.data);
    assert(leakedInTemplate.length === 0, 'Zero secrets leaked in template response');

    const leakedInValidation = findLeakedSecrets(validRes.body);
    assert(leakedInValidation.length === 0, 'Zero secrets leaked in validation response');

    const leakedInConflict = findLeakedSecrets(dbConflictRes.body);
    assert(leakedInConflict.length === 0, 'Zero secrets leaked in duplicate conflict response');
  } finally {
    await dataManager.cleanup();
  }
}
