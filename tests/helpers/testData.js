// tests/helpers/testData.js — Synthetic Test Data Factory with Guaranteed Cleanup
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export class TestDataManager {
  constructor() {
    this.prisma = new PrismaClient({
      datasources: process.env.DATABASE_URL
        ? { db: { url: process.env.DATABASE_URL } }
        : undefined,
    });
    this.sessionPrefix = `reg_${crypto.randomBytes(4).toString('hex')}`;
    this.createdUserIds = new Set();
    this.createdBookIds = new Set();
    this.createdCopyIds = new Set();
    this.createdLendingIds = new Set();
    this.createdRequestIds = new Set();
    this.createdNotificationIds = new Set();
    this.defaultPassword = 'TestPassword123!';
    this.passwordHash = null;
  }

  async getPasswordHash() {
    if (!this.passwordHash) {
      this.passwordHash = await bcrypt.hash(this.defaultPassword, 8);
    }
    return this.passwordHash;
  }

  generateEmail(role, tag = '') {
    const unique = crypto.randomBytes(3).toString('hex');
    const suffix = tag ? `_${tag}` : '';
    return `${this.sessionPrefix}_${role.toLowerCase()}${suffix}_${unique}@example.test`;
  }

  generateRollNumber(tag = '') {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `TEST-${this.sessionPrefix.toUpperCase()}-${num}${tag ? '-' + tag : ''}`;
  }

  async createUser({ role = 'STUDENT', active = true, program = 'BCOM', branch = 'General', semester = 1, tag = '' } = {}) {
    const hash = await this.getPasswordHash();
    const email = this.generateEmail(role, tag);
    const rollNumber = role === 'STUDENT' ? this.generateRollNumber(tag) : null;

    const user = await this.prisma.user.create({
      data: {
        name: `Synthetic ${role} ${tag || this.sessionPrefix}`,
        email,
        password: hash,
        role,
        rollNumber,
        program,
        branch,
        semester,
        active,
      },
    });

    this.createdUserIds.add(user.id);
    return {
      ...user,
      plainPassword: this.defaultPassword,
    };
  }

  async createStudent(opts = {}) {
    return this.createUser({ ...opts, role: 'STUDENT' });
  }

  async createTeacher(opts = {}) {
    return this.createUser({ ...opts, role: 'TEACHER' });
  }

  async createLibrarian(opts = {}) {
    return this.createUser({ ...opts, role: 'LIBRARIAN' });
  }

  async createBook({ title = 'Synthetic Test Book', author = 'Test Author', totalCopies = 2, tag = '', category = 'TEXTBOOK', segment = 'Commerce' } = {}) {
    const uniqueTitle = `[${this.sessionPrefix}] ${title} ${tag || crypto.randomBytes(2).toString('hex')}`;
    const copiesData = Array.from({ length: totalCopies }, (_, i) => ({
      copyNumber: i + 1,
      condition: 'Good',
      status: 'AVAILABLE',
      barcode: `BC-${this.sessionPrefix}-${crypto.randomBytes(3).toString('hex')}-${i + 1}`,
    }));

    const book = await this.prisma.book.create({
      data: {
        title: uniqueTitle,
        author,
        segment,
        category,
        totalCopies,
        availableCopies: totalCopies,
        copies: {
          create: copiesData,
        },
      },
      include: {
        copies: true,
      },
    });

    this.createdBookIds.add(book.id);
    book.copies.forEach((c) => this.createdCopyIds.add(c.id));
    return book;
  }

  async createLending({ userId, bookCopyId, status = 'ISSUED', dueDate = null, issuedDate = null, renewalCount = 0 }) {
    const now = new Date();
    const resolvedDueDate = dueDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const resolvedIssuedDate = issuedDate || now;

    const lending = await this.prisma.lending.create({
      data: {
        userId,
        bookCopyId,
        status,
        issuedDate: resolvedIssuedDate,
        dueDate: resolvedDueDate,
        renewalCount,
        fine: 0,
      },
    });

    this.createdLendingIds.add(lending.id);

    // Update copy status if issued
    if (status === 'ISSUED') {
      await this.prisma.bookCopy.update({
        where: { id: bookCopyId },
        data: { status: 'ISSUED' },
      });
    }

    return lending;
  }

  async createBookRequest({ userId, bookId, type = 'BORROW', status = 'PENDING', message = null }) {
    const req = await this.prisma.bookRequest.create({
      data: {
        userId,
        bookId,
        type,
        status,
        message,
      },
    });
    this.createdRequestIds.add(req.id);
    return req;
  }

  async createNotification({ userId, title, message, type = 'INFO', read = false, link = null, dismissedAt = null }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        read,
        link,
        dismissedAt,
      },
    });

    this.createdNotificationIds.add(notification.id);
    return notification;
  }

  async cleanup() {
    const userIds = Array.from(this.createdUserIds);
    const bookIds = Array.from(this.createdBookIds);

    try {
      if (userIds.length > 0) {
        // Delete audit logs created by or targeting these users
        await this.prisma.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: userIds } },
              { targetId: { in: userIds } },
            ],
          },
        });

        // Delete notifications
        await this.prisma.notification.deleteMany({
          where: { userId: { in: userIds } },
        });

        // Delete lendings for these users
        await this.prisma.lending.deleteMany({
          where: { userId: { in: userIds } },
        });

        // Delete requests for these users
        await this.prisma.bookRequest.deleteMany({
          where: { userId: { in: userIds } },
        });

        // Delete exam papers uploaded by these users
        await this.prisma.examPaper.deleteMany({
          where: { uploadedById: { in: userIds } },
        });
      }

      if (bookIds.length > 0) {
        // Delete audit logs targeting these books
        await this.prisma.auditLog.deleteMany({
          where: { targetId: { in: bookIds } },
        });

        // Delete bookProgram curriculum mappings
        await this.prisma.bookProgram.deleteMany({
          where: { bookId: { in: bookIds } },
        });

        // Delete any lendings referencing copies of created books
        await this.prisma.lending.deleteMany({
          where: { bookCopy: { bookId: { in: bookIds } } },
        });

        // Delete any book requests referencing created books
        await this.prisma.bookRequest.deleteMany({
          where: { bookId: { in: bookIds } },
        });

        // Delete copies
        await this.prisma.bookCopy.deleteMany({
          where: { bookId: { in: bookIds } },
        });

        // Delete books
        await this.prisma.book.deleteMany({
          where: { id: { in: bookIds } },
        });
      }

      if (userIds.length > 0) {
        // Finally delete the synthetic users
        await this.prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    } catch (err) {
      console.error('Error during TestDataManager cleanup:', err.message);
    } finally {
      await this.prisma.$disconnect();
    }
  }
}
