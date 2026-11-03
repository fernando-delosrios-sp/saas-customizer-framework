import { runAfterOperations, runBeforeOperations } from '../src/operationRunner'
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

    it('uses operation.defaultAttribute when wildcard rule is used', async () => {
        const opWithDefault: any = async () => ({
            attributes: {
                resolvedValue: 'Computed Value',
            },
        })
        opWithDefault.defaultAttribute = 'myDefaultAttr'
        ;(operationRegistry as any).testWithDefault = opWithDefault

        ;(readConfig as jest.Mock).mockResolvedValue({
            customOperations: {
                'afterStdAccountRead.*': ['testWithDefault'],
            },
        })

        const handler = runAfterOperations('afterStdAccountRead')
        const output = {
            identity: '123',
            attributes: {},
        }

        const result: any = await handler({} as any, output as any)
        expect(result.attributes.myDefaultAttr).toBe('Computed Value')
    })

    it('overrides operation.defaultAttribute when specific rule attribute is given', async () => {
        const opWithDefault: any = async () => ({
            attributes: {
                resolvedValue: 'Computed Value',
            },
        })
        opWithDefault.defaultAttribute = 'myDefaultAttr'
        ;(operationRegistry as any).testWithDefault = opWithDefault

        ;(readConfig as jest.Mock).mockResolvedValue({
            customOperations: {
                'afterStdAccountRead.overriddenAttr': ['testWithDefault'],
            },
        })

        const handler = runAfterOperations('afterStdAccountRead')
        const output = {
            identity: '123',
            attributes: {},
        }

        const result: any = await handler({} as any, output as any)
        expect(result.attributes.overriddenAttr).toBe('Computed Value')
    })
})

describe('runBeforeOperations dynamic attribute mapping', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('triggers before-operation when matching rule attribute is present', async () => {
        let called = false
        const testOp: any = async (_ctx: any, input: any) => {
            called = true
            return input
        }
        ;(operationRegistry as any).testBeforeOp = testOp

        ;(readConfig as jest.Mock).mockResolvedValue({
            customOperations: {
                'beforeStdAccountCreate.customAttr': ['testBeforeOp'],
            },
        })

        const handler = runBeforeOperations('beforeStdAccountCreate')
        await handler({} as any, {
            attributes: {
                customAttr: 'testValue',
            },
        } as any)

        expect(called).toBe(true)
    })

    it('triggers before-operation via defaultAttribute on wildcard rule', async () => {
        let called = false
        const testBeforeWithDefault: any = async (_ctx: any, input: any) => {
            called = true
            return input
        }
        testBeforeWithDefault.defaultAttribute = 'myDefaultBeforeAttr'
        ;(operationRegistry as any).testBeforeWithDefault = testBeforeWithDefault

        ;(readConfig as jest.Mock).mockResolvedValue({
            customOperations: {
                'beforeStdAccountCreate.*': ['testBeforeWithDefault'],
            },
        })

        const handler = runBeforeOperations('beforeStdAccountCreate')

        // 1. Should not call if defaultAttribute is absent
        await handler({} as any, {
            attributes: {
                otherAttr: 'val',
            },
        } as any)
        expect(called).toBe(false)

        // 2. Should call if defaultAttribute is present
        await handler({} as any, {
            attributes: {
                myDefaultBeforeAttr: 'val',
            },
        } as any)
        expect(called).toBe(true)
    })
})
