import * as Sentry from '@sentry/react-native';
import { env, has } from './config';

export function initSentry() {
  if (!has('sentryDsn')) return; // scaffold mode — no-op
  Sentry.init({
    dsn: env.sentryDsn,
    tracesSampleRate: 0.2,
    // Health data (cravings/relapses) and Sage chat drafts must never ride
    // along in a crash payload to a third-party processor.
    sendDefaultPii: false,
    // Drop breadcrumbs that can carry content: console lines, and request
    // URLs/bodies from xhr/fetch.
    beforeBreadcrumb(breadcrumb) {
      const c = breadcrumb.category;
      if (c === 'console' || c === 'xhr' || c === 'fetch') return null;
      return breadcrumb;
    },
    // Strip request bodies/cookies/auth headers and captured local variables
    // (a frame may hold a Sage message or craving fields) before send.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.Authorization;
          delete event.request.headers.authorization;
          delete event.request.headers.Cookie;
        }
      }
      for (const ex of event.exception?.values ?? []) {
        for (const frame of ex.stacktrace?.frames ?? []) {
          delete (frame as { vars?: unknown }).vars;
        }
      }
      return event;
    },
  });
}

export { Sentry };
