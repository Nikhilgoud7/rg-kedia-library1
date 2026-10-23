// tests/suites/bookCoverApi.test.js — Phase 8C Book Cover Image API Regression Test Suite
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import { getStorageAdapter } from '../../dist/server/lib/storage/index.js';

export async function runBookCoverApiTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;

  try {
    // =========================================================================
    // 0. Persona & Client Setup
    // =========================================================================
    const librarian = await dataManager.createLibrarian({ tag: 'p8c_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p8c_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'p8c_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // Create test books
    const bookA = await dataManager.createBook({
      title: 'Financial Accounting Essentials',
      author: 'Dr. S. K. Sharma',
      tag: 'p8c_a',
    });

    const bookB = await dataManager.createBook({
      title: 'Business Statistics & Probability',
      author: 'Prof. R. V. Rao',
      tag: 'p8c_b',
    });

    const bookC = await dataManager.createBook({
      title: 'Principles of Marketing Management',
      author: 'Dr. Ananya Sen',
      tag: 'p8c_c',
    });

    // Helper to generate synthetic test images with sharp
    const createTestJpeg = async (width = 300, height = 450) =>
      await sharp({
        create: { width, height, channels: 3, background: { r: 50, g: 100, b: 200 } },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

    const createTestPng = async (width = 250, height = 375) =>
      await sharp({
        create: { width, height, channels: 4, background: { r: 200, g: 80, b: 50, alpha: 1 } },
      })
        .png()
        .toBuffer();

    const createTestWebp = async (width = 280, height = 420) =>
      await sharp({
        create: { width, height, channels: 3, background: { r: 40, g: 180, b: 90 } },
      })
        .webp({ quality: 85 })
        .toBuffer();

    const validJpeg = await createTestJpeg();
    const validPng = await createTestPng();
    const validWebp = await createTestWebp();

    // =========================================================================
    // 1. Role Authorization Enforcement
    // =========================================================================
    // 1.1 Unauthenticated POST /api/books/:id/cover is rejected with HTTP 401
    const formUnauth = new FormData();
    formUnauth.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'test.jpg');
    const unauthPostRes = await unauthClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: formUnauth,
    });
    assert(unauthPostRes.status === 401, '1.1 Unauthenticated cover upload is rejected with HTTP 401');

    // 1.2 Student POST /api/books/:id/cover is forbidden with HTTP 403
    const formStudent = new FormData();
    formStudent.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'test.jpg');
    const studentPostRes = await studentClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: formStudent,
    });
    assert(studentPostRes.status === 403, '1.2 Student cover upload is forbidden with HTTP 403');

    // 1.3 Teacher POST /api/books/:id/cover is forbidden with HTTP 403
    const formTeacher = new FormData();
    formTeacher.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'test.jpg');
    const teacherPostRes = await teacherClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: formTeacher,
    });
    assert(teacherPostRes.status === 403, '1.3 Teacher cover upload is forbidden with HTTP 403');

    // 1.4 Unauthenticated GET /api/books/:id/cover is rejected with HTTP 401 (campus-only protection)
    const unauthGetRes = await unauthClient.request('GET', `/api/books/${bookA.id}/cover`);
    assert(unauthGetRes.status === 401, '1.4 Unauthenticated cover retrieval is rejected with HTTP 401');

    // 1.5 Unauthenticated DELETE /api/books/:id/cover is rejected with HTTP 401
    const unauthDelRes = await unauthClient.request('DELETE', `/api/books/${bookA.id}/cover`);
    assert(unauthDelRes.status === 401, '1.5 Unauthenticated cover delete is rejected with HTTP 401');

    // 1.6 Student DELETE /api/books/:id/cover is forbidden with HTTP 403
    const studentDelRes = await studentClient.request('DELETE', `/api/books/${bookA.id}/cover`);
    assert(studentDelRes.status === 403, '1.6 Student cover delete is forbidden with HTTP 403');

    // 1.7 Teacher DELETE /api/books/:id/cover is forbidden with HTTP 403
    const teacherDelRes = await teacherClient.request('DELETE', `/api/books/${bookA.id}/cover`);
    assert(teacherDelRes.status === 403, '1.7 Teacher cover delete is forbidden with HTTP 403');

    // =========================================================================
    // 2. Successful Upload & Format Processing (JPEG, PNG, WebP)
    // =========================================================================
    // 2.1 Librarian uploads valid JPEG under field 'cover'
    const formJpeg = new FormData();
    formJpeg.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'accounting.jpg');
    const jpegUploadRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: formJpeg,
    });

    assert(jpegUploadRes.status === 200, '2.1 Librarian JPEG cover upload succeeds with HTTP 200');
    assert(jpegUploadRes.body?.message === 'Book cover updated successfully.', '2.1 Success message returned');
    assert(typeof jpegUploadRes.body?.coverUrl === 'string', '2.1 coverUrl is returned');
    assert(jpegUploadRes.body?.coverUrl.includes(`/api/books/${bookA.id}/cover`), '2.1 coverUrl points to book cover endpoint');
    assert(jpegUploadRes.body?.mimeType === 'image/webp', '2.1 Processed output mimeType is image/webp');
    assert(jpegUploadRes.body?.sizeBytes <= 51200, '2.1 Processed output sizeBytes <= 50 KB (51,200 bytes)');
    assert(jpegUploadRes.body?.width > 0 && jpegUploadRes.body?.width <= 400, '2.1 Processed width within bounds');
    assert(jpegUploadRes.body?.height > 0 && jpegUploadRes.body?.height <= 600, '2.1 Processed height within bounds');
    assert(typeof jpegUploadRes.body?.etag === 'string' && jpegUploadRes.body?.etag.length > 0, '2.1 ETag returned in upload response');

    // Verify database record for Book A
    const dbBookA = await prisma.book.findUnique({ where: { id: bookA.id } });
    assert(dbBookA?.coverImage === jpegUploadRes.body?.coverUrl, '2.1 Book.coverImage in database updated with timestamped URL');

    const dbCoverA = await prisma.bookCover.findUnique({ where: { bookId: bookA.id } });
    assert(dbCoverA !== null, '2.1 BookCover row created in PostgreSQL');
    assert(dbCoverA?.mimeType === 'image/webp', '2.1 BookCover mimeType is image/webp');
    assert(dbCoverA?.sizeBytes === jpegUploadRes.body?.sizeBytes, '2.1 BookCover sizeBytes matches upload response');
    assert(dbCoverA?.data instanceof Uint8Array || Buffer.isBuffer(dbCoverA?.data), '2.1 BookCover data is stored binary');

    // 2.2 Librarian uploads valid PNG under field 'file' for Book B
    const formPng = new FormData();
    formPng.append('file', new Blob([validPng], { type: 'image/png' }), 'statistics.png');
    const pngUploadRes = await librarianClient.request('POST', `/api/books/${bookB.id}/cover`, {
      body: formPng,
    });

    assert(pngUploadRes.status === 200, '2.2 Librarian PNG cover upload succeeds with HTTP 200');
    assert(pngUploadRes.body?.mimeType === 'image/webp', '2.2 PNG converted to image/webp');
    assert(pngUploadRes.body?.sizeBytes <= 51200, '2.2 PNG processed size <= 50 KB');

    // 2.3 Librarian uploads valid WebP under field 'image' for Book C
    const formWebp = new FormData();
    formWebp.append('image', new Blob([validWebp], { type: 'image/webp' }), 'marketing.webp');
    const webpUploadRes = await librarianClient.request('POST', `/api/books/${bookC.id}/cover`, {
      body: formWebp,
    });

    assert(webpUploadRes.status === 200, '2.3 Librarian WebP cover upload succeeds with HTTP 200');
    assert(webpUploadRes.body?.mimeType === 'image/webp', '2.3 WebP processed output is image/webp');
    assert(webpUploadRes.body?.sizeBytes <= 51200, '2.3 WebP processed size <= 50 KB');

    // =========================================================================
    // 3. Cover Replacement (In-Place Upsert)
    // =========================================================================
    // Generate a different image for Book A replacement
    const replacementImage = await sharp({
      create: { width: 350, height: 500, channels: 3, background: { r: 180, g: 40, b: 40 } },
    })
      .jpeg()
      .toBuffer();

    const formReplace = new FormData();
    formReplace.append('cover', new Blob([replacementImage], { type: 'image/jpeg' }), 'replacement.jpg');
    const replaceRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: formReplace,
    });

    assert(replaceRes.status === 200, '3.1 In-place cover replacement succeeds with HTTP 200');
    assert(replaceRes.body?.coverUrl !== jpegUploadRes.body?.coverUrl, '3.1 Replacement generates updated timestamped coverUrl');
    assert(replaceRes.body?.etag !== jpegUploadRes.body?.etag, '3.1 Replacement generates new ETag');

    const coverRowsCount = await prisma.bookCover.count({ where: { bookId: bookA.id } });
    assert(coverRowsCount === 1, '3.1 Database BookCover row count remains exactly 1 (no duplicate rows created)');

    // =========================================================================
    // 4. Upload Validation, Format Rejection & MIME Spoofing Defense
    // =========================================================================
    // 4.1 Upload for non-existent book ID -> HTTP 404
    const fakeBookId = crypto.randomUUID();
    const fakeForm = new FormData();
    fakeForm.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'fake.jpg');
    const notFoundUploadRes = await librarianClient.request('POST', `/api/books/${fakeBookId}/cover`, {
      body: fakeForm,
    });
    assert(notFoundUploadRes.status === 404, '4.1 Cover upload to non-existent book ID returns HTTP 404');

    // 4.2 Empty upload (no file attached) -> HTTP 400
    const emptyForm = new FormData();
    const emptyUploadRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: emptyForm,
    });
    assert(emptyUploadRes.status === 400, '4.2 Empty upload with no file attached returns HTTP 400');

    // 4.3 0-byte image file -> HTTP 400
    const zeroByteForm = new FormData();
    zeroByteForm.append('cover', new Blob([Buffer.alloc(0)], { type: 'image/jpeg' }), 'zero.jpg');
    const zeroByteRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: zeroByteForm,
    });
    assert(zeroByteRes.status === 400, '4.3 0-byte image file upload returns HTTP 400');

    // 4.4 Rejected format: PDF (%PDF-...) -> HTTP 400
    const pdfBytes = Buffer.from('%PDF-1.4\n%synthetic pdf document header\n%%EOF');
    const pdfForm = new FormData();
    pdfForm.append('cover', new Blob([pdfBytes], { type: 'application/pdf' }), 'document.pdf');
    const pdfRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: pdfForm,
    });
    assert(pdfRes.status === 400, '4.4 PDF upload is strictly rejected with HTTP 400');
    assert(pdfRes.body?.error?.includes('PDF') || pdfRes.body?.error?.includes('not accepted'), '4.4 Error identifies PDF rejection');

    // 4.5 Rejected format: Executable binary (MZ...) -> HTTP 400
    const exeBytes = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff');
    const exeForm = new FormData();
    exeForm.append('cover', new Blob([exeBytes], { type: 'application/octet-stream' }), 'malware.exe');
    const exeRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: exeForm,
    });
    assert(exeRes.status === 400, '4.5 Executable binary upload is strictly rejected with HTTP 400');

    // 4.6 MIME spoofing defense: HTML file with image/jpeg MIME -> HTTP 400
    const htmlBytes = Buffer.from('<!DOCTYPE html><html><body><script>alert("xss")</script></body></html>');
    const spoofForm = new FormData();
    spoofForm.append('cover', new Blob([htmlBytes], { type: 'image/jpeg' }), 'innocent.jpg');
    const spoofRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: spoofForm,
    });
    assert(spoofRes.status === 400, '4.6 MIME spoofed text/HTML is rejected by magic bytes sniffer with HTTP 400');

    // 4.7 Corrupted image bytes -> HTTP 400
    const corruptedBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('junk corrupted data')]);
    const corruptedForm = new FormData();
    corruptedForm.append('cover', new Blob([corruptedBytes], { type: 'image/jpeg' }), 'corrupted.jpg');
    const corruptedRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: corruptedForm,
    });
    assert(corruptedRes.status === 400, '4.7 Corrupted image bytes safely return HTTP 400');

    // 4.8 File exceeding 5 MB limit -> HTTP 400
    const oversizedBytes = Buffer.alloc(5.2 * 1024 * 1024, 0xaa);
    const oversizedForm = new FormData();
    oversizedForm.append('cover', new Blob([oversizedBytes], { type: 'image/jpeg' }), 'huge.jpg');
    const oversizedRes = await librarianClient.request('POST', `/api/books/${bookA.id}/cover`, {
      body: oversizedForm,
    });
    assert(oversizedRes.status === 400, '4.8 File exceeding 5 MB limit is rejected with HTTP 400');
    assert(oversizedRes.body?.error?.includes('5MB') || oversizedRes.body?.error?.includes('5 MB') || oversizedRes.body?.error?.includes('exceeds'), '4.8 Error notes 5MB limit');

    // =========================================================================
    // 5. Cover Retrieval & Conditional Caching (ETag / 304)
    // =========================================================================
    // 5.1 Student retrieves cover (GET /api/books/:id/cover) -> HTTP 200
    const studentGetRes = await studentClient.request('GET', `/api/books/${bookA.id}/cover`);
    assert(studentGetRes.status === 200, '5.1 Authenticated student retrieves book cover with HTTP 200');

    // 5.2 Teacher retrieves cover -> HTTP 200
    const teacherGetRes = await teacherClient.request('GET', `/api/books/${bookA.id}/cover`);
    assert(teacherGetRes.status === 200, '5.2 Authenticated teacher retrieves book cover with HTTP 200');

    // 5.3 Librarian retrieves cover -> HTTP 200
    const libGetRes = await librarianClient.request('GET', `/api/books/${bookA.id}/cover`);
    assert(libGetRes.status === 200, '5.3 Authenticated librarian retrieves book cover with HTTP 200');

    // 5.4 Response headers verification
    const contentType = studentGetRes.headers.get('content-type');
    assert(contentType === 'image/webp', '5.4 Content-Type header is exactly image/webp');

    const contentLength = studentGetRes.headers.get('content-length');
    assert(contentLength && parseInt(contentLength, 10) > 0, '5.4 Content-Length header is present and > 0');

    const cacheControl = studentGetRes.headers.get('cache-control');
    assert(cacheControl?.includes('private'), '5.4 Cache-Control includes private (ensures shared proxies do not cache authenticated media)');
    assert(!cacheControl?.includes('public'), '5.4 Cache-Control strictly does NOT include public');
    assert(cacheControl?.includes('max-age=86400'), '5.4 Cache-Control includes max-age=86400');
    assert(cacheControl?.includes('must-revalidate'), '5.4 Cache-Control includes must-revalidate');

    const varyHeader = studentGetRes.headers.get('vary');
    assert(varyHeader?.includes('Cookie') || varyHeader?.includes('Authorization'), '5.4 Vary header specifies Cookie / Authorization');

    const etag = studentGetRes.headers.get('etag');
    assert(typeof etag === 'string' && etag.length > 0, '5.4 ETag header is present');

    // 5.5 Binary wire verification via fetch
    const wireRes = await fetch(`${baseUrl}/api/books/${bookA.id}/cover`, {
      headers: { Cookie: studentClient.getCookie() },
    });
    const wireBuffer = Buffer.from(await wireRes.arrayBuffer());
    assert(wireBuffer.length === parseInt(contentLength, 10), '5.5 Wire buffer byte length matches Content-Length header');
    assert(wireBuffer.subarray(0, 4).toString('ascii') === 'RIFF', '5.5 Wire buffer begins with RIFF header');
    assert(wireBuffer.subarray(8, 12).toString('ascii') === 'WEBP', '5.5 Wire buffer contains WEBP magic identifier');

    // 5.6 Conditional Caching (HTTP 304 Not Modified)
    // Matching exact ETag
    const conditionalRes = await fetch(`${baseUrl}/api/books/${bookA.id}/cover`, {
      headers: {
        Cookie: studentClient.getCookie(),
        'If-None-Match': etag,
      },
    });
    assert(conditionalRes.status === 304, '5.6 Matching If-None-Match header returns HTTP 304 Not Modified');
    const conditionalBody = await conditionalRes.text();
    assert(conditionalBody === '', '5.6 HTTP 304 response has empty body');

    // Matching raw ETag (without W/ prefix if applicable)
    const rawEtag = etag.replace(/^W\//, '');
    const conditionalRawRes = await fetch(`${baseUrl}/api/books/${bookA.id}/cover`, {
      headers: {
        Cookie: studentClient.getCookie(),
        'If-None-Match': rawEtag,
      },
    });
    assert(conditionalRawRes.status === 304, '5.6 Matching raw ETag returns HTTP 304 Not Modified');

    // Non-matching ETag returns HTTP 200
    const mismatchedRes = await fetch(`${baseUrl}/api/books/${bookA.id}/cover`, {
      headers: {
        Cookie: studentClient.getCookie(),
        'If-None-Match': '"mismatched-etag-value"',
      },
    });
    assert(mismatchedRes.status === 200, '5.6 Mismatched If-None-Match header returns HTTP 200');

    // 5.7 Retrieval for book with no cover -> HTTP 404
    const bookNoCover = await dataManager.createBook({
      title: 'Book Without Any Cover',
      tag: 'p8c_nocover',
    });
    const noCoverGetRes = await studentClient.request('GET', `/api/books/${bookNoCover.id}/cover`);
    assert(noCoverGetRes.status === 404, '5.7 Cover retrieval for book without cover returns HTTP 404');

    // 5.8 Retrieval for non-existent book -> HTTP 404
    const notFoundGetRes = await studentClient.request('GET', `/api/books/${fakeBookId}/cover`);
    assert(notFoundGetRes.status === 404, '5.8 Cover retrieval for non-existent book returns HTTP 404');

    // =========================================================================
    // 6. Cover Deletion & Safe No-Op
    // =========================================================================
    // 6.1 Librarian deletes cover via DELETE /api/books/:id/cover
    const deleteCoverRes = await librarianClient.request('DELETE', `/api/books/${bookB.id}/cover`);
    assert(deleteCoverRes.status === 200, '6.1 Librarian DELETE cover succeeds with HTTP 200');
    assert(deleteCoverRes.body?.message === 'Book cover deleted successfully.', '6.1 Deletion message returned');

    // 6.2 DB Book.coverImage is now null
    const dbBookBAfterDelete = await prisma.book.findUnique({ where: { id: bookB.id } });
    assert(dbBookBAfterDelete?.coverImage === null, '6.2 Book.coverImage in database reset to null');

    // 6.3 DB BookCover row is removed
    const dbCoverBAfterDelete = await prisma.bookCover.findUnique({ where: { bookId: bookB.id } });
    assert(dbCoverBAfterDelete === null, '6.3 BookCover record permanently removed from database');

    // 6.4 Subsequent GET returns 404
    const getDeletedCoverRes = await studentClient.request('GET', `/api/books/${bookB.id}/cover`);
    assert(getDeletedCoverRes.status === 404, '6.4 Subsequent GET for deleted cover returns HTTP 404');

    // 6.5 Safe no-op: Deleting cover for a book that already has no cover returns 200
    const noOpDeleteRes = await librarianClient.request('DELETE', `/api/books/${bookB.id}/cover`);
    assert(noOpDeleteRes.status === 200, '6.5 Deleting cover for book with no cover is a safe no-op returning HTTP 200');
    const dbBookBStillIntact = await prisma.book.findUnique({ where: { id: bookB.id } });
    assert(dbBookBStillIntact !== null, '6.5 Parent book remains intact after no-op cover delete');

    // 6.6 Deleting cover for non-existent book returns 404
    const notFoundDeleteRes = await librarianClient.request('DELETE', `/api/books/${fakeBookId}/cover`);
    assert(notFoundDeleteRes.status === 404, '6.6 Deleting cover for non-existent book returns HTTP 404');

    // 6.7 Failure-safe deletion ordering: Database update failure must NOT delete storage first
    const bookFailDB = await dataManager.createBook({
      title: 'Book for DB Failure Simulation',
      tag: 'p8c_faildb',
    });
    const formFailDB = new FormData();
    formFailDB.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'faildb.jpg');
    await librarianClient.request('POST', `/api/books/${bookFailDB.id}/cover`, { body: formFailDB });

    const dbCoverBeforeFail = await prisma.bookCover.findUnique({ where: { bookId: bookFailDB.id } });
    assert(dbCoverBeforeFail !== null, '6.7 BookCover row exists before simulated failure test');

    const failDbRes = await librarianClient.request('DELETE', `/api/books/${bookFailDB.id}/cover`, {
      headers: { 'x-test-simulate-db-update-failure': 'true' },
    });
    assert(failDbRes.status === 500, '6.7 Simulated database update failure returns HTTP 500');

    const dbCoverAfterFail = await prisma.bookCover.findUnique({ where: { bookId: bookFailDB.id } });
    assert(dbCoverAfterFail !== null, '6.7 Storage payload was NOT deleted when database update failed first');
    const bookAfterFail = await prisma.book.findUnique({ where: { id: bookFailDB.id } });
    assert(bookAfterFail?.coverImage !== null, '6.7 Book cover URL reference preserved after database update failure');

    // 6.8 Storage deletion failure: Database reference must remain cleared (no broken URL)
    const bookFailStorage = await dataManager.createBook({
      title: 'Book for Storage Failure Simulation',
      tag: 'p8c_failstorage',
    });
    const formFailStorage = new FormData();
    formFailStorage.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'failstorage.jpg');
    await librarianClient.request('POST', `/api/books/${bookFailStorage.id}/cover`, { body: formFailStorage });

    const failStorageRes = await librarianClient.request('DELETE', `/api/books/${bookFailStorage.id}/cover`, {
      headers: { 'x-test-simulate-storage-delete-failure': 'true' },
    });
    assert(failStorageRes.status === 200, '6.8 Storage deletion failure returns HTTP 200 with catalog cleared message');
    assert(failStorageRes.body?.warning !== undefined, '6.8 Response contains warning regarding storage cleanup failure');

    const bookAfterStorageFail = await prisma.book.findUnique({ where: { id: bookFailStorage.id } });
    assert(bookAfterStorageFail?.coverImage === null, '6.8 Catalog book.coverImage remains strictly null despite storage error (no broken URLs)');

    const storageFailLogs = await prisma.auditLog.findMany({
      where: {
        action: 'BOOK_COVER_DELETED',
        targetId: bookFailStorage.id,
      },
    });
    assert(storageFailLogs.length >= 1, '6.8 Audit log captured deletion attempt with storage error');
    const failDetails = JSON.parse(storageFailLogs[0].details || '{}');
    assert(failDetails.storageCleanupFailed === true, '6.8 Audit log details record storageCleanupFailed: true');
    assert(typeof failDetails.storageError === 'string', '6.8 Audit log details record storage error message');

    // =========================================================================
    // 7. Cascade Deletion with Book
    // =========================================================================
    // 7.1 Create book and upload cover
    const bookCascade = await dataManager.createBook({
      title: 'Book for Cascade Test',
      totalCopies: 1,
      tag: 'p8c_casc',
    });

    const formCascade = new FormData();
    formCascade.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'cascade.jpg');
    const cascadeUploadRes = await librarianClient.request('POST', `/api/books/${bookCascade.id}/cover`, {
      body: formCascade,
    });
    assert(cascadeUploadRes.status === 200, '7.1 Cover uploaded for cascade test book');

    const dbCoverBeforeCascade = await prisma.bookCover.findUnique({ where: { bookId: bookCascade.id } });
    assert(dbCoverBeforeCascade !== null, '7.1 BookCover row exists before book deletion');

    // 7.2 Delete parent book via DELETE /api/books/:id
    const deleteBookRes = await librarianClient.request('DELETE', `/api/books/${bookCascade.id}`);
    assert(deleteBookRes.status === 200, '7.2 Parent book deleted via DELETE /api/books/:id with HTTP 200');

    // 7.3 DB verification: BookCover purged
    const dbCoverAfterCascade = await prisma.bookCover.findUnique({ where: { bookId: bookCascade.id } });
    assert(dbCoverAfterCascade === null, '7.3 BookCover row is purged upon parent book deletion');

    // 7.4 Storage adapter get returns null
    const storage = getStorageAdapter();
    const storageCover = await storage.get(`covers/books/${bookCascade.id}.webp`);
    assert(storageCover === null, '7.4 Storage adapter get returns null for purged book cover');

    // =========================================================================
    // 8. Administrative Audit Logging
    // =========================================================================
    // 8.1 AuditLog for BOOK_COVER_UPDATED
    const updateLogs = await prisma.auditLog.findMany({
      where: {
        action: 'BOOK_COVER_UPDATED',
        actorId: librarian.id,
      },
      orderBy: { timestamp: 'desc' },
    });

    assert(updateLogs.length >= 3, '8.1 AuditLog records BOOK_COVER_UPDATED events');
    const latestUpdateLog = updateLogs[0];
    assert(latestUpdateLog.targetId !== null, '8.1 AuditLog targetId records book ID');
    const updateDetails = JSON.parse(latestUpdateLog.details || '{}');
    assert(typeof updateDetails.bookTitle === 'string', '8.1 AuditLog details include bookTitle');
    assert(updateDetails.mimeType === 'image/webp', '8.1 AuditLog details include mimeType');
    assert(typeof updateDetails.sizeBytes === 'number', '8.1 AuditLog details include sizeBytes');

    // 8.2 AuditLog for BOOK_COVER_DELETED
    const deleteLogs = await prisma.auditLog.findMany({
      where: {
        action: 'BOOK_COVER_DELETED',
        actorId: librarian.id,
        targetId: bookB.id,
      },
    });

    assert(deleteLogs.length >= 1, '8.2 AuditLog records BOOK_COVER_DELETED event');
    const deleteLogDetails = JSON.parse(deleteLogs[0].details || '{}');
    assert(deleteLogDetails.bookTitle === bookB.title, '8.2 AuditLog details record correct book title');

    // =========================================================================
    // 9. Security, Isolation & Zero Storage Leakage
    // =========================================================================
    // 9.1 Standard GET /api/books catalog query does NOT serialize binary cover data
    const catalogRes = await studentClient.request('GET', `/api/books?search=${encodeURIComponent('Financial Accounting')}`);
    assert(catalogRes.status === 200, '9.1 Student catalog query succeeds with HTTP 200');
    const foundBookA = (catalogRes.body?.books || []).find((b) => b.id === bookA.id);
    assert(foundBookA !== undefined, '9.1 Book A located in catalog search');
    assert(typeof foundBookA.coverImage === 'string', '9.1 Catalog book includes lightweight coverImage URL string');
    assert(foundBookA.bookCover === undefined, '9.1 Standard book search does NOT leak bookCover relation');
    assert(foundBookA.data === undefined, '9.1 Standard book search does NOT leak binary data buffer');

    // 9.2 Standard GET /api/books/:id detail query does NOT leak binary data buffer
    const bookDetailRes = await studentClient.request('GET', `/api/books/${bookA.id}`);
    assert(bookDetailRes.status === 200, '9.2 Student book detail query succeeds with HTTP 200');
    assert(bookDetailRes.body?.book?.data === undefined, '9.2 Book detail response does NOT contain raw binary data');
    assert(bookDetailRes.body?.book?.bookCover === undefined, '9.2 Book detail response does NOT contain bookCover table object');

    // 9.3 Zero filesystem writes: ensure uploads directory has no cover images
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const filesInUploads = fs.readdirSync(uploadsDir);
      const coverFilesInUploads = filesInUploads.filter(
        (f) => f.endsWith('.webp') || f.includes('p8c') || f.includes('accounting')
      );
      assert(
        coverFilesInUploads.length === 0,
        `9.3 Zero cover image files written to local uploads directory (found: ${coverFilesInUploads.length})`
      );
    } else {
      assert(true, '9.3 uploads directory does not contain leaked cover files');
    }

    // 9.4 Secret leak scan across responses
    const leakedSecrets = [
      ...findLeakedSecrets(jpegUploadRes.body),
      ...findLeakedSecrets(replaceRes.body),
      ...findLeakedSecrets(deleteCoverRes.body),
      ...findLeakedSecrets(catalogRes.body),
      ...findLeakedSecrets(bookDetailRes.body),
    ];
    assert(leakedSecrets.length === 0, '9.4 Zero leaked credentials or sensitive counters across all response bodies');
  } finally {
    await dataManager.cleanup();
  }
}
