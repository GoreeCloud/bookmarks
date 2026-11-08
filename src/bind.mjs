import { isIP } from 'node:net';

/**
 * Reject ambiguous DNS resolution and accidental non-loopback listeners.
 * GCB_ALLOW_NON_LOOPBACK must be explicitly set to 1 before binding to any
 * non-loopback IP. An opt-in is NOT production exposure authorization or TLS.
 */
export function validateBindHost(host, allowNonLoopback = '') {
  if (typeof host !== 'string' || !isIP(host)) {
    throw new Error('HOST must be a literal IPv4 or IPv6 address; use 127.0.0.1 or ::1 for local access');
  }
  if (!['', '0', '1'].includes(allowNonLoopback)) {
    throw new Error('GCB_ALLOW_NON_LOOPBACK must be 1 to opt in, or 0/unset');
  }
  if (host !== '127.0.0.1' && host !== '::1' && allowNonLoopback !== '1') {
    throw new Error('Non-loopback HOST is disabled; set GCB_ALLOW_NON_LOOPBACK=1 only after a separate security review');
  }
  return host;
}
