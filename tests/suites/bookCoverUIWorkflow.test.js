// tests/suites/bookCoverUIWorkflow.test.js — Phase 8D Frontend Cover Image Integration & Workflow Test Suite
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import { getStorageAdapter } from '../../dist/server/lib/storage/index.js';

export async function runBookCoverUIWorkflowTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;

  try {
    // =========================================================================
    // 0. Persona & Client Setup
    // =========================================================================
    const librarian = await dataManager.createLibrarian({ tag: 'p8d_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p8d_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'p8d_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // Helpers to generate synthetic image fixtures
    const createTestJpeg = async (width = 300, height = 450) =>
      await sharp({
        create: { width, height, channels: 3, background: { r: 70, g: 130, b: 180 } },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

    const createTestPng = async (width = 280, height = 420) =>
      await sharp({
        create: { width, height, channels: 4, background: { r: 180, g: 70, b: 90, alpha: 1 } },
      })
        .png()
        .toBuffer();

    const createTestWebp = async (width = 320, height = 480) =>
      await sharp({
        create: { width, height, channels: 3, background: { r: 40, g: 160, b: 100 } },
      })
        .webp({ quality: 80 })
        .toBuffer();

    const validJpeg = await createTestJpeg();
    const validPng = await createTestPng();
    const validWebp = await createTestWebp();

    // Create test book titles
    const bookWithCover = await dataManager.createBook({
      title: 'Advanced Corporate Finance & Reporting',
      author: 'Dr. Ramesh Chandra',
      tag: 'p8d_hascover',
    });

    const bookWithoutCover = await dataManager.createBook({
      title: 'Quantitative Business Mathematics',
      author: 'Prof. K. V. Sharma',
      tag: 'p8d_nocover',
    });

    // =========================================================================
    // 1. Cover Rendering & Fallback Placeholder Invariants (Req 1, 2)
    // =========================================================================
    // 1.1 Initially, bookWithoutCover has coverImage: null
    const initialBookNoCover = await prisma.book.findUnique({ where: { id: bookWithoutCover.id } });
    assert(initialBookNoCover?.coverImage === null, '1.1 Book without cover has coverImage === null');

    // 1.2 Student catalog query reflects coverImage: null for placeholder rendering
    const studentCatalogNoCover = await studentClient.request('GET', `/api/books?search=${encodeURIComponent('Quantitative Business')}`);
    assert(studentCatalogNoCover.status === 200, '1.2 Student catalog search succeeds with HTTP 200');
    const catalogItemNoCover = (studentCatalogNoCover.body?.books || []).find((b) => b.id === bookWithoutCover.id);
    assert(catalogItemNoCover !== undefined, '1.2 Book without cover located in student catalog');
    assert(catalogItemNoCover?.coverImage === null, '1.2 Catalog response supplies coverImage: null triggering BookCoverImage placeholder');

    // 1.3 Upload cover for bookWithCover
    const formUpload = new FormData();
    formUpload.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'corp_finance.jpg');
    const uploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, {
      body: formUpload,
    });
    assert(uploadRes.status === 200, '1.3 Librarian upload succeeds with HTTP 200');
    assert(typeof uploadRes.body?.coverUrl === 'string', '1.3 Upload returns string coverUrl');
    assert(uploadRes.body?.coverUrl.startsWith(`/api/books/${bookWithCover.id}/cover?v=`), '1.3 coverUrl contains timestamped query string for cache-busting');

    // 1.4 Student catalog query reflects valid coverUrl when cover exists
    const studentCatalogHasCover = await studentClient.request('GET', `/api/books?search=${encodeURIComponent('Corporate Finance')}`);
    assert(studentCatalogHasCover.status === 200, '1.4 Student catalog search succeeds with HTTP 200');
    const catalogItemHasCover = (studentCatalogHasCover.body?.books || []).find((b) => b.id === bookWithCover.id);
    assert(catalogItemHasCover !== undefined, '1.4 Book with cover located in student catalog');
    assert(catalogItemHasCover?.coverImage === uploadRes.body?.coverUrl, '1.4 Catalog provides exact timestamped coverUrl for frontend image rendering');

    // =========================================================================
    // 2. Broken / Unavailable Image Handling (Req 3)
    // =========================================================================
    // 2.1 Fetching cover for book without cover returns HTTP 404 (handled by onError in BookCoverImage)
    const noCoverFetchRes = await studentClient.request('GET', `/api/books/${bookWithoutCover.id}/cover`);
    assert(noCoverFetchRes.status === 404, '2.1 Cover retrieval for book without cover returns HTTP 404');
    assert(noCoverFetchRes.body?.error !== undefined, '2.1 404 response contains descriptive error message');

    // 2.2 Fetching cover for non-existent book ID returns HTTP 404
    const fakeId = crypto.randomUUID();
    const fakeCoverFetchRes = await studentClient.request('GET', `/api/books/${fakeId}/cover`);
    assert(fakeCoverFetchRes.status === 404, '2.2 Cover retrieval for non-existent book returns HTTP 404');

    // =========================================================================
    // 3. Role-Based Access Control to Cover Management (Req 4, 5)
    // =========================================================================
    // 3.1 Unauthenticated user cannot upload or delete covers
    const unauthForm = new FormData();
    unauthForm.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'unauth.jpg');
    const unauthUploadRes = await unauthClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: unauthForm });
    assert(unauthUploadRes.status === 401, '3.1 Unauthenticated upload rejected with HTTP 401');

    const unauthDeleteRes = await unauthClient.request('DELETE', `/api/books/${bookWithCover.id}/cover`);
    assert(unauthDeleteRes.status === 401, '3.1 Unauthenticated delete rejected with HTTP 401');

    // 3.2 Student is forbidden from cover management (read-only UI persona)
    const studentForm = new FormData();
    studentForm.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'student.jpg');
    const studentUploadRes = await studentClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: studentForm });
    assert(studentUploadRes.status === 403, '3.2 Student upload forbidden with HTTP 403');

    const studentDeleteRes = await studentClient.request('DELETE', `/api/books/${bookWithCover.id}/cover`);
    assert(studentDeleteRes.status === 403, '3.2 Student delete forbidden with HTTP 403');

    // 3.3 Teacher is forbidden from cover management (read-only UI persona)
    const teacherForm = new FormData();
    teacherForm.append('cover', new Blob([validJpeg], { type: 'image/jpeg' }), 'teacher.jpg');
    const teacherUploadRes = await teacherClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: teacherForm });
    assert(teacherUploadRes.status === 403, '3.3 Teacher upload forbidden with HTTP 403');

    const teacherDeleteRes = await teacherClient.request('DELETE', `/api/books/${bookWithCover.id}/cover`);
    assert(teacherDeleteRes.status === 403, '3.3 Teacher delete forbidden with HTTP 403');

    // =========================================================================
    // 4. Client & Server File Validation (Req 6, 7)
    // =========================================================================
    // 4.1 Unsupported format: PDF rejected with HTTP 400
    const pdfForm = new FormData();
    const pdfHeader = Buffer.from('%PDF-1.4\n%synthetic pdf header\n%%EOF');
    pdfForm.append('cover', new Blob([pdfHeader], { type: 'application/pdf' }), 'syllabus.pdf');
    const pdfUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: pdfForm });
    assert(pdfUploadRes.status === 400, '4.1 PDF format upload rejected with HTTP 400');
    assert(pdfUploadRes.body?.error?.includes('PDF') || pdfUploadRes.body?.error?.includes('not accepted'), '4.1 Descriptive error indicates PDF rejection');

    // 4.2 Unsupported format: SVG/XML rejected before decoding
    const svgForm = new FormData();
    const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    svgForm.append('cover', new Blob([svgBytes], { type: 'image/svg+xml' }), 'vector.svg');
    const svgUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: svgForm });
    assert(svgUploadRes.status === 400, '4.2 SVG format upload rejected with HTTP 400');

    // 4.3 Unsupported format: Executable binary (MZ header)
    const exeForm = new FormData();
    const exeBytes = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00');
    exeForm.append('cover', new Blob([exeBytes], { type: 'application/octet-stream' }), 'tool.exe');
    const exeUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: exeForm });
    assert(exeUploadRes.status === 400, '4.3 Executable upload rejected with HTTP 400');

    // 4.4 File size limit: 5MB boundary enforcement (> 5MB rejected with HTTP 400)
    const oversizedForm = new FormData();
    const oversizedBytes = Buffer.alloc(5.2 * 1024 * 1024, 0xef);
    oversizedForm.append('cover', new Blob([oversizedBytes], { type: 'image/jpeg' }), 'oversized.jpg');
    const oversizedUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: oversizedForm });
    assert(oversizedUploadRes.status === 400, '4.4 Oversized upload (> 5MB) rejected with HTTP 400');

    // =========================================================================
    // 5. Image Preview & Format Conversion (Req 8, 9)
    // =========================================================================
    // 5.1 PNG upload converted to optimized WebP output
    const formPng = new FormData();
    formPng.append('cover', new Blob([validPng], { type: 'image/png' }), 'preview_test.png');
    const pngUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: formPng });
    assert(pngUploadRes.status === 200, '5.1 PNG upload succeeds with HTTP 200');
    assert(pngUploadRes.body?.mimeType === 'image/webp', '5.1 PNG transformed to image/webp');
    assert(pngUploadRes.body?.sizeBytes <= 51200, '5.1 WebP thumbnail strictly <= 50 KB');

    // 5.2 WebP upload preserved and compressed within bounds
    const formWebp = new FormData();
    formWebp.append('cover', new Blob([validWebp], { type: 'image/webp' }), 'preview_test.webp');
    const webpUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: formWebp });
    assert(webpUploadRes.status === 200, '5.2 WebP upload succeeds with HTTP 200');
    assert(webpUploadRes.body?.mimeType === 'image/webp', '5.2 Output MIME type is image/webp');
    assert(webpUploadRes.body?.sizeBytes <= 51200, '5.2 Output size <= 50 KB');

    // =========================================================================
    // 6. Cover Replacement & Cache-Busting (Req 10, 16)
    // =========================================================================
    const initialCoverUrl = webpUploadRes.body?.coverUrl;
    const initialEtag = webpUploadRes.body?.etag;

    // Small delay to ensure timestamp parameter differs on replacement
    await new Promise((r) => setTimeout(r, 20));

    const replacementImage = await sharp({
      create: { width: 340, height: 510, channels: 3, background: { r: 210, g: 90, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const formReplace = new FormData();
    formReplace.append('cover', new Blob([replacementImage], { type: 'image/jpeg' }), 'replacement_artwork.jpg');
    const replaceRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: formReplace });

    assert(replaceRes.status === 200, '6.1 Replacement upload succeeds with HTTP 200');
    assert(replaceRes.body?.coverUrl !== initialCoverUrl, '6.1 Replacement generates new timestamped coverUrl parameter');
    assert(replaceRes.body?.etag !== initialEtag, '6.1 Replacement generates distinct ETag');

    // Database check: Book.coverImage matches new URL and BookCover has exactly 1 row (no duplicate rows)
    const dbBookAfterReplace = await prisma.book.findUnique({ where: { id: bookWithCover.id } });
    assert(dbBookAfterReplace?.coverImage === replaceRes.body?.coverUrl, '6.1 Database Book.coverImage updated to new timestamped URL');

    const coverRowCount = await prisma.bookCover.count({ where: { bookId: bookWithCover.id } });
    assert(coverRowCount === 1, '6.1 Exactly 1 BookCover row exists in database (upserted in place)');

    // =========================================================================
    // 7. Cover Removal & Immediate Placeholder Restoration (Req 11)
    // =========================================================================
    const deleteRes = await librarianClient.request('DELETE', `/api/books/${bookWithCover.id}/cover`);
    assert(deleteRes.status === 200, '7.1 Cover removal succeeds with HTTP 200');
    assert(deleteRes.body?.message?.includes('deleted') || deleteRes.body?.message?.includes('cleared'), '7.1 Deletion success message returned');

    // Database verification: coverImage is null and BookCover row is removed
    const dbBookAfterDelete = await prisma.book.findUnique({ where: { id: bookWithCover.id } });
    assert(dbBookAfterDelete?.coverImage === null, '7.1 Database Book.coverImage reset to null');

    const dbCoverAfterDelete = await prisma.bookCover.findUnique({ where: { bookId: bookWithCover.id } });
    assert(dbCoverAfterDelete === null, '7.1 Database BookCover row removed');

    // Subsequent retrieval returns HTTP 404
    const deletedFetchRes = await studentClient.request('GET', `/api/books/${bookWithCover.id}/cover`);
    assert(deletedFetchRes.status === 404, '7.1 Subsequent GET for deleted cover returns HTTP 404 (restores placeholder UI)');

    // =========================================================================
    // 8. Removal & Upload Failure Handling (Req 12, 13)
    // =========================================================================
    // 8.1 Deleting cover for book that already has no cover is a safe no-op returning HTTP 200
    const noOpDeleteRes = await librarianClient.request('DELETE', `/api/books/${bookWithCover.id}/cover`);
    assert(noOpDeleteRes.status === 200, '8.1 No-op cover deletion on book with no cover returns HTTP 200');

    // 8.2 Upload with no file attached returns HTTP 400
    const emptyForm = new FormData();
    const emptyUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: emptyForm });
    assert(emptyUploadRes.status === 400, '8.2 Upload with empty body returns HTTP 400');

    // 8.3 Upload with 0-byte file returns HTTP 400
    const zeroByteForm = new FormData();
    zeroByteForm.append('cover', new Blob([Buffer.alloc(0)], { type: 'image/jpeg' }), 'zero.jpg');
    const zeroByteUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: zeroByteForm });
    assert(zeroByteUploadRes.status === 400, '8.3 Upload with 0-byte file returns HTTP 400');

    // =========================================================================
    // 9. Cross-Persona Display & Network Egress Protection (Req 14, 15)
    // =========================================================================
    // Re-upload a cover to test persona catalog inspection
    const formFinal = new FormData();
    formFinal.append('cover', new Blob([validWebp], { type: 'image/webp' }), 'final_cover.webp');
    const finalUploadRes = await librarianClient.request('POST', `/api/books/${bookWithCover.id}/cover`, { body: formFinal });
    assert(finalUploadRes.status === 200, '9.1 Final cover upload succeeds with HTTP 200');

    // Student book detail query
    const studentDetailRes = await studentClient.request('GET', `/api/books/${bookWithCover.id}`);
    assert(studentDetailRes.status === 200, '9.1 Student book detail query succeeds with HTTP 200');
    assert(typeof studentDetailRes.body?.book?.coverImage === 'string', '9.1 Student detail receives lightweight coverImage URL');
    assert(studentDetailRes.body?.book?.bookCover === undefined, '9.1 Student detail does NOT leak BookCover relation object');
    assert(studentDetailRes.body?.book?.data === undefined, '9.1 Student detail does NOT leak binary buffer');

    // Teacher book detail query
    const teacherDetailRes = await teacherClient.request('GET', `/api/books/${bookWithCover.id}`);
    assert(teacherDetailRes.status === 200, '9.2 Teacher book detail query succeeds with HTTP 200');
    assert(typeof teacherDetailRes.body?.book?.coverImage === 'string', '9.2 Teacher detail receives lightweight coverImage URL');
    assert(teacherDetailRes.body?.book?.bookCover === undefined, '9.2 Teacher detail does NOT leak BookCover relation object');
    assert(teacherDetailRes.body?.book?.data === undefined, '9.2 Teacher detail does NOT leak binary buffer');

    // Librarian book detail query
    const librarianDetailRes = await librarianClient.request('GET', `/api/books/${bookWithCover.id}`);
    assert(librarianDetailRes.status === 200, '9.3 Librarian book detail query succeeds with HTTP 200');
    assert(typeof librarianDetailRes.body?.book?.coverImage === 'string', '9.3 Librarian detail receives lightweight coverImage URL');
    assert(librarianDetailRes.body?.book?.bookCover === undefined, '9.3 Librarian detail does NOT leak BookCover relation object');
    assert(librarianDetailRes.body?.book?.data === undefined, '9.3 Librarian detail does NOT leak binary buffer');

    // Zero disk writes check
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      const coverLeaks = files.filter((f) => f.includes('p8d') || f.includes('corp_finance') || f.endsWith('.webp'));
      assert(coverLeaks.length === 0, `9.4 Zero cover files leaked into uploads directory (found: ${coverLeaks.length})`);
    } else {
      assert(true, '9.4 uploads directory clean');
    }

    // Secret leaks scan across all responses
    const secretCheck = [
      ...findLeakedSecrets(uploadRes.body),
      ...findLeakedSecrets(replaceRes.body),
      ...findLeakedSecrets(deleteRes.body),
      ...findLeakedSecrets(studentDetailRes.body),
      ...findLeakedSecrets(teacherDetailRes.body),
      ...findLeakedSecrets(librarianDetailRes.body),
    ];
    assert(secretCheck.length === 0, '9.5 Zero leaked credentials, secrets, or internal flags across all API responses');
  } finally {
    await dataManager.cleanup();
  }
}
