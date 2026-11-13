import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ProxyConfig, Session } from 'electron';

export interface DesktopNetworkPolicySettings {
  httpProxy?: string;
  httpProxyNoProxy?: string;
  httpProxyCaCertPath?: string;
}

type CertificateVerifyProc = NonNullable<Parameters<Session['setCertificateVerifyProc']>[0]>;

interface CertificateLike {
  data?: string;
  fingerprint?: string;
  issuerCert?: CertificateLike | null;
}

const USE_CHROMIUM_DEFAULT_VERIFICATION = -3;
const ACCEPT_CERTIFICATE = 0;
const MAX_CERTIFICATE_CHAIN_DEPTH = 16;

function normalizeFingerprint(value: string): string {
  return value.replace(/[^a-f0-9]/gi, '').toLowerCase();
}

export function readCustomCaFingerprintsFromPem(pem: string): Set<string> {
  const fingerprints = new Set<string>();
  const certBlocks =
    pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  for (const block of certBlocks) {
    fingerprints.add(normalizeFingerprint(new X509Certificate(block).fingerprint256));
  }
  return fingerprints;
}

function readCertificateFingerprint(certificate: CertificateLike): string | undefined {
  if (certificate.data) {
    try {
      return normalizeFingerprint(new X509Certificate(certificate.data).fingerprint256);
    } catch {
      // Fall back to Electron's precomputed fingerprint string
    }
  }
  return certificate.fingerprint ? normalizeFingerprint(certificate.fingerprint) : undefined;
}

export function certificateChainMatchesCustomCa(
  certificate: CertificateLike,
  trustedFingerprints: ReadonlySet<string>,
): boolean {
  let current: CertificateLike | null | undefined = certificate;
  const seen = new Set<string>();

  for (let depth = 0; current && depth < MAX_CERTIFICATE_CHAIN_DEPTH; depth += 1) {
    const fingerprint = readCertificateFingerprint(current);
    if (fingerprint) {
      if (trustedFingerprints.has(fingerprint)) return true;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
    }
    current = current.issuerCert;
  }
  return false;
}

export function buildElectronProxyConfig(
  httpProxy?: string,
  noProxy?: string,
): ProxyConfig {
  const trimmed = httpProxy?.trim();
  if (!trimmed) {
    // Default session uses direct connections so local embedded loopback API is never intercepted by OS proxies.
    return { mode: 'direct' };
  }
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(candidate);
    const auth = url.username ? `${url.username}${url.password ? `:${url.password}` : ''}@` : '';
    const bypassTokens = ['127.0.0.1', 'localhost', ...(noProxy?.split(',') ?? [])]
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      mode: 'fixed_servers',
      proxyRules: `${url.protocol}//${auth}${url.host}`,
      proxyBypassRules: Array.from(new Set(bypassTokens)).join(','),
    };
  } catch {
    return { mode: 'direct' };
  }
}

export async function applyDesktopChromiumNetworkPolicy(
  targetSession: Session,
  settings: DesktopNetworkPolicySettings = {},
): Promise<void> {
  const proxyConfig = buildElectronProxyConfig(settings.httpProxy, settings.httpProxyNoProxy);
  await targetSession.setProxy(proxyConfig);
  await targetSession.closeAllConnections();

  let verifyProc: CertificateVerifyProc | null = null;
  const caPath = settings.httpProxyCaCertPath?.trim();
  if (caPath) {
    try {
      const fingerprints = readCustomCaFingerprintsFromPem(readFileSync(caPath, 'utf8'));
      if (fingerprints.size > 0) {
        verifyProc = (request, callback) => {
          if (request.verificationResult === 'OK') {
            callback(USE_CHROMIUM_DEFAULT_VERIFICATION);
            return;
          }
          if (
            certificateChainMatchesCustomCa(request.certificate, fingerprints) ||
            certificateChainMatchesCustomCa(request.validatedCertificate, fingerprints)
          ) {
            callback(ACCEPT_CERTIFICATE);
            return;
          }
          callback(USE_CHROMIUM_DEFAULT_VERIFICATION);
        };
      }
    } catch {
      verifyProc = null;
    }
  }
  targetSession.setCertificateVerifyProc(verifyProc);
}
