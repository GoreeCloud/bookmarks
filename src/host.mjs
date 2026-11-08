import { isIP } from 'node:net';

/**
 * Strict host-header validation for the self-hosted preview. Exact hostnames only:
 * no suffix matching, wildcards, user-info or URL fragments. HTTP ports are allowed
 * in request Host headers (reverse proxies may expose a different external port).
 */
function parseHostAuthority(value) {
  if (typeof value !== 'string' || !value || value.length > 255 ||
      /[\s/@?#\\*%]/.test(value)) return null;
  let rawName, port;
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    if (close < 2) return null;
    rawName = value.slice(0, close + 1);
    const trailing = value.slice(close + 1);
    if (trailing && !/^:[0-9]{1,5}$/.test(trailing)) return null;
    port = trailing ? trailing.slice(1) : null;
  } else {
    const parts = value.split(':');
    if (parts.length > 2 || !parts[0] || (parts.length === 2 && !/^[0-9]{1,5}$/.test(parts[1]))) return null;
    [rawName] = parts;
    port = parts.length === 2 ? parts[1] : null;
  }
  if (port !== null && (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)) return null;
  let parsed;
  try { parsed = new URL(`http://${rawName}/`); } catch { return null; }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
  // Reject alternate textual encodings of loopback IPs and other authorities.
  // An encoded DNS name must be supplied in canonical ASCII (punycode) form.
  if (rawName.toLowerCase() !== parsed.hostname.toLowerCase()) return null;
  // URL's canonical normalization handles case, IDNA and IPv6 formatting.
  const name = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // IDNA-normalized DNS names or literal IPs only; never accept wildcard or
  // invalid labels that could be interpreted differently by a reverse proxy.
  if (!isIP(name) && !name.split('.').every(label => label.length > 0 && label.length <= 63 &&
      /^[a-z0-9-]+$/.test(label) && !label.startsWith('-') && !label.endsWith('-'))) return null;
  return { name, port };
}

export function trustedHostPolicy(additional = '') {
  if (typeof additional !== 'string' || additional.length > 4096) throw new Error('Invalid GCB_TRUSTED_HOSTS configuration');
  const hosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (additional.trim()) {
    for (const item of additional.split(',')) {
      const host = parseHostAuthority(item.trim());
      if (!host || host.port !== null || !item.trim()) {
        throw new Error('Invalid GCB_TRUSTED_HOSTS entry: use comma-separated hostnames without ports or schemes');
      }
      hosts.add(host.name);
    }
  }
  return {
    accepts(header) {
      const parsed = parseHostAuthority(header);
      return Boolean(parsed && hosts.has(parsed.name));
    }
  };
}
