/**
 * After operation — getAgentDisplayName
 *
 * Correlates Azure AI Foundry, Agent 365, and Copilot Studio service principal
 * machine accounts with their underlying AI Agent and resolves its display name.
 *
 * For Azure AI Foundry:
 *  - Instance Identity: spn_appId matches instanceIdentityClientId / instanceIdentityPrincipalId.
 *  - Blueprint Identity: objectId contains blueprintPrincipalId, or spn_appId matches blueprintClientId.
 *  - Online Lookup (optional): queries ISC search / machineidentities when configured or when client credentials are provided.
 *  - Fallback / Convention Inference: strips known Foundry blueprint & agent suffixes from the account displayName.
 *
 * For Copilot Studio / Agent 365:
 *  - Matches entraIdentityId against spn_appId or servicePrincipalId.
 */
import { readConfig } from '@sailpoint/connector-sdk'
import { AfterOperation, AccountAfterOperationInput } from '../../model/operation'
import { Config } from '../../model/config'
import { getLogger } from '../../utils'

export interface AIAgentIdentityAttributes {
    agentName?: string
    version?: string
    instanceIdentityClientId?: string
    instanceIdentityPrincipalId?: string
    blueprintClientId?: string
    blueprintPrincipalId?: string
    entraIdentityId?: string
    metadata?: string
    [key: string]: any
}

export interface AIAgentIdentity {
    id: string
    name: string
    datasetId?: string
    attributes?: AIAgentIdentityAttributes
}

/**
 * Extracts the user-friendly display name of an AI Agent from its Machine Identity.
 */
export function extractAgentDisplayName(agent: AIAgentIdentity): string {
    if (agent.attributes?.metadata) {
        try {
            const meta = typeof agent.attributes.metadata === 'string'
                ? JSON.parse(agent.attributes.metadata)
                : agent.attributes.metadata
            if (meta?.displayName) return meta.displayName
        } catch {
            // Ignore parse errors
        }
    }

    if (agent.attributes?.agentName) {
        return agent.attributes.version
            ? `${agent.attributes.agentName} v${agent.attributes.version}`
            : agent.attributes.agentName
    }

    return agent.name
}

/**
 * Correlates an account's service principal attributes with known AI Agent records.
 */
export function correlateAccountToAgent(
    accountAttributes: Record<string, any>,
    agents: AIAgentIdentity[]
): AIAgentIdentity | undefined {
    const appId = accountAttributes.spn_appId
    const nativeObjectId = accountAttributes.objectId || accountAttributes.nativeIdentity || ''
    const [spPrincipalId, spAppId] = typeof nativeObjectId === 'string' && nativeObjectId.includes(':')
        ? nativeObjectId.split(':')
        : [nativeObjectId, appId]

    return agents.find((agent) => {
        const attrs = agent.attributes || {}

        // 1. Azure AI Foundry Instance Identity match
        if (
            appId &&
            (attrs.instanceIdentityClientId === appId || attrs.instanceIdentityPrincipalId === appId)
        ) {
            return true
        }

        // 2. Azure AI Foundry Blueprint match
        if (
            (appId && attrs.blueprintClientId === appId) ||
            (spAppId && attrs.blueprintClientId === spAppId) ||
            (spPrincipalId && attrs.blueprintPrincipalId === spPrincipalId)
        ) {
            return true
        }

        // 3. Copilot Studio / Agent 365 match
        if (
            attrs.entraIdentityId &&
            (attrs.entraIdentityId === appId || attrs.entraIdentityId === spPrincipalId)
        ) {
            return true
        }

        return false
    })
}

/**
 * Derives a clean agent display name from standard Entra ID account naming conventions
 * when live machine identity correlation is not available.
 *
 * Example patterns:
 * - "aif-emeatesteam-proj-finance-ap-intake-agent-AgentIdentity" -> "ap-intake-agent" / "Accounts Payable Intake Agent"
 * - "aif-emeatesteam-proj-finance-ap-intake-agent-a7298-AgentIdentityBlueprint" -> "ap-intake-agent"
 */
export function deriveAgentDisplayNameFromAccountName(accountName: string): string {
    if (!accountName) return accountName

    // Strip Blueprint & Identity suffixes
    let clean = accountName
        .replace(/-AgentIdentityBlueprint$/i, '')
        .replace(/-AgentIdentity$/i, '')

    // Strip hex random suffix on blueprints (e.g. -a7298)
    clean = clean.replace(/-[a-f0-9]{4,6}$/i, '')

    // If Azure AI Foundry format (aif-<org>-proj-<project>-<agentName>), extract agent name
    if (clean.startsWith('aif-')) {
        const projIdx = clean.indexOf('-proj-')
        if (projIdx !== -1) {
            const afterProj = clean.substring(projIdx + '-proj-'.length)
            // afterProj format is <project>-<agentName>
            const firstDash = afterProj.indexOf('-')
            if (firstDash !== -1) {
                clean = afterProj.substring(firstDash + 1)
            }
        }
    }

    return clean || accountName
}

/**
 * Cache for AI Agent machine identities in runtime memory during aggregation.
 */
let cachedAgents: AIAgentIdentity[] | null = null
let lastCacheTime = 0
const CACHE_TTL_MS = 60_000 // 1 minute

async function fetchAIAgentsFromISC(config: Config, logger: any): Promise<AIAgentIdentity[]> {
    const now = Date.now()
    if (cachedAgents && (now - lastCacheTime) < CACHE_TTL_MS) {
        return cachedAgents
    }

    const tenantUrl = (config as any).tenantUrl || (config as any).baseUrl
    const clientId = (config as any).spnClientId || (config as any).clientId || config.clientID
    const clientSecret = (config as any).spnClientSecret || (config as any).clientSecret || config.clientSecret

    if (!tenantUrl || !clientId || !clientSecret) {
        logger.debug('getAgentDisplayName: ISC API credentials not found in config, skipping online search')
        return []
    }

    try {
        const tokenRes = await fetch(`${tenantUrl}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            })
        })

        if (!tokenRes.ok) {
            logger.warn(`getAgentDisplayName: Failed to obtain ISC access token: ${tokenRes.statusText}`)
            return []
        }

        const tokenData = await tokenRes.json()
        const accessToken = tokenData.access_token

        const searchRes = await fetch(`${tenantUrl}/v3/search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                indices: ['machineidentities'],
                query: {
                    query: 'subtype:"AI Agent"'
                }
            })
        })

        if (!searchRes.ok) {
            logger.warn(`getAgentDisplayName: Failed to query ISC machine identities: ${searchRes.statusText}`)
            return []
        }

        cachedAgents = await searchRes.json()
        lastCacheTime = Date.now()
        logger.debug(`getAgentDisplayName: Cached ${cachedAgents?.length || 0} AI Agent(s) from ISC search`)
        return cachedAgents || []
    } catch (err) {
        logger.error(`getAgentDisplayName: Error querying ISC search for AI Agents: ${err}`)
        return []
    }
}

/**
 * AfterOperation: getAgentDisplayName
 */
export const getAgentDisplayName: AfterOperation<AccountAfterOperationInput> = async (context, output) => {
    const config: Config = await readConfig()
    const logger = getLogger(config.spConnDebugLoggingEnabled)

    const out: any = output
    if (!out?.attributes) {
        return undefined
    }

    const { spn_appId, displayName, objectId } = out.attributes
    // Service principal accounts or accounts with agent naming indicators
    const isServicePrincipal = Boolean(spn_appId || out.attributes.spn_servicePrincipalType)
    const rawDisplayName = displayName || out.name || ''

    const isAgentCandidate =
        isServicePrincipal ||
        rawDisplayName.includes('AgentIdentity') ||
        rawDisplayName.includes('AgentIdentityBlueprint') ||
        rawDisplayName.startsWith('aif-')

    if (!isAgentCandidate) {
        return undefined
    }

    logger.debug(`getAgentDisplayName: evaluating candidate account "${rawDisplayName}" (appId: ${spn_appId})`)

    let resolvedName: string | undefined

    // 1. Try online correlation if configured
    const agents = await fetchAIAgentsFromISC(config, logger)
    if (agents.length > 0) {
        const matched = correlateAccountToAgent(out.attributes, agents)
        if (matched) {
            resolvedName = extractAgentDisplayName(matched)
            logger.debug(`getAgentDisplayName: Correlated with agent "${matched.name}" -> "${resolvedName}"`)
        }
    }

    // 2. Fallback to name pattern extraction if no direct API match
    if (!resolvedName) {
        resolvedName = deriveAgentDisplayNameFromAccountName(rawDisplayName)
        logger.debug(`getAgentDisplayName: Inferred display name from pattern -> "${resolvedName}"`)
    }

    return {
        attributes: {
            ...out.attributes,
            // Returning the generated display name for common target attributes
            displayName: resolvedName,
            agentDisplayName: resolvedName,
            spn_agentName: resolvedName
        }
    }
}
getAgentDisplayName.defaultAttribute = 'spn_agentName'

