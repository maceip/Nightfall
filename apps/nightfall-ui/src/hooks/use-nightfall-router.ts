import { useCallback, useEffect, useRef, useState } from 'react';
import { platformBridge } from '../bridge/platform-bridge.js';

export type PrimarySection =
  | 'overview'
  | 'fixes'
  | 'findings'
  | 'finding-detail'
  | 'repositories'
  | 'scorecard'
  | 'scans'
  | 'red-team'
  | 'settings';

export type RedTeamStage = 'composer' | 'yaml-builder' | 'live-campaign' | 'finding-report';

export type RouteEntry = {
  section: PrimarySection;
  rtStage: RedTeamStage;
  findingId?: string;
  rtReportFindingId?: string;
};

export type NavigateOptions = {
  rtStage?: RedTeamStage;
  findingId?: string;
  rtReportFindingId?: string;
};

type HistoryStack = {
  entries: RouteEntry[];
  index: number;
};

const MAX_HISTORY_ENTRIES = 48;

const DEFENSE_SECTIONS = new Set<PrimarySection>([
  'overview',
  'fixes',
  'findings',
  'repositories',
  'scorecard',
  'scans',
  'settings',
]);

const RED_TEAM_STAGES = new Set<RedTeamStage>([
  'composer',
  'yaml-builder',
  'live-campaign',
  'finding-report',
]);

function safeDecodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function parseRouteHash(rawHash: string): RouteEntry {
  const trimmed = rawHash.trim().replace(/^#\/?/, '').replace(/\/+$/, '');
  if (!trimmed) {
    return { section: 'findings', rtStage: 'live-campaign' };
  }

  const parts = trimmed.split('/').filter(Boolean);
  const head = parts[0];

  if (head === 'findings') {
    const id = parts[1] ? safeDecodeSegment(parts[1]) : undefined;
    if (id) {
      return { section: 'finding-detail', rtStage: 'live-campaign', findingId: id };
    }
    return { section: 'findings', rtStage: 'live-campaign' };
  }

  if (head === 'red-team') {
    const stageCandidate = parts[1] as RedTeamStage | undefined;
    const rtStage: RedTeamStage =
      stageCandidate && RED_TEAM_STAGES.has(stageCandidate) ? stageCandidate : 'live-campaign';
    if (rtStage === 'finding-report' && parts[2]) {
      return {
        section: 'red-team',
        rtStage,
        rtReportFindingId: safeDecodeSegment(parts[2]),
      };
    }
    return { section: 'red-team', rtStage };
  }

  if (head && DEFENSE_SECTIONS.has(head as PrimarySection)) {
    return { section: head as PrimarySection, rtStage: 'live-campaign' };
  }

  return { section: 'findings', rtStage: 'live-campaign' };
}

export function formatRouteHash(entry: RouteEntry): string {
  if (entry.section === 'finding-detail') {
    return entry.findingId ? `#/findings/${encodeURIComponent(entry.findingId)}` : '#/findings';
  }
  if (entry.section === 'red-team') {
    if (entry.rtStage === 'finding-report' && entry.rtReportFindingId) {
      return `#/red-team/finding-report/${encodeURIComponent(entry.rtReportFindingId)}`;
    }
    return `#/red-team/${entry.rtStage}`;
  }
  return `#/${entry.section}`;
}

function writeWindowHash(nextHash: string, syncedRef: { current: string }): void {
  syncedRef.current = nextHash;
  if (typeof window === 'undefined') return;
  if (window.location.hash === nextHash) return;
  try {
    window.history.replaceState(null, '', nextHash);
  } catch {
    window.location.hash = nextHash;
  }
}

export function useNightfallRouter() {
  const initialEntry = parseRouteHash(typeof window !== 'undefined' ? window.location.hash : '');
  const [stack, setStack] = useState<HistoryStack>(() => ({
    entries: [initialEntry],
    index: 0,
  }));
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(initialEntry.section !== 'red-team');
  const lastSyncedHashRef = useRef<string>(formatRouteHash(initialEntry));

  const current = stack.entries[stack.index] ?? initialEntry;

  const syncSidebarForTransition = useCallback(
    (prevSection: PrimarySection, nextSection: PrimarySection) => {
      if (nextSection === 'red-team' && prevSection !== 'red-team') {
        setSidebarOpen(false);
      } else if (nextSection !== 'red-team' && prevSection === 'red-team') {
        setSidebarOpen(true);
      }
    },
    [],
  );

  const navigateTo = useCallback(
    (nextSection: PrimarySection, stageOrOptions?: RedTeamStage | NavigateOptions) => {
      const opts: NavigateOptions =
        typeof stageOrOptions === 'string'
          ? { rtStage: stageOrOptions }
          : (stageOrOptions ?? {});

      setStack((prev) => {
        const cur = prev.entries[prev.index] ?? { section: 'findings', rtStage: 'live-campaign' };
        const nextEntry: RouteEntry = {
          section: nextSection,
          rtStage: opts.rtStage ?? cur.rtStage,
          findingId: opts.findingId ?? cur.findingId,
          rtReportFindingId: opts.rtReportFindingId ?? cur.rtReportFindingId,
        };

        syncSidebarForTransition(cur.section, nextEntry.section);

        const nextHash = formatRouteHash(nextEntry);
        writeWindowHash(nextHash, lastSyncedHashRef);

        if (formatRouteHash(cur) === nextHash) {
          return prev;
        }

        const headEntries = prev.entries.slice(0, prev.index + 1);
        const appended = [...headEntries, nextEntry].slice(-MAX_HISTORY_ENTRIES);
        return {
          entries: appended,
          index: appended.length - 1,
        };
      });
    },
    [syncSidebarForTransition],
  );

  const goBack = useCallback(() => {
    setStack((prev) => {
      if (prev.index <= 0) return prev;
      const cur = prev.entries[prev.index]!;
      const nextIndex = prev.index - 1;
      const target = prev.entries[nextIndex]!;
      syncSidebarForTransition(cur.section, target.section);
      writeWindowHash(formatRouteHash(target), lastSyncedHashRef);
      return { ...prev, index: nextIndex };
    });
  }, [syncSidebarForTransition]);

  const goForward = useCallback(() => {
    setStack((prev) => {
      if (prev.index >= prev.entries.length - 1) return prev;
      const cur = prev.entries[prev.index]!;
      const nextIndex = prev.index + 1;
      const target = prev.entries[nextIndex]!;
      syncSidebarForTransition(cur.section, target.section);
      writeWindowHash(formatRouteHash(target), lastSyncedHashRef);
      return { ...prev, index: nextIndex };
    });
  }, [syncSidebarForTransition]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function handleExternalHash(rawHash: string): void {
      const parsed = parseRouteHash(rawHash);
      const canonical = formatRouteHash(parsed);
      if (canonical === lastSyncedHashRef.current) return;
      lastSyncedHashRef.current = canonical;

      setStack((prev) => {
        const cur = prev.entries[prev.index] ?? { section: 'findings', rtStage: 'live-campaign' };
        syncSidebarForTransition(cur.section, parsed.section);
        const headEntries = prev.entries.slice(0, prev.index + 1);
        const appended = [...headEntries, parsed].slice(-MAX_HISTORY_ENTRIES);
        return { entries: appended, index: appended.length - 1 };
      });
    }

    const onHashChange = () => handleExternalHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);

    const unsubDeepLink = platformBridge.onDeepLink?.((deepUrl) => {
      const hashIdx = deepUrl.indexOf('#');
      if (hashIdx >= 0) {
        handleExternalHash(deepUrl.slice(hashIdx));
      } else {
        const cleaned = deepUrl.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
        handleExternalHash(`#/${cleaned}`);
      }
    });

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      unsubDeepLink?.();
    };
  }, [syncSidebarForTransition]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((v) => !v);
  }, []);

  return {
    section: current.section,
    rtStage: current.rtStage,
    findingId: current.findingId,
    rtReportFindingId: current.rtReportFindingId,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    canGoBack: stack.index > 0,
    canGoForward: stack.index < stack.entries.length - 1,
    navigateTo,
    goBack,
    goForward,
  };
}
