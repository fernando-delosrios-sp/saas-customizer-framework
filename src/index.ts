/**
 * Connector Customizer entry point
 *
 * This file wires the operation runners to every standard SDK command.
 * The pattern is intentionally exhaustive: every account and entitlement
 * command gets both a before and after handler. If no operations are
 * registered in the source's `customOperations` config the handler is a
 * no-op (returns input/output unchanged).
 *
 * To support a new connector:
 *   - Register implementations in `customOperations.ts` (operationRegistry)
 *   - Wire hook patterns via the source's `customOperations` connector attribute
 *   - Swap the API client (EntraIdClient) for your target system
 *   - No changes needed in this file or in the framework utilities
 */
import { createConnectorCustomizer, logger } from '@sailpoint/connector-sdk'
import { runBeforeOperations, runAfterOperations } from './operationRunner'

export const connectorCustomizer = async () => {
    logger.info('Initializing connector customizer')

    return createConnectorCustomizer()
        // Test Connection
        .beforeStdTestConnection(runBeforeOperations('beforeStdTestConnection'))
        .afterStdTestConnection(runAfterOperations('afterStdTestConnection'))
        // Account
        .beforeStdAccountCreate(runBeforeOperations('beforeStdAccountCreate'))
        .afterStdAccountCreate(runAfterOperations('afterStdAccountCreate'))
        .beforeStdAccountRead(runBeforeOperations('beforeStdAccountRead'))
        .afterStdAccountRead(runAfterOperations('afterStdAccountRead'))
        .beforeStdAccountUpdate(runBeforeOperations('beforeStdAccountUpdate'))
        .afterStdAccountUpdate(runAfterOperations('afterStdAccountUpdate'))
        .beforeStdAccountDelete(runBeforeOperations('beforeStdAccountDelete'))
        .afterStdAccountDelete(runAfterOperations('afterStdAccountDelete'))
        .beforeStdAccountEnable(runBeforeOperations('beforeStdAccountEnable'))
        .afterStdAccountEnable(runAfterOperations('afterStdAccountEnable'))
        .beforeStdAccountDisable(runBeforeOperations('beforeStdAccountDisable'))
        .afterStdAccountDisable(runAfterOperations('afterStdAccountDisable'))
        .beforeStdAccountUnlock(runBeforeOperations('beforeStdAccountUnlock'))
        .afterStdAccountUnlock(runAfterOperations('afterStdAccountUnlock'))
        .beforeStdAccountList(runBeforeOperations('beforeStdAccountList'))
        .afterStdAccountList(runAfterOperations('afterStdAccountList'))
        // Authenticate
        .beforeStdAuthenticate(runBeforeOperations('beforeStdAuthenticate'))
        .afterStdAuthenticate(runAfterOperations('afterStdAuthenticate'))
        // Config Options
        .beforeStdConfigOptions(runBeforeOperations('beforeStdConfigOptions'))
        .afterStdConfigOptions(runAfterOperations('afterStdConfigOptions'))
        // Application Discovery List
        .beforeStdApplicationDiscoveryList(runBeforeOperations('beforeStdApplicationDiscoveryList'))
        .afterStdApplicationDiscoveryList(runAfterOperations('afterStdApplicationDiscoveryList'))
        // Entitlement
        .beforeStdEntitlementRead(runBeforeOperations('beforeStdEntitlementRead'))
        .afterStdEntitlementRead(runAfterOperations('afterStdEntitlementRead'))
        .beforeStdEntitlementList(runBeforeOperations('beforeStdEntitlementList'))
        .afterStdEntitlementList(runAfterOperations('afterStdEntitlementList'))
        // Change Password
        .beforeStdChangePassword(runBeforeOperations('beforeStdChangePassword'))
        .afterStdChangePassword(runAfterOperations('afterStdChangePassword'))
        // Source Data
        .beforeStdSourceDataDiscover(runBeforeOperations('beforeStdSourceDataDiscover'))
        .afterStdSourceDataDiscover(runAfterOperations('afterStdSourceDataDiscover'))
        .beforeStdSourceDataRead(runBeforeOperations('beforeStdSourceDataRead'))
        .afterStdSourceDataRead(runAfterOperations('afterStdSourceDataRead'))
}
