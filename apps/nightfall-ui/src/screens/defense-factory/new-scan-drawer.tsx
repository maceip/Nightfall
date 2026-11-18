import React, { useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import type { NewScanRequest, RepositoryRecord } from '@nightfall/core-contracts';
import {
  Button,
  CloseIcon,
  DialogClose,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DrawerContent,
  FolderIcon,
  Input,
  SegmentedControl,
} from '@nightfall/ui-kit';
import { platformBridge } from '../../bridge/platform-bridge.js';

export type NewScanDrawerProps = {
  open: boolean;
  repositories: RepositoryRecord[];
  onClose: () => void;
  onSubmitScan: (req: NewScanRequest) => Promise<void>;
};

const SCAN_METHODS: ReadonlyArray<{
  value: NewScanRequest['method'];
  title: string;
  subtitle: string;
}> = [
  {
    value: 'repository_scan',
    title: 'Repository scan',
    subtitle: "Find security issues across the repository's default branch.",
  },
  {
    value: 'continuous_monitoring',
    title: 'Continuous monitoring',
    subtitle: 'Find security issues introduced by new commits.',
  },
  {
    value: 'scheduled_scan',
    title: 'Scheduled scan',
    subtitle: "Set a schedule to run scans across your repository's default branch.",
  },
  {
    value: 'scorecard_scan',
    title: 'Supply-chain & Scorecard posture',
    subtitle: 'Evaluate CI workflow permissions, pinned actions, binary artifacts, and supply-chain checks.',
  },
  {
    value: 'mantis_scan',
    title: 'Mantis autonomous deep review',
    subtitle: 'Run the 20-stage Mantis LLM security review pipeline (static-only) over repository code.',
  },
];

export function NewScanDrawer({
  open,
  repositories,
  onClose,
  onSubmitScan,
}: NewScanDrawerProps): React.ReactElement | null {
  const defaultLocalRepo = repositories.find((r) => Boolean(r.localPath));
  const initialRepo = defaultLocalRepo?.name ?? repositories[0]?.name ?? 'northstar-docs';
  const initialLocalPath = defaultLocalRepo?.localPath ?? `/workspace/${initialRepo}`;

  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [repository, setRepository] = useState(initialRepo);
  const [localPath, setLocalPath] = useState(initialLocalPath);
  const [cloneUrl, setCloneUrl] = useState('');
  const [method, setMethod] = useState<NewScanRequest['method']>('repository_scan');
  const [scope, setScope] = useState<NewScanRequest['scope']>('full_repository');
  const [specificPath, setSpecificPath] = useState('src/');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function resolveFallbackLocalPath(repoName: string): string {
    const matched = repositories.find((r) => r.name === repoName);
    return matched?.localPath ?? defaultLocalRepo?.localPath ?? `/workspace/${repoName || 'northstar-docs'}`;
  }

  function handleSelectLocalMode(): void {
    setMode('local');
    if (!localPath.trim()) setLocalPath(resolveFallbackLocalPath(repository));
  }

  async function handleBrowseLocalDirectory(): Promise<void> {
    handleSelectLocalMode();
    const chosen = await platformBridge.pickLocalRepository();
    if (chosen) {
      setLocalPath(chosen);
      const basename = chosen.split('/').filter(Boolean).pop();
      if (basename) setRepository(basename);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DrawerContent floating className="w-[min(520px,calc(100vw-24px))]" aria-label="New scan">
        <div className="flex items-start justify-between gap-3 border-b border-hairline bg-canvas px-5 py-4">
          <div>
            <DialogTitle>New scan</DialogTitle>
            <DialogDescription className="mt-0.5">
              Share findings from a connected repository with your team.
            </DialogDescription>
          </div>
          <DialogClose id="btn-close-new-scan" aria-label="Close New scan drawer">
            <CloseIcon size={16} />
          </DialogClose>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-canvas px-5 py-4">
          <SegmentedControl
            value={mode}
            onChange={(next) => (next === 'local' ? handleSelectLocalMode() : setMode('cloud'))}
            options={[
              {
                id: 'btn-scan-mode-cloud',
                value: 'cloud',
                label: (
                  <span>
                    Cloud <span className="text-ink-muted">·</span>{' '}
                    <span className="font-medium text-accent-violet">Recommended</span>
                  </span>
                ),
              },
              { id: 'btn-scan-mode-local', value: 'local', label: 'Local' },
            ]}
          />

          <div className="space-y-2">
            <label htmlFor="select-scan-repo" className="block text-[13px] font-medium text-ink">
              {mode === 'cloud' ? 'Repository' : 'Local Workspace Directory'}
            </label>
            {mode === 'cloud' ? (
              <VStack gap={2}>
                <select
                  id="select-scan-repo"
                  value={repository}
                  onChange={(e) => {
                    const nextRepo = e.target.value;
                    setRepository(nextRepo);
                    setLocalPath(resolveFallbackLocalPath(nextRepo));
                  }}
                  className="h-9 w-full rounded-full border border-hairline-strong bg-canvas px-3.5 text-[13px] text-ink outline-none"
                >
                  {repositories.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.fullName}
                    </option>
                  ))}
                </select>
                <Input
                  id="input-scan-clone-url"
                  type="url"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="Optional Git clone URL (https://github.com/org/repo.git)"
                  className="border-hairline-strong bg-canvas"
                />
              </VStack>
            ) : (
              <HStack gap={2} align="center">
                <Input
                  id="input-local-repo-path"
                  value={localPath}
                  placeholder="/workspace/northstar-docs"
                  onChange={(e) => {
                    const nextPath = e.target.value;
                    setLocalPath(nextPath);
                    const basename = nextPath.split('/').filter(Boolean).pop();
                    if (basename) setRepository(basename);
                  }}
                  className="flex-1 border-hairline-strong bg-canvas font-mono text-xs"
                />
                <Button variant="outline" onClick={() => void handleBrowseLocalDirectory()}>
                  <FolderIcon size={14} />
                  <span>Browse</span>
                </Button>
              </HStack>
            )}
          </div>

          <div className="space-y-1">
            <div className="mb-1.5 text-[13px] font-semibold text-ink">Scan method</div>
            {SCAN_METHODS.map((opt) => (
              <ThickRingRadioRow
                key={opt.value}
                name="scan-method"
                checked={method === opt.value}
                title={opt.title}
                subtitle={opt.subtitle}
                onSelect={() => setMethod(opt.value)}
              />
            ))}
          </div>

          <div className="space-y-1">
            <div className="mb-1.5 text-[13px] font-semibold text-ink">Scope</div>
            <ThickRingRadioRow
              name="scan-scope"
              checked={scope === 'full_repository'}
              title="Full repository"
              onSelect={() => setScope('full_repository')}
            />
            <ThickRingRadioRow
              name="scan-scope"
              checked={scope === 'specific_paths'}
              title="Specific folder or files"
              onSelect={() => setScope('specific_paths')}
            />
            {scope === 'specific_paths' ? (
              <div className="pt-1 pl-7">
                <Input
                  id="input-scan-specific-paths"
                  type="text"
                  value={specificPath}
                  onChange={(e) => setSpecificPath(e.target.value)}
                  className="border-hairline-strong bg-canvas font-mono text-xs"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline bg-canvas px-5 py-3.5">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            id="btn-submit-start-scan"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                const effectiveLocalPath = localPath.trim() || resolveFallbackLocalPath(repository);
                await onSubmitScan({
                  mode,
                  repository,
                  ...(mode === 'local' ? { localPath: effectiveLocalPath } : {}),
                  ...(mode === 'cloud' && cloneUrl.trim() ? { cloneUrl: cloneUrl.trim() } : {}),
                  method,
                  scope,
                  ...(scope === 'specific_paths' ? { paths: [specificPath] } : {}),
                });
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Start scan
          </Button>
        </div>
      </DrawerContent>
    </DialogRoot>
  );
}

function ThickRingRadioRow({
  name,
  checked,
  title,
  subtitle,
  onSelect,
}: {
  name: string;
  checked: boolean;
  title: string;
  subtitle?: string;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-1.5 py-2 transition-colors hover:bg-sidebar">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 size-4 shrink-0 rounded-full bg-canvas transition-all ${
          checked ? 'border-[5px] border-ink' : 'border border-hairline-strong'
        }`}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block text-xs text-ink-secondary">{subtitle}</span>
        ) : null}
      </span>
    </label>
  );
}
