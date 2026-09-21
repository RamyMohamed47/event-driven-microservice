import mongoose from 'mongoose';

import type { Logger } from '../logging/logger.js';

export class MongoConnection {
  public constructor(
    private readonly uri: string,
    private readonly logger: Logger,
  ) {}

  public async connect(): Promise<void> {
    await mongoose.connect(this.uri, {
      serverSelectionTimeoutMS: 10_000,
    });
    this.logger.info('Connected to MongoDB');
  }

  public isReady(): boolean {
    return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
  }

  public async disconnect(): Promise<void> {
    await mongoose.disconnect();
    this.logger.info('Disconnected from MongoDB');
  }
}
