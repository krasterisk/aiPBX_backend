export class GetDashboardDto {
    assistantId?: string
    startDate?: string
    tab?: string
    endDate?: string
    userId?: string
}

export class GetDashboardAllData {
    allCount?: number
    allTokensCount?: number
    allDurationCount?: number
}

export class GetDashboardDoneData {
    label?: string
    tokensCount?: number
    durationCount?: number
}


export class GetDashboardData {
    chartData?: GetDashboardDoneData[]
    allCount?: number
    allTokensCount?: number
    allDurationCount?: number
}
