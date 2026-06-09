# IngestAgent

**Role:** Chunk-add the curated corpus into the RAG component, one namespace per
topic tag, with importance weighting and source metadata.

**Implementation:** `convex/rag.ts` → `ingestAll` (internal action). It iterates
`knowledge/corpus.ts` and, per source, calls:

```ts
rag.add(ctx, {
  namespace: entry.topic,                 // one namespace per topic tag
  key: entry.sourceUrl,                   // idempotent: replace on re-ingest
  chunks: entry.chunks,
  importance: importanceFor(entry.sourceUrl), // peer-reviewed/CDC/NIH = higher
  filterValues: [
    { name: 'referenceOnly', value: entry.referenceOnly },
    { name: 'domain', value: entry.domain },
  ],
  contentHash,                            // skip unchanged sources
  metadata: { sourceUrl, sourceName, domain, topic, retrievalDate, referenceOnly },
});
```

- **Embeddings:** Google `text-embedding-004` (768-dim) via the AI SDK, keyed by
  `GOOGLE_GENERATIVE_AI_API_KEY` on the Convex deployment (`sources.config.ts` →
  `EMBEDDING`).
- **Importance** biases retrieval ranking by source authority (Cochrane / PMC /
  NIH / CDC highest — see `DOMAIN_IMPORTANCE`).
- **Idempotent:** keyed by source URL + content hash, so re-running only rewrites
  changed sources.

**Run:**
```bash
npx convex run rag:ingestAll
```
Returns `{ sources, skipped, totalChunks, perTopic }`.
