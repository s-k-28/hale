import * as Sentry from '@sentry/react-native';
import { env, has } from './config';

export function initSentry() {
  if (!has('sentryDsn')) return; // scaffold mode — no-op
  Sentry.init({ dsn: env.sentryDsn, tracesSampleRate: 0.2 });
}

export { Sentry };
