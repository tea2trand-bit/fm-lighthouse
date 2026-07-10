import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const fm360Nodes = pgTable(
  "fm360_nodes",
  {
    id: text().primaryKey(),
    parent: text(),
    type: text().notNull(),
    name: text().notNull(),
    code: text().notNull().default(""),
    objectCode: text("object_code").notNull().default(""),
    notes: text().notNull().default(""),
    anlage: jsonb(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("fm360_nodes_object_code_unique").on(table.objectCode).where(sql`${table.objectCode} <> ''`)],
);

export const fm360Documents = pgTable("fm360_documents", {
  id: text().primaryKey(),
  parent: text().notNull(),
  type: text().notNull(),
  title: text().notNull(),
  folder: text().notNull().default(""),
  tags: text().notNull().default(""),
  note: text().notNull().default(""),
  blobKey: text("blob_key"),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  fileName: text("file_name").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360FloorRecords = pgTable("fm360_floor_records", {
  id: text().primaryKey(),
  floorId: text("floor_id").notNull().references(() => fm360Nodes.id),
  section: text().notNull(),
  title: text().notNull(),
  status: text().notNull().default(""),
  note: text().notNull().default(""),
  data: jsonb().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360RoomRecords = pgTable("fm360_room_records", {
  id: text().primaryKey(),
  roomId: text("room_id").notNull().references(() => fm360Nodes.id),
  section: text().notNull(),
  title: text().notNull(),
  status: text().notNull().default(""),
  note: text().notNull().default(""),
  data: jsonb().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Tickets = pgTable("fm360_tickets", {
  id: text().primaryKey(),
  parent: text().notNull(),
  type: text().notNull(),
  status: text().notNull(),
  prio: text().notNull(),
  title: text().notNull(),
  resp: text().notNull().default(""),
  due: text().notNull().default(""),
  text: text().notNull().default(""),
  executionBy: text("execution_by").notNull().default(""),
  costChf: text("cost_chf").notNull().default(""),
  invoiceReceived: text("invoice_received").notNull().default(""),
  deliveryNoteReceived: text("delivery_note_received").notNull().default(""),
  created: text().notNull().default(""),
  assignedEmployeeId: text("assigned_employee_id").references(() => fm360Employees.id),
  assignedByEmployeeId: text("assigned_by_employee_id").references(() => fm360Employees.id),
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Templates = pgTable("fm360_templates", {
  id: text().primaryKey(),
  type: text().notNull(),
  name: text().notNull(),
  text: text().notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Photos = pgTable("fm360_photos", {
  id: text().primaryKey(),
  parent: text().notNull(),
  description: text().notNull().default(""),
  blobKey: text("blob_key").notNull(),
  contentType: text("content_type").notNull().default("image/jpeg"),
  ticketId: text("ticket_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Employees = pgTable("fm360_employees", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().default(""),
  loginName: text("login_name").notNull().default(""),
  loginEnabled: boolean("login_enabled").notNull().default(false),
  passwordHash: text("password_hash").notNull().default(""),
  role: text().notNull().default(""),
  skills: text().notNull().default(""),
  availability: text().notNull().default("Verfügbar"),
  piketEligible: boolean("piket_eligible").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Shifts = pgTable("fm360_shifts", {
  id: text().primaryKey(),
  employeeId: text("employee_id").notNull(),
  managedByEmployeeId: text("managed_by_employee_id").references(() => fm360Employees.id),
  date: text().notNull(),
  shiftType: text("shift_type").notNull(), // "Früh", "Spät", "Tag", etc.
  taskAssignment: text("task_assignment").notNull().default(""),
  workload: text().notNull().default("Normal"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Piket = pgTable("fm360_piket", {
  id: text().primaryKey(),
  employeeId: text("employee_id").references(() => fm360Employees.id),
  managedByEmployeeId: text("managed_by_employee_id").references(() => fm360Employees.id),
  date: text().notNull(),
  employeeName: text("employee_name").notNull(),
  shiftTime: text("shift_time").notNull().default(""),
  contacts: text().notNull().default(""),
  interventions: text().notNull().default(""),
  responseTime: text("response_time").notNull().default(""),
  escalation: text().notNull().default(""),
  status: text().notNull().default("Geplant"),
  interventionDuration: text("intervention_duration").notNull().default(""),
  interventionCause: text("intervention_cause").notNull().default(""),
  interventionMeasure: text("intervention_measure").notNull().default(""),
  interventionStatus: text("intervention_status").notNull().default("offen"),
  interventionTime: text("intervention_time").notNull().default(""),
  interventionNotes: text("intervention_notes").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  handoverFrom: text("handover_from").notNull().default(""),
  interventionAlarmTime: text("intervention_alarm_time").notNull().default(""),
  interventionEndTime: text("intervention_end_time").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Roles = pgTable("fm360_roles", {
  id: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Permissions = pgTable("fm360_permissions", {
  id: text().primaryKey(),
  module: text().notNull(),
  action: text().notNull(),
  description: text().notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360RolePermissions = pgTable(
  "fm360_role_permissions",
  {
    roleId: text("role_id").notNull().references(() => fm360Roles.id),
    permissionId: text("permission_id").notNull().references(() => fm360Permissions.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const fm360EmployeeRoles = pgTable(
  "fm360_employee_roles",
  {
    employeeId: text("employee_id").notNull().references(() => fm360Employees.id),
    roleId: text("role_id").notNull().references(() => fm360Roles.id),
    assignedByEmployeeId: text("assigned_by_employee_id").references(() => fm360Employees.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.employeeId, table.roleId] })],
);

export const fm360TaskAssignments = pgTable("fm360_task_assignments", {
  id: text().primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => fm360Tickets.id),
  employeeId: text("employee_id").notNull().references(() => fm360Employees.id),
  assignedByEmployeeId: text("assigned_by_employee_id").references(() => fm360Employees.id),
  status: text().notNull().default("new"),
  dueDate: text("due_date").notNull().default(""),
  note: text().notNull().default(""),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360VacationEntries = pgTable("fm360_vacation_entries", {
  id: text().primaryKey(),
  employeeId: text("employee_id").notNull().references(() => fm360Employees.id),
  managedByEmployeeId: text("managed_by_employee_id").references(() => fm360Employees.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text().notNull().default("requested"),
  type: text().notNull().default("vacation"),
  note: text().notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Notifications = pgTable("fm360_notifications", {
  id: text().primaryKey(),
  employeeId: text("employee_id").notNull().references(() => fm360Employees.id),
  ticketId: text("ticket_id").references(() => fm360Tickets.id),
  taskAssignmentId: text("task_assignment_id").references(() => fm360TaskAssignments.id),
  eventType: text("event_type").notNull(),
  title: text().notNull(),
  body: text().notNull().default(""),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fm360Brandschutz = pgTable("fm360_brandschutz", {
  id: text().primaryKey(),
  systemType: text("system_type").notNull(), // "BMA", "Sprinkler", etc.
  name: text().notNull(),
  location: text().notNull().default(""),
  inspectionInterval: text("inspection_interval").notNull().default(""),
  lastInspection: text("last_inspection").notNull().default(""),
  nextInspection: text("next_inspection").notNull().default(""),
  certificate: text().notNull().default(""),
  defects: text().notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Security = pgTable("fm360_security", {
  id: text().primaryKey(),
  systemType: text("system_type").notNull(), // "Alarmanlage", "CCTV", etc.
  name: text().notNull(),
  location: text().notNull().default(""),
  status: text().notNull().default("Aktiv"),
  alarmHistory: text("alarm_history").notNull().default(""),
  incidents: text().notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360EmergencyContacts = pgTable("fm360_emergency_contacts", {
  id: text().primaryKey(),
  name: text().notNull(),
  phone: text().notNull().default(""),
  description: text().notNull().default(""),
  category: text().notNull().default("Externe Notfallkontakte"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Projects = pgTable("fm360_projects", {
  id: text().primaryKey(),
  kind: text().notNull(),
  title: text().notNull().default(""),
  category: text().notNull().default(""),
  location: text().notNull().default(""),
  responsible: text().notNull().default(""),
  status: text().notNull().default(""),
  data: jsonb().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fm360Costs = pgTable("fm360_costs", {
  id: text().primaryKey(),
  parent: text().notNull(),
  category: text().notNull(),
  title: text().notNull().default(""),
  amountChf: text("amount_chf").notNull().default(""),
  status: text().notNull().default("Geplant"),
  year: text().notNull().default(""),
  source: text().notNull().default("Manuell"),
  note: text().notNull().default(""),
  data: jsonb().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
