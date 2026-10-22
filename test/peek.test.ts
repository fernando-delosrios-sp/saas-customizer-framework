import * as utils from '../src/utils'

jest.mock('@sailpoint/connector-sdk', () => ({
    readConfig: jest.fn().mockResolvedValue({}),
}))

import { sanitize, toSingleQuotedJson, chunkObject, peek } from '../src/operations/peek'

describe('peek operation', () => {
    describe('sanitize', () => {
        it('removes internal stream and runtime handles', () => {
            const input = {
                version: 82,
                _outStream: { fd: null },
                _promiseStore: {},
                productFlags: ['FLAG_1', 'FLAG_2'],
                handlers: {},
                customData: 'hello',
            }
            const clean = sanitize(input)
            expect(clean).toEqual({
                version: 82,
                customData: 'hello',
            })
            expect(clean._outStream).toBeUndefined()
            expect(clean.productFlags).toBeUndefined()
        })

        it('handles circular references gracefully', () => {
            const circular: any = { name: 'test' }
            circular.self = circular
            const clean = sanitize(circular)
            expect(clean.name).toBe('test')
            expect(clean.self).toBe('[Circular]')
        })

        it('masks sensitive keywords in keys and redacts credential values', () => {
            const input = {
                oauth_token: 'secret-token-123',
                client_secret: 'topsecret',
                password: 'pass',
                url: 'https://example.com/oauth/token',
                safeField: 'normalValue',
            }
            const clean = sanitize(input)
            expect(clean['oauth_tok*n']).toBe('[REDACTED]')
            expect(clean['client_s*cret']).toBe('[REDACTED]')
            expect(clean['p*ssword']).toBe('[REDACTED]')
            expect(clean.url).toBe('https://example.com/oauth/tok*n')
            expect(clean.safeField).toBe('normalValue')
            expect(clean.oauth_token).toBeUndefined()
        })
    })

    describe('toSingleQuotedJson', () => {
        it('converts double quotes to single quotes and escapes existing single quotes', () => {
            const original = JSON.stringify({
                title: "User's Manual",
                description: 'Simple "quoted" text',
                count: 10,
            })
            const result = toSingleQuotedJson(original)
            expect(result).not.toContain('"')
            // Verify that the resulting string is a valid JavaScript / single-quoted object
            // by evaluating it safely
            // eslint-disable-next-line no-eval
            const parsed = eval(`(${result})`)
            expect(parsed.title).toBe("User's Manual")
            expect(parsed.description).toBe("Simple 'quoted' text")
            expect(parsed.count).toBe(10)
        })
    })

    describe('chunkObject', () => {
        it('keeps small objects in a single chunk', () => {
            const small = { context: { version: 82 }, payload: { id: '123' } }
            const chunks = chunkObject(small, 2000)
            expect(chunks).toHaveLength(1)
            expect(chunks[0]).toEqual(small)
        })

        it('chunks large objects into valid standalone object chunks', () => {
            const large = {
                context: { version: 82, cmd: 'std:test-connection' },
                payload: {
                    part1: { data: 'a'.repeat(80) },
                    part2: { data: 'b'.repeat(80) },
                    part3: { data: 'c'.repeat(80) },
                },
            }
            const chunks = chunkObject(large, 120)
            expect(chunks.length).toBeGreaterThan(1)
            for (const chunk of chunks) {
                expect(typeof chunk).toBe('object')
                const str = toSingleQuotedJson(JSON.stringify(chunk))
                expect(str.startsWith('{')).toBe(true)
                expect(str.endsWith('}')).toBe(true)
                // eslint-disable-next-line no-eval
                const parsed = eval(`(${str})`)
                expect(typeof parsed).toBe('object')
            }
        })
    })

    describe('peek execution', () => {
        it('logs single chunk with === PEEK === banner', async () => {
            const infoMock = jest.fn()
            jest.spyOn(utils, 'getLogger').mockReturnValue({ info: infoMock, warn: jest.fn() } as any)

            const context: any = { version: 82, commandType: 'std:test-connection' }
            const payload: any = { input: { id: 'test' } }

            await peek(context, payload)

            expect(infoMock).toHaveBeenCalledTimes(1)
            const logMsg = infoMock.mock.calls[0][0]
            expect(logMsg).toMatch(/^=== PEEK === \{'context':/)
            expect(logMsg).not.toContain('"')
            // eslint-disable-next-line no-eval
            const parsed = eval(`(${logMsg.replace(/^=== PEEK === /, '')})`)
            expect(parsed.context.version).toBe(82)
            expect(parsed.payload.input.id).toBe('test')
        })

        it('logs multiple chunks with === PEEK [i/N] === banner when payload is large', async () => {
            const infoMock = jest.fn()
            jest.spyOn(utils, 'getLogger').mockReturnValue({ info: infoMock, warn: jest.fn() } as any)

            const context: any = { version: 82 }
            // Large payload exceeding 2000 characters
            const payload: any = {
                items: Array.from({ length: 40 }, (_, i) => ({
                    id: `id_${i}`,
                    name: `User name ${i}`,
                    description: `Detailed description for user attribute number ${i}`,
                })),
            }

            await peek(context, payload)

            expect(infoMock.mock.calls.length).toBeGreaterThan(1)
            const total = infoMock.mock.calls.length
            for (let i = 0; i < total; i++) {
                const msg = infoMock.mock.calls[i][0]
                expect(msg).toMatch(new RegExp(`^=== PEEK \\[${i + 1}/${total}\\] === \\{`))
                expect(msg).not.toContain('"')
                // Verify each chunk is a valid standalone object
                const jsonPart = msg.replace(/^=== PEEK \[\d+\/\d+\] === /, '')
                // eslint-disable-next-line no-eval
                const parsed = eval(`(${jsonPart})`)
                expect(typeof parsed).toBe('object')
            }
        })
    })
})
