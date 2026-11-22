import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth-schema';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const placeType = pgEnum('place_type', [
  'office',
  'lab',
  'classroom',
  'warehouse',
]);

export const itemStatus = pgEnum('item_status', [
  'working',
  'needs_maintenance',
  'damaged',
  'disposed',
]);

export const operationType = pgEnum('operation_type', [
  'stock_in',
  'delivery',
  'transfer',
  'return',
  'maintenance',
  'status_change',
  'disposal',
]);

export const operationStatus = pgEnum('operation_status', [
  'pending',
  'approved',
  'rejected',
]);

export const recipientResponse = pgEnum('recipient_response', [
  'pending',
  'accepted',
  'rejected',
]);

// Shared timestamp columns
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export const places = pgTable(
  'places',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    name: text('name').notNull().unique(),
    type: placeType('type').notNull(),
    floor: smallint('floor').notNull(),
    department: text('department'),
    responsibleUserId: text('responsible_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('places_floor', sql`${t.floor} IN (1, 2)`),
    index('places_responsible_user').on(t.responsibleUserId),
  ],
);

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export const items = pgTable(
  'items',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    code: text('code').notNull().unique(), // Inventory code, e.g. LAP-0001
    name: text('name').notNull(), // Item name
    category: text('category').notNull(), // Category as free text
    serialNumber: text('serial_number'), // Manufacturer's serial number, optional
    status: itemStatus('status').notNull().default('working'),
    holderUserId: text('holder_user_id').references(() => users.id), // Custody holder when it is a user
    holderPlaceId: integer('holder_place_id').references(() => places.id), // Custody holder when it is a place
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Exactly one holder, except disposed items which have none
    check(
      'items_one_holder',
      sql`(${t.status} = 'disposed' AND num_nonnulls(${t.holderUserId}, ${t.holderPlaceId}) = 0)
       OR (${t.status} <> 'disposed' AND num_nonnulls(${t.holderUserId}, ${t.holderPlaceId}) = 1)`,
    ),
    index('items_holder_user').on(t.holderUserId),
    index('items_holder_place').on(t.holderPlaceId),
  ],
);

// ---------------------------------------------------------------------------
// Operations: requests and movement history in one table
// ---------------------------------------------------------------------------

export const operations = pgTable(
  'operations',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    type: operationType('type').notNull(),
    status: operationStatus('status').notNull().default('pending'),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),

    fromUserId: text('from_user_id').references(() => users.id),
    fromPlaceId: integer('from_place_id').references(() => places.id),
    toUserId: text('to_user_id').references(() => users.id),
    toPlaceId: integer('to_place_id').references(() => places.id),

    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id),
    recipientResponse: recipientResponse('recipient_response'), // Transfers only
    decidedBy: text('decided_by').references(() => users.id), // The manager
    newStatus: itemStatus('new_status'), // Maintenance, status change and disposal only

    reason: text('reason'),
    rejectionReason: text('rejection_reason'),
    createdAt: createdAt(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'op_one_from', // At most one source: a user or a place
      sql`num_nonnulls(${t.fromUserId}, ${t.fromPlaceId}) <= 1`,
    ),
    check(
      'op_one_to', // At most one destination
      sql`num_nonnulls(${t.toUserId}, ${t.toPlaceId}) <= 1`,
    ),
    check(
      'op_recipient', // Recipient response exists if and only if the operation is a transfer
      sql`(${t.type} = 'transfer') = (${t.recipientResponse} IS NOT NULL)`,
    ),
    check(
      'op_new_status', // New status exists if and only if the operation is maintenance, status change or disposal
      sql`(${t.type} IN ('maintenance', 'status_change', 'disposal')) = (${t.newStatus} IS NOT NULL)`,
    ),
    check(
      'op_disposal', // Only disposal sets an item to disposed, and disposal always does
      sql`(${t.type} = 'disposal') = (${t.newStatus} = 'disposed')`,
    ),
    check(
      'op_route', // Source and destination must match the operation type
      sql`CASE ${t.type}
        WHEN 'stock_in' THEN num_nonnulls(${t.fromUserId}, ${t.fromPlaceId}) = 0 AND ${t.toPlaceId} IS NOT NULL
        WHEN 'delivery' THEN ${t.fromPlaceId} IS NOT NULL AND ${t.toUserId} IS NOT NULL
        WHEN 'transfer' THEN num_nonnulls(${t.fromUserId}, ${t.fromPlaceId}) = 1 AND num_nonnulls(${t.toUserId}, ${t.toPlaceId}) = 1
        WHEN 'return' THEN ${t.fromUserId} IS NOT NULL AND ${t.toPlaceId} IS NOT NULL
        ELSE num_nonnulls(${t.fromUserId}, ${t.fromPlaceId}, ${t.toUserId}, ${t.toPlaceId}) = 0
      END`,
    ),
    // Approved requests carry the manager; closed requests carry a closing date
    check(
      'op_approved', // An approved request always records the approving manager
      sql`${t.status} <> 'approved' OR ${t.decidedBy} IS NOT NULL`,
    ),
    check(
      'op_closed', // Pending requests have no closing date; closed ones do
      sql`(${t.status} = 'pending') = (${t.decidedAt} IS NULL)`,
    ),
    check(
      'op_rejection_reason', // A rejection must include a reason

      sql`${t.status} <> 'rejected' OR ${t.rejectionReason} IS NOT NULL`,
    ),
    check(
      'op_not_self', // Custody cannot be moved to its current holder
      sql`(${t.fromUserId} IS NULL OR ${t.fromUserId} IS DISTINCT FROM ${t.toUserId})
  AND (${t.fromPlaceId} IS NULL OR ${t.fromPlaceId} IS DISTINCT FROM ${t.toPlaceId})`,
    ),

    // Lock: only one pending request per item
    uniqueIndex('op_one_pending_per_item')
      .on(t.itemId)
      .where(sql`status = 'pending'`),
    index('op_item_history').on(t.itemId, t.createdAt),
    // Incoming transfers awaiting the recipient
    index('op_incoming_pending')
      .on(t.toUserId)
      .where(sql`status = 'pending'`),
    // Manager review queue
    index('op_status_created').on(t.status, t.createdAt),
    // "My requests"
    index('op_requester_created').on(t.requestedBy, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations: for Drizzle relational queries such as db.query.items.findMany({ with: ... })
// ---------------------------------------------------------------------------

export const placesRelations = relations(places, ({ one, many }) => ({
  responsibleUser: one(users, {
    fields: [places.responsibleUserId],
    references: [users.id],
  }),
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  holderUser: one(users, {
    fields: [items.holderUserId],
    references: [users.id],
  }),
  holderPlace: one(places, {
    fields: [items.holderPlaceId],
    references: [places.id],
  }),
  operations: many(operations),
}));

export const operationsRelations = relations(operations, ({ one }) => ({
  item: one(items, { fields: [operations.itemId], references: [items.id] }),
  fromUser: one(users, {
    fields: [operations.fromUserId],
    references: [users.id],
  }),
  fromPlace: one(places, {
    fields: [operations.fromPlaceId],
    references: [places.id],
  }),
  toUser: one(users, { fields: [operations.toUserId], references: [users.id] }),
  toPlace: one(places, {
    fields: [operations.toPlaceId],
    references: [places.id],
  }),
  requester: one(users, {
    fields: [operations.requestedBy],
    references: [users.id],
  }),
  decider: one(users, {
    fields: [operations.decidedBy],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// Types: for use in services and DTOs
// ---------------------------------------------------------------------------

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Operation = typeof operations.$inferSelect;
export type NewOperation = typeof operations.$inferInsert;
