import { cn } from "@/lib/utils";

const LEAVES: [number, number, number][] = [
  [128, 128, -40],
  [112, 100, 30],
  [100, 78, -35],
  [88, 58, 32],
  [78, 38, -28],
];

/** The drawn eucalyptus sprig that sits by the title (decorative). */
export function LeafSprig({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 170 170" aria-hidden="true" className={cn("text-leaf", className)}>
      <path d="M150 160 C120 120 100 80 70 20" stroke="var(--primary)" strokeOpacity="0.55" strokeWidth="2.5" fill="none" />
      {LEAVES.map(([x, y, r]) => (
        <g key={`${x}-${y}`} transform={`rotate(${r} ${x} ${y})`}>
          <path
            d={`M${x} ${y - 22} C${x + 11} ${y - 10} ${x + 11} ${y + 10} ${x} ${y + 22} C${x - 11} ${y + 10} ${x - 11} ${y - 10} ${x} ${y - 22}Z`}
            fill="currentColor"
          />
          <path d={`M${x} ${y - 18} V${y + 18}`} stroke="white" strokeOpacity="0.55" strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  );
}
