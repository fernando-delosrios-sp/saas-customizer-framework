/**
 * After operation — getApplication
 *
 * Extracts the application name from an entitlement's displayName.
 *
 * Entra ID applicationRole entitlements encode the role and application in
 * the format:  "RoleName [on] ApplicationName"
 *
 * This operation parses out the application portion and writes it to
 * `attributes.application` so ISC can use it for grouping or filtering.
 *
 * Only runs for entitlement types listed in APPLICATION_ENTITLEMENT_TYPES.
 */
import { Context, readConfig } from '@sailpoint/connector-sdk'
import { AfterOperation, EntitlementAfterOperationInput } from '../../model/operation'
import { Config } from '../../model/config'
import { getLogger } from '../../utils'

/** Entitlement types whose displayName contains the "[on] Application" pattern. */
const APPLICATION_ENTITLEMENT_TYPES = ['applicationRole']

export const getApplication: AfterOperation<EntitlementAfterOperationInput> = async (context, entitlement) => {
    const config: Config = await readConfig()
    const logger = getLogger(config.spConnDebugLoggingEnabled)

    const entitlementAny = entitlement as any
    if (entitlementAny.type && APPLICATION_ENTITLEMENT_TYPES.includes(entitlementAny.type) && entitlementAny.attributes?.displayName) {
        logger.debug(`Processing application entitlement type: ${entitlementAny.type}`)
        const [_name, application] = entitlementAny.attributes.displayName.toString().split(' [on] ')
        logger.debug(
            `Parsed displayName: "${entitlementAny.attributes.displayName}". Extracted application: "${application}"`
        )
        return {
            attributes: {
                ...entitlementAny.attributes,
                application
            }
        }
    }
}
