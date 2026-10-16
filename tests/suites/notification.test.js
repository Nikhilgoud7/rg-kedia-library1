// tests/suites/notification.test.js — Step 7 Notification Regression Tests
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runNotificationTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // 1. Setup personas
    const student = await dataManager.createStudent({ tag: 'notif_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    // 2. Setup books and loans for Due-Soon and Overdue lazy alert generation
    const bookDueSoon = await dataManager.createBook({ title: 'Book Due Soon Alert', totalCopies: 1 });
    const bookOverdue = await dataManager.createBook({ title: 'Book Overdue Alert', totalCopies: 1 });

    const now = new Date();
    // Due in 2 days (<= 3 days threshold for WARNING)
    const dueSoonDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    // Overdue by 4 days
    const overdueDate = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    const lendingDueSoon = await dataManager.createLending({
      userId: student.id,
      bookCopyId: bookDueSoon.copies[0].id,
      status: 'ISSUED',
      dueDate: dueSoonDate,
    });

    const lendingOverdue = await dataManager.createLending({
      userId: student.id,
      bookCopyId: bookOverdue.copies[0].id,
      status: 'ISSUED',
      dueDate: overdueDate,
    });

    // 3. Trigger lazy notification generation via GET /api/lending/notifications
    const notifRes1 = await studentClient.request('GET', '/api/lending/notifications');
    assert(
      notifRes1.status === 200,
      'GET /api/lending/notifications succeeds with HTTP 200',
      `Got status ${notifRes1.status}`
    );

    const notifs = notifRes1.body?.notifications || [];
    assert(
      notifs.length >= 2,
      'Lazy alert generation created at least 2 notifications for due-soon and overdue items',
      `Found ${notifs.length} notifications`
    );

    // 4. Verify Due-Soon notification properties & deep-link
    const dueSoonNotif = notifs.find((n) => n.type === 'WARNING');
    assert(Boolean(dueSoonNotif), 'Due-soon notification of type WARNING is present');
    assert(
      dueSoonNotif?.title === 'Book Due Soon',
      'Due-soon notification title is "Book Due Soon"'
    );
    assert(
      dueSoonNotif?.link?.includes('/student/borrowings?dueSoon='),
      'Due-soon notification includes deep-link with query param ?dueSoon=',
      `Link: ${dueSoonNotif?.link}`
    );
    assert(
      dueSoonNotif?.read === false,
      'Newly generated due-soon notification has read: false'
    );

    // 5. Verify Overdue notification properties & deep-link
    const overdueNotif = notifs.find((n) => n.type === 'OVERDUE');
    assert(Boolean(overdueNotif), 'Overdue notification of type OVERDUE is present');
    assert(
      overdueNotif?.title === 'Overdue Book Warning',
      'Overdue notification title is "Overdue Book Warning"'
    );
    assert(
      overdueNotif?.link?.includes('/student/borrowings?overdue='),
      'Overdue notification includes deep-link with query param ?overdue=',
      `Link: ${overdueNotif?.link}`
    );
    assert(
      overdueNotif?.read === false,
      'Newly generated overdue notification has read: false'
    );

    // 6. Duplicate notification prevention across repeated fetches
    const notifRes2 = await studentClient.request('GET', '/api/lending/notifications');
    const notifs2 = notifRes2.body?.notifications || [];
    assert(
      notifs2.length === notifs.length,
      'Duplicate prevention: repeated GET /api/lending/notifications does not create duplicate alerts',
      `Count before: ${notifs.length}, count after: ${notifs2.length}`
    );

    // 7. Notification read status via PUT /api/lending/notifications/:id/read
    const markReadRes = await studentClient.request('PUT', `/api/lending/notifications/${dueSoonNotif.id}/read`);
    assert(
      markReadRes.status === 200,
      'PUT /api/lending/notifications/:id/read succeeds (HTTP 200)',
      `Got status ${markReadRes.status}`
    );

    const dbDueSoonNotif = await dataManager.prisma.notification.findUnique({ where: { id: dueSoonNotif.id } });
    assert(
      dbDueSoonNotif?.read === true,
      'Notification read flag updated to true in DB'
    );

    const notifResAfterSingleRead = await studentClient.request('GET', '/api/lending/notifications');
    assert(
      notifResAfterSingleRead.body?.unreadCount === notifRes1.body?.unreadCount - 1,
      'Unread count decremented by 1 after marking single notification as read'
    );

    // 8. Mark-all-read behavior via PUT /api/lending/notifications/read-all
    const markAllReadRes = await studentClient.request('PUT', '/api/lending/notifications/read-all');
    assert(
      markAllReadRes.status === 200,
      'PUT /api/lending/notifications/read-all succeeds (HTTP 200)',
      `Got status ${markAllReadRes.status}`
    );

    const notifResAfterAllRead = await studentClient.request('GET', '/api/lending/notifications');
    assert(
      notifResAfterAllRead.body?.unreadCount === 0,
      'All notifications marked read, unreadCount is exactly 0'
    );

    // 9. Soft-dismissal behavior for OVERDUE / WARNING notifications
    // Delete the overdue notification
    const deleteOverdueRes = await studentClient.request('DELETE', `/api/lending/notifications/${overdueNotif.id}`);
    assert(
      deleteOverdueRes.status === 200,
      'DELETE /api/lending/notifications/:id succeeds for OVERDUE notification (HTTP 200)',
      `Got status ${deleteOverdueRes.status}`
    );

    // Verify it was soft-dismissed in DB (dismissedAt is not null)
    const dbOverdueAfterDelete = await dataManager.prisma.notification.findUnique({
      where: { id: overdueNotif.id },
    });
    assert(
      dbOverdueAfterDelete !== null && dbOverdueAfterDelete.dismissedAt !== null,
      'OVERDUE notification is soft-dismissed in DB (dismissedAt set, record preserved for audit)'
    );

    // Verify soft-dismissed notification is hidden from GET /api/lending/notifications
    const notifsAfterDismiss = await studentClient.request('GET', '/api/lending/notifications');
    const dismissedVisible = (notifsAfterDismiss.body?.notifications || []).some((n) => n.id === overdueNotif.id);
    assert(
      dismissedVisible === false,
      'Soft-dismissed notification is excluded from subsequent GET /api/lending/notifications'
    );

    // 10. Permanent deletion of INFO / generic notifications
    const infoNotif = await dataManager.createNotification({
      userId: student.id,
      title: 'General Library Announcement',
      message: 'Library will remain closed for maintenance this Sunday.',
      type: 'INFO',
      read: true,
    });

    const deleteInfoRes = await studentClient.request('DELETE', `/api/lending/notifications/${infoNotif.id}`);
    assert(
      deleteInfoRes.status === 200,
      'DELETE /api/lending/notifications/:id succeeds for INFO notification (HTTP 200)',
      `Got status ${deleteInfoRes.status}`
    );

    // Verify permanent hard deletion from database
    const dbInfoAfterDelete = await dataManager.prisma.notification.findUnique({
      where: { id: infoNotif.id },
    });
    assert(
      dbInfoAfterDelete === null,
      'INFO notification was permanently deleted from the database'
    );
  } finally {
    await dataManager.cleanup();
  }
}
