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
          <linearGradient id="airs-brand-gradient" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f2c38b" />
            <stop offset="0.5" stopColor="#c9784b" />
            <stop offset="1" stopColor="#7d4e35" />
          </linearGradient>
        </defs>

        <path
          d="M23 10h18l11 11v22L41 54H23L12 43V21z"
          fill="none"
          stroke="url(#airs-brand-gradient)"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M24 22h16v18H24z"
          fill="rgba(255,255,255,0.04)"
          stroke="url(#airs-brand-gradient)"
          strokeWidth="2.5"
          rx="4"
        />
        <path
          d="M28 22v-3.5c0-2.7 1.8-4.5 4-4.5s4 1.8 4 4.5V22"
          fill="none"
          stroke="url(#airs-brand-gradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M21 35c4.5-5.7 8.5-8.5 12-8.5s7.5 2.8 12 8.5"
          fill="none"
          stroke="#f6e7d1"
          strokeOpacity="0.9"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="32" cy="33" r="2.3" fill="#f6e7d1" />
      </svg>

      {withWordmark && (
        <div className={cn('leading-none', wordmarkClassName)}>
          <p className="font-serif text-xl font-semibold tracking-tight text-primary">AIRS</p>
          <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Hiring Intelligence</p>
        </div>
      )}
    </div>
  )
}
