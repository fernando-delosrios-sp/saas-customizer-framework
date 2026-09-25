// Configuration file path constant
export const GROUP_CREATION_CONFIG_FILE = 'group-creation-config.json'

export interface Config {
    beforeProvisioningRule: any
    cloudCacheUpdate: number
    cloudDisplayName: string
    cloudExternalId: string
    connectionType: string
    connectorName: string
    deleteThresholdPercentage: number
    deltaAggregation: DeltaAggregation
    deltaAggregationEnabled: boolean | string
    formPath: any
    hasFullAggregationCompleted: boolean
    healthCheckTimeout: number
    healthy: boolean
    spConnDebugLoggingEnabled: boolean
    since: string
    'slpt-source-diagnostics': string
    sourceConnected: boolean
    status: string
    supportsDeltaAgg: boolean | string
    templateApplication: string

    // Fields from original JSON
    domainName: string
    channelFilter: any
    clientCertificate: any
    clientID: string
    enableAzureManagement: boolean
    mailContactFilter: any
    pageSize: string
    manageAdminConsentedPermissions: any
    maxRetryCount: string
    checkDeletedDisabled: boolean
    exoAuthenticationType: any
    spnAccountFilter: any
    numPartitionThreads: string
    password: any
    clientSecret: string
    isCaeEnabled: boolean
    aggregateHiddenAccessPackages: boolean
    spnManageAzureADPIM: any
    aggregateAllGroups: string
    manageO365Groups: boolean
    skipMailEnabledGroup: string
    enableManagedIdentityManagement: boolean
    private_key: any
    refresh_token: any
    fetchB2CMemberships: string
    CloudResourceManagement: string
    privateKeyPassword: any
    spnManageAppRoles: any
    grantType: string
    exoCertificateThumbprint: any
    exchangeUserName: any
    groupDeltaToken: string
    enablePIM: boolean
    enableAccessPackageManagement: boolean
    azureRolesFilter: any
    authURL: any
    subscribedSkus: SubscribedSku[]
    recommendationStatus: any
    partitionAggregationEnabled: string
    manageAzureServicePrincipalAsAccount: boolean
    manageExchangeOnline: boolean
    spnManageAzurePIM: any
    groupMembershipDeltaToken: string
    samlRequestBody: any
    spnManageGroups: any
    accountDeltaToken: string
    exchangeUserPassword: any
    spnManageDirectoryRole: any
    useMSGraphAPI: boolean
    encrypted: string
    isB2CTenant: boolean
    spnManageRBACRoles: any
    azureADRolesFilter: any
    enableMailContactGovernance: any
    username: any

    // Fields from extra Config (if used in context)
    idnProxyType?: string
    managementWorkgroup?: any
    managerCorrelationFilter?: any
    sourceDescription?: string
    spConnEnableStatefulCommands?: boolean
    spConnectorInstanceId?: string
    spConnectorSpecId?: string

    /**
     * Hook-pattern → operation-name map. Keys use `<hookPattern>.<attributePattern>`
     * (e.g. `afterStdAccountRead.*`). Values are registry names or arrays of names.
     * May be a JSON string when stored as an ISC connector attribute.
     */
    customOperations?: CustomOperationsConfig | string
}

/**
 * Source-config shape for custom operations wiring.
 * Values are operation registry names (see `operationRegistry` in customOperations.ts).
 */
export type CustomOperationsConfig = {
    [pattern: string]: string | string[]
}

// Group creation configuration
export interface GroupCreationConfig {
    prefix: string
    categories: string[]
    groupTypes: GroupType[]
}

export interface GroupType {
    name: string
    omitInNaming: boolean
}

// Default group creation configuration
export const DEFAULT_GROUP_CREATION_CONFIG: GroupCreationConfig = {
    prefix: 'GrQ',
    categories: ['H', 'HI'],
    groupTypes: [
        { name: 'Main', omitInNaming: true },
        { name: 'GrG-Dipendenti', omitInNaming: false },
        { name: 'GrG-Responsabili', omitInNaming: false }
    ]
}

export interface DeltaAggregation {
    'std:account:list': any
    'std:entitlement:list': any
}

export interface SubscribedSku {
    prepaidUnits: Units
    skuPartNumber: string
    accountName: string
    capabilityStatus: string
    appliesTo: string
    servicePlans: ServicePlan[]
    consumedUnits: number
    accountId: string
    selfServiceSignupUnits: Units
    overageUnits: Units
    subscriptionIds: string[]
    id: string
    trialUnits: Units
    objectId: string
    skuId: string
}

export interface Units {
    warning: number
    lockedOut: number
    enabled: number
    suspended: number
}

export interface ServicePlan {
    servicePlanName: string
    servicePlanType: string
    provisioningStatus: string
    appliesTo: string
    servicePlanId: string
}
