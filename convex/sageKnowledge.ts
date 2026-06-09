/**
 * Sage retrieval flow + evaluation.
 *
 * `searchKnowledge` is called by sage.ts on each user message: it routes the
 * message to the right topic namespaces, searches the RAG index (excluding
 * reference-only/dosing chunks), and returns source-attributed evidence to
 * inject into the system prompt. `runEval` is the EvalAgent harness.
 */
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { rag } from './rag';
import { TOPIC_ROUTES } from '../knowledge/sources.config';
import { routeKey, type RetrievedEvidence } from './model/sage.prompt';
import { EVAL_QUESTIONS } from '../knowledge/eval/questions';

/**
 * Retrieve source-attributed evidence for a user message. Defensive by design:
 * any failure (missing GOOGLE_GENERATIVE_AI_API_KEY, empty index, API error)
 * returns [] so Sage degrades to its baked-in core knowledge instead of erroring.
 */
export async function searchKnowledge(
  ctx: ActionCtx,
  message: string,
  opts: { perNamespaceLimit?: number; maxEvidence?: number } = {},
): Promise<RetrievedEvidence[]> {
  // No embedding key → no index yet. Skip cleanly so Sage uses core knowledge
  // (avoids a failing embedding call per namespace on every message pre-ingest).
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return [];

  const perNamespaceLimit = opts.perNamespaceLimit ?? 3;
  const maxEvidence = opts.maxEvidence ?? 6;
  const namespaces = TOPIC_ROUTES[routeKey(message)] ?? TOPIC_ROUTES.default;

  const evidence: RetrievedEvidence[] = [];
  const seen = new Set<string>();

  for (const ns of namespaces) {
    try {
      // `referenceOnly:false` keeps dosing/clinical chunks out of repeatable advice.
      const res: any = await rag.search(ctx, {
        namespace: ns,
        query: message,
        limit: perNamespaceLimit,
        vectorScoreThreshold: 0.3,
        chunkContext: { before: 0, after: 1 },
        filters: [{ name: 'referenceOnly', value: false }],
      });

      const entries: any[] = res?.entries ?? [];
      const entryById = new Map(
        entries.map((e) => [e.entryId ?? e._id ?? e.id, e]),
      );

      for (const r of (res?.results ?? []) as any[]) {
        const text = String(r?.text ?? r?.content ?? '').trim();
        if (!text) continue;
        const dedupe = text.slice(0, 80);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const entry = entryById.get(r?.entryId) ?? {};
        const md = entry?.metadata ?? {};
        evidence.push({
          topic: ns,
          sourceName: md.sourceName ?? entry?.title ?? ns,
          sourceUrl: md.sourceUrl ?? '',
          text,
        });
      }
    } catch (e) {
      // Surface WHY in Convex logs, but never break the chat turn.
      console.error(`[sage:rag] search failed for namespace "${ns}":`, e instanceof Error ? e.message : String(e));
    }
  }

  // Internal citation log so bad answers are debuggable via `npx convex logs`.
  if (evidence.length) {
    console.log(`[sage:rag] "${message.slice(0, 60)}" → ${evidence.length} chunks from ${[...new Set(evidence.map((e) => e.sourceName))].join(', ')}`);
  } else {
    console.log(`[sage:rag] "${message.slice(0, 60)}" → no evidence (using core knowledge)`);
  }

  return evidence.slice(0, maxEvidence);
}

/**
 * EvalAgent: run the 25 representative questions through retrieval and log what
 * comes back. Fails LOUDLY (console.error + failed count) on empty/off-topic
 * results. Run with: `npx convex run sageKnowledge:runEval`.
 */
export const runEval = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows: {
      q: string;
      expectTopic: string;
      hits: number;
      topics: string[];
      sources: string[];
      onTopic: boolean;
      ok: boolean;
    }[] = [];

    for (const item of EVAL_QUESTIONS) {
      const ev = await searchKnowledge(ctx, item.q);
      const topics = [...new Set(ev.map((e) => e.topic))];
      const sources = [...new Set(ev.map((e) => e.sourceName))];
      const onTopic = topics.includes(item.topic);
      const ok = ev.length > 0;
      rows.push({ q: item.q, expectTopic: item.topic, hits: ev.length, topics, sources, onTopic, ok });
      const tag = !ok ? 'FAIL-EMPTY' : !onTopic ? 'WARN-OFFTOPIC' : 'PASS';
      console.log(`[eval] ${tag} (${ev.length}) "${item.q}" → ${topics.join('/')} | ${sources.join(', ')}`);
    }

    const passed = rows.filter((r) => r.ok).length;
    const onTopic = rows.filter((r) => r.onTopic).length;
    const empties = rows.filter((r) => !r.ok);
    if (empties.length) {
      console.error(`[eval] ${empties.length}/${rows.length} questions returned NO evidence — check ingestion ran and namespaces are populated:`, empties.map((r) => r.q));
    }
    console.log(`[eval] SUMMARY: ${passed}/${rows.length} returned evidence, ${onTopic}/${rows.length} on expected topic`);
    return { total: rows.length, returnedEvidence: passed, onExpectedTopic: onTopic, failedEmpty: empties.length, rows };
  },
});
