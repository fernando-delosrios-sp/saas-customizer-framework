import { AttributeChangeOp, Context, readConfig } from '@sailpoint/connector-sdk'
import { EntraIdClient } from '../../entraid-client'
import { BeforeOperation, AccountBeforeOperationInput, AfterOperation, AccountAfterOperationInput } from '../../model/operation'
import { Config } from '../../model/config'
import { getLogger } from '../../utils'

// ---------------------------------------------------------------------------
// Per-invocation cache (before → after data passing)
// ---------------------------------------------------------------------------

/** Data cached by the before operation for consumption by the after operation. */
export type CachedInput = {
    userId?: string
    identity?: string
    key?: any
    /** Present only when the before operation could not apply the sponsor change (e.g. create). */
    pendingSponsor?: { op: AttributeChangeOp; upn?: string }
    /** The sponsor UPN that was set in this invocation (so the after op can enforce single-sponsor). */
    setUpn?: string
}

const inputCache = new Map<string, CachedInput>()

/** Derives a cache key from the invocation context (invocationId > requestId > id). */
function cacheKey(context: Context): string | undefined {
    return (context as any).invocationId ?? (context as any).requestId ?? (context as any).id
}

/** Retrieves and consumes the cached input for this invocation (one-time read). */
export function getCachedInput(context: Context): CachedInput | undefined {
    const key = cacheKey(context)
    if (!key) return undefined
    const val = inputCache.get(key)
    inputCache.delete(key) // consume: each entry is read exactly once
    return val
}

// ---------------------------------------------------------------------------
// Before operation implementation
// ---------------------------------------------------------------------------

/** Returns true when the command is a create operation (user doesn't exist yet). */
function isCreateCommand(context: Context): boolean {
    return context.commandType?.includes('create') ?? false
}

/**
 * Before operation that intercepts sponsor attribute changes and applies them
 * via the Microsoft Graph API.
 *
 * The base Entra ID connector does not support the `sponsors` navigation
 * property, so this operation side-steps it by talking to Graph directly
 * and then stripping the attribute from the input before the base connector
 * sees it (Graph would reject it with a 400 otherwise).
 *
 * The flow varies depending on the command type:
 *
 * **Create commands** — The target user does not yet exist in Entra ID, so
 * the Graph write cannot happen now. Instead, the sponsor change is cached
 * (via `inputCache`) and the companion after operation (`setSponsors`) picks
 * it up once the account has been provisioned.
 *
 * **All other commands** (update, enable, disable, unlock, etc.) — The user
 * already exists, so the sponsor is written (or cleared) immediately via
 * Graph. Identity data is still cached so the after operation can resolve the
 * userId even when the output object doesn't carry enough information.
 *
 * In both cases the `sponsors` attribute is removed from the input payload
 * before it reaches the base connector.
 *
 * @param context - SDK invocation context (carries commandType, invocationId, etc.)
 * @param input   - Raw SDK input; may contain `attributes.sponsors` or a
 *                  matching entry in `changes` (for update payloads).
 * @returns The sanitised input with the `sponsors` attribute stripped out.
 */
export const preSetSponsors: BeforeOperation<AccountBeforeOperationInput> = async (context, input) => {
    const config: Config = await readConfig()
    const logger = getLogger(config.spConnDebugLoggingEnabled)

    logger.debug(`preSetSponsors: commandType=${context.commandType}`)

    // Look for the sponsor value in both attributes and changes (update payloads)
    const inputAny = input as any
    const change = inputAny.changes?.find((c: any) => c.attribute === 'sponsors' || c.attribute === 'attributes.sponsors')
    const value = inputAny.attributes?.sponsors ?? inputAny.attributes?.['attributes.sponsors'] ?? change?.value

    if (value === undefined && !change) {
        return input
    }

    const op = change?.op ?? AttributeChangeOp.Set
    const sponsorUpn = (Array.isArray(value) ? value[0] : value) as string | undefined
    const userId: string | undefined = inputAny.identity ?? inputAny.key?.simple?.id ?? inputAny.attributes?.objectId

    logger.debug(`preSetSponsors: op=${op}, sponsorUpn=${sponsorUpn}, userId=${userId}`)

    const key = cacheKey(context)

    if (isCreateCommand(context)) {
        // Create: user doesn't exist yet — defer the Graph write to the after operation
        logger.debug('preSetSponsors: create command detected, deferring sponsor write to after operation')
        if (key) {
            inputCache.set(key, {
                userId,
                identity: inputAny.identity,
                key: inputAny.key,
                pendingSponsor: { op, upn: sponsorUpn },
            })
        }
    } else {
        // Update / other: apply the sponsor change via Graph immediately
        if (key && userId) {
            inputCache.set(key, {
                userId,
                identity: inputAny.identity,
                key: inputAny.key,
                setUpn: op !== AttributeChangeOp.Remove ? sponsorUpn : undefined,
            })
        }

        if (userId) {
            const client = new EntraIdClient(config.domainName, config.clientID, config.clientSecret)
            if (op === AttributeChangeOp.Remove) {
                await client.clearSponsorsForUser(userId)
                logger.debug(`preSetSponsors: cleared sponsors for ${userId}`)
            } else if (sponsorUpn) {
                await client.setSponsorForUser(userId, sponsorUpn)
                logger.debug(`preSetSponsors: set sponsor ${sponsorUpn} for ${userId}`)
            }
        }
    }

    // Strip sponsors from the input so the base connector doesn't try to PATCH
    // it — Graph rejects 'sponsors' as a non-schema property on the user resource.
    return stripSponsorsFromInput(input, logger)
}

// ---------------------------------------------------------------------------
// Input sanitisation
// ---------------------------------------------------------------------------

/**
 * Removes `sponsors` / `attributes.sponsors` from the input payload so the
 * base connector never sends it to Graph (which would cause a 400 error).
 */
function stripSponsorsFromInput(input: any, logger: any): any {
    let result = input

    // Strip from attributes (create payloads)
    if (result.attributes?.sponsors != null || result.attributes?.['attributes.sponsors'] != null) {
        const { sponsors, 'attributes.sponsors': _attrSponsors, ...rest } = result.attributes
        result = { ...result, attributes: rest }
        logger.debug('preSetSponsors: stripped sponsors from input.attributes')
    }

    // Strip from changes array (update payloads)
    if (result.changes?.length) {
        const filtered = result.changes.filter(
            (c: any) => c.attribute !== 'sponsors' && c.attribute !== 'attributes.sponsors'
        )
        if (filtered.length !== result.changes.length) {
            result = { ...result, changes: filtered }
            logger.debug('preSetSponsors: stripped sponsors from input.changes')
        }
    }

    return result
}

// ---------------------------------------------------------------------------
// After operation implementation
// ---------------------------------------------------------------------------

/**
 * After operation — setSponsors
 *
 * Enriches each account output with its sponsor(s) from Microsoft Graph.
 * Runs after every standard account command (list, read, create, update, etc.).
 *
 * For **create** commands, the companion before operation (preSetSponsors)
 * defers the Graph write because the user didn't exist yet. This after operation
 * detects the pending sponsor change in the cache and applies it first, then
 * reads the sponsors back.
 *
 * Returns:
 *  - undefined          when no sponsors exist
 *  - a single UPN string when exactly one sponsor
 *  - an array of UPNs   when multiple sponsors
 *
 * The framework writes this value to `attributes.sponsors` on the account.
 */
export const setSponsors: AfterOperation<AccountAfterOperationInput> = async (
    context: Context,
    output: AccountAfterOperationInput
): Promise<any> => {
    const config: Config = await readConfig()
    const logger = getLogger(config.spConnDebugLoggingEnabled)

    logger.debug(`setSponsors: original output = ${JSON.stringify(output)}`)

    // Resolve userId from the output object or fall back to the cached before-operation input
    let userId = (output as any).identity
    const cached = getCachedInput(context)

    if (!userId && cached?.userId) {
        userId = cached.userId
    }

    logger.debug(`setSponsors: userId=${userId}`)

    if (!userId) {
        logger.debug('setSponsors: no userId found, returning unmodified output')
        return undefined
    }

    const client = new EntraIdClient(config.domainName, config.clientID, config.clientSecret)

    // If the before operation deferred a sponsor write (create flow), apply it now
    if (cached?.pendingSponsor) {
        const { op, upn } = cached.pendingSponsor
        logger.debug(`setSponsors: applying deferred sponsor change (op=${op}, upn=${upn}) for ${userId}`)
        if (op === AttributeChangeOp.Remove) {
            await client.clearSponsorsForUser(userId)
        } else if (upn) {
            await client.setSponsorForUser(userId, upn)
        }
    }

    return undefined
}

