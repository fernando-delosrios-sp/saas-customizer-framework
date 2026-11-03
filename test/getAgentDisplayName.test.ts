import {
    extractAgentDisplayName,
    correlateAccountToAgent,
    deriveAgentDisplayNameFromAccountName,
    AIAgentIdentity
} from '../src/operations/Microsoft-Entra/getAgentDisplayName'

describe('getAgentDisplayName logic', () => {
    const mockAgents: AIAgentIdentity[] = [
        {
            id: '8954af94-933f-46c4-a554-ba3c31ab130e',
            name: 'ap-intake-agent v1',
            datasetId: 'azure:foundry',
            attributes: {
                agentName: 'ap-intake-agent',
                version: '1',
                instanceIdentityClientId: '4d5121bf-7663-4d8c-837f-8895c1985018',
                instanceIdentityPrincipalId: '4d5121bf-7663-4d8c-837f-8895c1985018',
                blueprintClientId: 'ecb731e1-3017-4fba-abd1-a9117e2a96ab',
                blueprintPrincipalId: '0ca5c6f6-20e8-4aec-8e34-1fb776f73ccb',
                metadata: JSON.stringify({
                    toolkitAgentId: 'ap-intake-agent',
                    displayName: 'Accounts Payable Intake Agent',
                    mode: 'semi-autonomous'
                })
            }
        },
        {
            id: 'dfc6baf2-b02f-4d98-9468-049b416c4e9d',
            name: 'IT Access & Service Desk Agent',
            datasetId: 'microsoft:copilot',
            attributes: {
                name: 'IT Access & Service Desk Agent',
                entraIdentityId: 'd237ab8b-15af-470d-8faf-6e04c5142104'
            }
        }
    ]

    describe('extractAgentDisplayName', () => {
        it('prefers exact agent name (versioned) when present', () => {
            const name = extractAgentDisplayName(mockAgents[0])
            expect(name).toBe('ap-intake-agent v1')
        })

        it('falls back to agentName and version when metadata is missing', () => {
            const agent: AIAgentIdentity = {
                id: '123',
                name: '',
                attributes: {
                    agentName: 'test-agent',
                    version: '2'
                }
            }
            expect(extractAgentDisplayName(agent)).toBe('test-agent v2')
        })

        it('falls back to agent id when no attributes exist', () => {
            const agent: AIAgentIdentity = {
                id: '123',
                name: ''
            }
            expect(extractAgentDisplayName(agent)).toBe('123')
        })
    })

    describe('correlateAccountToAgent', () => {
        it('correlates Azure AI Foundry Instance Account via spn_appId', () => {
            const accountAttributes = {
                displayName: 'aif-emeatesteam-proj-finance-ap-intake-agent-AgentIdentity',
                spn_appId: '4d5121bf-7663-4d8c-837f-8895c1985018',
                objectId: '4d5121bf-7663-4d8c-837f-8895c1985018:EXT'
            }

            const matched = correlateAccountToAgent(accountAttributes, mockAgents)
            expect(matched).toBeDefined()
            expect(matched?.id).toBe('8954af94-933f-46c4-a554-ba3c31ab130e')
        })

        it('correlates Azure AI Foundry Blueprint Account via blueprintClientId and principal objectId', () => {
            const accountAttributes = {
                displayName: 'aif-emeatesteam-proj-finance-ap-intake-agent-a7298-AgentIdentityBlueprint',
                spn_appId: 'ecb731e1-3017-4fba-abd1-a9117e2a96ab',
                objectId: '0ca5c6f6-20e8-4aec-8e34-1fb776f73ccb:ecb731e1-3017-4fba-abd1-a9117e2a96ab'
            }

            const matched = correlateAccountToAgent(accountAttributes, mockAgents)
            expect(matched).toBeDefined()
            expect(matched?.id).toBe('8954af94-933f-46c4-a554-ba3c31ab130e')
        })

        it('correlates Copilot Studio Account via entraIdentityId', () => {
            const accountAttributes = {
                displayName: 'IT Access & Service Desk Agent SP',
                spn_appId: 'd237ab8b-15af-470d-8faf-6e04c5142104',
                objectId: 'sp-object-id'
            }

            const matched = correlateAccountToAgent(accountAttributes, mockAgents)
            expect(matched).toBeDefined()
            expect(matched?.id).toBe('dfc6baf2-b02f-4d98-9468-049b416c4e9d')
        })
    })

    describe('deriveAgentDisplayNameFromAccountName', () => {
        it('cleans Azure AI Foundry Blueprint account name and appends version', () => {
            const clean = deriveAgentDisplayNameFromAccountName(
                'aif-emeatesteam-proj-finance-ap-intake-agent-a7298-AgentIdentityBlueprint'
            )
            expect(clean).toBe('ap-intake-agent v1')
        })

        it('cleans Azure AI Foundry Instance account name and appends version', () => {
            const clean = deriveAgentDisplayNameFromAccountName(
                'aif-emeatesteam-proj-finance-ap-intake-agent-AgentIdentity'
            )
            expect(clean).toBe('ap-intake-agent v1')
        })
    })
})
