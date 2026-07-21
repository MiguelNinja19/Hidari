import { useDiscoverController } from './DiscoverController'
import { DiscoverResultsSection } from './DiscoverResultsSection'
import { DiscoverToolbar } from './DiscoverToolbar'

export function DiscoverBrowsePage() {
  const controller = useDiscoverController()
  const resultCount = controller.displayCatalogSource.length

  return (
    <section
      className={`browse-page${
        controller.catalogLoading && resultCount > 0 ? ' browse-page--loading' : ''
      }`}
    >
      <DiscoverToolbar
        value={controller.discoverSearchDraft}
        hasActiveSources={controller.enabledSourcesCount > 0}
        loading={controller.catalogLoading}
        onChange={controller.setDiscoverSearchDraft}
        onSubmit={controller.submitDiscoverSearch}
      />
      <DiscoverResultsSection />
    </section>
  )
}
