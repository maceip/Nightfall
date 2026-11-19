import React, { useCallback, useEffect, useState } from 'react';
import { App } from './App.js';
import { platformBridge } from './bridge/platform-bridge.js';
import {
  type LandingLaunchTarget,
  NightfallLandingPage,
} from './screens/landing/nightfall-landing-page.js';

const THEME_STORAGE_KEY = 'nightfall.themeMode';

function readInitialColorMode(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage access restrictions
  }
  return 'light';
}

export function readShowcaseViewFromLocation(loc?: Pick<Location, 'search' | 'hash'>): 'landing' | 'console' {
  const target = loc ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!target) return 'landing';
  const params = new URLSearchParams(target.search);
  const hash = target.hash.trim();
  if (params.get('view') === 'console' || hash === '#console' || hash.startsWith('#/')) {
    return 'console';
  }
  return 'landing';
}

export function NightfallShowcaseRoot(): React.ReactElement {
  const isElectronDesktop = platformBridge.isElectron;

  const [route, setRoute] = useState<{ view: 'landing' | 'console'; launchKey: number }>(() => ({
    view: isElectronDesktop ? 'console' : readShowcaseViewFromLocation(),
    launchKey: 0,
  }));
  const [colorMode, setColorMode] = useState<'dark' | 'light'>(readInitialColorMode);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = colorMode;
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, colorMode);
    } catch {
      // ignore storage write restrictions
    }
  }, [colorMode]);

  useEffect(() => {
    if (isElectronDesktop || typeof window === 'undefined') return undefined;
    const onPopState = () => {
      setRoute((prev) => ({
        view: readShowcaseViewFromLocation(),
        launchKey: prev.launchKey + 1,
      }));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isElectronDesktop]);

  const handleLaunchConsole = useCallback((target: LandingLaunchTarget = 'findings') => {
    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('view', 'console');
      nextUrl.hash = target === 'red-team' ? '#/red-team/live-campaign' : `#/${target}`;
      window.history.pushState({}, '', nextUrl.toString());
      if (!/jsdom/i.test(window.navigator.userAgent)) window.scrollTo(0, 0);
    }
    setRoute((prev) => ({
      view: 'console',
      launchKey: prev.launchKey + 1,
    }));
  }, []);

  const handleBackToLanding = useCallback(() => {
    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('view');
      nextUrl.hash = '';
      window.history.pushState({}, '', nextUrl.toString());
      if (!/jsdom/i.test(window.navigator.userAgent)) window.scrollTo(0, 0);
    }
    setRoute((prev) => ({
      view: 'landing',
      launchKey: prev.launchKey + 1,
    }));
  }, []);

  if (isElectronDesktop) {
    return <App />;
  }

  if (route.view === 'console') {
    return (
      <App
        themeModeOverride={colorMode}
        onThemeModeChange={setColorMode}
        onBackToLanding={handleBackToLanding}
      />
    );
  }

  return (
    <NightfallLandingPage
      colorMode={colorMode}
      onColorModeChange={setColorMode}
      onLaunchConsole={handleLaunchConsole}
    />
  );
}
