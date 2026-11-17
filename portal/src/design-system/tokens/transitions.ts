export const transitions = {
  fast: '120ms ease',
  normal: '200ms ease',
  slow: '300ms ease',
  spring: '220ms ease-in-out',
} as const;

export const duration = {
  fast: 120,
  normal: 200,
  slow: 300,
  spring: 220,
} as const;

export type Transitions = typeof transitions;
