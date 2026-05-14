import { cn } from '../../lib/utils'

interface BrandMarkProps {
  className?: string
  withWordmark?: boolean
  wordmarkClassName?: string
}

export default function BrandMark({ className, withWordmark = false, wordmarkClassName }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="h-10 w-10 shrink-0"
      >
        <defs>
          <linearGradient id="rekroot-brand-gradient" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f2c38b" />
            <stop offset="0.5" stopColor="#c9784b" />
            <stop offset="1" stopColor="#7d4e35" />
          </linearGradient>
        </defs>

        <circle cx="32" cy="32" r="25" fill="rgba(201,120,75,0.08)" />
        <path
          d="M20 26h24c3.3 0 6 2.7 6 6v12c0 3.3-2.7 6-6 6H20c-3.3 0-6-2.7-6-6V32c0-3.3 2.7-6 6-6z"
          fill="none"
          stroke="url(#rekroot-brand-gradient)"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M26 20h12c2.2 0 4 1.8 4 4v2H22v-2c0-2.2 1.8-4 4-4z"
          fill="none"
          stroke="url(#rekroot-brand-gradient)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M14 36h36"
          fill="none"
          stroke="url(#rekroot-brand-gradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="32" cy="18" r="5.5" fill="none" stroke="#f6e7d1" strokeWidth="2.5" />
        <path
          d="M24 30c1.7-4.4 4.5-7 8-7s6.3 2.6 8 7"
          fill="none"
          stroke="#f6e7d1"
          strokeOpacity="0.9"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M28 36h8v6h-8z"
          fill="none"
          stroke="#f6e7d1"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </svg>

      {withWordmark && (
        <div className={cn('leading-none', wordmarkClassName)}>
          <p className="font-serif text-xl font-semibold tracking-tight text-primary">RekrootAI</p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Recruit. Match. Hire.</p>
        </div>
      )}
    </div>
  )
}
