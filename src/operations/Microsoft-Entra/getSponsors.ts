import { readConfig } from '@sailpoint/connector-sdk'
import { EntraIdClient } from '../../entraid-client'
import { AfterOperation, AccountAfterOperationInput } from '../../model/operation'
import { Config } from '../../model/config'
import { getLogger } from '../../utils'

export const getSponsors: AfterOperation<AccountAfterOperationInput> = async (context, output) => {
    const config: Config = await readConfig()
    const logger = getLogger(config.spConnDebugLoggingEnabled)

    const out: any = output
    const userId =
        out.identity ??
        out.id ??
        out.uuid ??
        out.key?.simple?.id ??
        out.attributes?.objectId ??
        out.attributes?.id ??
        out.attributes?.userPrincipalName

    if (!userId) {
        logger.debug('getSponsors: no identity found, returning undefined')
        return undefined
    }

    const client = new EntraIdClient(config.domainName, config.clientID, config.clientSecret)

    // Read current sponsors from Graph
    const sponsors = await client.getSponsorsForGuest(userId)
    logger.debug(`getSponsors: fetched ${sponsors.length} sponsor(s) for ${userId}`)

    if (sponsors.length === 0) return undefined

    const sponsorValues = sponsors
        .map((s) => s.userPrincipalName ?? s.mail ?? s.id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)

    if (sponsorValues.length === 0) return undefined

    return {
        attributes: {
            ...out.attributes,
            sponsors: sponsorValues.length === 1 ? sponsorValues[0] : sponsorValues,
        }
    }
}
