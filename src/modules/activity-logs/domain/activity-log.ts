export interface ActivityResource {
  type: string;
  id: string;
}

export interface ActivityPayload {
  userId: string;
  action: string;
  source: string;
  occurredAt: string;
  resource?: ActivityResource | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ActivityRecordedEvent {
  schemaVersion: 1;
  eventType: 'user.activity.recorded';
  eventId: string;
  correlationId: string;
  receivedAt: string;
  payload: ActivityPayload;
}

export interface StoredActivityLog extends ActivityPayload {
  id: string;
  eventId: string;
  eventType: ActivityRecordedEvent['eventType'];
  correlationId: string;
  receivedAt: string;
  processedAt: string;
}

export interface ActivityLogFilters {
  userId?: string;
  action?: string;
  source?: string;
  from?: Date;
  to?: Date;
}

export interface ActivityLogCursor {
  occurredAt: Date;
  id: string;
}

export interface ActivityLogPageRequest {
  filters: ActivityLogFilters;
  limit: number;
  cursor?: ActivityLogCursor;
}

export interface ActivityLogPage {
  items: StoredActivityLog[];
  nextCursor?: ActivityLogCursor;
}
