import { runAfterOperations } from '../src/operationRunner'
import { operationRegistry } from '../src/customOperations'

jest.mock('@sailpoint/connector-sdk', () => ({
    readConfig: jest.fn(),
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}))

import { readConfig } from '@sailpoint/connector-sdk'

describe('runAfterOperations dynamic attribute mapping', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('maps single returned attribute to matching rule attribute when keys differ', async () => {
        // Register a temporary test operation returning { attributes: { customValue: 'Agent 007' } }
        ;(operationRegistry as any).testSingleAttr = async () => ({
            attributes: { customValue: 'Agent 007' },
        })

        ;(readConfig as jest.Mock).mockResolvedValue({
            customOperations: {
                'afterStdAccountRead.spn_agentName': ['testSingleAttr'],
            },
        })

        const handler = runAfterOperations('afterStdAccountRead')
        const output = {
            identity: '123',
            attributes: {
                displayName: 'Original Name',
            },
        }

        const result: any = await handler({} as any, output as any)
        expect(result.attributes.spn_agentName).toBe('Agent 007')
        expect(result.attributes.customValue).toBe('Agent 007')
    })

    it('uses fallback candidate (displayName/agentDisplayName) when multiple attributes are returned', async () => {
        ;(operationRegistry as any).testMultiAttr = async () => ({
            attributes: {
                agentDisplayName: 'My Resolved Agent',
                internalId: 'uuid-123',
            },
        })

        ;(readConfig as jest.Mock).mockResolvedValue({
            customOperations: {
                'afterStdAccountRead.targetAgentField': ['testMultiAttr'],
            },
        })

        const handler = runAfterOperations('afterStdAccountRead')
        const output = {
            identity: '123',
            attributes: {},
        }

        const result: any = await handler({} as any, output as any)
        expect(result.attributes.targetAgentField).toBe('My Resolved Agent')
        expect(result.attributes.internalId).toBe('uuid-123')
    })

    it('preserves predefined attributes when the operation explicitly returns the matching attribute', async () => {
        ;(operationRegistry as any).testExplicitAttr = async () => ({
            attributes: {
                explicitField: 'Exact Value',
            },
        })

        ;(readConfig as jest.Mock).mockResolvedValue({
            customOperations: {
                'afterStdAccountRead.explicitField': ['testExplicitAttr'],
            },
        })

        const handler = runAfterOperations('afterStdAccountRead')
        const output = {
            identity: '123',
            attributes: {},
        }

        const result: any = await handler({} as any, output as any)
        expect(result.attributes.explicitField).toBe('Exact Value')
    })
})
