import { defineApp } from 'convex/server';
import rag from '@convex-dev/rag/convex.config.js';

// Convex components for HALE. The RAG component backs Sage's cessation knowledge
// engine (vector store + embeddings + retrieval). See convex/rag.ts for the
// client, and knowledge/README.md for the ingestion workflow.
const app = defineApp();
app.use(rag);

export default app;
