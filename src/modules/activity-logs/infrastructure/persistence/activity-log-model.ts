import { Schema, model } from 'mongoose';

const resourceSchema = new Schema(
  {
    type: { type: String, required: true },
    id: { type: String, required: true },
  },
  { _id: false },
);

const activityLogSchema = new Schema(
  {
    eventId: { type: String, required: true },
    eventType: { type: String, required: true, enum: ['user.activity.recorded'] },
    correlationId: { type: String, required: true },
    userId: { type: String, required: true },
    action: { type: String, required: true },
    source: { type: String, required: true },
    resource: { type: resourceSchema },
    metadata: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    processedAt: { type: Date, required: true },
  },
  {
    collection: 'activity_logs',
    versionKey: false,
  },
);

activityLogSchema.index({ eventId: 1 }, { unique: true });
activityLogSchema.index({ occurredAt: -1, _id: -1 });
activityLogSchema.index({ userId: 1, occurredAt: -1, _id: -1 });
activityLogSchema.index({ action: 1, occurredAt: -1, _id: -1 });
activityLogSchema.index({ source: 1, occurredAt: -1, _id: -1 });

export const ActivityLogModel = model('ActivityLog', activityLogSchema);
