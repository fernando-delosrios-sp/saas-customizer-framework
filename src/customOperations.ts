import { setSponsors, preSetSponsors } from './operations/setSponsors'
import { getSponsors } from './operations/getSponsors'
import { getAppGroups } from './operations/getAppGroups'
import { getApplication } from './operations/getApplication'
import { setGuestGalVisibility } from './operations/setGuestGalVisibility'
import { BeforeOperation, AfterOperation } from './model/operation'

/**
 * Operation Registry
 *
 * Named catalog of available operation implementations. Source configuration
 * references these by name (e.g. `"preSetSponsors"`) in the `customOperations`
 * connector attribute — the runner resolves names to functions at runtime.
 *
 * To add a new operation:
 *   1. Implement it under `src/operations/`
 *   2. Register it here under a stable string key
 *   3. Wire the key into the source's `customOperations` config map
 */
export const operationRegistry: Record<string, BeforeOperation<any> | AfterOperation<any>> = {
    preSetSponsors,
    setSponsors,
    getSponsors,
    getAppGroups,
    getApplication,
    setGuestGalVisibility,
}
