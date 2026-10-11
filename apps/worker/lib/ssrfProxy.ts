import http from "http";
import net from "net";
import { resolveHostnameForServerSideFetch } from "@linkwarden/lib/ssrf";

/**
 * A localhost-only forward proxy that pins every outbound connection to an IP
 * that has just been validated by the SSRF allow-list.
 *
 * Subprocesses like `monolith` perform their own DNS resolution and fetching,
 * outside Playwright and `safeFetch`, so a hostname can pass a separate
 * validation check and then resolve to an internal address when the subprocess
 * connects (DNS rebinding / TOCTOU). Routing the subprocess through this proxy
 * (via HTTP(S)_PROXY) closes that gap: the proxy resolves the host once,
 * validates it, and connects the socket to that exact IP. For HTTPS the TLS
 * session stays end-to-end between the subprocess and the origin through the
 * CONNECT tunnel, so certificates and SNI are unaffected — only the IP the
 * socket lands on is constrained.
 */

let serverPromise: Promise<string> | null = null;

const CONNECT_TIMEOUT_MS = 15_000;

// Resolve to a single validated IP. resolveHostnameForServerSideFetch throws
// UnsafeUrlError if the host is blocked or resolves to a blocked address.
async function resolvePinnedAddress(hostname: string): Promise<string> {
  const addresses = await resolveHostnameForServerSideFetch(hostname);
  return addresses[0].address;
}

function stripBrackets(host: string): string {
  return host.replace(/^\[/, "").replace(/\]$/, "");
}

// Split a CONNECT authority ("host:port" or "[::1]:port") into host and port.
function splitAuthority(authority: string): { host: string; port: number } {
  if (authority.startsWith("[")) {
    const end = authority.indexOf("]");
    const host = authority.slice(1, end);
    const port = Number(authority.slice(end + 2));
    return { host, port: port || 443 };
  }

  const idx = authority.lastIndexOf(":");
  if (idx === -1) return { host: authority, port: 443 };

  return {
    host: authority.slice(0, idx),
    port: Number(authority.slice(idx + 1)) || 443,
  };
}

// HTTPS (and any tunneled protocol): validate the host, then tunnel raw bytes
// to the validated IP.
function handleConnect(
  req: http.IncomingMessage,
  clientSocket: net.Socket,
  head: Buffer
) {
  clientSocket.on("error", () => clientSocket.destroy());

  const { host, port } = splitAuthority(req.url || "");

  resolvePinnedAddress(host)
    .then((ip) => {
      const serverSocket = net.connect(port, ip, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head && head.length) serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      serverSocket.setTimeout(CONNECT_TIMEOUT_MS, () => serverSocket.destroy());
      serverSocket.on("error", () => clientSocket.destroy());
      serverSocket.on("close", () => clientSocket.destroy());
      clientSocket.on("close", () => serverSocket.destroy());
    })
    .catch(() => {
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
    });
}

// Plain HTTP forward-proxy requests arrive in absolute form ("GET http://...").
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  let target: URL;
  try {
    target = new URL(req.url || "");
  } catch {
    res.writeHead(400).end();
    return;
  }

  if (target.protocol !== "http:") {
    res.writeHead(400).end();
    return;
  }

  resolvePinnedAddress(stripBrackets(target.hostname))
    .then((ip) => {
      const proxyReq = http.request(
        {
          host: ip,
          port: Number(target.port) || 80,
          method: req.method,
          path: target.pathname + target.search,
          // Preserve the original Host so virtual-hosted servers respond
          // correctly even though we connect by IP.
          headers: { ...req.headers, host: target.host },
          timeout: CONNECT_TIMEOUT_MS,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });

      req.pipe(proxyReq);
    })
    .catch(() => {
      res.writeHead(403).end();
    });
}

/**
 * Starts the proxy on first use (bound to 127.0.0.1, ephemeral port) and
 * returns its URL, e.g. "http://127.0.0.1:54321". The single instance is
 * reused for the lifetime of the worker.
 */
export function getSsrfProxyUrl(): Promise<string> {
  if (!serverPromise) {
    serverPromise = new Promise<string>((resolve, reject) => {
      const server = http.createServer(handleRequest);
      server.on("connect", handleConnect);
      server.on("error", reject);

      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          resolve(`http://127.0.0.1:${address.port}`);
        } else {
          reject(new Error("Failed to determine SSRF proxy address."));
        }
      });

      // Don't keep the process alive solely for the proxy.
      server.unref();
    });
  }

  return serverPromise;
}
