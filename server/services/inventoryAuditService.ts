import { PrismaClient, Prisma } from '@prisma/client';
import { logAdminAction } from '../lib/auditLogger.js';

const prisma = new PrismaClient();

export const SCAN_MATCH_STATUS = {
  MATCHED: 'MATCHED',
  SHELF_MISMATCH: 'SHELF_MISMATCH',
  STATUS_CONFLICT: 'STATUS_CONFLICT',
  UNREGISTERED: 'UNREGISTERED',
} as const;

export type ScanMatchStatus = (typeof SCAN_MATCH_STATUS)[keyof typeof SCAN_MATCH_STATUS];

export interface RecordScanDTO {
  barcode: string;
  scannedShelf?: string;
  notes?: string;
}

export class InventoryAuditService {
  /**
   * Initiates or returns an existing physical inventory audit session for an audit.
   * Captures the baseline catalog inventory:
   * - totalExpected: count of all non-withdrawn copies.
   * - totalIssued: count of copies currently issued (accounted for!).
   * - totalMissing: totalExpected - totalIssued initially.
   */
  public static async startSession(auditId: string, actorId: string): Promise<any> {
    const audit = await prisma.libraryAudit.findUnique({
      where: { id: auditId },
    });

    if (!audit) {
      throw { status: 404, error: 'Library audit not found.' };
    }

    if (audit.status === 'CLOSED') {
      throw { status: 400, error: 'Cannot start inventory session on a CLOSED audit.' };
    }

    // Check if session already exists
    let session = await prisma.inventoryAuditSession.findUnique({
      where: { auditId },
      include: {
        scans: {
          take: 10,
          orderBy: { scannedAt: 'desc' },
        },
      },
    });

    if (session) {
      return session;
    }

    // Capture baseline copy metrics
    const [totalExpected, totalIssued] = await Promise.all([
      prisma.bookCopy.count({
        where: {
          status: { not: 'WITHDRAWN' },
        },
      }),
      prisma.bookCopy.count({
        where: {
          status: 'ISSUED',
        },
      }),
    ]);

    const totalMissing = Math.max(0, totalExpected - totalIssued);

    session = await prisma.inventoryAuditSession.create({
      data: {
        auditId,
        totalExpected,
        totalIssued,
        totalMissing,
        totalScanned: 0,
        totalMatched: 0,
        totalSurplus: 0,
        totalDiscrepancy: 0,
        status: 'ACTIVE',
      },
      include: {
        scans: true,
      },
    });

    // Advance audit status to IN_PROGRESS if NOT_STARTED
    if (audit.status === 'NOT_STARTED') {
      await prisma.libraryAudit.update({
        where: { id: auditId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    await logAdminAction({
      actorId,
      action: 'INVENTORY_AUDIT_SESSION_STARTED',
      targetId: session.id,
      details: {
        auditNumber: audit.auditNumber,
        totalExpected,
        totalIssued,
      },
    });

    return session;
  }

  /**
   * Records a physical barcode scan during an active inventory session.
   * Enforces duplicate protection, checks digital catalog, detects shelf mismatches,
   * and verifies copy circulation status.
   */
  public static async recordScan(auditId: string, dto: RecordScanDTO, actorId: string): Promise<any> {
    const { barcode: rawBarcode, scannedShelf, notes } = dto;

    if (!rawBarcode || typeof rawBarcode !== 'string' || !rawBarcode.trim()) {
      throw { status: 400, error: 'Barcode parameter is required.' };
    }

    const cleanBarcode = rawBarcode.trim();

    // Verify session
    const session = await prisma.inventoryAuditSession.findUnique({
      where: { auditId },
    });

    if (!session) {
      throw { status: 404, error: 'Active inventory audit session not found. Please start a session first.' };
    }

    if (session.status !== 'ACTIVE') {
      throw { status: 400, error: `Inventory session is ${session.status}. Scans can only be recorded in ACTIVE sessions.` };
    }

    // Duplicate Scan Detection: check if this barcode was already scanned in this session
    const existingScan = await prisma.inventoryAuditScan.findUnique({
      where: {
        sessionId_barcode: {
          sessionId: session.id,
          barcode: cleanBarcode,
        },
      },
    });

    if (existingScan) {
      throw {
        status: 409,
        error: `Barcode "${cleanBarcode}" was already scanned in this session at ${existingScan.scannedAt.toISOString()}. Duplicate scans are prevented from inflating inventory counts.`,
        data: existingScan,
      };
    }

    // Look up book copy in digital catalog
    const copy = await prisma.bookCopy.findUnique({
      where: { barcode: cleanBarcode },
      include: {
        book: {
          select: { id: true, title: true, author: true, shelfLocation: true },
        },
      },
    });

    let matchStatus: ScanMatchStatus = SCAN_MATCH_STATUS.MATCHED;
    let isMatched = false;
    let isSurplus = false;
    let isDiscrepancy = false;

    if (!copy) {
      // Barcode does not exist in digital catalog
      matchStatus = SCAN_MATCH_STATUS.UNREGISTERED;
      isSurplus = true;
      isDiscrepancy = true;
    } else {
      // Copy exists in catalog: analyze condition & circulation status
      const effectiveShelf = copy.shelfLocation || copy.book.shelfLocation;

      if (copy.status === 'ISSUED') {
        // Book is registered as borrowed by student/faculty, but physical copy was found on shelf
        matchStatus = SCAN_MATCH_STATUS.STATUS_CONFLICT;
        isDiscrepancy = true;
        isMatched = true;
      } else if (scannedShelf && scannedShelf.trim() && effectiveShelf && scannedShelf.trim() !== effectiveShelf.trim()) {
        // Physical shelf location does not match digital record
        matchStatus = SCAN_MATCH_STATUS.SHELF_MISMATCH;
        isDiscrepancy = true;
        isMatched = true;
      } else if (copy.status === 'LOST' || copy.status === 'DAMAGED' || copy.status === 'WITHDRAWN') {
        // Found physical copy that was marked lost/damaged/withdrawn
        matchStatus = SCAN_MATCH_STATUS.STATUS_CONFLICT;
        isDiscrepancy = true;
        isMatched = true;
      } else {
        matchStatus = SCAN_MATCH_STATUS.MATCHED;
        isMatched = true;
      }
    }

    // Atomically record scan and increment session counters
    const [scan, updatedSession] = await prisma.$transaction([
      prisma.inventoryAuditScan.create({
        data: {
          sessionId: session.id,
          barcode: cleanBarcode,
          bookCopyId: copy?.id || null,
          matchStatus,
          scannedShelf: scannedShelf?.trim() || null,
          notes: notes?.trim() || null,
          scannedById: actorId,
        },
        include: {
          bookCopy: {
            include: {
              book: { select: { title: true, author: true } },
            },
          },
        },
      }),
      prisma.inventoryAuditSession.update({
        where: { id: session.id },
        data: {
          totalScanned: { increment: 1 },
          totalMatched: isMatched ? { increment: 1 } : undefined,
          totalMissing: isMatched ? { decrement: 1 } : undefined,
          totalSurplus: isSurplus ? { increment: 1 } : undefined,
          totalDiscrepancy: isDiscrepancy ? { increment: 1 } : undefined,
        },
      }),
    ]);

    return {
      scan,
      session: updatedSession,
      matchStatus,
      copyDetails: copy
        ? {
            title: copy.book.title,
            copyNumber: copy.copyNumber,
            condition: copy.condition,
            status: copy.status,
            expectedShelf: copy.shelfLocation || copy.book.shelfLocation,
          }
        : null,
    };
  }

  /**
   * Retrieves inventory audit session overview, progress metrics, and scan exceptions.
   */
  public static async getSessionSummary(auditId: string): Promise<any> {
    const session = await prisma.inventoryAuditSession.findUnique({
      where: { auditId },
      include: {
        scans: {
          orderBy: { scannedAt: 'desc' },
          take: 50,
          include: {
            bookCopy: {
              include: { book: { select: { title: true } } },
            },
          },
        },
      },
    });

    if (!session) {
      throw { status: 404, error: 'Inventory session not found for this audit.' };
    }

    // Query unscanned copies that are marked AVAILABLE (potential missing items)
    const scannedCopyIds = (
      await prisma.inventoryAuditScan.findMany({
        where: { sessionId: session.id, bookCopyId: { not: null } },
        select: { bookCopyId: true },
      })
    )
      .map((s) => s.bookCopyId)
      .filter((id): id is string => Boolean(id));

    const [unscannedAvailable, scannedExceptions] = await Promise.all([
      prisma.bookCopy.findMany({
        where: {
          status: 'AVAILABLE',
          id: { notIn: scannedCopyIds },
        },
        orderBy: { id: 'desc' },
        take: 200,
        select: {
          id: true,
          copyNumber: true,
          barcode: true,
          condition: true,
          status: true,
          shelfLocation: true,
          book: { select: { title: true, author: true } },
        },
      }),
      prisma.inventoryAuditScan.findMany({
        where: {
          sessionId: session.id,
          matchStatus: { not: SCAN_MATCH_STATUS.MATCHED },
        },
        orderBy: { scannedAt: 'desc' },
        include: {
          bookCopy: {
            include: { book: { select: { title: true } } },
          },
        },
      }),
    ]);

    const progressPercentage =
      session.totalExpected > 0
        ? Math.min(100, Math.round(((session.totalMatched + session.totalIssued) / session.totalExpected) * 100))
        : 100;

    return {
      session: {
        id: session.id,
        auditId: session.auditId,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        totalExpected: session.totalExpected,
        totalScanned: session.totalScanned,
        totalMatched: session.totalMatched,
        totalMissing: session.totalMissing,
        totalIssued: session.totalIssued,
        totalSurplus: session.totalSurplus,
        totalDiscrepancy: session.totalDiscrepancy,
        progressPercentage,
      },
      recentScans: session.scans,
      exceptions: scannedExceptions,
      unscannedAvailable,
    };
  }

  /**
   * Finalizes the physical inventory audit session.
   * Converts detected exceptions and remaining unscanned available copies into formal AuditDiscrepancy records.
   * Does NOT mutate BookCopy status or delete records (safeguards database integrity).
   */
  public static async finalizeSession(auditId: string, actorId: string): Promise<any> {
    const session = await prisma.inventoryAuditSession.findUnique({
      where: { auditId },
      include: {
        audit: true,
      },
    });

    if (!session) {
      throw { status: 404, error: 'Inventory audit session not found.' };
    }

    if (session.status === 'COMPLETED') {
      return { message: 'Inventory session is already completed.', session };
    }

    // 1. Fetch all exceptions from scans
    const exceptionScans = await prisma.inventoryAuditScan.findMany({
      where: {
        sessionId: session.id,
        matchStatus: { not: SCAN_MATCH_STATUS.MATCHED },
      },
      include: {
        bookCopy: { select: { id: true, bookId: true } },
      },
    });

    // 2. Fetch unscanned AVAILABLE copies
    const scannedCopyIds = (
      await prisma.inventoryAuditScan.findMany({
        where: { sessionId: session.id, bookCopyId: { not: null } },
        select: { bookCopyId: true },
      })
    )
      .map((s) => s.bookCopyId)
      .filter((id): id is string => Boolean(id));

    const unscannedAvailableCopies = await prisma.bookCopy.findMany({
      where: {
        status: 'AVAILABLE',
        id: { notIn: scannedCopyIds },
      },
      select: {
        id: true,
        bookId: true,
        barcode: true,
        copyNumber: true,
        shelfLocation: true,
        book: { select: { title: true } },
      },
    });

    // 3. Create AuditDiscrepancy entries inside a transaction
    const discrepancyData: Prisma.AuditDiscrepancyCreateManyInput[] = [];

    // Add exception scans
    for (const scan of exceptionScans) {
      let category = 'OTHER';
      let description = '';

      if (scan.matchStatus === SCAN_MATCH_STATUS.UNREGISTERED) {
        category = 'UNREGISTERED_PHYSICAL_BOOK';
        description = `Physical book with barcode "${scan.barcode}" was scanned on shelf but does not exist in the digital catalog.`;
      } else if (scan.matchStatus === SCAN_MATCH_STATUS.SHELF_MISMATCH) {
        category = 'INCORRECT_SHELF_LOCATION';
        description = `Book copy with barcode "${scan.barcode}" was scanned at shelf "${scan.scannedShelf || 'Unknown'}", differing from recorded shelf location.`;
      } else if (scan.matchStatus === SCAN_MATCH_STATUS.STATUS_CONFLICT) {
        category = 'INCORRECT_STATUS';
        description = `Book copy with barcode "${scan.barcode}" was scanned on shelf, but its catalog status conflicts with physical presence.`;
      }

      discrepancyData.push({
        auditId,
        bookId: scan.bookCopy?.bookId || null,
        bookCopyId: scan.bookCopyId || null,
        barcode: scan.barcode,
        category,
        severity: 'MEDIUM',
        description,
        status: 'OPEN',
      });
    }

    // Add unscanned available copies (potential missing physical books)
    for (const copy of unscannedAvailableCopies) {
      discrepancyData.push({
        auditId,
        bookId: copy.bookId,
        bookCopyId: copy.id,
        barcode: copy.barcode || null,
        category: 'MISSING_PHYSICAL_BOOK',
        severity: 'HIGH',
        description: `Digitally registered copy #${copy.copyNumber} of "${copy.book.title}" (barcode: ${copy.barcode || 'None'}) was not found during physical shelf audit.`,
        status: 'OPEN',
      });
    }

    await prisma.$transaction(async (tx) => {
      // Create discrepancies in batch if any
      if (discrepancyData.length > 0) {
        await tx.auditDiscrepancy.createMany({
          data: discrepancyData,
        });
      }

      // Mark session completed
      await tx.inventoryAuditSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalDiscrepancy: discrepancyData.length,
        },
      });

      // Advance audit to PENDING_RECONCILIATION if IN_PROGRESS
      if (session.audit.status === 'IN_PROGRESS') {
        await tx.libraryAudit.update({
          where: { id: auditId },
          data: { status: 'PENDING_RECONCILIATION' },
        });
      }
    });

    await logAdminAction({
      actorId,
      action: 'INVENTORY_AUDIT_SESSION_FINALIZED',
      targetId: session.id,
      details: {
        auditNumber: session.audit.auditNumber,
        discrepanciesCreated: discrepancyData.length,
      },
    });

    return {
      success: true,
      message: `Inventory audit session finalized. ${discrepancyData.length} discrepancies documented for librarian reconciliation.`,
      discrepanciesCreated: discrepancyData.length,
    };
  }
}
