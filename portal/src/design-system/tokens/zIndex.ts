export const zIndex = {
  base: 0,
  dropdown: 20,
  sticky: 25,
  composeDock: 30,
  sheet: 40,
  popover: 50,
  overlay: 60,
  modal: 70,
  confirm: 80,
  toast: 90,
} as const;

export type ZIndex = typeof zIndex;
