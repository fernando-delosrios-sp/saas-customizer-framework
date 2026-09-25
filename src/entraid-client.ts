/**
 * Entra ID API client (Microsoft Graph)
 *
 * This module is the connector-specific part of the customizer. It wraps the
 * Microsoft Graph SDK with ClientSecretCredential authentication and exposes
 * high-level methods used by the custom operations.
 *
 * When adapting this template for a different connector, replace this file
 * with a client for your target system's API.
 */
import { Client } from '@microsoft/microsoft-graph-client'
import { ClientSecretCredential } from '@azure/identity'
import 'isomorphic-fetch'
import { logger } from '@sailpoint/connector-sdk'

export class EntraIdClient {
    private graphClient: Client
    private credential: ClientSecretCredential

    /**
     * @param domainName   Entra ID tenant (directory) ID or primary domain
     * @param clientId     Application (client) ID registered in Entra ID
     * @param clientSecret Client secret for the application
     */
    constructor(domainName: string, clientId: string, clientSecret: string) {
        this.credential = new ClientSecretCredential(domainName, clientId, clientSecret)

        this.graphClient = Client.initWithMiddleware({
            authProvider: {
                getAccessToken: async () => {
                    const token = await this.credential.getToken('https://graph.microsoft.com/.default')
                    return token?.token || ''
                },
            },
        })
    }

    // -----------------------------------------------------------------------
    // User methods
    // -----------------------------------------------------------------------

    /** Fetches a user by objectId or UPN. Returns the raw Graph user object. */
    async getUser(upnOrId: string): Promise<any | undefined> {
        try {
            return await this.graphClient.api(`/users/${upnOrId}`).get()
        } catch (error) {
            logger.error(`Error fetching user ${upnOrId}:`)
            logger.error(error)
            return undefined
        }
    }

    /** Updates the showInAddressList property for a user. */
    async setShowInAddressList(upnOrId: string, show: boolean): Promise<void> {
        try {
            await this.graphClient.api(`/users/${upnOrId}`).patch({
                showInAddressList: show,
            })
            logger.info(`Successfully set showInAddressList to ${show} for user ${upnOrId}`)
        } catch (error) {
            logger.error(`Error setting showInAddressList to ${show} for user ${upnOrId}:`)
            logger.error(error)
            throw error
        }
    }

    // -----------------------------------------------------------------------
    // Sponsor methods
    // -----------------------------------------------------------------------

    /** Fetches all sponsors for a user. Accepts objectId (GUID) or UPN. */
    async getSponsorsForGuest(upnOrId: string): Promise<any[]> {
        try {
            const response = await this.graphClient.api(`/users/${upnOrId}/sponsors`).get()
            return (response.value as any[]) ?? []
        } catch (error) {
            logger.error('Error fetching sponsors:')
            logger.error(error)
            return []
        }
    }

    /**
     * Assigns a sponsor to a user.
     * Resolves the sponsor UPN to an objectId first, then creates the
     * directoryObject reference via the sponsors navigation property.
     * Silently succeeds if the sponsor is already assigned.
     */
    async setSponsorForUser(userId: string, sponsorUpn: string): Promise<void> {
        try {
            // Resolve sponsor UPN → objectId
            logger.info(`Resolving sponsor UPN: ${sponsorUpn}`)
            const sponsorResponse = await this.graphClient.api(`/users/${sponsorUpn}`).select('id').get()
            const sponsorId = sponsorResponse.id
            logger.info(`Resolved sponsor ID: ${sponsorId}`)

            // Create the sponsor reference
            await this.graphClient.api(`/users/${userId}/sponsors/$ref`).post({
                '@odata.id': `https://graph.microsoft.com/v1.0/users/${sponsorId}`,
            })
            logger.info(`Successfully set sponsor ${sponsorUpn} for user ${userId}`)
        } catch (error: any) {
            // Idempotent: treat "already exists" as success
            const msg = String(error?.message ?? error?.response?.data?.error?.message ?? error ?? '')
            if (msg.includes('already exist') && msg.toLowerCase().includes('sponsors')) {
                logger.info(`Sponsor ${sponsorUpn} already assigned to user ${userId}, skipping`)
                return
            }
            logger.error(`Error setting sponsor ${sponsorUpn} for user ${userId}:`)
            logger.error(error)
            throw error
        }
    }

    /** Removes a single sponsor (by objectId) from a user. */
    async removeSponsorForUser(userId: string, sponsorId: string): Promise<void> {
        try {
            await this.graphClient.api(`/users/${userId}/sponsors/${sponsorId}/$ref`).delete()
            logger.info(`Successfully removed sponsor ${sponsorId} from user ${userId}`)
        } catch (error) {
            logger.error(`Error removing sponsor ${sponsorId} from user ${userId}:`)
            logger.error(error)
            throw error
        }
    }

    /** Removes all sponsors from a user by fetching and deleting each one. */
    async clearSponsorsForUser(userId: string): Promise<void> {
        try {
            const response = await this.graphClient.api(`/users/${userId}/sponsors`).get()
            const sponsors = (response.value as any[]) ?? []
            for (const sponsor of sponsors) {
                await this.removeSponsorForUser(userId, sponsor.id)
            }
            if (sponsors.length > 0) {
                logger.info(`Cleared ${sponsors.length} sponsor(s) from user ${userId}`)
            }
        } catch (error) {
            logger.error(`Error clearing sponsors for user ${userId}:`)
            logger.error(error)
            throw error
        }
    }

    // -----------------------------------------------------------------------
    // Service principal methods
    // -----------------------------------------------------------------------

    /**
     * Fetches all app role assignments targeting a service principal
     * (Users and groups blade on the enterprise application).
     * Follows @odata.nextLink until all pages are retrieved.
     */
    async getAppRoleAssignedTo(servicePrincipalId: string): Promise<any[]> {
        try {
            const assignments: any[] = []
            let response = await this.graphClient
                .api(`/servicePrincipals/${servicePrincipalId}/appRoleAssignedTo`)
                .get()

            assignments.push(...((response.value as any[]) ?? []))

            while (response['@odata.nextLink']) {
                response = await this.graphClient.api(response['@odata.nextLink']).get()
                assignments.push(...((response.value as any[]) ?? []))
            }

            return assignments
        } catch (error) {
            logger.error(`Error fetching appRoleAssignedTo for service principal ${servicePrincipalId}:`)
            logger.error(error)
            return []
        }
    }
}
