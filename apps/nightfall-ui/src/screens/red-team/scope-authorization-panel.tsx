import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import type { SignedScopeManifest } from '@nightfall/core-contracts';
import {
  Button,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  cn,
} from '@nightfall/ui-kit';

export type ScopeAuthorizationPanelProps = {
  yamlDraft: string;
  fallbackTargetUrl: string;
  signedManifest?: SignedScopeManifest;
  onSignedManifestChange: (manifest: SignedScopeManifest | undefined) => void;
};

const SIGN_CLI_COMMAND =
  'nightfall sign --manifest campaign.yaml --key operator.pem --out campaign.signed.json';

function extractTargetsFromYaml(yamlDraft: string, fallbackTargetUrl: string): string[] {
  const matches = yamlDraft.match(/(?:https?|wss?):\/\/[^\s,\]"'}]+/gi) ?? [];
  const unique = Array.from(new Set(matches.map((u) => u.trim()).filter(Boolean)));
  if (unique.length > 0) return unique;
  return fallbackTargetUrl ? [fallbackTargetUrl] : [];
}

export function isLoopbackOrBundledStagingUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === 'staging.northstardocs.com' ||
      /^127(?:\.\d{1,3}){3}$/.test(host)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function parseSignedScopeManifestJson(
  rawText: string,
): { ok: true; manifest: SignedScopeManifest } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'Malformed JSON — paste or upload a valid campaign.signed.json file.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'SignedScopeManifest payload must be a JSON object.' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 'v5') {
    return { ok: false, error: 'SignedScopeManifest version must equal "v5".' };
  }
  if (!obj.manifest || typeof obj.manifest !== 'object') {
    return { ok: false, error: 'Missing embedded v5 "manifest" object.' };
  }
  const requiredStrings = [
    'canonicalDigestSha256',
    'signatureBase64',
    'issuedAt',
    'expiresAt',
    'keyId',
  ] as const;
  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string' || !(obj[field] as string).trim()) {
      return { ok: false, error: `Missing required Ed25519 signature field "${field}".` };
    }
  }
  return { ok: true, manifest: obj as unknown as SignedScopeManifest };
}

export function ScopeAuthorizationPanel({
  yamlDraft,
  fallbackTargetUrl,
  signedManifest,
  onSignedManifestChange,
}: ScopeAuthorizationPanelProps): React.ReactElement {
  const targets = useMemo(
    () => extractTargetsFromYaml(yamlDraft, fallbackTargetUrl),
    [yamlDraft, fallbackTargetUrl],
  );
  const requiresOperatorSignature = useMemo(
    () => targets.length === 0 || targets.some((t) => !isLoopbackOrBundledStagingUrl(t)),
    [targets],
  );

  const [expanded, setExpanded] = useState<boolean>(requiresOperatorSignature);
  const [rawJson, setRawJson] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [copiedCli, setCopiedCli] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (requiresOperatorSignature) {
      setExpanded(true);
    }
  }, [requiresOperatorSignature]);

  function applyManifestText(nextText: string): void {
    setRawJson(nextText);
    if (!nextText.trim()) {
      setParseError(null);
      onSignedManifestChange(undefined);
      return;
    }
    const result = parseSignedScopeManifestJson(nextText);
    if (result.ok) {
      setParseError(null);
      onSignedManifestChange(result.manifest);
    } else {
      setParseError(result.error);
      onSignedManifestChange(undefined);
    }
  }

  async function handleCopyCli(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(SIGN_CLI_COMMAND);
      } catch {
        // Clipboard permission unavailable in headless test runner
      }
    }
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 1800);
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    applyManifestText(text);
  }

  const statusDotVariant = signedManifest
    ? 'success'
    : requiresOperatorSignature
      ? 'warning'
      : 'success';
  const statusSummary = signedManifest
    ? `Signed (${signedManifest.keyId})`
    : requiresOperatorSignature
      ? 'External host · signature required'
      : 'Bundled staging scope';

  return (
    <div
      id="panel-scope-authorization"
      className={cn(
        'rounded-2xl border bg-sidebar text-[12.5px] transition-colors',
        requiresOperatorSignature && !signedManifest
          ? 'border-hairline-strong'
          : 'border-hairline',
      )}
    >
      <button
        id="btn-toggle-scope-auth"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left cursor-pointer"
      >
        <HStack gap={2} align="center">
          {requiresOperatorSignature && !signedManifest ? (
            <ShieldAlertIcon size={15} className="text-status-amber-ink" />
          ) : (
            <ShieldCheckIcon size={15} className="text-ink-secondary" />
          )}
          <span className="font-medium text-ink">Cryptographic Scope Authorization (Ed25519)</span>
        </HStack>

        <HStack gap={2} align="center">
          <StatusDot variant={statusDotVariant} label={statusSummary} />
          <span className="text-[11.5px] text-ink-secondary">{statusSummary}</span>
          {expanded ? (
            <ChevronDownIcon size={14} className="text-ink-muted" />
          ) : (
            <ChevronRightIcon size={14} className="text-ink-muted" />
          )}
        </HStack>
      </button>

      {expanded ? (
        <div className="border-t border-hairline px-3.5 py-3">
          <VStack gap={2}>
            <p className="m-0 leading-relaxed text-ink-secondary">
              {requiresOperatorSignature
                ? 'External targets require an Ed25519 SignedScopeManifest signed by a key pinned in NIGHTFALL_SCOPE_SIGNERS.'
                : 'Loopback and bundled Northstar staging targets run inside ephemeral sandbox scope automatically, or you may attach a pinned operator signature below.'}
            </p>

            <div className="rounded-xl border border-hairline bg-canvas p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Sign offline with operator key
                </span>
                <Button
                  id="btn-copy-sign-cli"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11.5px]"
                  onClick={() => void handleCopyCli()}
                >
                  {copiedCli ? 'Copied ✓' : 'Copy CLI'}
                </Button>
              </div>
              <code className="block overflow-x-auto font-mono text-[11.5px] whitespace-nowrap text-ink">
                {SIGN_CLI_COMMAND}
              </code>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11.5px] font-medium text-ink-secondary">
                  SignedScopeManifest JSON
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    id="input-upload-signed-manifest"
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={(e) => void handleFileUpload(e)}
                  />
                  <Button
                    id="btn-upload-signed-manifest"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2.5 text-[11.5px]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload signed JSON
                  </Button>
                  {rawJson ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11.5px]"
                      onClick={() => applyManifestText('')}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>

              <textarea
                id="textarea-signed-manifest-json"
                rows={3}
                value={rawJson}
                onChange={(e) => applyManifestText(e.target.value)}
                spellCheck={false}
                placeholder='Paste campaign.signed.json ({"version":"v5","keyId":"...","signatureBase64":"..."})'
                className="w-full resize-y rounded-xl border border-hairline-strong bg-canvas px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink placeholder:text-ink-muted outline-none"
              />
            </div>

            {parseError ? (
              <div className="rounded-lg bg-status-danger px-3 py-1.5 text-[11.5px] text-status-danger-ink">
                {parseError}
              </div>
            ) : null}

            {signedManifest ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-status-mint px-3 py-1.5 text-[11.5px] text-status-mint-ink">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <CheckCircleIcon size={13} />
                  <span>Ready to attach Ed25519 envelope</span>
                </span>
                <Token
                  size="sm"
                  color="green"
                  label={`${signedManifest.keyId} · sha256:${signedManifest.canonicalDigestSha256.slice(0, 10)}…`}
                />
              </div>
            ) : null}
          </VStack>
        </div>
      ) : null}
    </div>
  );
}
