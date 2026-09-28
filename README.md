## SaaS Customizer Framework

A framework for building SailPoint SaaS Connector Customizers that extend any [supported SaaS connector](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/customizers) with custom account and entitlement attributes. The included operations all target **Microsoft Entra ID** (sponsors, service principal group assignments, guest GAL visibility, and entitlement application parsing), but the framework is connector-agnostic — swap the API client and operations for any connector.

---

### Architecture

```
index.ts                      ← entry point: wires handlers to SDK commands
├── customOperations.ts       ← named registry of available operation implementations
├── operationRunner.ts        ← generic engine: resolves source config → runs operations
├── utils.ts                  ← general utilities
├── model/
│   ├── operation.ts          ← Operation / OperationMap type definitions
│   └── config.ts             ← connector configuration interface (incl. customOperations)
├── operations/               ← your custom operation functions live here
│   ├── setSponsors.ts        ← (Entra ID) handles deferred sponsor writes and clears (preSetSponsors, setSponsors)
│   ├── getSponsors.ts        ← (Entra ID) after: fetches sponsors from Graph
│   ├── setGuestGalVisibility.ts ← (Entra ID) after: enforce guest GAL visibility
│   └── getApplication.ts     ← (Entra ID) after: parse application from entitlement name
└── entraid-client.ts         ← (Entra ID) Microsoft Graph API wrapper
```

### How it works

1. **`index.ts`** registers a single before-handler and a single after-handler for every standard SDK command (account list/read/create/update/disable/enable/unlock, change-password, entitlement list/read).

2. Each handler delegates to the **operation runner** in `operationRunner.ts`, which reads the source's **`customOperations`** connector attribute — a map from hook patterns to operation **names** — and resolves those names through the **operation registry** in `customOperations.ts`:

    ```typescript
    // customOperations.ts — registry of implementations (code)
    export const operationRegistry = {
        setSponsors,
        getSponsors,
        // ...
    }
    ```

    ```json
    // Source connector attribute — wiring (config)
    {
      "customOperations": {
        "afterStdAccountCreate.sponsors": ["setSponsors"]
      }
    }
    ```

3. **Before operations** transform the SDK input in a pipeline (each function receives the input and returns a partial object to merge into the input). They only run when the input contains the relevant attribute, or unconditionally if mapped to `*.*`.

4. **After operations** run against every output object. Each function receives the object and returns a partial object that the engine merges with the current item.

5. Hook paths follow the `<hookPattern>.<attributePattern>` convention:
    - `'beforeStdAccountCreate.sponsors'` → runs on beforeStdAccountCreate when 'sponsors' attribute is present
    - `'afterStdAccountRead.*'` → runs on afterStdAccountRead unconditionally for all attributes
    - `'*.*'` → runs on all hooks unconditionally

---

### Quick start — adding a custom attribute

**1. Write your operation** in `src/operations/`:

```typescript
// src/operations/myCustomAttr.ts
import { Context, readConfig } from '@sailpoint/connector-sdk'
import { AnyAfterOperationInput, AfterOperation } from '../model/operation'
import { Config } from '../model/config'
import { getLogger } from '../utils'

export const myCustomAttr: AfterOperation<AnyAfterOperationInput> = async (context: Context, output: AnyAfterOperationInput) => {
    const config: Config = await readConfig()
    const logger = getLogger(config.spConnDebugLoggingEnabled)

    // Your logic here — call an API, derive a value, etc.
    logger.debug(`Computing custom attr`)
    const computedValue = 'computed-value'
    
    // Return an object that will be merged into the current item
    return {
        attributes: {
            ...output.attributes,
            myCustomAttr: computedValue
        }
    }
}
```

**2. Register it** in the operation registry:

```typescript
// src/customOperations.ts
import { myCustomAttr } from './operations/myCustomAttr'

export const operationRegistry = {
    // ...existing ops
    myCustomAttr, // ← new: available by name "myCustomAttr"
}
```

**3. Wire it** in the source's `customOperations` connector attribute:

```json
{
  "customOperations": {
    "afterStdAccountRead.*": ["myCustomAttr"]
  }
}
```

That's it. The framework handles hook matching, name resolution, iteration, merging the returned object, and logging.

---

### Builtin operations

All registry names below are defined in `src/customOperations.ts`. Reference them by name in the source's `customOperations` map.

#### Quick reference

Every builtin operation was written for the **Microsoft Entra ID** connector (`connectorId: Microsoft-Entra`) and, except for `getApplication`, calls Microsoft Graph using the source's `domainName`, `clientID`, and `clientSecret`. They are worked examples of the framework rather than connector-agnostic utilities — on any other source they will either skip or fail.

| Registry name | Connector | Phase | Applies to | Reads from the object | Graph call | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| `preSetSponsors` | Microsoft Entra ID (`Microsoft-Entra`) | before | User accounts, on create/update | `sponsors` (in `attributes` or `changes`), plus `identity` / `key.simple.id` / `attributes.objectId` | `POST /users/{id}/sponsors/$ref`, `DELETE /users/{id}/sponsors/{sponsorId}/$ref` | Writes or clears the sponsor immediately on update; on create caches it for `setSponsors`. Always strips `sponsors` from the payload so the base connector cannot 400 on it. |
| `setSponsors` | Microsoft Entra ID (`Microsoft-Entra`) | after | User accounts, on create | `identity`, falling back to the id cached by `preSetSponsors` | same as above | Applies the sponsor write that `preSetSponsors` deferred. Writes no ISC attribute. |
| `getSponsors` | Microsoft Entra ID (`Microsoft-Entra`) | after | User accounts, on list/read | `identity` / `id` / `uuid` / `attributes.objectId` / `attributes.userPrincipalName` | `GET /users/{id}/sponsors` | Sets `attributes.sponsors` to the sponsor UPN, or an array of UPNs when there is more than one. |
| `getAppGroups` | Microsoft Entra ID (`Microsoft-Entra`) | after | Service principal accounts, on list/read — needs `manageAzureServicePrincipalAsAccount` on the source | `attributes.spn_appId` (gate) and `attributes.objectId` (composite `{spObjectId}:{appObjectId}` native id) | `GET /servicePrincipals/{id}/appRoleAssignedTo`, following `@odata.nextLink` | Sets the multi-valued `attributes.spn_app_groups` to the unique `principalId`s of `Group` assignments. Users and other principal types are ignored. |
| `setGuestGalVisibility` | Microsoft Entra ID (`Microsoft-Entra`) | after | B2B guest accounts, on create/update | `identity` and `attributes.userType` (must be `Guest`) | `PATCH /users/{id}` | Sets `showInAddressList: true` in Entra. Changes nothing on the ISC account; failures are logged, not thrown. |
| `getApplication` | Microsoft Entra ID (`Microsoft-Entra`) | after | Entitlements of type `applicationRole`, on list/read | `type` and `attributes.displayName` | none — pure string parsing | Sets `attributes.application` to the part of `displayName` after ` [on] `. |

Graph permissions differ per operation: reading sponsors needs `User.Read.All` (or `Directory.Read.All`), writing them needs `User.ReadWrite.All`, `setGuestGalVisibility` needs `User.ReadWrite.All`, and `getAppGroups` needs `Application.Read.All` (or `Directory.Read.All`).

---

#### `preSetSponsors` + `setSponsors` — write sponsors

**Connector:** Microsoft Entra ID (`Microsoft-Entra`)

**What for:** Microsoft Graph treats `sponsors` as a navigation property. The base Entra connector cannot set it, so these ops talk to Graph and remove `sponsors` from the payload before the base connector runs (otherwise Graph returns 400).

**How they work together:**
- **Update (and similar):** `preSetSponsors` writes/clears the sponsor via Graph immediately and strips the attribute from input.
- **Create:** the user does not exist yet, so `preSetSponsors` caches the pending change; `setSponsors` applies it after the account is created.

**How to use:** define a multi-valued (or single) account attribute named `sponsors` in the source schema, and wire both before and after hooks:

```json
"beforeStdAccountCreate.sponsors": ["preSetSponsors"],
"afterStdAccountCreate.sponsors": ["setSponsors"],
"beforeStdAccountUpdate.sponsors": ["preSetSponsors"],
"afterStdAccountUpdate.sponsors": ["setSponsors"]
```

Always pair `preSetSponsors` (before) with `setSponsors` (after) on create. On update, `preSetSponsors` alone is enough for the write; `setSponsors` is still safe to keep for consistency.

---

#### `getSponsors` — read sponsors

**Connector:** Microsoft Entra ID (`Microsoft-Entra`)

**What for:** Populate `attributes.sponsors` on account read/list with the current sponsor UPN(s) from `GET /users/{id}/sponsors`.

**How to use:** do **not** let the base connector `$select` sponsors (that causes 404). Let this operation fetch them. Typical wiring:

```json
"afterStdAccountList.*": ["getSponsors"],
"afterStdAccountRead.*": ["getSponsors"]
```

Or bind to the attribute: `"afterStdAccountRead.sponsors": ["getSponsors"]`.

---

#### `getAppGroups` — SPN group assignments

**Connector:** Microsoft Entra ID (`Microsoft-Entra`)

**What for:** On service principal (enterprise app) accounts, fetch Users and groups assignments via Graph `appRoleAssignedTo` and write unique group object IDs to `attributes.spn_app_groups`. Skips normal user accounts (requires `attributes.spn_appId`).

**How to use:** ensure SPN accounts expose `spn_appId` and `objectId`. The Entra connector reports `objectId` as a composite native id (`{servicePrincipalObjectId}:{applicationObjectId}`, or `:EXT` for apps from another tenant); the operation uses the first segment for the Graph call. Add a multi-valued account attribute `spn_app_groups`, then:

```json
"afterStdAccountList.*": ["getAppGroups"],
"afterStdAccountRead.*": ["getAppGroups"]
```

Can be combined with `getSponsors` on the same hook:

```json
"afterStdAccountList.*": ["getSponsors", "getAppGroups"],
"afterStdAccountRead.*": ["getSponsors", "getAppGroups"]
```

---

#### `setGuestGalVisibility` — guest GAL visibility

**Connector:** Microsoft Entra ID (`Microsoft-Entra`)

**What for:** Entra hides B2B guests from the Exchange GAL by default. After create (or update), if `userType === 'Guest'`, PATCHes the user with `showInAddressList: true`. Does not change the ISC account object.

**How to use:** trigger on a create/update after hook when a guest-related attribute is present (example uses `invitedUserDisplayName`):

```json
"afterStdAccountCreate.invitedUserDisplayName": ["setGuestGalVisibility"]
```

Or run unconditionally after create/update:

```json
"afterStdAccountCreate.*": ["setGuestGalVisibility"],
"afterStdAccountUpdate.*": ["setGuestGalVisibility"]
```

Requires Graph permission to update the user (`User.ReadWrite.All` or equivalent).

---

#### `getApplication` — parse application from entitlement name

**Connector:** Microsoft Entra ID (`Microsoft-Entra`)

**What for:** Entra `applicationRole` entitlements use display names like `RoleName [on] ApplicationName`. This op splits on ` [on] ` and writes the application portion to `attributes.application` for grouping/filtering in ISC. Only runs when entitlement `type` is `applicationRole`.

**How to use:** add an entitlement attribute `application`, then:

```json
"afterStdEntitlementList.application": ["getApplication"]
```

Also useful on read: `"afterStdEntitlementRead.application": ["getApplication"]`.

---

### Adapting for a different connector

The only Entra ID-specific files are:

| File                                      | Purpose                                |
| ----------------------------------------- | -------------------------------------- |
| `src/entraid-client.ts`                   | Microsoft Graph API wrapper            |
| `src/operations/setSponsors.ts`           | Handles deferred sponsor writes/clears |
| `src/operations/getSponsors.ts`           | After-op: fetches current sponsors     |
| `src/operations/getAppGroups.ts`          | After-op: SPN group assignments        |
| `src/operations/getApplication.ts`        | After-op: parse app from entitlement   |
| `src/operations/setGuestGalVisibility.ts` | After-op: enforce guest GAL visibility |
| `src/model/config.ts`                     | Entra ID connector config interface    |

Everything else (`index.ts`, `operationRunner.ts`, `utils.ts`, `model/operation.ts`, `customOperations.ts`) is generic framework code. To target a different connector:

1. Replace `entraid-client.ts` with a client for your target API
2. Update `config.ts` to match your connector's configuration schema
3. Write new operations in `src/operations/`
4. Register them in `operationRegistry` (`customOperations.ts`)
5. Wire hook patterns via the source's `customOperations` connector attribute

---

### Configuration

The customizer reuses the same configuration as the base connector, plus an optional **`customOperations`** attribute that wires hook patterns to registry names.

| Field                       | Used for                                                |
| --------------------------- | ------------------------------------------------------- |
| `domainName`                | Entra ID tenant ID (passed to `ClientSecretCredential`) |
| `clientID`                  | Application (client) ID                                 |
| `clientSecret`              | Application secret                                      |
| `spConnDebugLoggingEnabled` | Toggles debug-level logging                             |
| `customOperations`          | Hook pattern → operation name map (object or JSON string) |

Example Entra ID wiring (add as a source connector attribute):

```json
{
  "customOperations": {
    "beforeStdAccountCreate.sponsors": ["preSetSponsors"],
    "afterStdAccountCreate.sponsors": ["setSponsors"],
    "beforeStdAccountUpdate.sponsors": ["preSetSponsors"],
    "afterStdAccountUpdate.sponsors": ["setSponsors"],
    "afterStdAccountCreate.invitedUserDisplayName": ["setGuestGalVisibility"],
    "afterStdAccountList.*": ["getSponsors", "getAppGroups"],
    "afterStdAccountRead.*": ["getSponsors", "getAppGroups"],
    "afterStdEntitlementList.application": ["getApplication"]
  }
}
```

ISC connector attributes are often strings, so `customOperations` may also be stored as a JSON string — the runner parses either form. If the field is missing or empty, no custom operations run. Unknown operation names are skipped with a warning log.

---

### Build & development

```bash
npm install           # install dependencies
npm run build         # clean + compile (via @vercel/ncc)
npm run dev           # run locally with source maps (spcx)
npm run debug         # run locally without rebuild
npm run pack-zip      # package for deployment (spcx package)
```

### Deployment

1. `npm run build` (or `npm run prepack-zip`)
2. `npm run pack-zip` → creates a deployable ZIP
3. Upload to ISC as a SaaS connector customizer
4. Link to your source, set the `customOperations` connector attribute, and enable the relevant before/after operations

---

### Logging

Controlled by `spConnDebugLoggingEnabled`:

-   `true` → `logger.level = 'debug'` (verbose operation tracing)
-   `false` → `logger.level = 'info'` (production)

---

### Troubleshooting

| Symptom                                         | Likely cause                                                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth errors from Graph                          | Check `clientID`, `clientSecret`, `domainName` and required Graph permissions (`User.Read.All`, `Directory.Read.All`)                                                                                      |
| Missing attributes on output                    | Verify the incoming object contains the fields your operations use (`objectId`, `userPrincipalName`, `uuid`, `type`). Add null checks as needed.                                                           |
| Operations never run                            | Ensure the source has a `customOperations` attribute mapping hook patterns to registry names. Missing/empty config means no ops run.                                                                       |
| `Unknown custom operation` warning              | The name in config is not registered in `operationRegistry` (`customOperations.ts`). Check spelling or add the implementation.                                                                            |
| 404 on aggregation with `sponsors` in `$select` | `sponsors` is a Graph navigation property (requires `$expand`, not `$select`). Configure the attribute in ISC so the base connector does not fetch it — the customizer handles it via a separate API call. |
| Graph throttling / failures                     | Check logs for `Error fetching ...` messages. Consider adding retry/backoff in the client methods.                                                                                                         |

---

### Dependencies

| Package                                      | Purpose                                            |
| -------------------------------------------- | -------------------------------------------------- |
| `@sailpoint/connector-sdk`                   | Customizer runtime, logger, config                 |
| `@azure/identity`                            | Entra ID authentication (`ClientSecretCredential`) |
| `@microsoft/microsoft-graph-client`          | Microsoft Graph API client                         |
| `isomorphic-fetch`                           | Fetch polyfill for Node.js                         |
| `@vercel/ncc`                                | Single-file bundling                               |
| `cross-env`, `shx`, `typescript`, `prettier` | Build tooling                                      |

---

### License

MIT — see `LICENSE.txt`.
