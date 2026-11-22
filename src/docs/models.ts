import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  itemStatus,
  operationStatus,
  operationType,
  placeType,
  recipientResponse,
} from '../database/schema';

// Documentation-only models mirroring the database tables in src/database
// Shown under Schemas in Swagger until the controllers and DTOs are built

type PlaceType = (typeof placeType.enumValues)[number];
type ItemStatus = (typeof itemStatus.enumValues)[number];
type OperationType = (typeof operationType.enumValues)[number];
type OperationStatus = (typeof operationStatus.enumValues)[number];
type RecipientResponse = (typeof recipientResponse.enumValues)[number];

export class UserModel {
  @ApiProperty({ example: 'kq3x9...', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'Ahmed Ali' })
  name: string;

  @ApiProperty({
    example: 'ahmed.ali',
    description: 'Username used to sign in, stored lowercase, unique',
  })
  username: string;

  @ApiProperty({
    example: 'Ahmed.Ali',
    description: 'Username as the admin typed it',
  })
  displayUsername: string;

  @ApiProperty({ example: 'ahmed@uni.edu', format: 'email' })
  email: string;

  @ApiProperty({ default: false })
  emailVerified: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  image: string | null;

  @ApiProperty({ example: 'EMP-1024', description: 'Employee number' })
  employeeNumber: string;

  @ApiProperty({ example: 'Engineer', description: 'Job title' })
  jobTitle: string;

  @ApiProperty({
    default: true,
    description:
      'true until the user changes the password an admin gave them; while true, other routes answer 403 PASSWORD_CHANGE_REQUIRED',
  })
  mustChangePassword: boolean;

  @ApiProperty({ example: 'Computer Science', description: 'Department' })
  department: string;

  @ApiProperty({
    enum: ['admin', 'user'],
    default: 'user',
    description: 'Role, set by an admin via /admin/set-role',
  })
  role: string;

  @ApiProperty({
    default: false,
    description:
      'Account is banned (disabled), set by an admin via /admin/ban-user',
  })
  banned: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Ban reason',
  })
  banReason: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Ban expiry date, null if permanent',
  })
  banExpires: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class PlaceModel {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Lab 101', description: 'Place name, unique' })
  name: string;

  @ApiProperty({ enum: placeType.enumValues, enumName: 'PlaceType' })
  type: PlaceType;

  @ApiProperty({ enum: [1, 2], description: 'Floor: 1 or 2' })
  floor: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  department: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'ID of the user responsible for the place',
  })
  responsibleUserId: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class ItemModel {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'LAP-0001', description: 'Inventory code, unique' })
  code: string;

  @ApiProperty({ example: 'Dell laptop', description: 'Item name' })
  name: string;

  @ApiProperty({ example: 'Computers', description: 'Category' })
  category: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "Manufacturer's serial number",
  })
  serialNumber: string | null;

  @ApiProperty({
    enum: itemStatus.enumValues,
    enumName: 'ItemStatus',
    default: 'working',
  })
  status: ItemStatus;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Custody holder when it is a user. Every item has exactly one holder (a user or a place), except disposed items which have none',
  })
  holderUserId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Custody holder when it is a place',
  })
  holderPlaceId: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class OperationModel {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: operationType.enumValues, enumName: 'OperationType' })
  type: OperationType;

  @ApiProperty({
    enum: operationStatus.enumValues,
    enumName: 'OperationStatus',
    default: 'pending',
    description: 'Only one pending request per item',
  })
  status: OperationStatus;

  @ApiProperty({ example: 1 })
  itemId: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  fromUserId: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  fromPlaceId: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  toUserId: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  toPlaceId: number | null;

  @ApiProperty({ description: 'ID of the requester' })
  requestedBy: string;

  @ApiPropertyOptional({
    nullable: true,
    enum: recipientResponse.enumValues,
    enumName: 'RecipientResponse',
    description: 'Recipient response, present on transfer operations only',
  })
  recipientResponse: RecipientResponse | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Manager who made the decision, required on approval',
  })
  decidedBy: string | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: itemStatus.enumValues,
    enumName: 'ItemStatus',
    description:
      'New item status, present on maintenance, status_change and disposal only',
  })
  newStatus: ItemStatus | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  reason: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  rejectionReason: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Closing date, null while the request is pending',
  })
  decidedAt: Date | null;
}

export const docModels = [UserModel, PlaceModel, ItemModel, OperationModel];
