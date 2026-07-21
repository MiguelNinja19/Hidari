import { useTranslation } from 'react-i18next'
import { PageCenterSpinner } from '../shared/components/PageCenterSpinner'

export function AppTabFallback() {
  const { t } = useTranslation()
  return <PageCenterSpinner label={t('common.loadingTab')} />
}
