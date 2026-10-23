// tests/suites/bulkExport.test.js — Phase 7E Bulk Book Export Engine Regression Test Suite
import crypto from 'crypto';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import { parseCsv, BULK_IMPORT_COLUMNS } from '../helpers/csvHelper.js';

export async function runBulkExportTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;

  try {
    // ---------------------------------------------------------
    // 0. Persona & Client Setup
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p7e_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p7e_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'p7e_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    const runTag = crypto.randomBytes(4).toString('hex');

    // ---------------------------------------------------------
    // 1. Role Authorization Enforcement
    // ---------------------------------------------------------
    // 1.1 Unauthenticated access is rejected with HTTP 401
    const unauthRes = await unauthClient.request('GET', '/api/books/export');
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/books/export is rejected with HTTP 401');

    // 1.2 Student access is forbidden with HTTP 403
    const studentRes = await studentClient.request('GET', '/api/books/export');
    assert(studentRes.status === 403, 'Student GET /api/books/export is forbidden with HTTP 403');

    // 1.3 Teacher access is forbidden with HTTP 403
    const teacherRes = await teacherClient.request('GET', '/api/books/export');
    assert(teacherRes.status === 403, 'Teacher GET /api/books/export is forbidden with HTTP 403');

    // 1.4 Librarian access succeeds with HTTP 200
    const librarianRes = await librarianClient.request('GET', '/api/books/export');
    assert(librarianRes.status === 200, 'Librarian GET /api/books/export succeeds with HTTP 200');

    // ---------------------------------------------------------
    // 2. HTTP Headers, UTF-8 BOM, and Attachment Filename
    // ---------------------------------------------------------
    const contentType = librarianRes.headers.get('content-type') || '';
    assert(contentType.includes('text/csv'), 'Response Content-Type contains text/csv');
    assert(contentType.includes('charset=utf-8'), 'Response Content-Type specifies charset=utf-8');

    const disposition = librarianRes.headers.get('content-disposition') || '';
    assert(disposition.includes('attachment'), 'Content-Disposition indicates attachment');
    assert(disposition.includes('filename="rgkedia-books-export-'), 'Content-Disposition includes standard export filename prefix');

    const todayDate = new Date().toISOString().split('T')[0];
    assert(disposition.includes(todayDate), 'Export filename includes current date YYYY-MM-DD');

    // Verify UTF-8 BOM (\uFEFF: 0xEF, 0xBB, 0xBF) on wire bytes for Excel parity
    const wireRawRes = await fetch(`${baseUrl}/api/books/export`, {
      headers: { Cookie: librarianClient.getCookie() },
    });
    const wireBuffer = Buffer.from(await wireRawRes.arrayBuffer());
    assert(
      wireBuffer.length >= 3 && wireBuffer[0] === 0xef && wireBuffer[1] === 0xbb && wireBuffer[2] === 0xbf,
      'Exported CSV begins with UTF-8 Byte Order Mark (\\uFEFF: 0xEF 0xBB 0xBF) on wire for Excel parity'
    );

    const rawBody = typeof librarianRes.body === 'string' ? librarianRes.body : JSON.stringify(librarianRes.body);

    // ---------------------------------------------------------
    // 3. Schema & 14-Column Header Fidelity
    // ---------------------------------------------------------
    const parsedRows = parseCsv(rawBody);
    assert(parsedRows.length >= 1, 'Export contains at least the header row');

    const headers = parsedRows[0];
    assert(headers.length === 14, 'Header row contains exactly 14 columns');

    BULK_IMPORT_COLUMNS.forEach((expectedCol, idx) => {
      assert(headers[idx] === expectedCol, `Column ${idx} header matches "${expectedCol}"`);
    });

    // ---------------------------------------------------------
    // 4. Multiple Physical Copies, Conditions, and Program Mappings Aggregation
    // ---------------------------------------------------------
    const bookTitle1 = `P7E Advanced Accounting ${runTag}`;
    const book1 = await dataManager.createBook({
      title: bookTitle1,
      author: 'Dr. Srinivas Rao',
      category: 'TEXTBOOK',
      segment: 'Accounting',
      totalCopies: 3,
      tag: 'agg1',
    });

    // Explicitly set barcodes and conditions on copies
    const bc1 = `BC-P7E-1-${runTag}`;
    const bc2 = `BC-P7E-2-${runTag}`;
    const bc3 = `BC-P7E-3-${runTag}`;
    await prisma.bookCopy.update({ where: { id: book1.copies[0].id }, data: { barcode: bc1, condition: 'Good' } });
    await prisma.bookCopy.update({ where: { id: book1.copies[1].id }, data: { barcode: bc2, condition: 'Fair' } });
    await prisma.bookCopy.update({ where: { id: book1.copies[2].id }, data: { barcode: bc3, condition: 'Poor' } });

    // Attach multiple BookProgram mappings
    await prisma.bookProgram.createMany({
      data: [
        { bookId: book1.id, program: 'BCOM', branch: 'General' },
        { bookId: book1.id, program: 'BBA', branch: null },
      ],
    });

    // Export with search targeting book1
    const exportBook1Res = await librarianClient.request('GET', `/api/books/export?search=${encodeURIComponent(runTag)}`);
    assert(exportBook1Res.status === 200, 'Search export succeeds for multi-copy book');

    const book1Parsed = parseCsv(exportBook1Res.body);
    const book1Row = book1Parsed.find((r) => r[0] && r[0].includes(bookTitle1));
    assert(Boolean(book1Row), 'Exported rows contain multi-copy target book');

    if (book1Row) {
      assert(book1Row[0].includes(bookTitle1), 'Exported Title matches');
      assert(book1Row[1] === 'Dr. Srinivas Rao', 'Exported Author matches');
      assert(book1Row[6] === 'TEXTBOOK', 'Exported Category matches');
      assert(book1Row[7] === 'Accounting', 'Exported Segment matches');
      assert(book1Row[9] === '3', 'Exported TotalCopies is 3');

      // Barcode aggregation check
      assert(book1Row[11].includes(bc1), 'Aggregated Barcodes contain copy 1 barcode');
      assert(book1Row[11].includes(bc2), 'Aggregated Barcodes contain copy 2 barcode');
      assert(book1Row[11].includes(bc3), 'Aggregated Barcodes contain copy 3 barcode');

      // Copy Conditions aggregation check
      assert(book1Row[12].includes('Good'), 'Aggregated CopyConditions contain Good');
      assert(book1Row[12].includes('Fair'), 'Aggregated CopyConditions contain Fair');
      assert(book1Row[12].includes('Poor'), 'Aggregated CopyConditions contain Poor');

      // Programs aggregation check (semicolon delimited)
      assert(book1Row[13].includes('BCOM:General'), 'Aggregated Programs contain BCOM:General');
      assert(book1Row[13].includes('BBA'), 'Aggregated Programs contain BBA');
      assert(book1Row[13].includes(';'), 'Multiple programs separated by semicolon delimiter');
    }

    // ---------------------------------------------------------
    // 5. Formula Injection Protection (CSV Macro Sanitization)
    // ---------------------------------------------------------
    // Create books with formula trigger characters (=, +, -, @, \t, \r)
    const formulaTag = `fml_${runTag}`;
    const triggerBooks = [
      { trigger: '=', title: `=SUM(1+1) Trigger Equals ${formulaTag}` },
      { trigger: '+', title: `+12345 Trigger Plus ${formulaTag}` },
      { trigger: '-', title: `-20+5 Trigger Minus ${formulaTag}` },
      { trigger: '@', title: `@cmd Trigger At ${formulaTag}` },
      { trigger: '\t', title: `\tTabIndented Title ${formulaTag}` },
      { trigger: '\r', title: `\rCarriageReturn Title ${formulaTag}` },
    ];

    for (const tb of triggerBooks) {
      const b = await dataManager.createBook({
        title: tb.title,
        author: 'Prof. Formula Test',
        category: 'GENERAL',
        segment: 'Computer Science',
        totalCopies: 1,
      });
      // Explicitly set exact title starting with trigger character to override [sessionPrefix]
      await prisma.book.update({
        where: { id: b.id },
        data: { title: tb.title },
      });
    }

    const formulaExportRes = await librarianClient.request('GET', `/api/books/export?search=${encodeURIComponent(formulaTag)}`);
    assert(formulaExportRes.status === 200, 'Formula test export succeeds with HTTP 200');

    const formulaParsed = parseCsv(formulaExportRes.body);
    for (const tb of triggerBooks) {
      const matchRow = formulaParsed.find((r) => r[0] && r[0].includes(formulaTag) && r[0].includes(tb.trigger.trim() || ''));
      assert(Boolean(matchRow), `Export contains record for formula trigger "${tb.trigger === '\t' ? '\\t' : tb.trigger === '\r' ? '\\r' : tb.trigger}"`);
      if (matchRow) {
        assert(matchRow[0].startsWith("'"), `Formula trigger cell begins with single quote (') to neutralize macro execution`);
      }
    }

    // ---------------------------------------------------------
    // 6. Multilingual Unicode Preservation (Devanagari, Telugu, Sanskrit Diacritics)
    // ---------------------------------------------------------
    const devanagariTitle = `वित्तीय लेखांकन सिद्धान्त ${runTag}`;
    const teluguAuthor = `ఆచార్య రామారావు ${runTag}`;
    const sanskritSegment = `Śāṅkara Vedānta ${runTag}`;

    const unicodeBook = await dataManager.createBook({
      title: devanagariTitle,
      author: teluguAuthor,
      category: 'LANGUAGE',
      segment: sanskritSegment,
      totalCopies: 1,
    });
    // Set exact title without prefix
    await prisma.book.update({
      where: { id: unicodeBook.id },
      data: { title: devanagariTitle },
    });

    const unicodeExportRes = await librarianClient.request('GET', `/api/books/export?search=${encodeURIComponent(runTag)}`);
    assert(unicodeExportRes.status === 200, 'Unicode test export succeeds with HTTP 200');

    const unicodeParsed = parseCsv(unicodeExportRes.body);
    const unicodeRow = unicodeParsed.find((r) => r[0] && r[0].includes(devanagariTitle));
    assert(Boolean(unicodeRow), 'Export contains Devanagari book row');
    if (unicodeRow) {
      assert(unicodeRow[0] === devanagariTitle, 'Devanagari title preserved with 100% byte fidelity');
      assert(unicodeRow[1] === teluguAuthor, 'Telugu author preserved with 100% byte fidelity');
      assert(unicodeRow[7] === sanskritSegment, 'Sanskrit diacritic segment preserved with 100% byte fidelity');
    }

    // ---------------------------------------------------------
    // 7. CSV Quoting, Commas, and Internal Quotes Escaping (RFC 4180)
    // ---------------------------------------------------------
    const quotedTitle = `The "Comprehensive" Business Guide, Vol 1 ${runTag}`;
    const quotedAuthor = `Smith, Jr., Ph.D.`;

    const quoteBook = await dataManager.createBook({
      title: quotedTitle,
      author: quotedAuthor,
      category: 'REFERENCE',
      segment: 'Business Management',
      totalCopies: 1,
    });
    // Set exact title without prefix
    await prisma.book.update({
      where: { id: quoteBook.id },
      data: { title: quotedTitle },
    });

    const quoteExportRes = await librarianClient.request('GET', `/api/books/export?search=${encodeURIComponent(runTag)}`);
    assert(quoteExportRes.status === 200, 'Quoted export succeeds with HTTP 200');

    const quoteParsed = parseCsv(quoteExportRes.body);
    const quoteRow = quoteParsed.find((r) => r[0] && r[0].includes('The "Comprehensive" Business Guide'));
    assert(Boolean(quoteRow), 'Export contains RFC 4180 quoted book row');
    if (quoteRow) {
      assert(quoteRow[0] === quotedTitle, 'Quotes and commas inside title preserved cleanly without field corruption');
      assert(quoteRow[1] === quotedAuthor, 'Author with commas parsed as single intact column');
    }

    // ---------------------------------------------------------
    // 8. Filter Accuracy Tests (Search, Category, Segment, Program, Empty)
    // ---------------------------------------------------------
    // 8.1 Category filter
    const catExportRes = await librarianClient.request('GET', `/api/books/export?search=${encodeURIComponent(runTag)}&category=REFERENCE`);
    assert(catExportRes.status === 200, 'Category-filtered export returns HTTP 200');
    const catParsed = parseCsv(catExportRes.body);
    const catDataRows = catParsed.slice(1);
    assert(catDataRows.length > 0, 'Category-filtered export returns matching records');
    assert(
      catDataRows.every((r) => r[6] === 'REFERENCE'),
      'All category-filtered export records match Category === REFERENCE'
    );

    // 8.2 Segment filter
    const segExportRes = await librarianClient.request('GET', `/api/books/export?search=${encodeURIComponent(runTag)}&segment=Accounting`);
    assert(segExportRes.status === 200, 'Segment-filtered export returns HTTP 200');
    const segParsed = parseCsv(segExportRes.body);
    const segDataRows = segParsed.slice(1);
    assert(segDataRows.length > 0, 'Segment-filtered export returns matching records');
    assert(
      segDataRows.every((r) => r[7] === 'Accounting'),
      'All segment-filtered export records match Segment === Accounting'
    );

    // 8.3 Program filter
    const progExportRes = await librarianClient.request('GET', `/api/books/export?search=${encodeURIComponent(runTag)}&program=BBA`);
    assert(progExportRes.status === 200, 'Program-filtered export returns HTTP 200');
    const progParsed = parseCsv(progExportRes.body);
    const progDataRows = progParsed.slice(1);
    assert(progDataRows.length > 0, 'Program-filtered export returns matching records');
    assert(
      progDataRows.every((r) => r[13].includes('BBA')),
      'All program-filtered export records are mapped to BBA'
    );

    // 8.4 Empty catalogue / non-matching filter returns valid empty CSV
    const nonMatchRes = await librarianClient.request('GET', `/api/books/export?search=NON_EXISTENT_${runTag}_9999`);
    assert(nonMatchRes.status === 200, 'Non-matching filter export returns HTTP 200');
    const emptyParsed = parseCsv(nonMatchRes.body);
    assert(emptyParsed.length === 1, 'Empty catalogue export returns exactly 1 row (the header row)');
    assert(emptyParsed[0].length === 14, 'Empty catalogue header row retains 14 columns');

    // ---------------------------------------------------------
    // 9. Round-Trip Re-Importability Compatibility
    // ---------------------------------------------------------
    // The exported CSV must be 100% syntactically valid and acceptable to POST /api/books/import/validate
    const roundTripExportRes = await librarianClient.request('GET', `/api/books/export?search=${encodeURIComponent(runTag)}`);
    assert(roundTripExportRes.status === 200, 'Round-trip source export succeeds with HTTP 200');

    const valRes = await librarianClient.request('POST', '/api/books/import/validate', {
      body: { csvContent: roundTripExportRes.body },
    });
    assert(valRes.status === 200, 'POST /api/books/import/validate accepts exported CSV with HTTP 200');
    assert(Array.isArray(valRes.data.validation?.validRows), 'Validation engine parsed exported rows into validRows array');
    assert(valRes.data.validation?.summary?.totalRows > 0, 'Validation engine recognized non-zero totalRows');
    assert(valRes.data.validation?.errors?.length === 0, 'Zero schema or syntax errors when validating exported CSV');

    // ---------------------------------------------------------
    // 10. Audit Logging Verification
    // ---------------------------------------------------------
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'BOOK_EXPORTED',
        actorId: librarian.id,
      },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });
    assert(auditLogs.length > 0, 'Administrative AuditLog recorded BOOK_EXPORTED action');

    const latestAudit = auditLogs[0];
    assert(latestAudit.actorId === librarian.id, 'AuditLog captures librarian actorId');

    const auditDetails = typeof latestAudit.details === 'string' ? JSON.parse(latestAudit.details) : latestAudit.details;
    assert(typeof auditDetails?.count === 'number', 'AuditLog details record exported book count');
    assert(auditDetails?.format === 'CSV', 'AuditLog details record format === CSV');
    assert(typeof auditDetails?.filters === 'object', 'AuditLog details record applied filter parameters');

    // ---------------------------------------------------------
    // 11. Zero Secret / Credential Leakage Verification
    // ---------------------------------------------------------
    const rawExportBody = String(roundTripExportRes.body);
    assert(!rawExportBody.toLowerCase().includes('password'), 'Export CSV contains zero password references');
    assert(!rawExportBody.toLowerCase().includes('passwordhash'), 'Export CSV contains zero passwordHash references');
    assert(!rawExportBody.toLowerCase().includes('tokenversion'), 'Export CSV contains zero tokenVersion references');
    assert(!rawExportBody.toLowerCase().includes('secret'), 'Export CSV contains zero secret references');

    const valLeaks = findLeakedSecrets(valRes.data);
    assert(valLeaks.length === 0, 'Zero credentials leaked in round-trip validation response');

  } finally {
    await dataManager.cleanup();
  }
}
