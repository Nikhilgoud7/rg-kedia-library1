// tests/suites/bulkImportFinalGate.test.js — Phase 7D Bulk Import Final Quality Gate Test Suite
import crypto from 'crypto';
import { execSync } from 'child_process';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import {
  serializeCsv,
  normalizeIsbn,
  BULK_IMPORT_COLUMNS,
} from '../helpers/csvHelper.js';

function randomDigits(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

export async function runBulkImportFinalGateTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;

  try {
    // ---------------------------------------------------------
    // 0. Persona & Client Setup
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p7d_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const student = await dataManager.createStudent({ tag: 'p7d_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const runSuffix = crypto.randomBytes(3).toString('hex');

    // ---------------------------------------------------------
    // 1. Database Duplicate Row Attribution & Multi-Conflict Matching
    // ---------------------------------------------------------
    // Create two pre-existing books in the database with known ISBNs and Barcodes
    const existingIsbn1 = `97881${randomDigits(8)}`;
    const existingIsbn2 = `97881${randomDigits(8)}`;
    const existingBarcode1 = `BC-P7D-EXIST1-${runSuffix}`;
    const existingBarcode2 = `BC-P7D-EXIST2-${runSuffix}`;

    const preExistingBook1 = await dataManager.createBook({
      title: `P7D Baseline Conflict Book 1 ${runSuffix}`,
      author: 'Prof. Existing Author One',
      totalCopies: 1,
      tag: 'p7d_c1',
    });
    await prisma.book.update({
      where: { id: preExistingBook1.id },
      data: { isbn: existingIsbn1 },
    });
    await prisma.bookCopy.update({
      where: { id: preExistingBook1.copies[0].id },
      data: { barcode: existingBarcode1 },
    });

    const preExistingBook2 = await dataManager.createBook({
      title: `P7D Baseline Conflict Book 2 ${runSuffix}`,
      author: 'Prof. Existing Author Two',
      totalCopies: 1,
      tag: 'p7d_c2',
    });
    await prisma.book.update({
      where: { id: preExistingBook2.id },
      data: { isbn: existingIsbn2 },
    });
    await prisma.bookCopy.update({
      where: { id: preExistingBook2.copies[0].id },
      data: { barcode: existingBarcode2 },
    });

    // Build a 4-row CSV:
    // Row 1: Valid unique book
    // Row 2: Conflicting ISBN (matches preExistingBook1)
    // Row 3: Conflicting Barcode (matches preExistingBook1 copy)
    // Row 4: Conflicting ISBN AND Conflicting Barcode on the SAME row (matches preExistingBook2)
    const testIsbn1 = `97881${randomDigits(8)}`;
    const testIsbn3 = `97881${randomDigits(8)}`;
    const uniqueBc1 = `BC-P7D-UNQ1-${runSuffix}`;
    const uniqueBc2 = `BC-P7D-UNQ2-${runSuffix}`;

    const conflictRows = [
      [...BULK_IMPORT_COLUMNS],
      // Row 1 (Valid)
      [
        `Valid Book Row 1 ${runSuffix}`,
        'Author One',
        testIsbn1,
        'Publisher One',
        '1st Edition',
        '2023',
        'TEXTBOOK',
        'Economics',
        'Description',
        '1',
        'Rack E-1',
        uniqueBc1,
        'Good',
        'BCOM:General',
      ],
      // Row 2 (ISBN conflict with Book 1)
      [
        `ISBN Conflict Book Row 2 ${runSuffix}`,
        'Author Two',
        existingIsbn1, // CONFLICT WITH DB Book 1
        'Publisher Two',
        '2nd Edition',
        '2022',
        'REFERENCE',
        'Accounting',
        'Description',
        '1',
        'Rack E-2',
        uniqueBc2,
        'Fair',
        'BBA:Finance',
      ],
      // Row 3 (Barcode conflict with Book 1)
      [
        `Barcode Conflict Book Row 3 ${runSuffix}`,
        'Author Three',
        testIsbn3,
        'Publisher Three',
        '3rd Edition',
        '2024',
        'GENERAL',
        'Management',
        'Description',
        '1',
        'Rack E-3',
        existingBarcode1, // CONFLICT WITH DB Book 1 Copy
        'Good',
        'BCOM',
      ],
      // Row 4 (Double conflict: both ISBN AND Barcode with Book 2)
      [
        `Double Conflict Book Row 4 ${runSuffix}`,
        'Author Four',
        existingIsbn2, // CONFLICT WITH DB Book 2
        'Publisher Four',
        '4th Edition',
        '2021',
        'LANGUAGE',
        'English',
        'Description',
        '1',
        'Rack E-4',
        existingBarcode2, // CONFLICT WITH DB Book 2 Copy
        'Good',
        'BCOM:General',
      ],
    ];

    const conflictCsv = serializeCsv(conflictRows);

    const valRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: conflictCsv },
    });

    assert(valRes.status === 200, 'POST /api/books/import/validate returns HTTP 200 for duplicate conflict check');
    assert(valRes.data.isValid === false, 'Payload marked isValid: false due to database duplicate conflicts');

    const dbDups = valRes.data.databaseDuplicates;
    assert(Array.isArray(dbDups.existingIsbns), 'Response contains existingIsbns array');
    assert(Array.isArray(dbDups.existingBarcodes), 'Response contains existingBarcodes array');

    // 1.1 Row attribution for ISBN conflicts
    const isbnRow2 = dbDups.existingIsbns.find((d) => d.row === 2);
    assert(Boolean(isbnRow2), 'ISBN conflict correctly attributed to Row 2');
    assert(isbnRow2?.isbn === existingIsbn1, 'Row 2 conflict identifies conflicting ISBN');
    assert(
      isbnRow2?.existingTitle === preExistingBook1.title || isbnRow2?.title === preExistingBook1.title,
      'Row 2 conflict identifies existing database book title'
    );
    assert(isbnRow2?.existingBookId === preExistingBook1.id, 'Row 2 conflict identifies existing database book ID');

    const isbnRow4 = dbDups.existingIsbns.find((d) => d.row === 4);
    assert(Boolean(isbnRow4), 'ISBN conflict also correctly attributed to Row 4');
    assert(isbnRow4?.isbn === existingIsbn2, 'Row 4 conflict identifies Book 2 ISBN');

    // 1.2 Row attribution for Barcode conflicts
    const bcRow3 = dbDups.existingBarcodes.find((d) => d.row === 3);
    assert(Boolean(bcRow3), 'Barcode conflict correctly attributed to Row 3');
    assert(bcRow3?.barcode === existingBarcode1, 'Row 3 conflict identifies conflicting Barcode');
    assert(
      bcRow3?.existingBookTitle === preExistingBook1.title || bcRow3?.bookTitle === preExistingBook1.title,
      'Row 3 conflict identifies existing book title holding barcode'
    );

    const bcRow4 = dbDups.existingBarcodes.find((d) => d.row === 4);
    assert(Boolean(bcRow4), 'Barcode conflict also correctly attributed to Row 4');
    assert(bcRow4?.barcode === existingBarcode2, 'Row 4 conflict identifies Book 2 Barcode');

    // 1.3 Multiple conflicts on Row 4 preserved simultaneously
    assert(
      Boolean(isbnRow4) && Boolean(bcRow4),
      'Row 4 with both ISBN and Barcode conflicts maintains both attribution entries without overwriting'
    );

    // ---------------------------------------------------------
    // 2. Trailing Blank Rows & Formatting Parity
    // ---------------------------------------------------------
    const singleBookData = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Trailing Blank Test ${runSuffix}`,
        'Prof. Whitespace',
        `97881${randomDigits(8)}`,
        'Academic Press',
        '1st',
        '2024',
        'TEXTBOOK',
        'Commerce',
        'Test desc',
        '1',
        'Shelf T-1',
        `BC-TRL-${runSuffix}`,
        'Good',
        'BCOM:General',
      ],
    ];

    // Append multiple empty lines and lines with whitespace
    const trailingCsv = serializeCsv(singleBookData) + '\r\n\r\n   \r\n\t  \r\n\r\n';
    const trailingValRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: trailingCsv },
    });

    assert(trailingValRes.status === 200, 'POST /api/books/import/validate succeeds on CSV with trailing empty lines');
    assert(trailingValRes.data.isValid === true, 'CSV with trailing blank rows is marked isValid: true');
    assert(trailingValRes.data.validation.summary.totalRows === 1, 'Trailing empty lines do not produce phantom rows (totalRows === 1)');
    assert(trailingValRes.data.validation.errors.length === 0, 'Zero phantom missing-header or missing-title errors produced');

    // ---------------------------------------------------------
    // 3. Publication Year Boundaries & Strict Format
    // ---------------------------------------------------------
    const currentYear = new Date().getFullYear();

    // 3.1 Year 1000 is valid boundary
    const y1000Row = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Ancient Manuscript ${runSuffix}`,
        'Ancient Scholar',
        '',
        'Heritage Press',
        '',
        '1000', // valid min
        'REFERENCE',
        'History',
        '',
        '1',
        '',
        '',
        'Good',
        'BCOM',
      ],
    ];
    const y1000Res = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(y1000Row) },
    });
    assert(y1000Res.data.isValid === true, 'Publication year 1000 is accepted as valid boundary');

    // 3.2 Year 999 is rejected
    const y999Row = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Sub-1000 Book ${runSuffix}`,
        'Author',
        '',
        '',
        '',
        '999', // invalid
        'REFERENCE',
        'History',
        '',
        '1',
        '',
        '',
        'Good',
        'BCOM',
      ],
    ];
    const y999Res = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(y999Row) },
    });
    assert(y999Res.data.isValid === false, 'Publication year 999 is rejected');
    assert(
      y999Res.data.validation.errors.some((e) => e.column === 'PublicationYear'),
      'Error identifies PublicationYear below minimum'
    );

    // 3.3 Year currentYear + 1 is valid, currentYear + 2 is rejected
    const nextYear = currentYear + 1;
    const future2Year = currentYear + 2;

    const yNextRow = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Next Year Forthcoming ${runSuffix}`,
        'Author',
        '',
        '',
        '',
        String(nextYear),
        'TEXTBOOK',
        'Science',
        '',
        '1',
        '',
        '',
        'Good',
        'BSC',
      ],
    ];
    const yNextRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(yNextRow) },
    });
    assert(yNextRes.data.isValid === true, `Publication year ${nextYear} (currentYear + 1) is accepted`);

    const yFuture2Row = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Far Future Book ${runSuffix}`,
        'Author',
        '',
        '',
        '',
        String(future2Year),
        'TEXTBOOK',
        'Science',
        '',
        '1',
        '',
        '',
        'Good',
        'BSC',
      ],
    ];
    const yFuture2Res = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(yFuture2Row) },
    });
    assert(yFuture2Res.data.isValid === false, `Publication year ${future2Year} (currentYear + 2) is rejected`);

    // 3.4 Decimal / malformed year "2023.5" rejected
    const yDecimalRow = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Decimal Year ${runSuffix}`,
        'Author',
        '',
        '',
        '',
        '2023.5',
        'TEXTBOOK',
        'Science',
        '',
        '1',
        '',
        '',
        'Good',
        'BSC',
      ],
    ];
    const yDecimalRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(yDecimalRow) },
    });
    assert(yDecimalRes.data.isValid === false, 'Decimal year "2023.5" is rejected with non-numeric regex check');

    // ---------------------------------------------------------
    // 4. TotalCopies Strict Integer & Boundary Validation
    // ---------------------------------------------------------
    const decimalCopiesRow = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Decimal Copies ${runSuffix}`,
        'Author',
        '',
        '',
        '',
        '2024',
        'TEXTBOOK',
        'Science',
        '',
        '2.5', // decimal
        '',
        '',
        'Good',
        'BSC',
      ],
    ];
    const decCopRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(decimalCopiesRow) },
    });
    assert(decCopRes.data.isValid === false, 'TotalCopies "2.5" is rejected as non-integer');
    assert(
      decCopRes.data.validation.errors.some((e) => e.column === 'TotalCopies'),
      'TotalCopies error identifies non-integer copies'
    );

    const zeroCopiesRow = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Zero Copies ${runSuffix}`,
        'Author',
        '',
        '',
        '',
        '2024',
        'TEXTBOOK',
        'Science',
        '',
        '0', // 0 is invalid
        '',
        '',
        'Good',
        'BSC',
      ],
    ];
    const zeroCopRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(zeroCopiesRow) },
    });
    assert(zeroCopRes.data.isValid === false, 'TotalCopies 0 is rejected (minimum is 1)');

    const maxCopiesRow = [
      [...BULK_IMPORT_COLUMNS],
      [
        `100 Copies Book ${runSuffix}`,
        'Author',
        '',
        '',
        '',
        '2024',
        'TEXTBOOK',
        'Science',
        '',
        '100', // valid max
        '',
        '',
        'Good',
        'BSC',
      ],
    ];
    const maxCopRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(maxCopiesRow) },
    });
    assert(maxCopRes.data.isValid === true, 'TotalCopies 100 is accepted as maximum valid boundary');

    // ---------------------------------------------------------
    // 5. Barcode & Copy Conditions Delimiter & Case Parity
    // ---------------------------------------------------------
    const delimRow = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Delimiter Test Book ${runSuffix}`,
        'Author Delim',
        '',
        '',
        '',
        '2024',
        'TEXTBOOK',
        'Science',
        '',
        '4',
        '',
        `BC-A-${runSuffix},BC-B-${runSuffix};BC-C-${runSuffix},BC-D-${runSuffix}`, // mixed commas and semicolons
        'good;FAIR,Poor;Damaged', // mixed case and mixed delimiters
        'BCOM:General;BBA',
      ],
    ];
    const delimRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: serializeCsv(delimRow) },
    });
    assert(delimRes.data.isValid === true, 'Mixed comma and semicolon delimiters in Barcodes and Conditions are accepted');
    assert(delimRes.data.validation.validRows[0].barcodes.length === 4, 'Exactly 4 barcodes parsed from mixed delimiters');
    assert(delimRes.data.validation.validRows[0].copyConditions.length === 4, 'Exactly 4 copy conditions parsed with case-normalization');
    assert(delimRes.data.validation.validRows[0].copyConditions[0] === 'Good', 'Lowercase "good" normalized to "Good"');
    assert(delimRes.data.validation.validRows[0].copyConditions[1] === 'Fair', 'Uppercase "FAIR" normalized to "Fair"');

    // ---------------------------------------------------------
    // 6. Data Row Limits (1,000 Boundary and 1,001 Rejection)
    // ---------------------------------------------------------
    // 6.1 Exactly 1,000 data rows
    const thousandRows = [[...BULK_IMPORT_COLUMNS]];
    for (let i = 1; i <= 1000; i++) {
      thousandRows.push([
        `Bulk Scale Book ${i}`,
        `Author ${i}`,
        '',
        'Scale Publisher',
        '',
        '2024',
        'TEXTBOOK',
        'Accounting',
        '',
        '1',
        '',
        '',
        'Good',
        'BCOM',
      ]);
    }
    const thousandCsv = serializeCsv(thousandRows);
    const thousandRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: thousandCsv },
    });
    assert(thousandRes.status === 200, 'POST /api/books/import/validate accepts exactly 1,000 data rows');
    assert(thousandRes.data.isValid === true, '1,000-row CSV is reported isValid: true');
    assert(thousandRes.data.validation.summary.totalRows === 1000, 'Summary reports exactly 1,000 total rows');

    // 6.2 1,001 data rows rejected
    thousandRows.push([
      'Overflow Book 1001',
      'Author 1001',
      '',
      '',
      '',
      '2024',
      'TEXTBOOK',
      'Accounting',
      '',
      '1',
      '',
      '',
      'Good',
      'BCOM',
    ]);
    const overflowCsv = serializeCsv(thousandRows);
    const overflowRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: overflowCsv },
    });
    assert(overflowRes.data.isValid === false, '1,001-row CSV is rejected exceeding maximum limit');
    assert(
      overflowRes.data.validation.errors.some((e) => e.message.includes('exceeds maximum row limit of 1000')),
      'Error message clarifies that 1,000 rows limit was exceeded'
    );

    // ---------------------------------------------------------
    // 7. Unicode Indian Script & Multilingual Character Integrity
    // ---------------------------------------------------------
    const devanagariTitle = `वित्तीय लेखांकन एवं सांख्यिकी — ${runSuffix}`;
    const teluguAuthor = `డా. కె. ఎస్. శర్మ & ప్రొఫెసర్ వి. రావు`;
    const diacriticSegment = `Kāvyam & Saṅgītam (సంస్కృతము)`;

    const unicodeRow = [
      [...BULK_IMPORT_COLUMNS],
      [
        devanagariTitle,
        teluguAuthor,
        `97881${randomDigits(8)}`,
        'హైదరాబాద్ యూనివర్సిటీ ప్రెస్',
        '1వ ముద్రణ',
        '2024',
        'TEXTBOOK',
        diacriticSegment,
        'హిందీ మరియు తెలుగు వాణిజ్య గ్రంథం.',
        '2',
        'Rack OU-Indic-1',
        `BC-IND1-${runSuffix};BC-IND2-${runSuffix}`,
        'Good;Good',
        'BCOM:General',
      ],
    ];

    const unicodeCsv = serializeCsv(unicodeRow);
    const uniExecRes = await librarianClient.request('POST', '/api/books/import/execute', {
      body: { csvContent: unicodeCsv },
    });

    assert(uniExecRes.status === 200, 'POST /api/books/import/execute succeeds on multilingual Unicode CSV');
    assert(uniExecRes.data.success === true, 'Unicode import reports success: true');

    const createdUniBookId = uniExecRes.data.summary.bookIds[0];
    const persistedUniBook = await prisma.book.findUnique({
      where: { id: createdUniBookId },
      include: { copies: true },
    });

    assert(persistedUniBook?.title === devanagariTitle, 'Devanagari title stored and retrieved with 100% byte fidelity');
    assert(persistedUniBook?.author === teluguAuthor, 'Telugu author stored and retrieved with 100% byte fidelity');
    assert(persistedUniBook?.segment === diacriticSegment, 'Diacritic Sanskrit segment stored with 100% byte fidelity');
    assert(persistedUniBook?.copies.length === 2, 'Physical copies created successfully for Unicode record');

    // Clean up Unicode book
    await prisma.book.delete({ where: { id: createdUniBookId } });

    // ---------------------------------------------------------
    // 8. Multi-Batch Compensating Rollback & Rollback Audit Event
    // ---------------------------------------------------------
    // Set up a 2-book import executed with batchSize: 1
    // Batch 1: Book 1 (Unique) -> Will commit in Batch 1
    // Batch 2: Book 2 -> Will encounter a concurrent conflict inserted right before Batch 2
    const rollbackBook1Title = `Rollback Test Book 1 ${runSuffix}`;
    const rollbackBook2Title = `Rollback Test Book 2 ${runSuffix}`;
    const rollbackBc1 = `BC-RB1-${runSuffix}`;
    const rollbackBc2 = `BC-RB2-${runSuffix}`;

    const rollbackRows = [
      [...BULK_IMPORT_COLUMNS],
      [
        rollbackBook1Title,
        'Author Batch 1',
        `97881${randomDigits(8)}`,
        'Publisher RB',
        '1st',
        '2023',
        'TEXTBOOK',
        'Commerce',
        '',
        '1',
        '',
        rollbackBc1,
        'Good',
        'BCOM',
      ],
      [
        rollbackBook2Title,
        'Author Batch 2',
        `97881${randomDigits(8)}`,
        'Publisher RB',
        '1st',
        '2023',
        'TEXTBOOK',
        'Commerce',
        '',
        '1',
        '',
        rollbackBc2,
        'Good',
        'BCOM',
      ],
    ];

    const rollbackCsv = serializeCsv(rollbackRows);

    // Call execution endpoint with batchSize=1 and simulated failure on batch index 1 (the 2nd batch)
    // This deterministically allows Batch 0 (Book 1) to commit, and triggers failure on Batch 1 (Book 2),
    // exercising the multi-batch compensating rollback mechanism without any timing race condition.
    const rollbackResult = await librarianClient.request('POST', '/api/books/import/execute?batchSize=1', {
      headers: {
        'x-test-simulate-failure-batch': '1',
      },
      body: { csvContent: rollbackCsv },
    });

    assert(rollbackResult.status === 409, 'Status code is 409 Conflict');
    assert(rollbackResult.data.success === false, 'Multi-batch import failed as expected due to in-transaction conflict on Batch 2');

    // 8.1 Verify Book 1 was cleaned up from the database by compensating rollback
    const orphanedBook1 = await prisma.book.findFirst({
      where: { title: rollbackBook1Title },
    });
    assert(orphanedBook1 === null, 'Compensating rollback completely removed Book 1 from database (zero partial imports)');

    const orphanedCopies = await prisma.bookCopy.findMany({
      where: { barcode: rollbackBc1 },
    });
    assert(orphanedCopies.length === 0, 'Cascading cleanup removed physical copies of rolled-back Book 1');

    // 8.2 Verify Rollback Audit Log was recorded
    const rollbackAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'BOOK_DELETED',
        details: { contains: '"rollback":true' },
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(Boolean(rollbackAudit), 'Administrative audit log recorded BOOK_DELETED rollback event');
    assert(rollbackAudit?.actorId === librarian.id, 'Rollback audit captures librarian actorId');

    const auditDetails = JSON.parse(rollbackAudit?.details || '{}');
    assert(auditDetails.batchImport === true, 'Audit log details confirm batchImport: true');
    assert(auditDetails.rollback === true, 'Audit log details confirm rollback: true');
    assert(auditDetails.cleanupSuccess === true, 'Audit log details confirm cleanupSuccess: true');
    assert(auditDetails.booksRemovedCount >= 1, 'Audit log details report count of books removed');

    // 8.3 Failure Injection Security & Boundary Checks
    // (a) Invalid non-numeric header cannot trigger failure or affect normal import
    const validSingleRow1 = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Invalid Header Book ${runSuffix}`,
        'Test Author',
        '',
        '',
        '',
        '2024',
        'TEXTBOOK',
        'Commerce',
        '',
        '1',
        '',
        `IH-${runSuffix}-1`,
        'Good',
        'BCOM',
      ],
    ];
    const invalidHeaderRes = await librarianClient.request('POST', '/api/books/import/execute', {
      headers: {
        'x-test-simulate-failure-batch': 'invalid-not-a-number',
      },
      body: { csvContent: serializeCsv(validSingleRow1) },
    });
    assert(invalidHeaderRes.status === 200, 'Invalid header value string is ignored and import succeeds');
    assert(invalidHeaderRes.data.success === true, 'Import reports success despite non-numeric simulate header');
    if (invalidHeaderRes.data.summary?.bookIds?.[0]) {
      dataManager.createdBookIds.add(invalidHeaderRes.data.summary.bookIds[0]);
    }

    // (b) Negative batch index header cannot trigger failure
    const validSingleRow2 = [
      [...BULK_IMPORT_COLUMNS],
      [
        `Negative Header Book ${runSuffix}`,
        'Test Author',
        '',
        '',
        '',
        '2024',
        'TEXTBOOK',
        'Commerce',
        '',
        '1',
        '',
        `NH-${runSuffix}-1`,
        'Good',
        'BCOM',
      ],
    ];
    const negHeaderRes = await librarianClient.request('POST', '/api/books/import/execute', {
      headers: {
        'x-test-simulate-failure-batch': '-1',
      },
      body: { csvContent: serializeCsv(validSingleRow2) },
    });
    assert(negHeaderRes.status === 200, 'Negative batch index header is ignored and import succeeds');
    assert(negHeaderRes.data.success === true, 'Import reports success despite negative simulate header');
    if (negHeaderRes.data.summary?.bookIds?.[0]) {
      dataManager.createdBookIds.add(negHeaderRes.data.summary.bookIds[0]);
    }

    // (c) Production environment verification: service-level failure injection is strictly ignored when NODE_ENV === 'production'
    const prodGateOutput = execSync(
      `npx tsx -e "process.env.NODE_ENV = 'production'; import('./server/lib/bulkImportService.js').then(m => m.executeBulkBookImport({}, { csvText: '', actorId: 'test', testSimulateFailureBatchIdx: 0 })).then(r => console.log('STATUS:' + r.status));"`,
      { stdio: 'pipe' }
    ).toString();
    assert(prodGateOutput.includes('STATUS:400'), 'Service-level gate ignores failure injection when NODE_ENV is production');

    // ---------------------------------------------------------
    // 9. File Size Boundary & Multipart Safety Tests
    // ---------------------------------------------------------
    // 9.1 File above 5 MB rejected by Multer
    const largeBuffer = Buffer.alloc(5.2 * 1024 * 1024, 'a'); // 5.2 MB
    const largeForm = new FormData();
    largeForm.append('file', new Blob([largeBuffer], { type: 'text/csv' }), 'large_test.csv');

    const largeFileRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: largeForm,
    });
    assert(largeFileRes.status === 400, 'Multipart file exceeding 5MB is rejected with HTTP 400');
    assert(
      largeFileRes.data.error?.includes('5MB') || largeFileRes.data.error?.includes('exceeds'),
      'Error message identifies 5MB file-size limit'
    );

    // 9.2 String JSON payload above 5 MB (5 * 1024 * 1024 = 5,242,880 bytes) rejected
    const largeString = 'Title,Author,Segment\n' + 'Test,Author,Segment\n'.repeat(270000); // ~5.4 MB (> 5 MB, < 6 MB Express limit)
    const largeJsonRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: largeString },
    });
    assert(largeJsonRes.status === 400, 'JSON payload exceeding 5MB is rejected with HTTP 400');
    assert(
      largeJsonRes.data.error?.includes('5MB') || largeJsonRes.data.error?.includes('exceeds'),
      'Error message identifies 5MB limit for JSON payload'
    );

    // ---------------------------------------------------------
    // 10. Zero Secrets Leakage Recursive Scan
    // ---------------------------------------------------------
    const leakedInVal = findLeakedSecrets(valRes.data);
    assert(leakedInVal.length === 0, 'Zero credentials leaked in duplicate conflict response');

    const leakedInTrailing = findLeakedSecrets(trailingValRes.data);
    assert(leakedInTrailing.length === 0, 'Zero credentials leaked in trailing blank rows response');

    const leakedInThousand = findLeakedSecrets(thousandRes.data);
    assert(leakedInThousand.length === 0, 'Zero credentials leaked in 1,000-row response');

    const leakedInUni = findLeakedSecrets(uniExecRes.data);
    assert(leakedInUni.length === 0, 'Zero credentials leaked in Unicode execution response');
  } finally {
    // Guaranteed cleanup of synthetic test data
    await dataManager.cleanup();
  }
}
