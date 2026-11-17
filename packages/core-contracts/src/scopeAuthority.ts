import fs from 'node:fs';
import net from 'node:net';
import { z } from 'zod';
import { verifySignedCampaignManifest, type SignedScopeManifest } from './campaign.js';

/**
 * Scope authorization trust anchor.
 *
 * A campaign may only send traffic when its manifest is signed by a key that an operator pinned in
 * a signer registry ahead of time. The registry is configuration, provisioned outside the runtime
 * (file referenced by NIGHTFALL_SCOPE_SIGNERS); runtime code paths can read it but never add to it.
 * Private keys stay with the accountable person who signs, ideally in non-exportable hardware
 * (security key, Secure Enclave, TPM or a cloud KMS): any Ed25519 public key can be pinned here.
 */
export const ScopeSignerSchema = z.object({
  keyId: z.string().min(1),
  publicKeyPem: z.string().includes('BEGIN PUBLIC KEY'),
  /** The accountable person or role this key belongs to. Recorded on every launch. */
  principal: z.string().min(1),
  /**
   * When set, this signer may only authorize manifests whose every target origin is listed here
   * (e.g. a team key limited to its own staging domains).
   */
  allowedTargetOrigins: z.array(z.string().url()).optional(),
  /**
   * When true, traffic authorized by this signer may only physically reach loopback addresses.
   * Used for the runtime's bundled self-test target, which it starts itself.
   */
  loopbackTransportOnly: z.boolean().optional(),
  notAfter: z.string().datetime().optional(),
  revoked: z.boolean().optional(),
});
export type ScopeSigner = z.infer<typeof ScopeSignerSchema>;

export const ScopeSignerRegistrySchema = z.object({
  version: z.literal(1),
  signers: z.array(ScopeSignerSchema),
});
export type ScopeSignerRegistry = z.infer<typeof ScopeSignerRegistrySchema>;

export const SCOPE_SIGNERS_ENV = 'NIGHTFALL_SCOPE_SIGNERS';
export const SCOPE_AUTHORIZATION_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function emptyScopeSignerRegistry(): ScopeSignerRegistry {
  return { version: 1, signers: [] };
}

export function parseScopeSignerRegistry(jsonText: string): ScopeSignerRegistry {
  const registry = ScopeSignerRegistrySchema.parse(JSON.parse(jsonText));
  const seen = new Set<string>();
  for (const signer of registry.signers) {
    if (seen.has(signer.keyId)) {
      throw new Error(`Duplicate scope signer keyId in registry: ${signer.keyId}`);
    }
    seen.add(signer.keyId);
  }
  return registry;
}

/**
 * Loads the operator's pinned signer registry. Returns an empty registry (which authorizes nothing)
 * when no path is configured; throws when a configured file is missing or malformed, so a typo
 * fails closed instead of silently disabling scope enforcement.
 */
export function loadScopeSignerRegistry(
  filePath: string | undefined = process.env[SCOPE_SIGNERS_ENV],
): ScopeSignerRegistry {
  if (!filePath || !filePath.trim()) {
    return emptyScopeSignerRegistry();
  }
  return parseScopeSignerRegistry(fs.readFileSync(filePath, 'utf8'));
}

export function normalizeScopeOrigin(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const protocol =
    parsed.protocol === 'wss:' ? 'https:' : parsed.protocol === 'ws:' ? 'http:' : parsed.protocol;
  const defaultPort = protocol === 'https:' ? '443' : protocol === 'http:' ? '80' : '';
  const port = parsed.port && parsed.port !== defaultPort ? `:${parsed.port}` : '';
  return `${protocol}//${parsed.hostname.toLowerCase()}${port}`;
}

export function isLoopbackUrl(rawUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }
  if (hostname === 'localhost') {
    return true;
  }
  if (net.isIPv4(hostname)) {
    return hostname.split('.')[0] === '127';
  }
  if (net.isIPv6(hostname)) {
    return hostname === '::1';
  }
  return false;
}

export type ScopeAuthorizationResult =
  | { authorized: true; signer: ScopeSigner }
  | { authorized: false; reason: string; signer?: ScopeSigner };

/**
 * Decides whether a signed manifest is authorized: signed by a pinned, unrevoked, unexpired signer,
 * inside its validity window, and within that signer's target constraints.
 */
export function verifyScopeAuthorization(
  signed: SignedScopeManifest,
  registry: ScopeSignerRegistry,
  now: Date = new Date(),
): ScopeAuthorizationResult {
  const signer = registry.signers.find((s) => s.keyId === signed.keyId);
  if (!signer) {
    return {
      authorized: false,
      reason: `Scope manifest key "${signed.keyId}" is not a pinned authorized signer`,
    };
  }
  if (signer.revoked) {
    return { authorized: false, reason: `Scope signer "${signer.keyId}" is revoked`, signer };
  }
  const nowMs = now.getTime();
  if (signer.notAfter && nowMs > Date.parse(signer.notAfter)) {
    return { authorized: false, reason: `Scope signer "${signer.keyId}" has expired`, signer };
  }
  if (!verifySignedCampaignManifest(signed, signer.publicKeyPem)) {
    return {
      authorized: false,
      reason: 'Invalid or tampered SignedScopeManifest cryptographic signature',
      signer,
    };
  }
  const issuedMs = Date.parse(signed.issuedAt);
  const expiresMs = Date.parse(signed.expiresAt);
  if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs) || expiresMs <= issuedMs) {
    return { authorized: false, reason: 'Scope authorization window is malformed', signer };
  }
  if (nowMs + SCOPE_AUTHORIZATION_CLOCK_SKEW_MS < issuedMs) {
    return { authorized: false, reason: 'Scope authorization is not yet valid', signer };
  }
  if (nowMs > expiresMs) {
    return { authorized: false, reason: 'Scope authorization has expired', signer };
  }
  if (signer.allowedTargetOrigins) {
    const allowed = new Set(signer.allowedTargetOrigins.map(normalizeScopeOrigin));
    const outside = signed.manifest.campaign.targets.filter(
      (target) => !allowed.has(normalizeScopeOrigin(target)),
    );
    if (outside.length > 0) {
      return {
        authorized: false,
        reason: `Scope signer "${signer.keyId}" may not authorize target(s): ${outside.join(', ')}`,
        signer,
      };
    }
  }
  return { authorized: true, signer };
}

/** Builds a registry pinning exactly the given public keys (tests, provisioning tools). */
export function scopeSignerRegistryOf(
  signers: Array<Omit<ScopeSigner, 'principal'> & { principal?: string }>,
): ScopeSignerRegistry {
  return ScopeSignerRegistrySchema.parse({
    version: 1,
    signers: signers.map((s) => ({ principal: s.keyId, ...s })),
  });
}
