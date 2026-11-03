/**
 * Operation type definitions
 *
 * These types form the core abstraction of the customizer framework.
 * They are connector-agnostic — you can reuse them for any SaaS connector,
 * not just Entra ID.
 *
 * Key concepts:
 * - An **Operation** is a function that handles a single custom attribute.
 * - An **OperationMap** maps attribute names to their operation functions.
 * - The framework iterates the map, runs each operation, and writes the
 *   returned value to the corresponding attribute on the object.
 *
 * Map key conventions:
 * - Use the attribute name directly (e.g. 'sponsors'), **not** the full
 *   path ('attributes.sponsors'). The framework auto-prefixes 'attributes.'
 *   when reading/writing the object.
 * - Use a `null` key to register an operation that runs unconditionally,
 *   regardless of which attributes are present in the input/output.
 *   For before operations the pipeline semantics are preserved (input in → input out).
 *   For after operations the return value replaces the entire object.
 */
import {
    Context,
    StdAccountCreateInput, StdAccountReadInput, StdAccountUpdateInput, StdAccountDeleteInput, StdAccountEnableInput, StdAccountDisableInput, StdAccountUnlockInput, StdAccountListInput,
    StdAccountCreateOutput, StdAccountReadOutput, StdAccountUpdateOutput, StdAccountDeleteOutput, StdAccountEnableOutput, StdAccountDisableOutput, StdAccountUnlockOutput, StdAccountListOutput,
    StdEntitlementReadInput, StdEntitlementListInput,
    StdEntitlementReadOutput, StdEntitlementListOutput,
    StdTestConnectionInput, StdTestConnectionOutput,
    StdAuthenticateInput, StdAuthenticateOutput,
    StdConfigOptionsInput, StdConfigOptionsOutput,
    StdApplicationDiscoveryInputList, StdApplicationDiscoveryOutputList,
    StdChangePasswordInput, StdChangePasswordOutput,
    StdSourceDataDiscoverInput, StdSourceDataDiscoverOutput,
    StdSourceDataReadInput, StdSourceDataReadOutput
} from '@sailpoint/connector-sdk'

// ---------------------------------------------------------------------------
// Before-operation types
// ---------------------------------------------------------------------------

/**
 * Shape expected by before operations for accounts.
 */
export type AccountBeforeOperationInput =
    | StdAccountCreateInput
    | StdAccountReadInput
    | StdAccountUpdateInput
    | StdAccountDeleteInput
    | StdAccountEnableInput
    | StdAccountDisableInput
    | StdAccountUnlockInput
    | StdAccountListInput

/**
 * Shape expected by before operations for entitlements.
 */
export type EntitlementBeforeOperationInput =
    | StdEntitlementReadInput
    | StdEntitlementListInput

/**
 * Shape expected by before operations for other features.
 */
export type OtherBeforeOperationInput =
    | StdTestConnectionInput
    | StdAuthenticateInput
    | StdConfigOptionsInput
    | StdApplicationDiscoveryInputList
    | StdChangePasswordInput
    | StdSourceDataDiscoverInput
    | StdSourceDataReadInput

export type AnyBeforeOperationInput = AccountBeforeOperationInput | EntitlementBeforeOperationInput | OtherBeforeOperationInput

/**
 * A before operation transforms the SDK input in a pipeline fashion.
 * It receives the full input object and must return the (possibly modified) input.
 * Can define an optional `defaultAttribute` representing the attribute it primarily acts on.
 */
export type BeforeOperation<T extends AnyBeforeOperationInput = AnyBeforeOperationInput> = {
    (context: Context, input: T): Promise<Partial<T> | undefined>
    defaultAttribute?: string
}

// ---------------------------------------------------------------------------
// After-operation types
// ---------------------------------------------------------------------------

/**
 * Shape expected by after operations for accounts.
 */
export type AccountAfterOperationInput =
    | StdAccountCreateOutput
    | StdAccountReadOutput
    | StdAccountUpdateOutput
    | StdAccountDeleteOutput
    | StdAccountEnableOutput
    | StdAccountDisableOutput
    | StdAccountUnlockOutput
    | StdAccountListOutput

/**
 * Shape expected by after operations for entitlements.
 */
export type EntitlementAfterOperationInput =
    | StdEntitlementReadOutput
    | StdEntitlementListOutput

/**
 * Shape expected by after operations for other features.
 */
export type OtherAfterOperationInput =
    | StdTestConnectionOutput
    | StdAuthenticateOutput
    | StdConfigOptionsOutput
    | StdApplicationDiscoveryOutputList
    | StdChangePasswordOutput
    | StdSourceDataDiscoverOutput
    | StdSourceDataReadOutput

export type AnyAfterOperationInput = AccountAfterOperationInput | EntitlementAfterOperationInput | OtherAfterOperationInput

/**
 * An after operation returns an object containing the attributes to be merged into the output object.
 * Returns undefined if no modification is needed.
 * Can define an optional `defaultAttribute` representing the fallback output attribute
 * when no specific attribute or a wildcard is specified in the rule.
 */
export type AfterOperation<T extends AnyAfterOperationInput = AnyAfterOperationInput> = {
    (context: Context, object: T): Promise<Partial<T> | undefined>
    defaultAttribute?: string
}

// ---------------------------------------------------------------------------
// Unified operation types
// ---------------------------------------------------------------------------

/**
 * A combined operation map where keys follow the pattern `<hookPattern>.<attributePattern>`.
 * For example:
 * - `*.*` - Runs on all hooks for all attributes.
 * - `*.sponsors` - Runs on all hooks for the 'sponsors' attribute.
 * - `beforeStdAccountList.*` - Runs on the beforeStdAccountList hook for all attributes.
 * - `afterStdAccountRead.sponsors` - Runs on the afterStdAccountRead hook for the 'sponsors' attribute.
 */
export type CustomOperationMap = {
    [pattern: string]:
    | BeforeOperation<any>
    | AfterOperation<any>
    | Array<
        | BeforeOperation<any>
        | AfterOperation<any>
    >
}
