/**
 * Connector Customizer entry point
 *
 * This file wires the operation runners to every standard SDK command and
 * Web Services endpoint operation via `registerOperations`. If no operations
 * are registered in the source's `customOperations` config the handler is a
 * no-op (returns input/output unchanged).
 *
 * To support a new connector:
 *   - Register implementations in `customOperations.ts` (operationRegistry)
 *   - Wire hook patterns via the source's `customOperations` connector attribute
 *   - Swap the API client (EntraIdClient) for your target system
 *   - No changes needed in this file or in the framework utilities
 */
import { createConnectorCustomizer, logger } from '@sailpoint/connector-sdk'
import { registerOperations } from './operationRunner'

export const connectorCustomizer = async () => {
    logger.info('Initializing connector customizer')

    return registerOperations(createConnectorCustomizer())
}
