import XCTest
@testable import Hale

// Decode tests for the DTOs that lacked coverage. Payloads are shape-accurate to
// the Convex validators (derived from convex/*.ts return shapes; the local dev
// backend's `my*` queries require an authed identity a headless run can't supply,
// so these mirror the wire shapes — including the null/optional/empty edges that
// most often break hand-written Decodable structs).
final class DTOMoreDecodeTests: XCTestCase {
    private func dec<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: buddies.myBuddy
    func testMyBuddyDecodes() throws {
        let b = try dec(MyBuddy.self, #"""
        {"link":{"_id":"k1","_creationTime":1700000000000,"pairKey":"a:b","userA":"ua","userB":"ub","status":"active","sharedStreak":5,"lastSharedLocalDate":"2026-07-01","pairedAt":1700000000000,"pairingMethod":"invite_onboard","initiatorId":"ua"},"buddy":{"name":"Sam","currentStreak":7,"lastCheckInLocalDate":"2026-07-02"}}
        """#)
        XCTAssertEqual(b.link.sharedStreak, 5)
        XCTAssertEqual(b.buddy.name, "Sam")
        XCTAssertNil(b.link.endedAt)   // optional absent key decodes to nil
    }

    func testMyBuddyNullNameDecodes() throws {
        let b = try dec(MyBuddy.self, #"""
        {"link":{"_id":"k1","_creationTime":1,"pairKey":"a:b","userA":"ua","userB":"ub","status":"active","sharedStreak":0,"lastSharedLocalDate":null,"pairedAt":null,"endedAt":null,"pairingMethod":null,"initiatorId":null},"buddy":{"name":null,"currentStreak":0,"lastCheckInLocalDate":null}}
        """#)
        XCTAssertNil(b.buddy.name)
        XCTAssertNil(b.link.pairedAt)
    }

    // MARK: sage.messages
    func testSageMessagesDecode() throws {
        let ms = try dec([SageMessage].self, #"""
        [{"_id":"m1","_creationTime":1700000000000,"userId":"u1","role":"user","content":"hi","ts":1700000000000},
         {"_id":"m2","_creationTime":1700000001000,"userId":"u1","role":"sage","content":"Hey","ts":1700000001000,"inputTokens":10,"outputTokens":20,"costUsdProxy":0.001,"userTier":"free","cacheHit":false,"model":"llama"}]
        """#)
        XCTAssertEqual(ms.count, 2)
        XCTAssertEqual(ms[0].role, "user")
        XCTAssertNil(ms[0].outputTokens)      // metadata absent on the user turn
        XCTAssertEqual(ms[1].outputTokens, 20)
    }

    func testSageSendResultDecodes() throws {
        let a = try dec(SageSendResult.self, #"{"accepted":true,"tier":"free","dailyCount":3,"capType":null}"#)
        XCTAssertTrue(a.accepted); XCTAssertNil(a.capType)
        let cap = try dec(SageSendResult.self, #"{"accepted":false,"tier":"free","dailyCount":5,"capType":"daily"}"#)
        XCTAssertFalse(cap.accepted); XCTAssertEqual(cap.capType, "daily")
    }

    // MARK: nudges.myNudges
    func testNudgesDecode() throws {
        let ns = try dec([Nudge].self, #"""
        [{"_id":"n1","type":"cheer","ts":1700000000000,"title":"Sam cheered you on","body":"Keep going"}]
        """#)
        XCTAssertEqual(ns.first?.type, "cheer")
    }

    // MARK: goals.myGoals
    func testGoalsDecode() throws {
        let gs = try dec([Goal].self, #"""
        [{"_id":"g1","label":"Headphones","targetAmount":250.0,"createdAt":1700000000000,"achievedAt":null,"saved":80.5,"remaining":169.5,"ratio":0.322,"reached":false},
         {"_id":"g2","label":"Trip","targetAmount":500.0,"createdAt":1700000000000,"achievedAt":1700500000000,"saved":500.0,"remaining":0.0,"ratio":1.0,"reached":true}]
        """#)
        XCTAssertEqual(gs.count, 2)
        XCTAssertFalse(gs[0].reached)
        XCTAssertTrue(gs[1].reached)
        XCTAssertNil(gs[0].achievedAt)
    }

    // MARK: cravings.recent
    func testCravingsDecode() throws {
        let cs = try dec([Craving].self, #"""
        [{"_id":"c1","_creationTime":1700000000000,"userId":"u1","attemptId":"a1","ts":1700000000000,"localHour":21,"intensity":3,"trigger":"Stress","context":"Work","outcome":"survived","resolvedBy":"timer"},
         {"_id":"c2","_creationTime":1700000000000,"userId":"u1","attemptId":"a1","ts":1700000000000,"localHour":9,"intensity":5,"trigger":null,"context":null,"outcome":"survived","resolvedBy":null}]
        """#)
        XCTAssertEqual(cs.count, 2)
        XCTAssertEqual(cs[0].intensity, 3)
        XCTAssertNil(cs[1].trigger)
    }

    // MARK: leagues.myLeague
    func testMyLeagueDecode() throws {
        let l = try dec(MyLeague.self, #"""
        {"optedIn":true,"bucket":"week1","rank":2,"entries":[{"name":"You","score":6,"isMe":true},{"name":"Sam","score":8,"isMe":false}]}
        """#)
        XCTAssertTrue(l.optedIn)
        XCTAssertEqual(l.entries.count, 2)
        XCTAssertTrue(l.entries[0].isMe)
    }

    func testMyLeagueNotOptedInDecode() throws {
        let l = try dec(MyLeague.self, #"{"optedIn":false,"bucket":null,"rank":null,"entries":[]}"#)
        XCTAssertFalse(l.optedIn)
        XCTAssertNil(l.rank)
        XCTAssertTrue(l.entries.isEmpty)
    }

    // MARK: squads.mySquads
    func testSquadsDecode() throws {
        let ss = try dec([Squad].self, #"""
        [{"_id":"s1","name":"Fresh Start","isPublic":false,"memberCount":4,"role":"owner","inviteCode":"ABC123","challengeEnd":1700500000000,"challengeGoalDays":42},
         {"_id":"s2","name":"Solo","isPublic":true,"memberCount":1,"role":"member","inviteCode":"XYZ999","challengeEnd":null,"challengeGoalDays":null}]
        """#)
        XCTAssertEqual(ss.count, 2)
        XCTAssertEqual(ss[0].role, "owner")
        XCTAssertNil(ss[1].challengeEnd)
    }

    // MARK: feed.buddyFeed
    func testFeedEventsDecode() throws {
        let fs = try dec([FeedEvent].self, #"""
        [{"_id":"f1","type":"checkin","ts":1700000000000,"isMine":true,"payload":{"streak":5}},
         {"_id":"f2","type":"strength","ts":1700000001000,"isMine":false}]
        """#)
        XCTAssertEqual(fs.count, 2)     // payload (v.any()) is ignored, not required
        XCTAssertTrue(fs[0].isMine)
    }

    // MARK: mutation result DTOs (consumed for analytics props)
    func testCheckInResultDecodes() throws {
        let full = try dec(CheckInResult.self, #"""
        {"alreadyCheckedIn":false,"streak":3,"usedFreeze":false,"firstCheckIn":true,"activatedPairedQuitter":false,"pairedSolo":"solo","quitStage":"early","pairingMethod":null,"hoursPairToCheckin":null}
        """#)
        XCTAssertEqual(full.streak, 3)
        XCTAssertEqual(full.firstCheckIn, true)
        // the early-return branch only carries three keys
        let dup = try dec(CheckInResult.self, #"{"alreadyCheckedIn":true,"streak":3,"usedFreeze":false}"#)
        XCTAssertTrue(dup.alreadyCheckedIn)
        XCTAssertNil(dup.firstCheckIn)
    }

    func testPairResultDecodes() throws {
        let p = try dec(PairResult.self, #"{"linkId":"k1","alreadyPaired":false,"referrerId":"r1","referralCompleted":true,"referrerReachedGoal":false,"rewardGranted":true}"#)
        XCTAssertEqual(p.referrerId, "r1")
        XCTAssertTrue(p.rewardGranted)
        let noRef = try dec(PairResult.self, #"{"linkId":"k1","alreadyPaired":true,"referrerId":null,"referralCompleted":false,"referrerReachedGoal":false,"rewardGranted":false}"#)
        XCTAssertNil(noRef.referrerId)
    }

    func testMatchResultDecodes() throws {
        let matched = try dec(MatchResult.self, #"{"matched":true,"alreadyPaired":false,"linkId":"k1","buddyUserId":"u2","poolSize":4,"referrerId":"r1","referralCompleted":true,"referrerReachedGoal":false,"rewardGranted":false}"#)
        XCTAssertTrue(matched.matched)
        XCTAssertEqual(matched.poolSize, 4)
        let noMatch = try dec(MatchResult.self, #"{"matched":false,"poolSize":0,"reason":"profile_incomplete"}"#)
        XCTAssertFalse(noMatch.matched)
        XCTAssertEqual(noMatch.reason, "profile_incomplete")
        XCTAssertNil(noMatch.referrerId)
    }

    func testAttributionResultDecodes() throws {
        let ok = try dec(AttributionResult.self, #"{"attributed":true,"referrerId":"r1"}"#)
        XCTAssertTrue(ok.attributed)
        let no = try dec(AttributionResult.self, #"{"attributed":false,"reason":"already"}"#)
        XCTAssertFalse(no.attributed)
        XCTAssertEqual(no.reason, "already")
    }

    func testRelapseResultDecodes() throws {
        let r = try dec(RelapseResult.self, #"{"streakAtRelapse":5,"lapsesBeforeRelapse":1,"lifetimeMoneySaved":123.45,"bestStreak":9}"#)
        XCTAssertEqual(r.streakAtRelapse, 5)
        XCTAssertEqual(r.bestStreak, 9)
    }
}
