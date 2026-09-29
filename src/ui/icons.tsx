// Inkventure's own line icons (24×24, 2 px black strokes). Drawn for this project, not taken from any device UI.
import type { JSX } from 'preact';

type IconProps = { size?: number };

function Svg({ size = 28, children }: IconProps & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#000"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </Svg>
  );
}

export function IconLibrary(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4h4v16H4z" />
      <path d="M10 4h4v16h-4z" />
      <path d="m16 5 3.5-1 2.5 15.5-3.5 1z" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </Svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}
