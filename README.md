# Event-Driven Activity Log Microservice

A production-oriented Node.js microservice that accepts user activity over HTTP, publishes it to Kafka, processes it asynchronously, and stores queryable logs in MongoDB.

## Architecture

```text
Client ──POST──> Express API ──produce──> Kafka ──consume──> Worker ──> MongoDB
   └──────────── GET filtered, cursor-paginated activity logs <──────────┘
```

The repository produces one Docker image with two runtime entrypoints:

- **API** (`dist/api.js`) accepts activities and serves processed logs.
- **Worker** (`dist/worker.js`) consumes and persists events.

The `activity-logs` bounded context follows domain, application, and infrastructure layers. Domain/application code depends on repository and publisher interfaces, while Kafka, Mongoose, and Express remain replaceable adapters.

## Key reliability choices

- Kafka messages are keyed by `userId`, preserving per-user order within a partition.
- The worker provides **at-least-once** processing. It completes message handling only after persistence or successful DLQ publication.
- `eventId` has a unique MongoDB index. An upsert makes duplicate delivery idempotent.
- Processing is attempted three times with short backoff. Invalid or exhausted messages go to `user.activity.dlq.v1` with source offset and error details.
- Cursor pagination uses `(occurredAt, _id)` rather than growing MongoDB offsets.
- API and worker are separate processes and can be scaled independently. Workers share one consumer group.

Authentication, user management, automatic log expiration, Kafka/MongoDB provisioning in Kubernetes, and provider-specific ingress are intentionally outside v1.

## Requirements

- Node.js 24+
- Docker Desktop with Docker Compose (recommended)
- npm 11+

## Run the complete system

```bash
docker compose up --build -d
docker compose ps
```

Wait until `api`, `worker`, `kafka`, and `mongo` are healthy. The API is available at `http://localhost:3000`.

Submit an activity:

```bash
curl -i -X POST http://localhost:3000/api/v1/activity-logs \
  -H "content-type: application/json" \
  -H "x-request-id: demo-request-1" \
  -d '{"userId":"user-123","action":"LOGIN","source":"web","metadata":{"browser":"Chrome"}}'
```

The endpoint returns `202 Accepted` after Kafka acknowledges the event. Fetch the asynchronously processed record:

```bash
curl "http://localhost:3000/api/v1/activity-logs?userId=user-123&action=LOGIN&limit=20"
```

Use the returned `pageInfo.nextCursor` as the next request's `cursor`. Supported filters are `userId`, `action`, `source`, `from`, and `to`; date bounds are inclusive ISO 8601 timestamps.

Run the automated end-to-end and duplicate-delivery check while Compose is healthy:

```bash
npm run test:e2e
```

Stop containers with `docker compose down`. Add `--volumes` only when intentionally deleting local Kafka and MongoDB data.

## Local development

Copy `.env.example` to `.env`, start Kafka and MongoDB, then run the API and worker in separate terminals. Docker Compose publishes MongoDB on host port `27018` to avoid conflicts with a standard local MongoDB installation:

```bash
npm install
npm run dev:api
npm run dev:worker
```

Quality commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run check` runs all four in order. The API contract is in [`openapi.yaml`](./openapi.yaml).

## Configuration

| Variable               | Default                      | Purpose                                    |
| ---------------------- | ---------------------------- | ------------------------------------------ |
| `PORT`                 | `3000`                       | API HTTP port                              |
| `WORKER_PORT`          | `3001`                       | Worker health port                         |
| `MONGODB_URI`          | required                     | MongoDB connection string                  |
| `KAFKA_BROKERS`        | required                     | Comma-separated Kafka brokers              |
| `KAFKA_CLIENT_ID`      | `activity-log-service`       | Kafka client prefix                        |
| `KAFKA_TOPIC`          | `user.activity.v1`           | Input topic                                |
| `KAFKA_DLQ_TOPIC`      | `user.activity.dlq.v1`       | Dead-letter topic                          |
| `KAFKA_CONSUMER_GROUP` | `activity-log-processors-v1` | Worker consumer group                      |
| `KAFKA_SSL`            | `false`                      | Enable Kafka TLS                           |
| `KAFKA_SASL_*`         | unset                        | Optional mechanism, username, and password |
| `LOG_LEVEL`            | `info`                       | Pino log level                             |

All required configuration is validated before either runtime starts. SASL mechanism, username, and password must be provided together. Secrets must never be committed.

## Kubernetes

The manifests under `k8s/` deploy only the stateless API and worker. Provision Kafka and MongoDB externally, then update `KAFKA_BROKERS` in the ConfigMap and create the expected Secret without committing it:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n activity-logs create secret generic activity-log-secrets \
  --from-literal=MONGODB_URI='mongodb+srv://...' \
  --from-literal=KAFKA_SASL_MECHANISM='scram-sha-512' \
  --from-literal=KAFKA_SASL_USERNAME='...' \
  --from-literal=KAFKA_SASL_PASSWORD='...'
kubectl apply -k k8s
kubectl -n activity-logs rollout status deployment/activity-log-api
kubectl -n activity-logs rollout status deployment/activity-log-worker
```

Replace the example GHCR image reference before applying if publishing elsewhere. The API Service is intentionally `ClusterIP`; connect it to the cluster's existing ingress or use `kubectl port-forward service/activity-log-api 3000:80 -n activity-logs`.

Scale independently:

```bash
kubectl -n activity-logs scale deployment/activity-log-api --replicas=3
kubectl -n activity-logs scale deployment/activity-log-worker --replicas=3
```

Do not run more actively consuming workers than the topic's partition count unless standby consumers are desired.

## Demo runbook

Record with clear English narration and show these steps:

1. Briefly explain the API → Kafka → worker → MongoDB architecture.
2. Run `docker compose ps` and show all health states.
3. Submit one activity and point out the immediate `202` response and event ID.
4. Show the worker log processing the same event and correlation ID.
5. Query by user/action and show the persisted activity.
6. Run `npm run test:e2e` to demonstrate the complete flow and duplicate protection.
7. Show the MongoDB indexes, OpenAPI file, test result, and Kubernetes manifests.

## Data and API notes

The MongoDB collection is `activity_logs`. Indexed access paths cover the unique event ID, global reverse chronological listing, and reverse chronological filtering by user, action, or source. The metadata object is deliberately flexible, while the event envelope is strict and versioned so future schema changes can introduce a new version safely.
