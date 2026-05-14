import BrandSpinner from '../brand/BrandSpinner'

export default function LoadingSpinner({ className }: { className?: string }) {
  return <BrandSpinner className={className} label="Loading workspace" />
}
