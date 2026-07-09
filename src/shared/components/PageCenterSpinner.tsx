import { Spinner } from './Spinner'

type PageCenterSpinnerProps = {
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

export function PageCenterSpinner({
  label = 'A carregar…',
  size = 'lg',
}: PageCenterSpinnerProps) {
  return (
    <div className="page-center-spinner">
      <Spinner size={size} label={label} className="page-center-spinner__icon" />
    </div>
  )
}
