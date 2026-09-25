/**
 * After operation — getAppGroups
 *
 * For service principal (enterprise application) accounts, fetches the
 * Users and groups assignments via Graph `appRoleAssignedTo` and writes
 * the unique group object IDs to `spn_app_groups`. Individual users and
 * other principal types are ignored.
 *
 * Only runs when `attributes.spn_appId` is present (SPN accounts).
 */
import { readConfig } from '@sailpoint/connector-sdk'
import { EntraIdClient } from '../entraid-client'
import { AfterOperation, AccountAfterOperationInput } from '../model/operation'
import { Config } from '../model/config'
import { getLogger } from '../utils'

export const getAppGroups: AfterOperation<AccountAfterOperationInput> = async (context, output) => {
    const config: Config = await readConfig()
    const logger = getLogger(config.spConnDebugLoggingEnabled)

    const out: any = output

    // Only process service principal accounts (users lack spn_appId)
    if (out.attributes?.spn_appId == null) {
        logger.debug('getAppGroups: not a service principal account, skipping')
        return undefined
    }

    const nativeId =
        out.attributes?.objectId ??
        out.identity ??
        out.id ??
        out.uuid ??
        out.key?.simple?.id ??
        out.attributes?.id

    // SPN native ids are composite: `{servicePrincipalObjectId}:{applicationObjectId}`,
    // or `{servicePrincipalObjectId}:EXT` for apps owned by another tenant.
    const servicePrincipalId = typeof nativeId === 'string' ? nativeId.split(':')[0] : undefined

    if (!servicePrincipalId) {
        logger.debug('getAppGroups: no service principal identity found, returning undefined')
        return undefined
    }

    const client = new EntraIdClient(config.domainName, config.clientID, config.clientSecret)
    const assignments = await client.getAppRoleAssignedTo(servicePrincipalId)
    logger.debug(`getAppGroups: fetched ${assignments.length} assignment(s) for ${servicePrincipalId}`)

    const groupIds = [
        ...new Set(
            assignments
                .filter((a) => a.principalType === 'Group' && typeof a.principalId === 'string' && a.principalId.length > 0)
                .map((a) => a.principalId as string)
        ),
    ]

    logger.debug(`getAppGroups: found ${groupIds.length} unique group(s) for ${servicePrincipalId}`)

    return {
        attributes: {
            ...out.attributes,
            spn_app_groups: groupIds,
        },
    }
}
