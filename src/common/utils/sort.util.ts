import { BadRequestException } from '@nestjs/common';

export type SortOrder = 'asc' | 'desc';
export type SortCriteria = Record<string, SortOrder>;

/**
 * Parses an API sort expression like `-createdAt,email` into ORM-ready
 * criteria, validating every field against a per-resource whitelist.
 *
 *   parseSort('-createdAt,email', ['createdAt', 'email'])
 *   → [{ createdAt: 'desc' }, { email: 'asc' }]
 *
 * Unknown fields throw 400 — sort params reach the database, so they are
 * never passed through unvalidated.
 */
export function parseSort(
  sort: string | undefined,
  allowedFields: readonly string[],
  fallback: SortCriteria = { createdAt: 'desc' },
): SortCriteria[] {
  if (!sort) {
    return [fallback];
  }

  return sort.split(',').map((raw): SortCriteria => {
    const trimmed = raw.trim();
    const desc = trimmed.startsWith('-');
    const field = desc ? trimmed.slice(1) : trimmed;

    if (!allowedFields.includes(field)) {
      throw new BadRequestException(
        `Cannot sort by "${field}". Allowed fields: ${allowedFields.join(', ')}`,
      );
    }
    return { [field]: desc ? 'desc' : 'asc' };
  });
}
