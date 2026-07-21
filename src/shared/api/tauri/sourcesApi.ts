import { catalogApi } from './catalogApi'
import { launcherSettingsApi } from './launcherSettingsApi'
import { libraryApi } from './libraryApi'

export const sourcesApi = {
  ...catalogApi,
  ...launcherSettingsApi,
  ...libraryApi,
}
