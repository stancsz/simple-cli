import { describe, it, expect } from 'vitest';
import { getStartDateFromTimeframe, matchesFocusArea } from '../../../src/mcp_servers/ecosystem_auditor/tools/generate_audit_report';

describe('getStartDateFromTimeframe', () => {
    it('returns 24 hours ago for "last_24_hours"', () => {
        const date = getStartDateFromTimeframe('last_24_hours');
        const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
        expect(diffHours).toBeCloseTo(24, 0);
    });

    it('returns 7 days ago for "last_7_days"', () => {
        const date = getStartDateFromTimeframe('last_7_days');
        const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeCloseTo(7, 0);
    });

    it('returns 30 days ago for "last_30_days"', () => {
        const date = getStartDateFromTimeframe('last_30_days');
        const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeCloseTo(30, 0);
    });

    it('returns epoch for unknown timeframe', () => {
        const date = getStartDateFromTimeframe('unknown_timeframe');
        expect(date.getTime()).toBe(0);
    });
});

describe('matchesFocusArea', () => {
    it('always matches "all" focus area', () => {
        expect(matchesFocusArea({ event_type: 'communication' } as any, 'all')).toBe(true);
        expect(matchesFocusArea({ event_type: 'policy_change' } as any, 'all')).toBe(true);
        expect(matchesFocusArea({ event_type: 'morphology_adjustment' } as any, 'all')).toBe(true);
    });

    it('correctly matches "communications" focus area', () => {
        expect(matchesFocusArea({ event_type: 'communication' } as any, 'communications')).toBe(true);
        expect(matchesFocusArea({ event_type: 'message' } as any, 'communications')).toBe(true);
        expect(matchesFocusArea({ event_type: 'rpc' } as any, 'communications')).toBe(true);
        expect(matchesFocusArea({ event_type: 'policy_change' } as any, 'communications')).toBe(false);
    });

    it('correctly matches "policy_changes" focus area', () => {
        expect(matchesFocusArea({ event_type: 'policy_change' } as any, 'policy_changes')).toBe(true);
        expect(matchesFocusArea({ event_type: 'policy_update' } as any, 'policy_changes')).toBe(true);
        expect(matchesFocusArea({ event_type: 'communication' } as any, 'policy_changes')).toBe(false);
    });

    it('correctly matches "morphology_adjustments" focus area', () => {
        expect(matchesFocusArea({ event_type: 'morphology_adjustment' } as any, 'morphology_adjustments')).toBe(true);
        expect(matchesFocusArea({ event_type: 'spawn' } as any, 'morphology_adjustments')).toBe(true);
        expect(matchesFocusArea({ event_type: 'merge' } as any, 'morphology_adjustments')).toBe(true);
        expect(matchesFocusArea({ event_type: 'retire' } as any, 'morphology_adjustments')).toBe(true);
        expect(matchesFocusArea({ event_type: 'scale' } as any, 'morphology_adjustments')).toBe(true);
        expect(matchesFocusArea({ event_type: 'communication' } as any, 'morphology_adjustments')).toBe(false);
    });

    it('returns false for unknown event types when focus area is not "all"', () => {
        // Based on current logic, if none match, it returns false fallback
        expect(matchesFocusArea({ event_type: 'unknown_event' } as any, 'communications')).toBe(false);
    });
});
