# RekrootAI Server Scaffold

This folder contains the TypeScript/Express scaffold for the backend.

## What is included
- Auth, jobs, applications, assessments, interviews, and admin route groups
- In-memory demo data aligned to the current frontend services
- Mock-token auth so the client can run against the scaffold without extra setup
- Placeholder implementations for fairness, audit, and interview flows

## Run locally
```bash
cd SERVER
npm install
npm run dev
```

## Notes
- Demo users use the same mock ids as the client-side quick login buttons.
- This is a scaffold, not production code. Replace the in-memory store with MongoDB, Redis, blob storage, and worker queues when you wire the real backend.