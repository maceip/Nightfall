export interface NightfallDesktopBridge {
  isElectron: boolean;
  getPlatformInfo: () => Promise<{ isElectron: boolean; platform: string; arch: string }>;
  pickLocalRepository: () => Promise<string | null>;
  sendNativeNotification: (title: string, body: string) => Promise<boolean>;
}

declare global {
  interface Window {
    nightfallDesktop?: NightfallDesktopBridge;
  }
}

export const platformBridge: NightfallDesktopBridge = {
  get isElectron(): boolean {
    return typeof window !== 'undefined' && Boolean(window.nightfallDesktop?.isElectron);
  },
  async getPlatformInfo() {
    if (typeof window !== 'undefined' && window.nightfallDesktop) {
      return window.nightfallDesktop.getPlatformInfo();
    }
    return { isElectron: false, platform: 'web', arch: 'browser' };
  },
  async pickLocalRepository() {
    if (typeof window !== 'undefined' && window.nightfallDesktop) {
      return window.nightfallDesktop.pickLocalRepository();
    }
    return '/workspace/northstar-docs';
  },
  async sendNativeNotification(title: string, body: string) {
    if (typeof window !== 'undefined' && window.nightfallDesktop) {
      return window.nightfallDesktop.sendNativeNotification(title, body);
    }
    return false;
  },
};
