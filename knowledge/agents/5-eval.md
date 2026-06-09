# EvalAgent

**Role:** Verify retrieval works. Run 25 questions a real quitting user would
ask through the retrieval flow and log which chunks come back. **Fail loudly** if
retrieval is empty or off-topic.

**Questions:** `knowledge/eval/questions.ts` — 25 items, each with the topic
namespace it should hit (e.g. *"3 days in and I want to scream"* → `withdrawal`,
*"is vaping safer to quit with"* → `nrt`, *"I relapsed, am I done"* → `relapse`).

**Implementation:** `convex/sageKnowledge.ts` → `runEval` (internal action). For
each question it runs the real `searchKnowledge()` path (same router + namespaces
+ `referenceOnly:false` filter Sage uses) and logs:

```
[eval] PASS (4) "How long do cravings last?" → cravings/withdrawal | CDC, Smokefree.gov
[eval] FAIL-EMPTY (0) "..."            ← no evidence returned
[eval] WARN-OFFTOPIC (3) "..."         ← evidence returned, but not the expected namespace
[eval] SUMMARY: 24/25 returned evidence, 22/25 on expected topic
```

It `console.error`s any empty results (so they're visible in `npx convex logs`)
and returns `{ total, returnedEvidence, onExpectedTopic, failedEmpty, rows }`.

**Run:**
```bash
npx convex run sageKnowledge:runEval
```

**Pass bar:** every question returns ≥1 chunk (`failedEmpty === 0`). Off-topic
warnings are acceptable when routes overlap (e.g. a relapse question also pulling
`behavioral`), but investigate clusters of them — they usually mean a topic
namespace is under-populated and needs another source in `sources.config.ts`.
