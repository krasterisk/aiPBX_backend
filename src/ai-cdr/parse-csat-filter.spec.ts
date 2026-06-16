import { Op } from 'sequelize'
import { buildCsatWhereCondition, parseCsatFilter } from './parse-csat-filter'

describe('parseCsatFilter', () => {
    it('parses numeric scores and none', () => {
        expect(parseCsatFilter('1,3,5,none')).toEqual({
            scores: [1, 3, 5],
            includeNone: true,
        })
    })

    it('returns empty for blank input', () => {
        expect(parseCsatFilter('')).toEqual({ scores: [], includeNone: false })
    })
})

describe('buildCsatWhereCondition', () => {
    it('builds IN filter for scores', () => {
        expect(buildCsatWhereCondition([1, 2], false)).toEqual({
            '$analytics.csat$': { [Op.in]: [1, 2] },
        })
    })

    it('builds OR filter when none is included', () => {
        expect(buildCsatWhereCondition([4], true)).toEqual({
            [Op.or]: [
                { '$analytics.csat$': { [Op.in]: [4] } },
                { '$analytics.csat$': null },
            ],
        })
    })
})
