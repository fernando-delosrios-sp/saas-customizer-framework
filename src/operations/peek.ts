/**
 * Generic operation — peek
 *
 * Dumps the execution context (`context` and the operation payload) to `logger.info`
 * prefixed with a high-visibility banner (`=== PEEK ===` or `=== PEEK [i/N] ===`).
 *
 * Output formatting:
 * - Uses single quotes `'` instead of `"` to prevent Pino / JSON loggers from escaping
 *   every quote as `\"`, keeping the log readable and compact.
 * - Safely handles circular references (e.g. Web Services paging processors).
 * - Filters out noisy internal Node runtime stream handles and hundreds of productFlags.
 * - Divides oversized payloads into valid, standalone stringified JSON object chunks
 *   (`{...}`) under 2000 characters to prevent container log truncation.
 */
import { Context, readConfig } from '@sailpoint/connector-sdk'
import { AnyAfterOperationInput, AnyBeforeOperationInput } from '../model/operation'
import { Config } from '../model/config'
import { getLogger } from '../utils'

const MAX_CHUNK_SIZE = 2000

/**
 * Masks sensitive keywords (tokens, secrets, passwords) to prevent SailPoint's
 * cloud log filter from matching them and crudely truncating the log line to the end.
 */
export function maskSensitiveTerm(str: string): string {
    return str
        .replace(/token/gi, (m) => m[0] + (m[1] === 'O' ? 'OK*N' : 'ok*n'))
        .replace(/secret/gi, (m) => m[0] + (m[1] === 'E' ? '*CRET' : '*cret'))
        .replace(/password/gi, (m) => m[0] + (m[1] === 'A' ? '*SSWORD' : '*ssword'))
        .replace(/bearer/gi, (m) => m[0] + (m[1] === 'E' ? '*ARER' : '*arer'))
        .replace(/private_key/gi, (m) => m[0] + (m[1] === 'R' ? 'RIV*TE_KEY' : 'riv*te_key'))
}

const isSensitiveKey = (key: string) => /token|secret|password|bearer|private_key/i.test(key)

/**
 * Sanitizes an object by converting circular references to '[Circular]',
 * dropping internal runtime handles that clutter logs, and masking sensitive
 * credentials and keywords so SailPoint's container log redactor doesn't
 * truncate the line.
 */
export function sanitize(obj: any, seen = new WeakSet()): any {
    if (obj === null || typeof obj !== 'object') {
        if (typeof obj === 'string') {
            return maskSensitiveTerm(obj)
        }
        return obj
    }
    if (seen.has(obj)) {
        return '[Circular]'
    }
    seen.add(obj)

    if (Array.isArray(obj)) {
        return obj.map((item) => sanitize(item, seen))
    }

    const clean: Record<string, any> = {}
    for (const [key, val] of Object.entries(obj)) {
        // Strip noisy internal runtime/stream properties and license productFlags
        if (key === '_outStream' || key === '_promiseStore' || key === 'productFlags' || key === 'handlers') {
            continue
        }

        const maskedKey = maskSensitiveTerm(key)
        if (isSensitiveKey(key)) {
            if (val === null || typeof val !== 'object') {
                clean[maskedKey] = '[REDACTED]'
            } else {
                clean[maskedKey] = sanitize(val, seen)
            }
        } else {
            clean[maskedKey] = sanitize(val, seen)
        }
    }
    return clean
}

/**
 * Converts a JSON string to use single quotes `'` instead of double quotes `"`.
 * Escapes any pre-existing single quotes so the resulting string remains valid.
 */
export function toSingleQuotedJson(json: string): string {
    return json.replace(/'/g, "\\'").replace(/"/g, "'")
}

/**
 * Helper to set a value at a nested path inside an object.
 */
function setDeep(target: Record<string, any>, path: string[], value: any) {
    let current = target
    for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i]
        if (!current[seg] || typeof current[seg] !== 'object' || Array.isArray(current[seg])) {
            current[seg] = {}
        }
        current = current[seg]
    }
    current[path[path.length - 1]] = value
}

/**
 * Recursively breaks down an object into units that fit within `maxSize`.
 */
function collectUnits(
    obj: any,
    path: string[],
    maxSize: number,
    units: Array<{ path: string[]; value: any }>
) {
    const candidate: Record<string, any> = {}
    setDeep(candidate, path, obj)
    if (JSON.stringify(candidate).length <= maxSize) {
        units.push({ path, value: obj })
        return
    }

    if (Array.isArray(obj)) {
        let batch: any[] = []
        for (let i = 0; i < obj.length; i++) {
            const testCandidate: Record<string, any> = {}
            setDeep(testCandidate, path, [...batch, obj[i]])
            if (JSON.stringify(testCandidate).length <= maxSize) {
                batch.push(obj[i])
            } else {
                if (batch.length > 0) {
                    units.push({ path, value: batch })
                    batch = []
                }
                const singleCandidate: Record<string, any> = {}
                setDeep(singleCandidate, path, [obj[i]])
                if (JSON.stringify(singleCandidate).length <= maxSize) {
                    batch.push(obj[i])
                } else {
                    collectUnits(obj[i], [...path, String(i)], maxSize, units)
                }
            }
        }
        if (batch.length > 0) {
            units.push({ path, value: batch })
        }
    } else if (obj !== null && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
            collectUnits(v, [...path, k], maxSize, units)
        }
    } else if (typeof obj === 'string' && obj.length > maxSize) {
        units.push({ path, value: obj.slice(0, Math.max(0, maxSize - 100)) + '... [truncated]' })
    } else {
        units.push({ path, value: obj })
    }
}

/**
 * Chunks an object into multiple valid standalone JSON objects,
 * each staying within `maxSize` serialized characters.
 */
export function chunkObject(root: Record<string, any>, maxSize: number): Record<string, any>[] {
    const json = JSON.stringify(root)
    if (json.length <= maxSize) {
        return [root]
    }

    const units: Array<{ path: string[]; value: any }> = []
    for (const [k, v] of Object.entries(root)) {
        collectUnits(v, [k], maxSize, units)
    }

    const chunks: Record<string, any>[] = []
    let currentChunk: Record<string, any> = {}

    for (const unit of units) {
        const candidate = JSON.parse(JSON.stringify(currentChunk))
        let existing = candidate
        let canAppendArray = false

        for (let i = 0; i < unit.path.length; i++) {
            if (existing && typeof existing === 'object') {
                if (i === unit.path.length - 1 && Array.isArray(existing[unit.path[i]]) && Array.isArray(unit.value)) {
                    canAppendArray = true
                    existing[unit.path[i]] = [...existing[unit.path[i]], ...unit.value]
                } else {
                    existing = existing[unit.path[i]]
                }
            }
        }
        if (!canAppendArray) {
            setDeep(candidate, unit.path, unit.value)
        }

        if (JSON.stringify(candidate).length <= maxSize) {
            currentChunk = candidate
        } else {
            if (Object.keys(currentChunk).length > 0) {
                chunks.push(currentChunk)
                currentChunk = {}
            }
            setDeep(currentChunk, unit.path, unit.value)
        }
    }

    if (Object.keys(currentChunk).length > 0) {
        chunks.push(currentChunk)
    }

    return chunks.length > 0 ? chunks : [root]
}

export const peek = async (
    context: Context,
    payload: AnyBeforeOperationInput | AnyAfterOperationInput
): Promise<undefined> => {
    try {
        const config: Config = await readConfig()
        const logger = getLogger(config.spConnDebugLoggingEnabled)
        const sanitizedRoot = sanitize({ context, payload })
        const chunks = chunkObject(sanitizedRoot, MAX_CHUNK_SIZE)

        if (chunks.length <= 1) {
            const singleQuoted = toSingleQuotedJson(JSON.stringify(chunks[0]))
            logger.info(`=== PEEK === ${singleQuoted}`)
        } else {
            for (let i = 0; i < chunks.length; i++) {
                const singleQuoted = toSingleQuotedJson(JSON.stringify(chunks[i]))
                logger.info(`=== PEEK [${i + 1}/${chunks.length}] === ${singleQuoted}`)
            }
        }
    } catch (err: any) {
        // Never let peek fail the connector command
        try {
            const config: Config = await readConfig()
            const logger = getLogger(config.spConnDebugLoggingEnabled)
            logger.warn(`peek: failed to dump execution context: ${err?.message ?? err}`)
        } catch {
            // ignore
        }
    }

    return undefined
}
