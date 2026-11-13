import React, { useState } from 'react';
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

const SCAN_METHODS: Array<{
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
];

export function NewScanDrawer({
  open,
  repositories,
  onClose,
  onSubmitScan,
}: NewScanDrawerProps): React.ReactElement | null {
  const defaultLocalRepo = repositories.find((r) => Boolean(r.localPath));
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [repository, setRepository] = useState(repositories[0]?.name ?? 'northstar-docs');
  const [localPath, setLocalPath] = useState(defaultLocalRepo?.localPath ?? '');
  const [method, setMethod] = useState<NewScanRequest['method']>('repository_scan');
  const [scope, setScope] = useState<NewScanRequest['scope']>('full_repository');
  const [specificPath, setSpecificPath] = useState('src/');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleChooseLocalDirectory(): Promise<void> {
    setMode('local');
    const chosen = await platformBridge.pickLocalRepository();
    if (chosen) {
      setLocalPath(chosen);
      const basename = chosen.split('/').filter(Boolean).pop();
      if (basename) setRepository(basename);
    } else if (!localPath && defaultLocalRepo?.localPath) {
      setLocalPath(defaultLocalRepo.localPath);
      setRepository(defaultLocalRepo.name);
    }
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DrawerContent aria-label="New scan">
        <div className="flex items-start justify-between gap-3 border-b border-primary-200 px-5 py-4">
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

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <SegmentedControl
            value={mode}
            onChange={(next) => {
              if (next === 'local') {
                void handleChooseLocalDirectory();
              } else {
                setMode('cloud');
              }
            }}
            options={[
              {
                id: 'btn-scan-mode-cloud',
                value: 'cloud',
                label: (
                  <span>
                    Cloud <span className="text-primary-500 font-normal">· Recommended</span>
                  </span>
                ),
              },
              {
                id: 'btn-scan-mode-local',
                value: 'local',
                label: 'Local',
              },
            ]}
          />

          <div className="space-y-1.5">
            <label htmlFor="select-scan-repo" className="block text-[13px] font-medium text-ink">
              {mode === 'cloud' ? 'Repository' : 'Local Workspace Directory'}
            </label>
            {mode === 'cloud' ? (
              <select
                id="select-scan-repo"
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-3 text-[13px] text-ink outline-none focus:border-primary-400"
              >
                {repositories.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  id="input-local-repo-path"
                  value={localPath}
                  placeholder="/path/to/local/repository"
                  onChange={(e) => {
                    const nextPath = e.target.value;
                    setLocalPath(nextPath);
                    const basename = nextPath.split('/').filter(Boolean).pop();
                    if (basename) setRepository(basename);
                  }}
                />
                <Button variant="outline" onClick={() => void handleChooseLocalDirectory()}>
                  <FolderIcon size={14} />
                  <span>Browse</span>
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[13px] font-medium text-ink">Scan method</div>
            {SCAN_METHODS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-primary-200 bg-surface p-3 transition-colors hover:bg-primary-50"
              >
                <input
                  type="radio"
                  name="scan-method"
                  checked={method === opt.value}
                  onChange={() => setMethod(opt.value)}
                  className="mt-0.5 accent-primary-900"
                />
                <div>
                  <div className="text-[13px] font-medium text-ink">{opt.title}</div>
                  <div className="mt-0.5 text-xs text-primary-600">{opt.subtitle}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-[13px] font-medium text-ink">Scope</div>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-primary-200 bg-surface p-3 transition-colors hover:bg-primary-50">
              <input
                type="radio"
                name="scan-scope"
                checked={scope === 'full_repository'}
                onChange={() => setScope('full_repository')}
                className="accent-primary-900"
              />
              <span className="text-[13px] font-medium text-ink">Full repository</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-primary-200 bg-surface p-3 transition-colors hover:bg-primary-50">
              <input
                type="radio"
                name="scan-scope"
                checked={scope === 'specific_paths'}
                onChange={() => setScope('specific_paths')}
                className="accent-primary-900"
              />
              <span className="text-[13px] font-medium text-ink">Specific folder or files</span>
            </label>
            {scope === 'specific_paths' ? (
              <Input
                id="input-scan-specific-paths"
                type="text"
                value={specificPath}
                onChange={(e) => setSpecificPath(e.target.value)}
              />
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-primary-200 bg-primary-50/60 px-5 py-3.5">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            id="btn-submit-start-scan"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmitScan({
                  mode,
                  repository,
                  ...(mode === 'local' && localPath.trim() ? { localPath: localPath.trim() } : {}),
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
            Start Scan
          </Button>
        </div>
      </DrawerContent>
    </DialogRoot>
  );
}
