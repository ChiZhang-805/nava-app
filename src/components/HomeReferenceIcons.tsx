import type { SVGProps } from "react";

export type HomeReferenceIconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function iconProps({ size = 32, ...props }: HomeReferenceIconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    ...props,
  };
}

export function HeartMetricIcon(props: HomeReferenceIconProps) {
  return <svg {...iconProps(props)}>
    <path d="M16 28.1C13.7 25.9 5 20.3 3.7 13.4C2.6 7.8 5.8 4.1 10.2 4.1C13 4.1 14.8 5.7 16 7.7C17.2 5.7 19 4.1 21.8 4.1C26.2 4.1 29.4 7.8 28.3 13.4C27 20.3 18.3 25.9 16 28.1Z" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.8 15.7H11L13.2 11.1L16.4 20.1L19.2 14.5H25.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function SleepMetricIcon(props: HomeReferenceIconProps) {
  return <svg {...iconProps(props)}>
    <g transform="translate(-6.5 -2.8) scale(1.3)">
      <path d="M22.8 22.8C16.4 25.4 9.1 22.3 7 15.8C5.1 9.8 8.2 4.3 13.6 2.6C11.4 8.5 14.2 15.4 20.2 17.7C23 18.8 25.6 18.5 28 17.5C27.1 19.8 25.4 21.7 22.8 22.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.2 5.1H28L23.8 10.1H29" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.3 2.2V6.2M16.3 4.2H20.3" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </g>
  </svg>;
}

export function RunMetricIcon(props: HomeReferenceIconProps) {
  return <svg {...iconProps(props)}>
    <circle cx="21.9" cy="5.1" r="2.5" stroke="currentColor" strokeWidth="2.2" />
    <path d="M17.5 10.2L12.2 14.1L4.2 15.8M17.5 10.2L21 13.2L27.2 13.9M17.5 10.2L15.5 18.1L9.5 23.2L1.2 25.4M15.5 18.1L20.6 20.5L24.5 28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function StepsMetricIcon(props: HomeReferenceIconProps) {
  return <svg {...iconProps(props)}>
    <path d="M9.8 15.9C6.8 15.9 5.5 13.2 6.2 9.3C6.8 5.8 8.2 3.8 10.2 3.9C12.5 4 13.4 6.8 13.1 10.1C12.8 13.6 12 15.9 9.8 15.9Z" stroke="currentColor" strokeWidth="2.3" />
    <path d="M8.8 18.4C11.3 17.8 13.9 19.8 14.2 22.9C14.5 26 13 28.2 10.7 28.4C8.2 28.7 6.2 26.5 6.2 23.3C6.2 20.8 7.1 18.8 8.8 18.4Z" stroke="currentColor" strokeWidth="2.3" />
    <path d="M22.3 14.1C19.3 14.1 18.1 11.3 18.8 7.4C19.4 4 20.8 2 22.8 2.1C25.1 2.2 26 5 25.7 8.3C25.4 11.8 24.5 14.1 22.3 14.1Z" stroke="currentColor" strokeWidth="2.3" />
    <path d="M21.4 16.7C23.9 16 26.5 18 26.8 21.1C27.1 24.2 25.6 26.4 23.3 26.6C20.8 26.9 18.8 24.7 18.8 21.5C18.8 19 19.7 17.1 21.4 16.7Z" stroke="currentColor" strokeWidth="2.3" />
  </svg>;
}

export function EnergyStatusIcon(props: HomeReferenceIconProps) {
  return <svg {...iconProps(props)} viewBox="0 0 24 24">
    <path d="M13.4 1.8L5.6 13H11L9.8 22.2L18.7 9.7H13.1L13.4 1.8Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>;
}

export function PointsStatusIcon(props: HomeReferenceIconProps) {
  return <svg {...iconProps(props)} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.2" />
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
  </svg>;
}

export function MenuReferenceIcon(props: HomeReferenceIconProps) {
  return <svg {...iconProps(props)} viewBox="0 0 24 24">
    <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </svg>;
}
