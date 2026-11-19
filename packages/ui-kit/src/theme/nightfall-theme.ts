import { defineSyntaxTheme, defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

// Keep nightfallSyntax un-exported so `astryx theme build` compiles `nightfallTheme` as primary output.
const nightfallSyntax = defineSyntaxTheme({
  name: 'nightfall-syntax',
  tokens: {
    keyword: ['#9E2A2B', '#FCA5A5'],
    string: ['#116329', '#86EFAC'],
    comment: ['#7A7C78', '#9CA3AF'],
    number: ['#0550AE', '#93C5FD'],
    function: ['#1D4ED8', '#93C5FD'],
    type: ['#6E42C1', '#C4B5FD'],
    variable: ['#141514', '#F4F5F3'],
    operator: ['#5E605D', '#B8BAB6'],
    constant: ['#0550AE', '#93C5FD'],
    tag: ['#9E2A2B', '#FCA5A5'],
    attribute: ['#855A15', '#FDE047'],
    property: ['#9E2A2B', '#FCA5A5'],
    punctuation: ['#5E605D', '#9CA3AF'],
    background: ['#FFFFFF', '#111312'],
    added: ['#E6F6EC', '#14532D66'],
    removed: ['#FCEBEA', '#7F1D1D66'],
    'added-marker': ['#14532D', '#4ADE80'],
    'removed-marker': ['#8A1F24', '#FB7185'],
  },
});

export const nightfallTheme = defineTheme({
  name: 'nightfall',
  extends: neutralTheme,

  typography: {
    scale: { base: 13.5, ratio: 1.2 },
    body: {
      family: 'Inter',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Inter',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weight: 'semibold',
      weights: { 3: 'semibold', 4: 'semibold' },
    },
    code: {
      family: 'JetBrains Mono',
      fallbacks:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    },
  },

  motion: { fast: 120, medium: 220, slow: 480, ratio: 0.75 },
  syntax: nightfallSyntax,

  tokens: {
    // 3-tier stepped surface contrast:
    // Light: #F4F5F3 body -> #FAFBF9 muted/sidebar -> #FFFFFF surface/card
    // Dark:  #0B0C0B body -> #111312 surface -> #181B19 elevated card -> #1F2220 popover/muted
    '--color-background-body': ['#F4F5F3', '#0B0C0B'],
    '--color-background-surface': ['#FFFFFF', '#111312'],
    '--color-background-card': ['#FFFFFF', '#181B19'],
    '--color-background-popover': ['#FFFFFF', '#1F2220'],
    '--color-background-muted': ['#FAFBF9', '#1D201E'],

    // Charcoal-black primary pill authority (#141514) & subtle neutral hover/active fills
    '--color-accent': ['#141514', '#F4F5F3'],
    '--color-accent-muted': ['#EDEDEB', '#282A27'],
    '--color-on-accent': ['#FFFFFF', '#141514'],
    '--color-text-accent': ['#141514', '#F4F5F3'],
    '--color-icon-accent': ['#141514', '#F4F5F3'],

    // High-contrast ink & monochrome chrome icons (>= 4.5:1 WCAG AA)
    '--color-text-primary': ['#141514', '#F4F5F3'],
    '--color-text-secondary': ['#5E605D', '#A3A6A1'],
    '--color-text-disabled': ['#9A9C99', '#5A5D58'],
    '--color-icon-primary': ['#141514', '#F4F5F3'],
    '--color-icon-secondary': ['#6E706D', '#A3A6A1'],
    '--color-icon-disabled': ['#9A9C99', '#5A5D58'],

    // Crisp hairline borders & overlays with visible dark-mode separation
    '--color-neutral': ['#1415140D', '#F4F5F317'],
    '--color-border': ['#ECEEE9', '#FFFFFF1A'],
    '--color-border-emphasized': ['#E2E3E1', '#FFFFFF2B'],
    '--color-overlay-hover': ['#1415140A', '#F4F5F312'],
    '--color-overlay-pressed': ['#14151414', '#F4F5F31F'],

    // Reference-screenshot severity & semantic status colors
    '--color-error': ['#9E2A2B', '#FB7185'],
    '--color-error-muted': ['#FAE5E5', '#4C051966'],
    '--color-on-error': ['#FFFFFF', '#19040A'],
    '--color-on-error-muted': ['#9E2A2B', '#FDA4AF'],
    '--color-text-error': ['#9E2A2B', '#FDA4AF'],

    '--color-warning': ['#C25E1A', '#FBBF24'],
    '--color-warning-muted': ['#F8EFD4', '#451A0366'],
    '--color-on-warning': '#141514',
    '--color-on-warning-muted': ['#855A15', '#FDE68A'],
    '--color-text-warning': ['#855A15', '#FCD34D'],

    '--color-success': ['#15803D', '#4ADE80'],
    '--color-success-muted': ['#DCFCE7', '#052E1666'],
    '--color-on-success': ['#FFFFFF', '#052E16'],
    '--color-on-success-muted': ['#166534', '#86EFAC'],
    '--color-text-success': ['#15803D', '#86EFAC'],

    '--color-info': ['#1D74F5', '#60A5FA'],
    '--color-info-muted': ['#E1EFFE', '#17255466'],
    '--color-on-info': ['#FFFFFF', '#0B1736'],
    '--color-on-info-muted': ['#1E5AA8', '#93C5FD'],
    '--color-text-info': ['#1E5AA8', '#93C5FD'],

    // Radii matched to the 19 reference screenshots
    '--radius-none': '0px',
    '--radius-inner': '0.375rem',     // 6px  — borderless severity/status pills
    '--radius-element': '0.5rem',     // 8px  — nav rows, compact selects
    '--radius-container': '0.875rem', // 14px — KPI strips, proposed fix cards, floating drawers
    '--radius-page': '0.75rem',       // 12px — inset rounded workspace sheet
    '--radius-chat': '1.375rem',      // 22px — Red Team composer shell
    '--radius-full': '9999px',
  },

  components: {
    button: {
      'variant:primary': {
        borderRadius: 'var(--radius-full)',
      },
      'variant:secondary': {
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--color-background-card)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--color-border-emphasized)',
        ':hover': {
          backgroundColor: 'var(--color-background-muted)',
        },
      },
      'variant:ghost': {
        borderRadius: 'var(--radius-full)',
      },
      'variant:destructive': {
        borderRadius: 'var(--radius-full)',
      },
    },
  },
});
