/**
 * After operation — setGuestGalVisibility
 *
 * Enforces that B2B guest accounts are visible in the Exchange Global Address List.
 * Entra ID hides guests by default. This operation checks if the user being
 * processed is a guest (`userType` === 'Guest') and if so, sends a Graph PATCH
 * request setting `showInAddressList: true`.
 *
 * Runs conditionally when a user is created or updated. Does not modify the
 * Identity Security Cloud object.
 */
import { Context, readConfig } from '@sailpoint/connector-sdk'
import { EntraIdClient } from '../../entraid-client'
import { AfterOperation, AccountAfterOperationInput } from '../../model/operation'
import { Config } from '../../model/config'
import { getLogger } from '../../utils'
export const setGuestGalVisibility: AfterOperation<AccountAfterOperationInput> = async (context, output) => {
    const config: Config = await readConfig()
    const logger = getLogger(config.spConnDebugLoggingEnabled)

    const userId = (output as any).identity
    if (!userId) {
        logger.debug('setGuestGalVisibility: no userId found, returning')
        return undefined
    }

    const userType = (output as any)?.attributes?.userType
    if (userType !== 'Guest') {
        logger.debug(`setGuestGalVisibility: user ${userId} is not a Guest (userType=${userType}), skipping`)
        return undefined
    }

    try {
        const client = new EntraIdClient(config.domainName, config.clientID, config.clientSecret)
        logger.debug(`setGuestGalVisibility: setting showInAddressList for guest ${userId}`)
        await client.setShowInAddressList(userId, true)
    } catch (e: any) {
        logger.error(`setGuestGalVisibility: fail for guest ${userId}: ${e.message}`)
    }

    return undefined
}
