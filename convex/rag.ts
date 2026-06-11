/**
 * Sage knowledge index — the @convex-dev/rag client + ingestion pipeline.
 *
 * One namespace per topic tag; importance-weighted by source authority; every
 * chunk's source URL + retrieval date live in entry metadata. `referenceOnly`
 * (dosing/clinical) chunks are stored but filtered OUT of what Sage may repeat.
 */
import { components } from './_generated/api';
import { RAG } from '@convex-dev/rag';
import { google } from '@ai-sdk/google';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { EMBEDDING, importanceFor, isAllowlisted } from '../knowledge/sources.config';
import { CORPUS } from '../knowledge/corpus';

// Filters we can constrain searches on. `referenceOnly:false` is the important
// one — it keeps dosing/clinical chunks out of advice Sage repeats verbatim.
export type RagFilters = { referenceOnly: boolean; domain: string };

export const rag = new RAG<RagFilters>(components.rag, {
  textEmbeddingModel: google.textEmbeddingModel(EMBEDDING.model),
  embeddingDimension: EMBEDDING.dimension,
  filterNames: ['referenceOnly', 'domain'],
});

/** Stable FNV-1a hash so re-ingesting unchanged content is a no-op replace. */
function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * Ingest the curated corpus into the RAG index. Idempotent: keyed by source URL
 * with a content hash, so re-running only rewrites changed sources. Run after
 * editing knowledge/corpus.ts (see knowledge/README.md).
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const ingestAll = internalAction({
  // throttleMs: delay between sources to stay under the embedding free-tier
  // rate limit (Gemini free tier ≈ 100 embed requests/min). 0 to disable.
  // start/count: ingest a slice of the corpus — the full corpus at 8s/source
  // no longer fits in one action's runtime limit, so drive it in batches:
  //   npx convex run rag:ingestAll '{"start": 0, "count": 25}'
  args: { start: v.optional(v.number()), count: v.optional(v.number()) },
  handler: async (ctx, { start, count }) => {
    const throttleMs = 8000;
    let sources = 0;
    let skipped = 0;
    const perTopic: Record<string, number> = {};

    const batch = CORPUS.slice(start ?? 0, count ? (start ?? 0) + count : undefined);
    for (const entry of batch) {
      // Belt-and-suspenders: enforce the allowlist again at ingest time.
      if (!isAllowlisted(entry.sourceUrl) || !entry.chunks.length) {
        skipped++;
        continue;
      }
      if (sources > 0) await sleep(throttleMs); // pace embed calls under the rate limit
      await rag.add(ctx, {
        namespace: entry.topic, // one namespace per topic tag
        key: entry.sourceUrl, // unique per source → graceful replace on re-ingest
        chunks: entry.chunks,
        title: entry.sourceName,
        importance: importanceFor(entry.sourceUrl),
        filterValues: [
          { name: 'referenceOnly', value: !!entry.referenceOnly },
          { name: 'domain', value: entry.domain },
        ],
        contentHash: contentHash(entry.chunks.join('')),
        metadata: {
          sourceUrl: entry.sourceUrl,
          sourceName: entry.sourceName,
          domain: entry.domain,
          topic: entry.topic,
          retrievalDate: entry.retrievalDate,
          referenceOnly: !!entry.referenceOnly,
        },
      });
      sources++;
      perTopic[entry.topic] = (perTopic[entry.topic] ?? 0) + 1;
    }

    const totalChunks = batch.reduce((n, e) => n + e.chunks.length, 0);
    console.log(`[rag] ingested ${sources} sources (${totalChunks} chunks), skipped ${skipped}`, perTopic);
    return { sources, skipped, totalChunks, perTopic, corpusSize: CORPUS.length };
  },
});
