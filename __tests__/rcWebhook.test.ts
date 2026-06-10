import { premiumChangesFor } from '../convex/model/rcWebhook';

const UID = 'j57abc123';

describe('premiumChangesFor — grant events', () => {
  it.each([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'PRODUCT_CHANGE',
    'NON_RENEWING_PURCHASE',
    'TEMPORARY_ENTITLEMENT_GRANT',
  ])('%s mirrors premium=true', (type) => {
    expect(premiumChangesFor({ type, app_user_id: UID })).toEqual([
      { externalId: UID, premium: true },
    ]);
  });
});

describe('premiumChangesFor — revoke events', () => {
  it('EXPIRATION mirrors premium=false', () => {
    expect(premiumChangesFor({ type: 'EXPIRATION', app_user_id: UID })).toEqual([
      { externalId: UID, premium: false },
    ]);
  });

  it('refund (CANCELLATION + CUSTOMER_SUPPORT) revokes immediately', () => {
    expect(
      premiumChangesFor({ type: 'CANCELLATION', app_user_id: UID, cancel_reason: 'CUSTOMER_SUPPORT' }),
    ).toEqual([{ externalId: UID, premium: false }]);
  });
});

describe('premiumChangesFor — the two regressions this mapping fixes', () => {
  it('plain CANCELLATION (auto-renew off) does NOT revoke — user paid through period end', () => {
    expect(
      premiumChangesFor({ type: 'CANCELLATION', app_user_id: UID, cancel_reason: 'UNSUBSCRIBE' }),
    ).toEqual([]);
    expect(premiumChangesFor({ type: 'CANCELLATION', app_user_id: UID })).toEqual([]);
  });

  it.each(['TEST', 'BILLING_ISSUE', 'SUBSCRIBER_ALIAS', 'INVOICE_ISSUANCE', 'SUBSCRIPTION_PAUSED', 'SOME_FUTURE_TYPE'])(
    '%s does NOT mint premium (previously every unknown type granted it)',
    (type) => {
      expect(premiumChangesFor({ type, app_user_id: UID })).toEqual([]);
    },
  );
});

describe('premiumChangesFor — TRANSFER (restore on a new install)', () => {
  it('revokes transferred_from ids and grants transferred_to ids', () => {
    expect(
      premiumChangesFor({
        type: 'TRANSFER',
        transferred_from: ['oldUser1', 'oldUser2'],
        transferred_to: ['newUser'],
      }),
    ).toEqual([
      { externalId: 'oldUser1', premium: false },
      { externalId: 'oldUser2', premium: false },
      { externalId: 'newUser', premium: true },
    ]);
  });

  it('tolerates missing transfer arrays', () => {
    expect(premiumChangesFor({ type: 'TRANSFER' })).toEqual([]);
  });
});

describe('premiumChangesFor — malformed payloads', () => {
  it('no event / no type / no app_user_id → no writes', () => {
    expect(premiumChangesFor(undefined)).toEqual([]);
    expect(premiumChangesFor(null)).toEqual([]);
    expect(premiumChangesFor({})).toEqual([]);
    expect(premiumChangesFor({ type: 'RENEWAL' })).toEqual([]);
    expect(premiumChangesFor({ app_user_id: UID })).toEqual([]);
  });
});
