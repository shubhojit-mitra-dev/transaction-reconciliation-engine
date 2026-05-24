# Transaction Reconciliation Engine

[![CI/CD Pipeline](https://github.com/shubhojit-mitra-dev/transaction-reconciliation-engine/actions/workflows/cd.yml/badge.svg)](https://github.com/shubhojit-mitra-dev/transaction-reconciliation-engine/actions/workflows/cd.yml)
[![Node.js Version](https://img.shields.io/badge/node-v22.x-blue.svg)](https://nodejs.org)
[![Turborepo](https://img.shields.io/badge/built%20with-turborepo-cc00ff.svg)](https://turbo.build/)
[![Serverless](https://img.shields.io/badge/deployed%20with-serverless-red.svg)](https://www.serverless.com/)

A highly scalable, production-grade Transaction Reconciliation Engine built to detect discrepancies between internal system records and external exchange reports. 

Designed with an emphasis on **high-throughput memory efficiency**, **fault tolerance**, and **infrastructure-as-code security**, this engine leverages modern Node.js streaming APIs and a distributed micro-architecture.

---

## 🏗️ Architecture

The system is deployed entirely serverless on AWS, ensuring zero-downtime scalability and highly optimized cost efficiency.

<img width="1603" height="2063" alt="image" src="https://github.com/user-attachments/assets/c7edc934-5540-42ee-b2a3-b333272de617" />


## 🚀 Advanced Engineering Concepts

### 1. Streaming Ingestion & Backpressure Management
Traditional CSV parsing loads entire files into memory, leading to catastrophic `OutOfMemory` (OOM) crashes under heavy load. This engine implements an advanced `for-await` iteration pipeline using native Node.js streams. It reads chunks iteratively, applies on-the-fly normalization, and yields memory immediately, allowing the engine to process multi-gigabyte transaction datasets within the strict memory constraints of an AWS Lambda environment.

### 2. Multi-Pass Heuristic Matching Algorithm
Instead of naive `O(N^2)` cross-referencing, the matching engine utilizes a layered, hash-based deterministic approach:
1. **Pass 1 (Exact Match):** `O(1)` Hash-map lookups based on globally unique composite keys `(TransactionID + Amount + Date)`.
2. **Pass 2 (Fuzzy Date Match):** Sliding window temporal matching for transactions delayed across midnights.
3. **Pass 3 (Orphan Detection):** Remainder processing to accurately flag `MISSING_IN_INTERNAL` and `MISSING_IN_EXCHANGE` discrepancies.

### 3. CI/CD with Layered Turborepo Caching
The deployment pipeline (`ci.yml`, `cd.yml`) utilizes **Turborepo** to intelligently cache linting, type-checking, and test results. By hashing the AST and dependency trees, redundant executions are skipped. We consolidated the CI and CD steps into a highly optimized `build-and-deploy` job, cutting deployment times by over 60%.

### 4. Zero-Trust "Least Privilege" Cloud Security
Infrastructure provisioning is strictly controlled via granular IAM policies. The Serverless deployment executes under an IAM role explicitly restricted to:
* Resource-constrained `iam:PassRole` limits.
* Deterministic deployment bucket constraints (`reconciliation-engine-deploy-*`).
* Scoped `cloudformation`, `lambda`, and `apigateway` ARNs.
* Strict `TagResource` validation for organizational compliance.

---

## 🗄️ Database Schema & Indexing Strategy

The engine relies on MongoDB for persistence, utilizing heavily indexed collections to support lightning-fast reporting queries and aggregate data generation.

### Collections

#### 1. `ReconciliationRun`
Tracks the metadata, status, and aggregate statistics of a singular reconciliation execution.
```typescript
{
  _id: ObjectId,
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  startTime: Date,
  endTime: Date,
  summary: {
    totalInternalRecords: Number,
    totalExchangeRecords: Number,
    matchedCount: Number,
    discrepancyCount: Number,
  }
}
```
* **Indexes:** 
  * `{ status: 1, startTime: -1 }` (Optimized for dashboard polling)

#### 2. `Transaction`
Stores the normalized, atomic transactions from both sources.
```typescript
{
  _id: ObjectId,
  runId: ObjectId,            // Ref: ReconciliationRun
  source: 'INTERNAL' | 'EXCHANGE',
  transactionId: String,
  amount: Number,
  currency: String,
  timestamp: Date,
  rawMetadata: Object         // Schema-less blob for audit trails
}
```
* **Indexes:**
  * `{ runId: 1, transactionId: 1 }` (Compound unique index to prevent duplicate ingestion per run)
  * `{ runId: 1, source: 1 }` (Optimized for filtering by source during matching phase)

#### 3. `ReconciliationResult`
The highly-optimized discrepancy ledger.
```typescript
{
  _id: ObjectId,
  runId: ObjectId,            // Ref: ReconciliationRun
  status: 'MATCHED' | 'DISCREPANCY' | 'MISSING_IN_INTERNAL' | 'MISSING_IN_EXCHANGE',
  internalTransactionId: String,  // (Optional)
  exchangeTransactionId: String,  // (Optional)
  discrepancyReasons: [String],   // e.g., ["AMOUNT_MISMATCH", "DATE_MISMATCH"]
  deltaAmount: Number
}
```
* **Indexes:**
  * `{ runId: 1, status: 1 }` (Critical for fast report generation and pagination)

### Aggregation Pipelines
Generating discrepancy reports utilizes native MongoDB aggregation pipelines rather than memory-heavy application mapping:
* **`$match`**: Filters by `runId` and `status != 'MATCHED'`.
* **`$group`**: Groups by `discrepancyReasons` to generate analytical health dashboards.
* **`$lookup`**: (Optional) Left-joins the `Transaction` collection to hydrate raw audit data into the final payload.

---

## 🛠️ Repository Structure (Monorepo)

```text
reconciliation-engine/
├── apps/
│   └── api/                # Express.js REST API & Serverless Framework config
├── packages/
│   ├── engine/             # Core reconciliation logic & streaming parsers
│   ├── database/           # Mongoose models, schemas, and DB connection logic
│   ├── logger/             # Structured Pino logging utility
│   └── types/              # Shared TypeScript definitions (DTOs)
├── .github/
│   └── workflows/          # CI/CD GitHub Actions pipelines
├── turbo.json              # Turborepo task runner configuration
└── package.json            # Root workspace definitions (pnpm)
```

## 🚦 Local Development

1. **Install Dependencies:**
   ```bash
   pnpm install
   ```

2. **Start Infrastructure (MongoDB):**
   ```bash
   docker-compose up -d
   ```

3. **Run Development Server:**
   ```bash
   pnpm turbo run dev
   ```

4. **Run Test Suite:**
   ```bash
   pnpm turbo run test
   ```

---

*Designed and engineered for financial-grade data integrity and uncompromised cloud security.*
