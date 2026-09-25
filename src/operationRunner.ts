/**
 * Operation runners (the core engine)
 *
 * This module contains the engine that powers the customizer framework:
 *
 * 1. `runBeforeOperations` — creates a handler that iterates before-operation maps,
 *    running each registered operation only when the input contains the relevant attribute.
 *
 * 2. `runAfterOperations` — creates a handler that iterates after-operation maps,
 *    running each registered operation against every output object and writing
 *    the returned value back to the mapped attribute.
 *
 * Hook wiring comes from the source's `customOperations` config attribute.
 * Values are operation registry names resolved via `operationRegistry`.
 *
 * Map key conventions:
 *   - Keys are plain attribute names (e.g. 'sponsors'). The runners auto-prefix
 *     'attributes.' when reading/writing the object. The legacy 'attributes.'
 *     prefix is still accepted.
 *   - A `null` key means "always run" — the operation is invoked unconditionally.
 *
 * These utilities are connector-agnostic. Plug in any OperationMap and they work.
 */
import { Context, readConfig, logger as sdkLogger } from '@sailpoint/connector-sdk'
import { AnyBeforeOperationInput, AnyAfterOperationInput, CustomOperationMap } from './model/operation'
import { Config, CustomOperationsConfig } from './model/config'
import { operationRegistry } from './customOperations'
import { getLogger } from './utils'

// Helper function to check if a hook matches a pattern
function matchesPattern(hook: string, pattern: string): boolean {
    if (pattern === '*') return true
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
    return regex.test(hook)
}

/**
 * Parses `config.customOperations` (object or JSON string) and resolves
 * operation names through `operationRegistry` into a callable map.
 * Unknown names are skipped with a warning. Missing/empty config → empty map.
 */
function resolveOperationsFromConfig(config: Config): CustomOperationMap {
    let raw: CustomOperationsConfig | undefined

    if (typeof config.customOperations === 'string') {
        const trimmed = config.customOperations.trim()
        if (!trimmed) return {}
        try {
            raw = JSON.parse(trimmed) as CustomOperationsConfig
        } catch (err) {
            sdkLogger.warn(`Failed to parse customOperations config as JSON: ${err}`)
            return {}
        }
    } else {
        raw = config.customOperations
    }

    if (!raw || typeof raw !== 'object') return {}

    const resolved: CustomOperationMap = {}

    for (const [pattern, names] of Object.entries(raw)) {
        const nameList = Array.isArray(names) ? names : [names]
        const ops = []

        for (const name of nameList) {
            if (typeof name !== 'string' || !name) continue
            const op = operationRegistry[name]
            if (!op) {
                sdkLogger.warn(`Unknown custom operation "${name}" for pattern "${pattern}" — skipping`)
                continue
            }
            ops.push(op)
        }

        if (ops.length > 0) {
            resolved[pattern] = ops
        }
    }

    return resolved
}

/**
 * Creates a before-operation handler from the source's customOperations config.
 *
 * For each entry in the map the handler checks whether the input contains the
 * relevant attribute (in `attributes`, `primaryData`, or `changes`). If it does,
 * the operation function is called and its return value replaces the input for
 * subsequent operations (pipeline pattern).
 *
 * A `null` key bypasses the attribute-presence check — the operation always runs.
 *
 * Keys are plain attribute names (e.g. 'sponsors'). The legacy 'attributes.'
 * prefix is still accepted but no longer required.
 */
export const runBeforeOperations = <T extends AnyBeforeOperationInput>(hookName: string) => {
    return async (context: Context, input: T): Promise<T> => {
        const config: Config = await readConfig()
        const logger = getLogger(config.spConnDebugLoggingEnabled)
        const operations = resolveOperationsFromConfig(config)

        for (const [pattern, operation] of Object.entries(operations)) {
            let hookPattern = '*'
            let attrPattern = pattern
            if (pattern.includes('.')) {
                const firstDotIdx = pattern.indexOf('.')
                hookPattern = pattern.substring(0, firstDotIdx)
                attrPattern = pattern.substring(firstDotIdx + 1)
            }

            if (!matchesPattern(hookName, hookPattern)) continue

            // '*' or 'null' key → always run (unconditional operation)
            if (attrPattern === '*' || attrPattern === 'null') {
                logger.debug(`${context.commandType} - Running before operation (always)`)
                const ops = Array.isArray(operation) ? operation : [operation]
                for (const op of ops) {
                    const functionInput = await (op as any)(context, input)
                    if (functionInput) {
                        input = { ...input, ...functionInput }
                    }
                }
                continue
            }

            // Derive the short attribute name (strip 'attributes.' prefix if present)
            const attrName = attrPattern.startsWith('attributes.') ? attrPattern.slice('attributes.'.length) : attrPattern

            // Check if the attribute is present in any of the possible input locations
            const inputAny = input as any
            const hasAttribute =
                inputAny.attributes?.[attrName] != null ||
                inputAny.attributes?.[attrPattern] != null ||
                inputAny.primaryData?.[attrName] != null ||
                inputAny.changes?.some((c: any) => c.attribute === attrName || c.attribute === attrPattern)

            if (hasAttribute) {
                logger.debug(`${context.commandType} - Running before operation for attribute ${attrName}`)
                const ops = Array.isArray(operation) ? operation : [operation]
                for (const op of ops) {
                    const functionInput = await (op as any)(context, input)
                    if (functionInput) {
                        input = { ...input, ...functionInput }
                    }
                }
            }
        }
        return input
    }
}

/**
 * Creates an after-operation handler from the source's customOperations config.
 *
 * For each entry in the map the handler iterates over every output object
 * (supports both single objects and arrays), calls the operation, and writes
 * the returned value to the mapped attribute using `setAttribute`.
 * Falls back to `setAttributeImmutable` when the object is frozen.
 *
 * A `null` key means the operation always runs and its return value replaces
 * the entire object (useful for whole-object transformations).
 *
 * Keys are plain attribute names (e.g. 'sponsors') — the framework prepends
 * 'attributes.' automatically. The legacy 'attributes.' prefix is still
 * accepted but no longer required.
 */
export const runAfterOperations = <T extends AnyAfterOperationInput>(hookName: string) => {
    return async (context: Context, output: T): Promise<T> => {
        const config: Config = await readConfig()
        const logger = getLogger(config.spConnDebugLoggingEnabled)
        const operations = resolveOperationsFromConfig(config)

        // Normalise to array so the same logic works for list and single-object commands
        const isArray = Array.isArray(output)
        const items: any[] = isArray ? output : [output]
        let result: any[] = items

        for (const [pattern, operation] of Object.entries(operations)) {
            let hookPattern = '*'
            let attrPattern = pattern
            if (pattern.includes('.')) {
                const firstDotIdx = pattern.indexOf('.')
                hookPattern = pattern.substring(0, firstDotIdx)
                attrPattern = pattern.substring(firstDotIdx + 1)
            }

            if (!matchesPattern(hookName, hookPattern)) continue

            // '*' or 'null' key → always run; return value replaces the object
            if (attrPattern === '*' || attrPattern === 'null') {
                for (let i = 0; i < items.length; i++) {
                    logger.debug(`${context.commandType} - Running after operation (always)`)
                    const ops = Array.isArray(operation) ? operation : [operation]
                    let currentItem = result[i]
                    let mutated = false
                    for (const op of ops) {
                        const functionOutput = await (op as any)(context, currentItem)
                        if (functionOutput) {
                            currentItem = { ...currentItem, ...functionOutput }
                            mutated = true
                        }
                    }
                    if (mutated) {
                        if (result === items) result = [...items]
                        result[i] = currentItem
                    }
                }
                continue
            }

            // Derive the full attribute path (prepend 'attributes.' if not already present)
            const attributePath = attrPattern.startsWith('attributes.') ? attrPattern : `attributes.${attrPattern}`

            for (let i = 0; i < items.length; i++) {
                const item = result[i]

                // Skip attribute writes on outputs that don't carry an attributes bag
                // (e.g. update, disable, enable, unlock, changePassword responses).
                if (attributePath.startsWith('attributes.') && !item?.attributes) {
                    logger.debug(
                        `${context.commandType} - Skipping after operation for ${attrPattern}: output has no attributes`
                    )
                    continue
                }

                logger.debug(`${context.commandType} - Running after operation for attribute ${attrPattern}`)
                const ops = Array.isArray(operation) ? operation : [operation]
                let currentItem = item
                let mutated = false
                for (const op of ops) {
                    const functionOutput = await (op as any)(context, currentItem)
                    if (functionOutput) {
                        currentItem = { ...currentItem, ...functionOutput }
                        mutated = true
                    }
                }

                if (mutated) {
                    if (result === items) result = [...items]
                    result[i] = currentItem
                }
            }
        }

        return (isArray ? result : result[0]) as T
    }
}
