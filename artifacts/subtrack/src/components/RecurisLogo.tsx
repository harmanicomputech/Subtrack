import { cn } from "@/lib/utils";

interface RecurisLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClass?: string;
}

export function RecurisLogo({
  size = 32,
  showWordmark = false,
  className,
  wordmarkClass,
}: RecurisLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Recuris"
        style={{ flexShrink: 0 }}
      >
        <style>{`
          @keyframes recuris-arc-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes recuris-ring-pulse {
            0%, 100% { opacity: 0.15; }
            50%       { opacity: 0.45; }
          }
          .recuris-logo-arc {
            transform-origin: 16px 16px;
            animation: recuris-arc-spin 3s linear infinite;
          }
          .recuris-logo-ring {
            animation: recuris-ring-pulse 3s ease-in-out infinite;
          }
        `}</style>

        {/* Background */}
        <rect width="32" height="32" rx="7.5" fill="#0f172a"/>

        {/* Pulsing static ring */}
        <circle
          cx="16" cy="16" r="13.5"
          fill="none" stroke="#818cf8" strokeWidth="1"
          className="recuris-logo-ring"
        />

        {/* Rotating arc */}
        <g className="recuris-logo-arc">
          <circle
            cx="16" cy="16" r="13.5"
            fill="none" stroke="#818cf8" strokeWidth="1.5"
            strokeDasharray="14 71" strokeLinecap="round"
          />
        </g>

        {/* R letterform — stem */}
        <rect x="9.5" y="8" width="3" height="16" rx="1.5" fill="white"/>

        {/* R letterform — bowl */}
        <path
          d="M 12.5 8.5 L 18 8.5 Q 22 8.5 22 12 Q 22 15.5 18 15.5 L 12.5 15.5"
          fill="none" stroke="white" strokeWidth="3"
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* R letterform — leg */}
        <line
          x1="14.5" y1="15.5" x2="21" y2="23.5"
          stroke="white" strokeWidth="3" strokeLinecap="round"
        />
      </svg>

      {showWordmark && (
        <span className={cn("font-bold tracking-tight text-primary", wordmarkClass)}>
          Recuris
        </span>
      )}
    </div>
  );
}
