import { setSponsors, preSetSponsors } from './operations/Microsoft-Entra/setSponsors'
import { getSponsors } from './operations/Microsoft-Entra/getSponsors'
import { getAppGroups } from './operations/Microsoft-Entra/getAppGroups'
import { getApplication } from './operations/Microsoft-Entra/getApplication'
import { setGuestGalVisibility } from './operations/Microsoft-Entra/setGuestGalVisibility'
import { peek } from './operations/peek'
import { BeforeOperation, AfterOperation } from './model/operation'

/**
 * Operation Registry
 *
 * Named catalog of available operation implementations. Source configuration
 * references these by name (e.g. `"preSetSponsors"`) in the `customOperations`
 * connector attribute — the runner resolves names to functions at runtime.
 *
 * To add a new operation:
 *   1. Implement it under `src/operations/<connectorType>/` (e.g. `src/operations/Microsoft-Entra/`)
 *   2. Register it here under a stable string key
 *   3. Wire the key into the source's `customOperations` config map
 */
export const operationRegistry: Record<string, BeforeOperation<any> | AfterOperation<any>> = {
    peek,
    preSetSponsors,
    setSponsors,
    getSponsors,
    getAppGroups,
    getApplication,
    setGuestGalVisibility,
}
