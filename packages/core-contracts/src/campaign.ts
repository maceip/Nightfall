import crypto from 'node:crypto';
import YAML from 'yaml';
import { z } from 'zod';

export const HttpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const WebSocketOperationSchema = z.enum(['open', 'send']);
export type WebSocketOperation = z.infer<typeof WebSocketOperationSchema>;

export const CampaignSourceSchema = z.object({
  archive: z.string().optional(),
  repository: z.string().optional(),
  revision: z.string().optional(),
});

export const CampaignCredentialSchema = z.object({
  file: z.string().min(1),
  workspaceHint: z.string().optional(),
});

export const HttpAllowRuleSchema = z.object({
  methods: z.array(HttpMethodSchema).min(1),
  path_prefixes: z.array(z.string().min(1)).min(1),
});

export const WebSocketAllowRuleSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
  origins: z.array(z.string().min(1)).min(1),
  operations: z.array(WebSocketOperationSchema).min(1),
});

export const CampaignYamlV5Schema = z.object({
  objective: z.string().min(1),
  campaign: z.object({
    name: z.string().min(1),
    targets: z.array(z.string().url()).min(1),
    source: CampaignSourceSchema,
    max_duration: z.string().regex(/^\d+(ms|s|m|h)$/, 'Invalid duration format (e.g. 8h, 30m, 60s)'),
    max_requests_per_second: z.number().positive().max(1000),
  }),
  credentials: z.record(z.string(), CampaignCredentialSchema).default({}),
  http: z.object({
    allow: z.array(HttpAllowRuleSchema).min(1),
  }),
  websocket: z
    .object({
      allow: z.array(WebSocketAllowRuleSchema),
    })
    .optional(),
});

export type CampaignYamlV5 = z.infer<typeof CampaignYamlV5Schema>;

export interface SignedScopeManifest {
  version: 'v5';
  manifest: CampaignYamlV5;
  canonicalDigestSha256: string;
  signatureBase64: string;
  issuedAt: string;
  /** End of the authorization window. Bound into the signature, so it cannot be extended. */
  expiresAt: string;
  keyId: string;
}

export function parseDurationMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported duration string: ${duration}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}

export function parseCampaignYaml(yamlText: string): CampaignYamlV5 {
  const raw = YAML.parse(yamlText);
  return CampaignYamlV5Schema.parse(raw);
}

export function serializeCampaignYaml(manifest: CampaignYamlV5): string {
  const validated = CampaignYamlV5Schema.parse(manifest);
  return YAML.stringify(validated, { indent: 2 });
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`).join(',')}}`;
}

export interface ScopeSigningKeyPair {
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateScopeKeyPair(keyId = `nf-key-${crypto.randomUUID().slice(0, 8)}`): ScopeSigningKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { keyId, publicKeyPem: publicKey, privateKeyPem: privateKey };
}

export const DEFAULT_SCOPE_AUTHORIZATION_VALIDITY_MS = 24 * 60 * 60 * 1000;

export interface SignCampaignManifestOptions {
  /** How long the authorization stays valid. Defaults to 24 hours. */
  validForMs?: number;
  now?: Date;
}

/**
 * The exact bytes an Ed25519 scope signature covers. Domain-separated and bound to the key id and
 * the validity window, so a signature cannot be relabelled to another signer or replayed past expiry.
 */
export function scopeSignaturePayload(fields: {
  keyId: string;
  issuedAt: string;
  expiresAt: string;
  canonicalDigestSha256: string;
}): Buffer {
  return Buffer.from(
    [
      'nightfall-scope-authorization-v1',
      fields.keyId,
      fields.issuedAt,
      fields.expiresAt,
      fields.canonicalDigestSha256,
    ].join('\n'),
    'utf8',
  );
}

export function canonicalManifestDigest(manifest: CampaignYamlV5): string {
  const validated = CampaignYamlV5Schema.parse(manifest);
  return crypto.createHash('sha256').update(canonicalizeJson(validated)).digest('hex');
}

/**
 * Signs a scope manifest with an operator-held private key. Runtime services must never call this
 * with a key they generated themselves; authorization is checked against a pinned signer registry
 * (see `verifyScopeAuthorization` in `scopeAuthority.ts`).
 */
export function signCampaignManifest(
  manifest: CampaignYamlV5,
  privateKeyPem: string,
  keyId = 'nf-scope-default',
  options?: SignCampaignManifestOptions,
): SignedScopeManifest {
  const validated = CampaignYamlV5Schema.parse(manifest);
  const canonicalDigestSha256 = canonicalManifestDigest(validated);
  const now = options?.now ?? new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + (options?.validForMs ?? DEFAULT_SCOPE_AUTHORIZATION_VALIDITY_MS),
  ).toISOString();
  const signature = crypto.sign(
    null,
    scopeSignaturePayload({ keyId, issuedAt, expiresAt, canonicalDigestSha256 }),
    privateKeyPem,
  );
  return {
    version: 'v5',
    manifest: validated,
    canonicalDigestSha256,
    signatureBase64: signature.toString('base64'),
    issuedAt,
    expiresAt,
    keyId,
  };
}

/**
 * Integrity check only: is `signed` an untampered manifest signed by `publicKeyPem`? This does NOT
 * decide whether the signer is authorized; use `verifyScopeAuthorization` for that.
 */
export function verifySignedCampaignManifest(
  signed: SignedScopeManifest,
  publicKeyPem: string,
): boolean {
  try {
    const expectedDigest = canonicalManifestDigest(signed.manifest);
    if (expectedDigest !== signed.canonicalDigestSha256) {
      return false;
    }
    if (typeof signed.expiresAt !== 'string' || typeof signed.issuedAt !== 'string') {
      return false;
    }
    return crypto.verify(
      null,
      scopeSignaturePayload({
        keyId: signed.keyId,
        issuedAt: signed.issuedAt,
        expiresAt: signed.expiresAt,
        canonicalDigestSha256: expectedDigest,
      }),
      publicKeyPem,
      Buffer.from(signed.signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}
