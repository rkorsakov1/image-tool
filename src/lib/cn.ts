type ClassValue = string | false | null | undefined | Record<string, boolean | undefined>;

/** Joins class names. Accepts strings, falsy values, and `{ 'class': condition }` objects. */
export const cn = (...values: ClassValue[]): string =>
  values
    .flatMap((value) => {
      if (!value) return [];
      if (typeof value === 'string') return [value];
      return Object.entries(value)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name);
    })
    .join(' ');
